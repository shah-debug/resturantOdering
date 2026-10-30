import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { createVerifiedUser, PASSWORD, signIn, uniqueEmail } from './support';

const ORIGIN = { Origin: 'http://localhost:3100' };
const ALL_DAY = [1, 2, 3, 4, 5, 6, 7].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '00:00', closesAt: '12:00' },
  { dayOfWeek, opensAt: '12:00', closesAt: '00:00' },
]);

interface Seeded {
  organizationId: string;
  slug: string;
  branchId: string;
  karahiId: string;
  halfId: string;
  naanId: string;
}

async function call<T>(
  request: APIRequestContext,
  method: 'post' | 'put' | 'patch',
  path: string,
  data: object,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await request[method](`/api/v1${path}`, {
    data,
    headers: { ...ORIGIN, ...headers },
  });
  expect(response.ok(), `${method} ${path} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

async function seedRestaurant(request: APIRequestContext, email: string): Promise<Seeded> {
  await call(request, 'post', '/auth/login', { email, password: PASSWORD });
  const slug = `ops-${randomUUID().slice(0, 8)}`;
  const { id: organizationId } = await call<{ id: string }>(request, 'post', '/organizations', {
    name: 'Ops Karahi',
    slug,
  });
  const base = `/organizations/${organizationId}`;
  await call(request, 'patch', base, {
    description: 'Charcoal karahi and fresh naan, cooked to order.',
    contactPhone: '+923111111111',
  });
  const { id: branchId } = await call<{ id: string }>(request, 'post', `${base}/branches`, {
    name: 'Gulberg',
    phone: '+924235000000',
    addressLine: '12 Main Boulevard',
    area: 'Gulberg III',
    city: 'Lahore',
  });
  await call(request, 'put', `${base}/branches/${branchId}/opening-hours`, { intervals: ALL_DAY });
  await call(request, 'put', `${base}/branches/${branchId}/fulfillment`, {
    deliveryEnabled: true,
    pickupEnabled: true,
    preparationMinutes: 20,
    delivery: { feeMinor: 15_000, minimumOrderMinor: 0, estimatedMinutes: 40 },
  });
  const { id: categoryId } = await call<{ id: string }>(
    request,
    'post',
    `${base}/menu/categories`,
    {
      name: 'Karahi',
    },
  );
  const bread = await call<{ id: string; addOns: { id: string }[] }>(
    request,
    'post',
    `${base}/menu/add-on-groups`,
    {
      name: 'Bread',
      minSelect: 1,
      maxSelect: 1,
      addOns: [{ name: 'Naan', priceMinor: 5_000, isAvailable: true }],
    },
  );
  const karahi = await call<{ id: string; variants: { id: string }[] }>(
    request,
    'post',
    `${base}/menu/products`,
    {
      categoryId,
      name: 'Chicken Karahi',
      status: 'PUBLISHED',
      isAvailable: true,
      variants: [{ name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true }],
      addOnGroupIds: [bread.id],
    },
  );
  await call(request, 'post', `${base}/onboarding/complete`, {});
  return {
    organizationId,
    slug,
    branchId,
    karahiId: karahi.id,
    halfId: karahi.variants[0]?.id ?? '',
    naanId: bread.addOns[0]?.id ?? '',
  };
}

async function placeOrder(request: APIRequestContext, seeded: Seeded, type: 'DELIVERY' | 'PICKUP') {
  const body = {
    branchId: seeded.branchId,
    fulfillment:
      type === 'PICKUP'
        ? { type: 'PICKUP' }
        : {
            type: 'DELIVERY',
            address: { addressLine: '45 Canal View Road', area: 'Model Town', city: 'Lahore' },
            instructions: 'Ring the bell twice',
          },
    paymentMethod: 'CASH',
    items: [
      {
        productId: seeded.karahiId,
        variantId: seeded.halfId,
        addOnIds: [seeded.naanId],
        quantity: 2,
      },
    ],
  };
  const quote = await call<{ totals: { totalMinor: number } }>(
    request,
    'post',
    `/storefront/restaurants/${seeded.slug}/checkout/quote`,
    body,
  );
  return call<{ orderId: string; orderNumber: number }>(
    request,
    'post',
    `/storefront/restaurants/${seeded.slug}/orders`,
    {
      ...body,
      customer: { name: 'Bilal Ahmed', phone: '+923009876543' },
      note: 'Less spicy',
      expectedTotalMinor: quote.totals.totalMinor,
    },
    { 'Idempotency-Key': randomUUID() },
  );
}

async function openSection(page: Page, seeded: Seeded, section: string) {
  await page.goto(`/organizations/${seeded.organizationId}/${section}`);
}

test.describe('restaurant order operations', () => {
  let email: string;
  let seeded: Seeded;

  test.beforeEach(async ({ request }) => {
    email = uniqueEmail('ops-owner');
    await createVerifiedUser(request, email);
    seeded = await seedRestaurant(request, email);
  });

  test('receives a live order and takes it from kitchen to delivery', async ({ page, request }) => {
    await signIn(page, email);
    await expect(page).toHaveURL(/\/organizations\//);
    await openSection(page, seeded, 'riders');
    await page.getByRole('button', { name: 'Add rider' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Full name').fill('Imran Khan');
    await dialog.getByLabel('Mobile number').fill('0300 1110001');
    await dialog.getByRole('button', { name: 'Add rider' }).click();
    await expect(page.getByText('Imran Khan')).toBeVisible();

    await openSection(page, seeded, 'orders');
    await expect(page.getByText('No new orders')).toBeVisible();
    await expect(page.getByText('Live', { exact: true })).toBeVisible();

    const order = await placeOrder(request, seeded, 'DELIVERY');
    await expect(page.getByText(`New order #${order.orderNumber}`)).toBeVisible();
    await expect(page.getByRole('link', { name: `Order #${order.orderNumber}` })).toBeVisible();
    await page.getByRole('button', { name: `Accept order #${order.orderNumber}` }).click();
    await expect(page.getByRole('tab', { name: /Accepted\s*1/ })).toBeVisible();

    await openSection(page, seeded, 'kitchen');
    const toStart = page.getByRole('region', { name: /To start/ });
    await expect(toStart.getByText('2 × Chicken Karahi')).toBeVisible();
    await expect(toStart.getByText('Note: Less spicy')).toBeVisible();
    await toStart
      .getByRole('button', { name: `Start preparing order #${order.orderNumber}` })
      .click();
    const cooking = page.getByRole('region', { name: /Cooking/ });
    await cooking.getByRole('button', { name: `Mark ready order #${order.orderNumber}` }).click();
    await expect(cooking.getByText('Nothing here.')).toBeVisible();

    await page.goto(`/organizations/${seeded.organizationId}/orders/${order.orderId}`);
    await expect(page.getByRole('heading', { name: `Order #${order.orderNumber}` })).toBeVisible();
    await expect(page.getByText('Instructions: Ring the bell twice')).toBeVisible();
    await page.getByLabel('Rider').selectOption({ label: 'Imran Khan' });
    await page
      .getByRole('button', { name: `Send out for delivery order #${order.orderNumber}` })
      .click();
    await expect(page.getByText('Out for delivery').first()).toBeVisible();
    await page.getByRole('button', { name: `Mark delivered order #${order.orderNumber}` }).click();
    await expect(page.getByText('Cash · Paid')).toBeVisible();

    const tracking = await request.get(
      `/api/v1/organizations/${seeded.organizationId}/orders/${order.orderId}`,
    );
    expect(((await tracking.json()) as { status: string }).status).toBe('DELIVERED');
  });

  test('rejects with a reason and prints a receipt', async ({ page, request }) => {
    const pickup = await placeOrder(request, seeded, 'PICKUP');
    const rejected = await placeOrder(request, seeded, 'DELIVERY');
    await signIn(page, email);
    await expect(page).toHaveURL(/\/organizations\//);

    await page.goto(`/organizations/${seeded.organizationId}/orders/${rejected.orderId}`);
    await page.getByRole('button', { name: `Reject order #${rejected.orderNumber}` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Out of chicken tonight');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByText('Out of chicken tonight').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Accept order/ })).toHaveCount(0);

    await page.goto(`/organizations/${seeded.organizationId}/orders/${pickup.orderId}/receipt`);
    const receipt = page.getByRole('article', { name: `Receipt for order #${pickup.orderNumber}` });
    await expect(receipt.getByText(`#${pickup.orderNumber} · PICKUP`)).toBeVisible();
    await expect(receipt.getByText(/TO BE COLLECTED/)).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(receipt).toBeVisible();
  });
});
