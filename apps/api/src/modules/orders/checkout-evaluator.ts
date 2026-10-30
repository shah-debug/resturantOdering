import {
  type CheckoutIssue,
  type CheckoutQuote,
  formatRupees,
  getOpenStatus,
  minutesToTime,
  type PaymentMethod,
  type PricedLine,
  resolveProductSelection,
} from '@app/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { storefrontProductSelect, toStorefrontProduct } from '../storefront/storefront-menu.js';
import { type DeliveryZoneCandidate, matchDeliveryZone } from './domain/delivery-zones.js';
import { type OrderPricing, percentageDiscount, priceOrder } from './domain/order-pricing.js';

export const ENABLED_PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH'];

export interface CheckoutInput {
  branchId: string;
  fulfillment:
    | { type: 'PICKUP' }
    | {
        type: 'DELIVERY';
        address: {
          addressLine?: string;
          area: string;
          city: string;
          landmark?: string | null;
          latitude?: number | null;
          longitude?: number | null;
        };
        instructions?: string | null;
      };
  paymentMethod: PaymentMethod;
  promoCode?: string | null;
  items: { productId: string; variantId: string; addOnIds: string[]; quantity: number }[];
}

export interface CheckoutOrganization {
  id: string;
  slug: string;
  name: string;
  currency: string;
  timezone: string;
}

export interface EvaluatedLine extends PricedLine {
  addOnSnapshots: { id: string; name: string; groupName: string; priceMinor: number }[];
}

export interface EvaluatedPromotion {
  id: string;
  code: string;
  name: string;
}

export interface CheckoutEvaluation {
  branch: { id: string; taxRateBps: number; pricesIncludeTax: boolean } | null;
  zone: DeliveryZoneCandidate | null;
  promotion: EvaluatedPromotion | null;
  lines: EvaluatedLine[];
  pricing: OrderPricing | null;
  issues: CheckoutIssue[];
  quote: CheckoutQuote;
}

type Db = Prisma.TransactionClient;

const branchSelect = {
  id: true,
  city: true,
  latitude: true,
  longitude: true,
  isAcceptingOrders: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  preparationMinutes: true,
  taxRateBps: true,
  pricesIncludeTax: true,
  openingHours: {
    select: { dayOfWeek: true, opensAtMinutes: true, closesAtMinutes: true },
  },
  deliveryZones: {
    where: { isActive: true, archivedAt: null },
    select: {
      id: true,
      name: true,
      feeMinor: true,
      minOrderMinor: true,
      estimatedMinutes: true,
      radiusMeters: true,
      areas: { select: { name: true } },
    },
  },
} satisfies Prisma.BranchSelect;

async function lockMenuRows(db: Db, organizationId: string, input: CheckoutInput): Promise<void> {
  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const variantIds = [...new Set(input.items.map((item) => item.variantId))];
  const addOnIds = [...new Set(input.items.flatMap((item) => item.addOnIds))];
  await db.$queryRaw`
    SELECT b.id FROM branches b
    WHERE b.organization_id = ${organizationId}::uuid AND b.id = ${input.branchId}::uuid
    FOR SHARE`;
  await db.$queryRaw`
    SELECT p.id FROM products p
    JOIN categories c ON c.id = p.category_id AND c.organization_id = p.organization_id
    WHERE p.organization_id = ${organizationId}::uuid AND p.id = ANY(${productIds}::uuid[])
    FOR SHARE OF p, c`;
  await db.$queryRaw`
    SELECT v.id FROM product_variants v
    WHERE v.organization_id = ${organizationId}::uuid AND v.id = ANY(${variantIds}::uuid[])
    FOR SHARE`;
  await db.$queryRaw`
    SELECT link.product_id FROM product_add_on_groups link
    WHERE link.organization_id = ${organizationId}::uuid
      AND link.product_id = ANY(${productIds}::uuid[])
    FOR SHARE`;
  if (addOnIds.length > 0) {
    await db.$queryRaw`
      SELECT a.id FROM add_ons a
      JOIN add_on_groups g ON g.id = a.add_on_group_id AND g.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId}::uuid AND a.id = ANY(${addOnIds}::uuid[])
      FOR SHARE OF a, g`;
  }
}

function issue(code: CheckoutIssue['code'], field: string, message: string): CheckoutIssue {
  return { code, field, message };
}

