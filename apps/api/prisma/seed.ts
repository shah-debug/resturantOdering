import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BillingInterval,
  MembershipRole,
  MembershipStatus,
  NotificationChannel,
  NotificationStatus,
  OrderChannel,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  type Prisma,
  PrismaClient,
  ProductStatus,
  PromotionType,
  RiderAvailability,
  StatusActorType,
  SubscriptionStatus,
  VehicleType,
} from '../src/generated/prisma/client.js';
import { createPgPoolConfig } from '../src/database/pg-pool-config.js';
import { percentageDiscount, priceOrder } from '../src/modules/orders/domain/order-pricing.js';
import { assertDevelopmentSeedAllowed } from './seed/guard.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const DEMO_ORGANIZATION_SLUG = 'demo-karahi-house';
const TAX_RATE_BPS = 1_600;
const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

const PLANS = [
  {
    code: 'STARTER',
    name: 'Starter',
    priceMinor: 499_900,
    maxBranches: 1,
    maxProducts: 100,
    maxRiders: 5,
    sortOrder: 1,
  },
  {
    code: 'GROWTH',
    name: 'Growth',
    priceMinor: 999_900,
    maxBranches: 3,
    maxProducts: 500,
    maxRiders: 20,
    sortOrder: 2,
  },
  {
    code: 'SCALE',
    name: 'Scale',
    priceMinor: 2_499_900,
    maxBranches: null,
    maxProducts: null,
    maxRiders: null,
    sortOrder: 3,
  },
] as const;

const ADD_ON_GROUPS = [
  {
    name: 'Extras',
    minSelect: 0,
    maxSelect: 3,
    addOns: [
      { name: 'Extra Naan', priceMinor: 6_000 },
      { name: 'Raita', priceMinor: 15_000 },
      { name: 'Salad', priceMinor: 10_000 },
    ],
  },
  {
    name: 'Spice Level',
    minSelect: 1,
    maxSelect: 1,
    addOns: [
      { name: 'Mild', priceMinor: 0 },
      { name: 'Medium', priceMinor: 0 },
      { name: 'Hot', priceMinor: 0 },
    ],
  },
] as const;

const MENU = [
  {
    category: { name: 'Karahi', slug: 'karahi' },
    products: [
      {
        name: 'Chicken Karahi',
        slug: 'chicken-karahi',
        variants: [
          { name: 'Half', priceMinor: 145_000 },
          { name: 'Full', priceMinor: 270_000 },
        ],
        addOnGroups: ['Extras', 'Spice Level'],
      },
    ],
  },
  {
    category: { name: 'BBQ', slug: 'bbq' },
    products: [
      {
        name: 'Seekh Kebab (4 pcs)',
        slug: 'seekh-kebab',
        variants: [{ name: 'Regular', priceMinor: 90_000 }],
        addOnGroups: ['Extras'],
      },
    ],
  },
  {
    category: { name: 'Rice', slug: 'rice' },
    products: [
      {
        name: 'Chicken Biryani',
        slug: 'chicken-biryani',
        variants: [
          { name: 'Single', priceMinor: 55_000 },
          { name: 'Family', priceMinor: 160_000 },
        ],
        addOnGroups: ['Extras'],
      },
    ],
  },
  {
    category: { name: 'Drinks', slug: 'drinks' },
    products: [
      {
        name: 'Soft Drink',
        slug: 'soft-drink',
        variants: [
          { name: 'Regular', priceMinor: 12_000 },
          { name: '1.5 Litre', priceMinor: 28_000 },
        ],
        addOnGroups: [],
      },
    ],
  },
] as const;

interface CatalogVariant {
  id: string;
  name: string;
  priceMinor: number;
}

interface CatalogProduct {
  id: string;
  name: string;
  variants: Map<string, CatalogVariant>;
}

interface CatalogAddOn {
  id: string;
  name: string;
  groupName: string;
  priceMinor: number;
}

interface Catalog {
  products: Map<string, CatalogProduct>;
  addOns: Map<string, CatalogAddOn>;
}

interface OrderLineSpec {
  productSlug: string;
  variantName: string;
  quantity: number;
  addOns: readonly { name: string; quantity: number }[];
}

