import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  createVerifiedUser,
  expectNoHorizontalScroll,
  onboardRestaurant,
  saveAndContinue,
  signIn,
  uniqueEmail,
  uniqueName,
} from './support';

test('a new owner completes onboarding, resuming after a reload', async ({ page }) => {
  const email = uniqueEmail('onboard');
  await createVerifiedUser(page.request, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await expectNoHorizontalScroll(page);

  const organizationId = await onboardRestaurant(page);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Opening hours', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Setup progress' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('switch', { name: 'Open on Monday' }).click();
  await saveAndContinue(page, 'Delivery & pickup');

  await page.getByLabel('Delivery fee').fill('150');
  await page.getByLabel('Minimum order').fill('800');
  await page.getByLabel('Delivery time (minutes)').fill('40');
  await saveAndContinue(page, 'Review');
  await expect(
    page
      .getByRole('region', { name: 'Storefront preview' })
      .or(page.getByLabel('Storefront preview')),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Complete setup' }).click();
  await expect(page).toHaveURL(new RegExp(`/organizations/${organizationId}$`));
  await page.reload();
  await expect(page.getByText('Continue setup')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test('invalid input is reported and nothing is saved', async ({ page }) => {
  const email = uniqueEmail('invalid');
  await createVerifiedUser(page.request, email);
  await signIn(page, email);
  await page.getByLabel('Restaurant name').fill(uniqueName('Validation Kitchen'));
  await saveAndContinue(page, 'Profile');

  await page.getByLabel('Contact phone').fill('0300 123');
  await page.getByLabel('Logo URL').fill('http://insecure.example.com/logo.png');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByLabel('Contact phone')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Logo URL')).toHaveAttribute('aria-invalid', 'true');

  await page.reload();
  await expect(page.getByLabel('Contact phone')).toHaveValue('');
});

test('navigation works on this screen size', async ({ page, isMobile }) => {
  const email = uniqueEmail('nav');
  await createVerifiedUser(page.request, email);
  await signIn(page, email);
  const organizationId = await onboardRestaurant(page);
  await page.goto(`/organizations/${organizationId}`);

  const openNavigation = page.getByRole('button', { name: 'Open navigation' });
  if (isMobile) {
    await expect(openNavigation).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await openNavigation.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await sheet.getByRole('link', { name: 'Team' }).click();
  } else {
    await expect(openNavigation).toBeHidden();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Team' })
      .click();
  }
  await expect(page).toHaveURL(new RegExp(`/organizations/${organizationId}/members$`));
  await expect(page.getByRole('button', { name: 'Switch restaurant' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Switch restaurant' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Account menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Sign out/ }).first()).toBeVisible();
});

test('anonymous visitors are sent to sign in, and unknown restaurants are not found', async ({
  page,
}) => {
  await page.goto('/organizations/00000000-0000-4000-8000-000000000000');
  await expect(page).toHaveURL(/\/login\?next=/);

  const email = uniqueEmail('notfound');
  await createVerifiedUser(page.request, email);
  await signIn(page, email);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(`/organizations/${randomUUID()}`);
  await expect(page.getByText('Restaurant not found')).toBeVisible();
});
