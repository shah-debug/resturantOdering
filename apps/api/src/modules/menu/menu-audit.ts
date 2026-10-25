import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { type AuditAction, AuditService } from '../audit/audit.service.js';
import type { AuthContext, RequestMeta } from '../auth/http/request-context.js';

export interface MenuActor {
  auth: AuthContext;
  organizationId: string;
  meta: RequestMeta;
}

@Injectable()
export class MenuAudit {
  constructor(private readonly audit: AuditService) {}

  record(
    tx: Prisma.TransactionClient,
    actor: MenuActor,
    action: AuditAction,
    entityType: string,
    entityId: string | null,
    changes: Prisma.InputJsonObject,
  ): Promise<void> {
    return this.audit.record(
      {
        action,
        actorUserId: actor.auth.user.id,
        organizationId: actor.organizationId,
        entityType,
        entityId,
        changes,
        meta: actor.meta,
      },
      tx,
    );
  }
}
