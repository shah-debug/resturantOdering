import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type BillingOverview,
  EVIDENCE_MAX_BYTES,
  normalizePaymentReference,
  type SubscriptionPaymentRecord,
  submitPaymentFieldsSchema,
  type SubscriptionState,
} from '@app/contracts';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
import { localDateOf } from '../../common/time/zoned-dates.js';
import { assertValid } from '../../common/validation/schema.js';
import { AppConfig } from '../../config/app-config.js';
import { isUniqueViolation } from '../../database/prisma-errors.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, OrganizationAccess, RequestMeta } from '../auth/http/request-context.js';
import { subscriptionSummarySelect, toSubscriptionSummary } from './subscription-summary.js';
import {
  type DocumentType,
  detectDocumentType,
  extensionFor,
  PrivateDocumentStore,
} from '../storage/private-documents.js';
import { invoiceSelect, paymentSelect, toInvoice, toPaymentRecord } from './billing-records.js';
import { EntitlementsService } from './entitlements.service.js';

export interface UploadedEvidence {
  buffer: Buffer;
  size: number;
}

export function duplicateReference(): AppException {
  return new AppException(
    HttpStatus.CONFLICT,
    'CONFLICT',
    'This payment reference has already been submitted. Check the reference or contact support.',
    [{ field: 'reference', message: 'This reference has already been submitted' }],
  );
}

export interface EvidenceFile {
  body: Buffer;
  contentType: string;
  filename: string;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly documents: PrivateDocumentStore,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  state(access: OrganizationAccess): Promise<SubscriptionState> {
    return this.entitlements.state(access.organizationId);
  }

  async overview(access: OrganizationAccess): Promise<BillingOverview> {
    const organizationId = access.organizationId;
    const [state, subscription, invoices, payments] = await Promise.all([
      this.entitlements.state(organizationId),
      this.prisma.subscription.findFirst({
        where: { organizationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: subscriptionSummarySelect,
      }),
      this.prisma.subscriptionInvoice.findMany({
        where: { organizationId },
        orderBy: [{ periodStart: 'desc' }, { id: 'desc' }],
        take: 12,
        select: invoiceSelect,
      }),
      this.prisma.subscriptionPayment.findMany({
        where: { organizationId },
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        take: 20,
        select: paymentSelect,
      }),
    ]);
    return {
      state,
      subscription: subscription ? toSubscriptionSummary(subscription) : null,
      invoices: invoices.map(toInvoice),
      payments: payments.map(toPaymentRecord),
      paymentInstructions: this.config.billing.paymentInstructions,
    };
  }

  async submitPayment(
    access: OrganizationAccess,
    auth: AuthContext,
    body: unknown,
    file: UploadedEvidence | undefined,
    meta: RequestMeta,
    now = new Date(),
  ): Promise<SubscriptionPaymentRecord> {
    const dto = assertValid(submitPaymentFieldsSchema, body);
    const organizationId = access.organizationId;
    const [invoice, organization] = await Promise.all([
      this.prisma.subscriptionInvoice.findFirst({
        where: { id: dto.invoiceId, organizationId },
        select: { id: true, status: true, currency: true, amountMinor: true },
      }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true },
      }),
    ]);
    if (!invoice) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        [{ field: 'invoiceId', message: 'Choose one of your invoices' }],
      );
    }
    if (invoice.status !== 'OPEN') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CONFLICT',
        'This invoice is not open for payment.',
      );
    }
    const today = localDateOf(now, organization.timezone);
    const earliest = `${String(Number(today.slice(0, 4)) - 1)}${today.slice(4)}`;
    if (dto.paidOn > today || dto.paidOn < earliest) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        [{ field: 'paidOn', message: 'Enter the date you made the payment (not in the future)' }],
      );
    }

    const referenceKey = normalizePaymentReference(dto.reference);
    const duplicate = await this.prisma.subscriptionPayment.findFirst({
      where: { method: dto.method, referenceKey, status: { not: 'REJECTED' } },
      select: { id: true },
    });
    if (duplicate) {
      throw duplicateReference();
    }

    let evidence: { key: string; type: DocumentType } | null = null;
    if (file) {
      const type = detectDocumentType(file.buffer);
      if (file.size > EVIDENCE_MAX_BYTES) {
        throw new AppException(
          HttpStatus.PAYLOAD_TOO_LARGE,
          'PAYLOAD_TOO_LARGE',
          'The receipt must be 5 MB or smaller',
        );
      }
      if (!type) {
        throw new AppException(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'UNSUPPORTED_MEDIA_TYPE',
          'Upload the receipt as a JPEG, PNG, WebP image or a PDF',
        );
      }
      evidence = { key: `${organizationId}/billing/${randomUUID()}.${extensionFor(type)}`, type };
      await this.documents.put(evidence.key, file.buffer, type);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const payment = await tx.subscriptionPayment.create({
          data: {
            organizationId,
            invoiceId: invoice.id,
            method: dto.method,
            amountMinor: dto.amountMinor,
            currency: invoice.currency,
            reference: dto.reference,
            referenceKey,
            paidOn: new Date(`${dto.paidOn}T00:00:00Z`),
            note: dto.note ?? null,
            evidenceKey: evidence?.key ?? null,
            evidenceContentType: evidence?.type ?? null,
            submittedByUserId: auth.user.id,
            submittedAt: now,
          },
          select: paymentSelect,
        });
        await this.audit.record(
          {
            action: AuditAction.BillingPaymentSubmitted,
            actorUserId: auth.user.id,
            organizationId,
            entityType: 'subscription_payment',
            entityId: payment.id,
            changes: {
              invoiceId: invoice.id,
              method: dto.method,
              amountMinor: dto.amountMinor,
              reference: dto.reference,
              evidence: evidence !== null,
            },
            meta,
          },
          tx,
        );
        return payment;
      });
      return toPaymentRecord(created);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw duplicateReference();
      }
      throw error;
    }
  }

  async evidence(organizationId: string | null, paymentId: string): Promise<EvidenceFile> {
    const notFound = new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Receipt not found');
    if (!z.uuid().safeParse(paymentId).success) {
      throw notFound;
    }
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, ...(organizationId ? { organizationId } : {}) },
      select: {
        evidenceKey: true,
        evidenceContentType: true,
        invoice: { select: { number: true } },
      },
    });
    if (!payment?.evidenceKey || !payment.evidenceContentType) {
      throw notFound;
    }
    const body = await this.documents.read(payment.evidenceKey);
    if (!body) {
      throw notFound;
    }
    const extension = payment.evidenceKey.split('.').at(-1) ?? 'bin';
    return {
      body,
      contentType: payment.evidenceContentType,
      filename: `receipt-${payment.invoice.number}.${extension}`,
    };
  }
}
