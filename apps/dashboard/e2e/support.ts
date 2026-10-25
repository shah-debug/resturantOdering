import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';

export const PASSWORD = 'correct horse battery staple';
const APP_ORIGIN = 'http://localhost:3100';
const MAILBOX = 'http://127.0.0.1:4199';

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.com`;
}

export function uniqueName(label: string): string {
  return `${label} ${randomUUID().slice(0, 6)}`;
}

async function emailedLink(
  request: APIRequestContext,
  email: string,
  path: string,
): Promise<string> {
  const pattern = new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`);
  let token: string | undefined;
  await expect
    .poll(async () => {
      const response = await request.get(`${MAILBOX}/?to=${encodeURIComponent(email)}`);
      const messages = (await response.json()) as string[];
      token = messages.map((message) => pattern.exec(message)?.[1]).findLast(Boolean);
      return token;
    })
    .toBeTruthy();
  return token ?? '';
}

export async function createVerifiedUser(request: APIRequestContext, email: string): Promise<void> {
  const headers = { Origin: APP_ORIGIN };
  const signup = await request.post('/api/v1/auth/signup', {
    headers,
    data: { email, password: PASSWORD, fullName: 'Browser Test Owner' },
  });
  expect(signup.status()).toBe(202);
  const token = await emailedLink(request, email, '/verify-email');
  const verify = await request.post('/api/v1/auth/email/verify', { headers, data: { token } });
  expect(verify.status()).toBe(200);
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function saveAndContinue(page: Page, nextHeading: string): Promise<void> {
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: nextHeading, exact: true })).toBeVisible();
}

export async function onboardRestaurant(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Your restaurant' })).toBeVisible();
  await page.getByLabel('Restaurant name').fill(uniqueName('Browser Karahi'));
  await saveAndContinue(page, 'Profile');
  const organizationId = /\/organizations\/([0-9a-f-]{36})\//.exec(page.url())?.[1] ?? '';

  await page
    .getByLabel('Description')
    .fill('Charcoal karahi and BBQ, cooked fresh for every order.');
  await page.getByLabel('Contact phone').fill('+923001234567');
  await saveAndContinue(page, 'Location');

  await page.getByLabel('Location name').fill('Gulberg');
  await page.getByLabel('Branch phone').fill('+924235000000');
  await page.getByLabel('Address line').fill('12 Main Boulevard');
  await page.getByLabel('City').fill('Lahore');
  await saveAndContinue(page, 'Opening hours');
  return organizationId;
}