export async function evaluateCheckout(
  db: Db,
  organization: CheckoutOrganization,
  input: CheckoutInput,
  options: { now: Date; lock: boolean; customerPhone?: string },
): Promise<CheckoutEvaluation> {
  const issues: CheckoutIssue[] = [];
  if (options.lock) {
    await lockMenuRows(db, organization.id, input);
  }

  const branch = await db.branch.findFirst({
    where: { id: input.branchId, organizationId: organization.id, status: 'ACTIVE' },
    select: branchSelect,
  });

  const productIds = [...new Set(input.items.map((item) => item.productId))];
  const rows = await db.product.findMany({
    where: {
      organizationId: organization.id,
      id: { in: productIds },
      status: 'PUBLISHED',
      archivedAt: null,
      category: { isActive: true, archivedAt: null },
    },
    select: storefrontProductSelect,
  });
  const products = new Map(rows.map((row) => [row.id, toStorefrontProduct(row)]));

  const lines: EvaluatedLine[] = [];
  input.items.forEach((item, index) => {
    const product = products.get(item.productId);
    if (!product) {
      issues.push(
        issue(
          'ITEM_UNAVAILABLE',
          `items.${index}`,
          'An item in your cart is no longer on the menu',
        ),
      );
      return;
    }
    const result = resolveProductSelection(product, item);
    if (!result.ok) {
      issues.push(issue('ITEM_UNAVAILABLE', `items.${index}`, `${product.name}: ${result.reason}`));
      return;
    }
    const groupNames = new Map(
      product.addOnGroups.flatMap((group) => group.addOns.map((addOn) => [addOn.id, group.name])),
    );
    const addOnSnapshots = result.addOns.map((addOn) => ({
      id: addOn.id,
      name: addOn.name,
      groupName: groupNames.get(addOn.id) ?? '',
      priceMinor: addOn.priceMinor,
    }));
    const addOnsTotalMinor = addOnSnapshots.reduce((sum, addOn) => sum + addOn.priceMinor, 0);
    lines.push({
      productId: product.id,
      variantId: result.variant.id,
      productName: product.name,
      variantName: result.variant.name,
      addOns: addOnSnapshots,
      addOnSnapshots,
      quantity: item.quantity,
      unitPriceMinor: result.variant.priceMinor,
      addOnsTotalMinor,
      lineSubtotalMinor: (result.variant.priceMinor + addOnsTotalMinor) * item.quantity,
    });
  });

  if (!ENABLED_PAYMENT_METHODS.includes(input.paymentMethod)) {
    issues.push(
      issue(
        'PAYMENT_METHOD_UNAVAILABLE',
        'paymentMethod',
        'This payment method is not available. Please pay with cash.',
      ),
    );
  }

  let zone: DeliveryZoneCandidate | null = null;
  if (!branch) {
    issues.push(
      issue('BRANCH_UNAVAILABLE', 'branchId', 'This location is not taking online orders'),
    );
  } else {
    const intervals = branch.openingHours.map((interval) => ({
      dayOfWeek: interval.dayOfWeek,
      opensAt: minutesToTime(interval.opensAtMinutes),
      closesAt: minutesToTime(interval.closesAtMinutes),
    }));
    if (!branch.isAcceptingOrders) {
      issues.push(
        issue('STORE_CLOSED', 'branchId', 'This restaurant is not taking online orders right now'),
      );
    } else if (!getOpenStatus(intervals, organization.timezone, options.now).isOpen) {
      issues.push(issue('STORE_CLOSED', 'branchId', 'This restaurant is closed right now'));
    }

    if (input.fulfillment.type === 'PICKUP' && !branch.pickupEnabled) {
      issues.push(
        issue('FULFILLMENT_UNAVAILABLE', 'fulfillment.type', 'Pickup is not available here'),
      );
    }
    if (input.fulfillment.type === 'DELIVERY') {
      if (!branch.deliveryEnabled) {
        issues.push(
          issue('FULFILLMENT_UNAVAILABLE', 'fulfillment.type', 'Delivery is not available here'),
        );
      } else {
        const { address } = input.fulfillment;
        zone = matchDeliveryZone(
          branch.deliveryZones.map((candidate) => ({
            ...candidate,
            areas: candidate.areas.map((area) => area.name),
          })),
          {
            city: branch.city,
            coordinates:
              branch.latitude && branch.longitude
                ? { latitude: Number(branch.latitude), longitude: Number(branch.longitude) }
                : null,
          },
          {
            area: address.area,
            city: address.city,
            coordinates:
              typeof address.latitude === 'number' && typeof address.longitude === 'number'
                ? { latitude: address.latitude, longitude: address.longitude }
                : null,
          },
        );
        if (!zone) {
          issues.push(
            issue(
              'DELIVERY_UNAVAILABLE',
              'fulfillment.address.area',
              'Sorry, we don’t deliver to this address yet',
            ),
          );
        }
      }
    }
  }

  const subtotalMinor = lines.reduce((sum, line) => sum + line.lineSubtotalMinor, 0);
  if (zone && lines.length > 0 && subtotalMinor < zone.minOrderMinor) {
    issues.push(
      issue(
        'MINIMUM_ORDER_NOT_MET',
        'items',
        `The minimum order for delivery is ${formatRupees(zone.minOrderMinor)}`,
      ),
    );
  }

  const deliveryFeeMinor = input.fulfillment.type === 'DELIVERY' && zone ? zone.feeMinor : 0;
  let orderDiscountMinor = 0;
  let deliveryDiscountMinor = 0;
  let promotion: EvaluatedPromotion | null = null;

  if (input.promoCode) {
    const found = await db.promotion.findFirst({
      where: { organizationId: organization.id, code: input.promoCode, archivedAt: null },
    });
    const now = options.now;
    let problem: string | null = null;
    if (!found || !found.isActive || found.startsAt > now) {
      problem = 'This code isn’t valid';
    } else if (found.endsAt && found.endsAt <= now) {
      problem = 'This code has expired';
    } else if (found.usageLimit !== null && found.timesRedeemed >= found.usageLimit) {
      problem = 'This code has been fully redeemed';
    } else if (subtotalMinor < found.minOrderMinor) {
      problem = `Spend at least ${formatRupees(found.minOrderMinor)} to use this code`;
    } else if (found.type === 'FREE_DELIVERY' && input.fulfillment.type !== 'DELIVERY') {
      problem = 'This code only applies to delivery orders';
    } else if (found.perCustomerLimit !== null && options.customerPhone) {
      const used = await db.order.count({
        where: {
          organizationId: organization.id,
          promotionId: found.id,
          customerPhone: options.customerPhone,
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
      });
      if (used >= found.perCustomerLimit) {
        problem = 'You have already used this code';
      }
    }

    if (problem || !found) {
      issues.push(issue('PROMOTION_INVALID', 'promoCode', problem ?? 'This code isn’t valid'));
    } else {
      promotion = { id: found.id, code: found.code, name: found.name };
      if (found.type === 'PERCENTAGE') {
        orderDiscountMinor = percentageDiscount(
          subtotalMinor,
          found.percentBps ?? 0,
          found.maxDiscountMinor,
        );
      } else if (found.type === 'FIXED_AMOUNT') {
        orderDiscountMinor = Math.min(found.amountMinor ?? 0, subtotalMinor);
      } else {
        deliveryDiscountMinor = deliveryFeeMinor;
      }
    }
  }

  const pricing =
    lines.length > 0 && branch
      ? priceOrder({
          lines: lines.map((line) => ({
            unitPriceMinor: line.unitPriceMinor,
            quantity: line.quantity,
            addOns: line.addOnSnapshots.map((addOn) => ({
              unitPriceMinor: addOn.priceMinor,
              quantity: 1,
            })),
          })),
          taxRateBps: branch.taxRateBps,
          pricesIncludeTax: branch.pricesIncludeTax,
          orderDiscountMinor,
          deliveryFeeMinor,
          deliveryDiscountMinor,
          roundToWholeRupee: input.paymentMethod === 'CASH',
        })
      : null;

  const estimatedMinutes =
    input.fulfillment.type === 'DELIVERY'
      ? (zone?.estimatedMinutes ?? null)
      : (branch?.preparationMinutes ?? null);

  return {
    branch: branch
      ? { id: branch.id, taxRateBps: branch.taxRateBps, pricesIncludeTax: branch.pricesIncludeTax }
      : null,
    zone,
    promotion,
    lines,
    pricing,
    issues,
    quote: {
      lines: lines.map(({ addOnSnapshots: _snapshots, ...line }) => line),
      totals:
        pricing && branch
          ? {
              currency: organization.currency,
              subtotalMinor: pricing.subtotalMinor,
              discountMinor: pricing.discountMinor,
              taxMinor: pricing.taxMinor,
              taxRateBps: branch.taxRateBps,
              pricesIncludeTax: branch.pricesIncludeTax,
              deliveryFeeMinor: pricing.deliveryFeeMinor,
              deliveryDiscountMinor: pricing.deliveryDiscountMinor,
              roundingAdjustmentMinor: pricing.roundingAdjustmentMinor,
              totalMinor: pricing.totalMinor,
            }
          : null,
      promotion: promotion ? { code: promotion.code, name: promotion.name } : null,
      estimatedMinutes,
      paymentMethods: [...ENABLED_PAYMENT_METHODS],
      issues,
      canPlaceOrder: issues.length === 0 && pricing !== null,
    },
  };
}