interface OrderSpec {
  type: OrderType;
  customer: { id: string; fullName: string; phone: string };
  delivery?: {
    zoneId: string;
    feeMinor: number;
    addressLine: string;
    area: string;
    city: string;
    landmark: string | null;
  };
  lines: readonly OrderLineSpec[];
  promotion?: { id: string; code: string; percentBps: number; maxDiscountMinor: number };
  progress: readonly OrderStatus[];
  riderId?: string;
}

interface TenantContext {
  organizationId: string;
  branchId: string;
  catalog: Catalog;
  staffUserId: string;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Seed data is inconsistent: ${label} not found`);
  }
  return value;
}

async function seedPlans(prisma: PrismaClient) {
  const plans = [];
  for (const plan of PLANS) {
    plans.push(
      await prisma.plan.upsert({
        where: { code: plan.code },
        update: {},
        create: {
          ...plan,
          description: 'Development seed plan with fictional pricing',
          billingInterval: BillingInterval.MONTHLY,
          trialDays: 14,
        },
      }),
    );
  }
  return plans;
}

async function seedUser(tx: Tx, email: string, fullName: string, phone: string) {
  return tx.user.upsert({
    where: { email },
    update: {},
    create: { email, fullName, phone, emailVerifiedAt: new Date() },
  });
}

async function seedCatalog(tx: Tx, organizationId: string): Promise<Catalog> {
  const groupIds = new Map<string, string>();
  const addOns = new Map<string, CatalogAddOn>();

  for (const [groupIndex, group] of ADD_ON_GROUPS.entries()) {
    const created = await tx.addOnGroup.create({
      data: {
        organizationId,
        name: group.name,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        sortOrder: groupIndex,
      },
    });
    groupIds.set(group.name, created.id);
    for (const [addOnIndex, addOn] of group.addOns.entries()) {
      const createdAddOn = await tx.addOn.create({
        data: {
          organizationId,
          addOnGroupId: created.id,
          name: addOn.name,
          priceMinor: addOn.priceMinor,
          sortOrder: addOnIndex,
        },
      });
      addOns.set(addOn.name, {
        id: createdAddOn.id,
        name: addOn.name,
        groupName: group.name,
        priceMinor: addOn.priceMinor,
      });
    }
  }

  const products = new Map<string, CatalogProduct>();
  for (const [categoryIndex, section] of MENU.entries()) {
    const category = await tx.category.create({
      data: { organizationId, ...section.category, sortOrder: categoryIndex },
    });
    for (const [productIndex, product] of section.products.entries()) {
      const createdProduct = await tx.product.create({
        data: {
          organizationId,
          categoryId: category.id,
          name: product.name,
          slug: product.slug,
          description: 'Fictional menu item for development',
          status: ProductStatus.PUBLISHED,
          sortOrder: productIndex,
        },
      });
      const variants = new Map<string, CatalogVariant>();
      for (const [variantIndex, variant] of product.variants.entries()) {
        const createdVariant = await tx.productVariant.create({
          data: {
            organizationId,
            productId: createdProduct.id,
            name: variant.name,
            priceMinor: variant.priceMinor,
            isDefault: variantIndex === 0,
            sortOrder: variantIndex,
          },
        });
        variants.set(variant.name, {
          id: createdVariant.id,
          name: variant.name,
          priceMinor: variant.priceMinor,
        });
      }
      for (const [linkIndex, groupName] of product.addOnGroups.entries()) {
        await tx.productAddOnGroup.create({
          data: {
            organizationId,
            productId: createdProduct.id,
            addOnGroupId: requireValue(groupIds.get(groupName), `add-on group ${groupName}`),
            sortOrder: linkIndex,
          },
        });
      }
      products.set(product.slug, { id: createdProduct.id, name: product.name, variants });
    }
  }

  return { products, addOns };
}

async function createOrder(
  tx: Tx,
  context: TenantContext,
  spec: OrderSpec,
): Promise<{ id: string; totalMinor: number }> {
  const lines = spec.lines.map((line) => {
    const product = requireValue(
      context.catalog.products.get(line.productSlug),
      `product ${line.productSlug}`,
    );
    const variant = requireValue(
      product.variants.get(line.variantName),
      `variant ${line.variantName}`,
    );
    const addOns = line.addOns.map((selection) => ({
      ...requireValue(context.catalog.addOns.get(selection.name), `add-on ${selection.name}`),
      quantity: selection.quantity,
    }));
    return { line, product, variant, addOns };
  });

  const subtotalBeforeDiscount = lines.reduce(
    (sum, { line, variant, addOns }) =>
      sum +
      (variant.priceMinor +
        addOns.reduce((total, addOn) => total + addOn.priceMinor * addOn.quantity, 0)) *
        line.quantity,
    0,
  );
  const orderDiscountMinor = spec.promotion
    ? percentageDiscount(
        subtotalBeforeDiscount,
        spec.promotion.percentBps,
        spec.promotion.maxDiscountMinor,
      )
    : 0;

  const pricing = priceOrder({
    lines: lines.map(({ line, variant, addOns }) => ({
      unitPriceMinor: variant.priceMinor,
      quantity: line.quantity,
      addOns: addOns.map((addOn) => ({
        unitPriceMinor: addOn.priceMinor,
        quantity: addOn.quantity,
      })),
    })),
    taxRateBps: TAX_RATE_BPS,
    pricesIncludeTax: false,
    orderDiscountMinor,
    deliveryFeeMinor: spec.delivery?.feeMinor ?? 0,
    deliveryDiscountMinor: 0,
    roundToWholeRupee: true,
  });

  const { lastOrderNumber } = await tx.organization.update({
    where: { id: context.organizationId },
    data: { lastOrderNumber: { increment: 1 } },
    select: { lastOrderNumber: true },
  });

  const order = await tx.order.create({
    data: {
      organizationId: context.organizationId,
      branchId: context.branchId,
      customerId: spec.customer.id,
      orderNumber: lastOrderNumber,
      type: spec.type,
      channel: OrderChannel.STOREFRONT,
      paymentMethod: PaymentMethod.CASH,
      subtotalMinor: pricing.subtotalMinor,
      discountMinor: pricing.discountMinor,
      taxMinor: pricing.taxMinor,
      taxRateBps: TAX_RATE_BPS,
      pricesIncludeTax: false,
      deliveryFeeMinor: pricing.deliveryFeeMinor,
      deliveryDiscountMinor: pricing.deliveryDiscountMinor,
      roundingAdjustmentMinor: pricing.roundingAdjustmentMinor,
      totalMinor: pricing.totalMinor,
      promotionId: spec.promotion?.id ?? null,
      promotionCode: spec.promotion?.code ?? null,
      customerName: spec.customer.fullName,
      customerPhone: spec.customer.phone,
      deliveryZoneId: spec.delivery?.zoneId ?? null,
      deliveryAddressLine: spec.delivery?.addressLine ?? null,
      deliveryArea: spec.delivery?.area ?? null,
      deliveryCity: spec.delivery?.city ?? null,
      deliveryLandmark: spec.delivery?.landmark ?? null,
      customerNote: 'Fictional development order',
    },
  });

  for (const [index, { line, product, variant, addOns }] of lines.entries()) {
    const priced = requireValue(pricing.lines[index], `priced line ${index}`);
    const item = await tx.orderItem.create({
      data: {
        organizationId: context.organizationId,
        orderId: order.id,
        productId: product.id,
        variantId: variant.id,
        productName: product.name,
        variantName: variant.name,
        quantity: line.quantity,
        unitPriceMinor: variant.priceMinor,
        addOnsTotalMinor: priced.addOnsTotalMinor,
        lineSubtotalMinor: priced.lineSubtotalMinor,
        discountMinor: priced.discountMinor,
        taxMinor: priced.taxMinor,
      },
    });
    if (addOns.length > 0) {
      await tx.orderItemAddOn.createMany({
        data: addOns.map((addOn) => ({
          organizationId: context.organizationId,
          orderItemId: item.id,
          addOnId: addOn.id,
          groupName: addOn.groupName,
          name: addOn.name,
          unitPriceMinor: addOn.priceMinor,
          quantity: addOn.quantity,
        })),
      });
    }
  }

  await tx.orderStatusHistory.create({
    data: {
      organizationId: context.organizationId,
      orderId: order.id,
      toStatus: OrderStatus.PENDING,
      actorType: StatusActorType.CUSTOMER,
    },
  });

  let previous: OrderStatus = OrderStatus.PENDING;
  for (const status of spec.progress) {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status,
        ...(status === OrderStatus.OUT_FOR_DELIVERY && spec.riderId
          ? { riderId: spec.riderId }
          : {}),
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        organizationId: context.organizationId,
        orderId: order.id,
        fromStatus: previous,
        toStatus: status,
        actorType: StatusActorType.STAFF,
        changedByUserId: context.staffUserId,
      },
    });
    previous = status;
  }

  return { id: order.id, totalMinor: pricing.totalMinor };
}

async function seedDemoTenant(
  tx: Tx,
  plan: { id: string; priceMinor: number },
  owner: { id: string },
  manager: { id: string },
): Promise<void> {
  const now = new Date();
  const organization = await tx.organization.create({
    data: {
      slug: DEMO_ORGANIZATION_SLUG,
      name: 'Demo Karahi House (Fictional)',
      contactEmail: 'hello@example.com',
      contactPhone: '+920000000100',
      primaryColor: '#B45309',
    },
  });
  const organizationId = organization.id;

  await tx.organizationDomain.create({
    data: {
      organizationId,
      hostname: `${DEMO_ORGANIZATION_SLUG}.localhost`,
      isPrimary: true,
      verifiedAt: now,
    },
  });

  await tx.subscription.create({
    data: {
      organizationId,
      planId: plan.id,
      status: SubscriptionStatus.TRIALING,
      priceMinor: plan.priceMinor,
      billingInterval: BillingInterval.MONTHLY,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 14 * DAY_MS),
      trialEndsAt: new Date(now.getTime() + 14 * DAY_MS),
    },
  });

  const branch = await tx.branch.create({
    data: {
      organizationId,
      name: 'Gulberg (Demo)',
      slug: 'gulberg',
      phone: '+920000000101',
      addressLine: '1 Example Road (fictional address)',
      area: 'Gulberg',
      city: 'Lahore',
      taxRateBps: TAX_RATE_BPS,
      pricesIncludeTax: false,
    },
  });

  await tx.membership.createMany({
    data: [
      {
        organizationId,
        userId: owner.id,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
        acceptedAt: now,
      },
      {
        organizationId,
        userId: manager.id,
        branchId: branch.id,
        role: MembershipRole.MANAGER,
        status: MembershipStatus.ACTIVE,
        acceptedAt: now,
      },
    ],
  });

  const catalog = await seedCatalog(tx, organizationId);

  const zone = await tx.deliveryZone.create({
    data: {
      organizationId,
      branchId: branch.id,
      name: 'Gulberg & Model Town (Demo)',
      feeMinor: 15_000,
      minOrderMinor: 80_000,
      estimatedMinutes: 45,
    },
  });
  await tx.deliveryZoneArea.createMany({
    data: ['Gulberg', 'Model Town'].map((name) => ({
      organizationId,
      deliveryZoneId: zone.id,
      name,
    })),
  });

  const rider = await tx.rider.create({
    data: {
      organizationId,
      branchId: branch.id,
      fullName: 'Demo Rider One',
      phone: '+920000000201',
      vehicleType: VehicleType.MOTORCYCLE,
      vehicleNumber: 'DEMO-001',
      availability: RiderAvailability.AVAILABLE,
    },
  });

  const firstCustomer = await tx.customer.create({
    data: {
      organizationId,
      phone: '+920000000301',
      fullName: 'Demo Customer One',
      email: 'customer.one@example.com',
    },
  });
  const secondCustomer = await tx.customer.create({
    data: { organizationId, phone: '+920000000302', fullName: 'Demo Customer Two' },
  });

  const address = await tx.customerAddress.create({
    data: {
      organizationId,
      customerId: firstCustomer.id,
      label: 'Home',
      addressLine: 'House 0, Example Street (fictional)',
      area: 'Gulberg',
      city: 'Lahore',
      landmark: 'Near the demo park',
      isDefault: true,
    },
  });

  const promotion = await tx.promotion.create({
    data: {
      organizationId,
      code: 'WELCOME10',
      name: '10% off your first order (demo)',
      type: PromotionType.PERCENTAGE,
      percentBps: 1_000,
      maxDiscountMinor: 30_000,
      minOrderMinor: 100_000,
      startsAt: now,
      perCustomerLimit: 1,
    },
  });

  const context: TenantContext = {
    organizationId,
    branchId: branch.id,
    catalog,
    staffUserId: manager.id,
  };

  const deliveredOrder = await createOrder(tx, context, {
    type: OrderType.DELIVERY,
    customer: firstCustomer,
    delivery: {
      zoneId: zone.id,
      feeMinor: zone.feeMinor,
      addressLine: address.addressLine,
      area: address.area ?? 'Gulberg',
      city: address.city,
      landmark: address.landmark,
    },
    lines: [
      {
        productSlug: 'chicken-karahi',
        variantName: 'Full',
        quantity: 1,
        addOns: [
          { name: 'Extra Naan', quantity: 2 },
          { name: 'Medium', quantity: 1 },
        ],
      },
      {
        productSlug: 'chicken-biryani',
        variantName: 'Single',
        quantity: 2,
        addOns: [{ name: 'Raita', quantity: 1 }],
      },
      { productSlug: 'soft-drink', variantName: '1.5 Litre', quantity: 1, addOns: [] },
    ],
    promotion: {
      id: promotion.id,
      code: promotion.code,
      percentBps: 1_000,
      maxDiscountMinor: 30_000,
    },
    progress: [
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ],
    riderId: rider.id,
  });

  await tx.payment.create({
    data: {
      organizationId,
      orderId: deliveredOrder.id,
      method: PaymentMethod.CASH,
      status: PaymentStatus.SUCCEEDED,
      amountMinor: deliveredOrder.totalMinor,
      collectedByRiderId: rider.id,
      paidAt: new Date(),
    },
  });
  await tx.order.update({
    where: { id: deliveredOrder.id },
    data: { paymentStatus: OrderPaymentStatus.PAID },
  });
  await tx.promotion.update({
    where: { id: promotion.id },
    data: { timesRedeemed: { increment: 1 } },
  });

  await createOrder(tx, context, {
    type: OrderType.PICKUP,
    customer: secondCustomer,
    lines: [
      {
        productSlug: 'seekh-kebab',
        variantName: 'Regular',
        quantity: 2,
        addOns: [{ name: 'Salad', quantity: 1 }],
      },
    ],
    progress: [],
  });

  await tx.notification.create({
    data: {
      organizationId,
      channel: NotificationChannel.SMS,
      template: 'order.delivered',
      recipient: firstCustomer.phone,
      payload: { orderId: deliveredOrder.id },
      status: NotificationStatus.SENT,
      attempts: 1,
      sentAt: new Date(),
      orderId: deliveredOrder.id,
      customerId: firstCustomer.id,
    },
  });

  await tx.auditLog.create({
    data: {
      organizationId,
      actorUserId: owner.id,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organizationId,
      changes: { source: 'development-seed' },
    },
  });
}

async function main(): Promise<void> {
  const target = assertDevelopmentSeedAllowed(process.env, process.argv.slice(2));
  log(`Seeding development database at ${target.description}`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPgPoolConfig({
        url: target.databaseUrl,
        sslCaPath: process.env.DATABASE_SSL_CA_PATH,
        poolMax: 1,
        connectionTimeoutMs: 10_000,
        statementTimeoutMs: 60_000,
      }),
    ),
  });
  try {
    const plans = await seedPlans(prisma);
    log(`Plans ready: ${plans.map((plan) => plan.code).join(', ')}`);

    const existing = await prisma.organization.findUnique({
      where: { slug: DEMO_ORGANIZATION_SLUG },
    });
    if (existing) {
      log(
        `Demo organization "${DEMO_ORGANIZATION_SLUG}" already exists; leaving tenant data unchanged.`,
      );
      return;
    }

    const starter = requireValue(plans[0], 'starter plan');

    await prisma.$transaction(
      async (tx) => {
        const owner = await seedUser(tx, 'demo.owner@example.com', 'Demo Owner', '+920000000001');
        const manager = await seedUser(
          tx,
          'demo.manager@example.com',
          'Demo Manager',
          '+920000000002',
        );
        await seedDemoTenant(tx, starter, owner, manager);
      },
      { timeout: 60_000 },
    );
    log(
      `Demo organization "${DEMO_ORGANIZATION_SLUG}" created with catalog, customers, rider and 2 orders.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
