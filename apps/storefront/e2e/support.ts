import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page, request } from '@playwright/test';

const API_URL = 'http://localhost:4100';
const APP_ORIGIN = 'http://localhost:3101';
const MAILBOX = 'http://127.0.0.1:4199';
const PASSWORD = 'correct horse battery staple';

export interface SeededRestaurant {
  slug: string;
  name: string;
  organizationId: string;
  productIds: { karahi: string; lassi: string };
  api: APIRequestContext;
}

interface Created {
  id: string;
}

function karachiWeekday(): number {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', weekday: 'short' })
    .format(new Date())
    .slice(0, 3);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day) + 1;
}

async function call<T>(
  api: APIRequestContext,
  method: 'post' | 'patch' | 'put',
  path: string,
  data: object,
): Promise<T> {
  const response = await api[method](`/api/v1${path}`, { data, headers: { Origin: APP_ORIGIN } });
  expect(response.ok(), `${method.toUpperCase()} ${path} → ${response.status()}`).toBe(true);
  return (await response.json()) as T;
}

async function verificationToken(api: APIRequestContext, email: string): Promise<string> {
  let token: string | undefined;
  await expect
    .poll(async () => {
      const response = await api.get(`${MAILBOX}/?to=${encodeURIComponent(email)}`);
      const messages = (await response.json()) as string[];
      token = messages
        .map((message) => /\/verify-email\?token=([A-Za-z0-9_-]+)/.exec(message)?.[1])
        .findLast(Boolean);
      return token;
    })
    .toBeTruthy();
  return token ?? '';
}

export async function createOwner(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: API_URL });
  const email = `storefront-${randomUUID().slice(0, 8)}@example.com`;
  await call(api, 'post', '/auth/signup', {
    email,
    password: PASSWORD,
    fullName: 'Storefront Owner',
  });
  await call(api, 'post', '/auth/email/verify', { token: await verificationToken(api, email) });
  await call(api, 'post', '/auth/login', { email, password: PASSWORD });
  return api;
}

export async function seedRestaurant(
  api: APIRequestContext,
  options: { label: string; dish: string; openNow?: boolean; publish?: boolean },
): Promise<SeededRestaurant> {
  const slug = `${options.label}-${randomUUID().slice(0, 6)}`;
  const name = `${options.label.replace(/-/g, ' ')} kitchen`;
  const { id: organizationId } = await call<Created>(api, 'post', '/organizations', {
    name,
    slug,
  });
  const base = `/organizations/${organizationId}`;
  await call(api, 'patch', base, {
    description: `${name} serves charcoal grills and fresh bread every day.`,
    contactPhone: '+923001234567',
    primaryColor: '#B45309',
  });
  const { id: branchId } = await call<Created>(api, 'post', `${base}/branches`, {
    name: 'Gulberg',
    phone: '+924235000000',
    addressLine: '12 Main Boulevard',
    area: 'Gulberg III',
    city: 'Lahore',
  });
  const openDay = options.openNow === false ? ((karachiWeekday() + 2) % 7) + 1 : null;
  await call(api, 'put', `${base}/branches/${branchId}/opening-hours`, {
    intervals:
      openDay === null
        ? [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
            dayOfWeek,
            opensAt: '00:00',
            closesAt: '23:59',
          }))
        : [{ dayOfWeek: openDay, opensAt: '12:00', closesAt: '22:00' }],
  });
  await call(api, 'put', `${base}/branches/${branchId}/fulfillment`, {
    deliveryEnabled: true,
    pickupEnabled: true,
    preparationMinutes: 25,
    delivery: { feeMinor: 15_000, minimumOrderMinor: 200_000, estimatedMinutes: 40 },
  });

  const menu = `${base}/menu`;
  const { id: grill } = await call<Created>(api, 'post', `${menu}/categories`, { name: 'Grill' });
  const { id: drinks } = await call<Created>(api, 'post', `${menu}/categories`, {
    name: 'Drinks',
  });
  const { id: bread } = await call<Created>(api, 'post', `${menu}/add-on-groups`, {
    name: 'Bread',
    minSelect: 1,
    maxSelect: 1,
    addOns: [
      { name: 'Naan', priceMinor: 5_000, isAvailable: true },
      { name: 'Roghni Naan', priceMinor: 8_000, isAvailable: true },
    ],
  });
  const { id: karahi } = await call<Created>(api, 'post', `${menu}/products`, {
    categoryId: grill,
    name: options.dish,
    description: 'Cooked to order in a cast-iron karahi.',
    status: 'PUBLISHED',
    isAvailable: true,
    variants: [
      { name: 'Half', priceMinor: 145_000, isAvailable: true, isDefault: true },
      { name: 'Full', priceMinor: 270_000, isAvailable: true, isDefault: false },
    ],
    addOnGroupIds: [bread],
  });
  const { id: lassi } = await call<Created>(api, 'post', `${menu}/products`, {
    categoryId: drinks,
    name: 'Sweet Lassi',
    description: 'Chilled yoghurt drink.',
    status: 'PUBLISHED',
    isAvailable: true,
    variants: [{ name: 'Regular', priceMinor: 35_000, isAvailable: true, isDefault: true }],
    addOnGroupIds: [],
  });
  if (options.publish !== false) {
    await call(api, 'post', `${base}/onboarding/complete`, {});
  }
  return { slug, name, organizationId, productIds: { karahi, lassi }, api };
}

export async function setProductAvailability(
  restaurant: SeededRestaurant,
  productId: string,
  isAvailable: boolean,
): Promise<void> {
  await call(
    restaurant.api,
    'patch',
    `/organizations/${restaurant.organizationId}/menu/products/${productId}`,
    { isAvailable },
  );
}

export function isMobile(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 1024;
}

export async function openCart(page: Page) {
  if (isMobile(page)) {
    await page.getByRole('button', { name: /^View cart/ }).click();
    return page.getByRole('dialog', { name: 'Cart' });
  }
  return page.getByRole('complementary', { name: 'Cart' });
}

export async function closeCart(page: Page): Promise<void> {
  if (isMobile(page)) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Cart' })).toBeHidden();
  }
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
