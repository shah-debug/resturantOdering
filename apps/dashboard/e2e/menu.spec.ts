import { expect, test } from '@playwright/test';
import {
  createVerifiedUser,
  expectNoHorizontalScroll,
  onboardRestaurant,
  signIn,
  uniqueEmail,
} from './support';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('menu changes persist after a reload', async ({ page }) => {
  const email = uniqueEmail('menu');
  await createVerifiedUser(page.request, email);
  await signIn(page, email);
  const organizationId = await onboardRestaurant(page);

  await page.goto(`/organizations/${organizationId}/menu`);
  await expect(page.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'New category' }).click();
  await page.getByLabel('Category name').fill('Karahi');
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page.getByRole('list', { name: 'Categories' }).getByText('Karahi')).toBeVisible();

  await page
    .getByRole('link', { name: 'New product' })
    .or(page.getByRole('button', { name: 'New product' }))
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'New product' })).toBeVisible();
  await page
    .getByLabel('Category')
    .selectOption({ label: 'Karahi' })
    .catch(() => undefined);
  await page.getByLabel('Product name').fill('Chicken Karahi');
  await page.getByLabel('Description').fill('Slow-cooked with tomatoes and green chillies.');
  await page.getByLabel('Option name').first().fill('Full');
  await page.getByLabel('Price (Rs)').first().fill('2700');
  await page.getByLabel('Published').check();
  await page.getByRole('button', { name: 'Save product' }).click();
  await expect(page.getByRole('heading', { name: 'Edit product' })).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/organizations/${organizationId}/menu/products/[0-9a-f-]{36}$`),
  );

  await page
    .getByLabel('Upload image')
    .setInputFiles({ name: 'karahi.png', mimeType: 'image/png', buffer: PNG });
  const photo = page.locator('img[src*="/api/v1/media/"]');
  await expect(photo).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Product name')).toHaveValue('Chicken Karahi');
  await expect(page.getByLabel('Price (Rs)').first()).toHaveValue(/^2,?700(\.00)?$/);
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1);
  await expectNoHorizontalScroll(page);

  await page.goto(`/organizations/${organizationId}/menu`);
  const availability = page.getByRole('switch', { name: 'Available to order: Chicken Karahi' });
  await expect(availability).toBeChecked();
  await availability.click();
  await expect(availability).not.toBeChecked();
  await page.reload();
  await expect(
    page.getByRole('switch', { name: 'Available to order: Chicken Karahi' }),
  ).not.toBeChecked();

  await page.getByRole('link', { name: 'Edit Chicken Karahi' }).click();
  await page.getByRole('button', { name: 'Delete product' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete product' }).click();
  await expect(page).toHaveURL(new RegExp(`/organizations/${organizationId}/menu$`));
  await page.reload();
  await expect(page.getByText('Chicken Karahi')).toHaveCount(0);
});
