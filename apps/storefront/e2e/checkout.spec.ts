import { expect, type Page, test } from '@playwright/test';
import {
  createOwner,
  expectNoHorizontalScroll,
  openCart,
  type SeededRestaurant,
  seedRestaurant,
  setProductAvailability,
} from './support';

let restaurant: SeededRestaurant;

test.beforeAll(async () => {
  const owner = await createOwner();
  restaurant = await seedRestaurant(owner, { label: 'checkout', dish: 'Chicken Karahi' });
});

async function addKarahiToCart(page: Page) {
  await page.goto(`/r/${restaurant.slug}`);
  await page.getByRole('button', { name: /Chicken Karahi, From Rs 1,450/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Chicken Karahi' });
  await dialog.getByText('Naan', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Increase quantity of Chicken Karahi' }).click();
  await dialog.getByRole('button', { name: 'Add to cart · Rs 3,000' }).click();
  await expect(dialog).toBeHidden();
}

async function goToCheckout(page: Page) {
  const cart = await openCart(page);
  await cart.getByRole('link', { name: 'Checkout' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
}

async function fillContact(page: Page) {
  await page.getByLabel('Full name').fill('Ayesha Khan');
  await page.getByLabel('Mobile number').fill('0300 1234567');
}

test('places a cash-on-delivery order and tracks it', async ({ page }) => {
  await addKarahiToCart(page);
  await goToCheckout(page);
  await expect(page.getByText('Enter your area and city to see the delivery fee.')).toBeVisible();

  await fillContact(page);
  await page.getByLabel('House and street').fill('45 Canal View Road');
  await page.getByLabel('Area').fill('Model Town');
  await page.getByLabel('Delivery instructions (optional)').fill('Ring the bell twice');

  await expect(page.getByTestId('price-subtotal')).toHaveText('Rs 3,000');
  await expect(page.getByTestId('price-delivery')).toHaveText('Rs 150');
  await expect(page.getByTestId('price-total')).toHaveText('Rs 3,150');
  await expect(page.getByText('Cash on delivery')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: 'Place order · Rs 3,150' }).click();
  await expect(page.getByText('Thank you! Your order has been placed.')).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}\?token=[A-Za-z0-9_-]{43}&placed=1$/);
  await expect(
    page.getByRole('heading', { name: 'Waiting for the restaurant to confirm' }),
  ).toBeVisible();
  await expect(page.getByText('Cash on delivery · Rs 3,150 due')).toBeVisible();
  await expect(page.getByText('+92300••••567')).toBeVisible();
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await expectNoHorizontalScroll(page);

  const trackingUrl = page.url().replace('&placed=1', '');
  await page.goto(`/r/${restaurant.slug}`);
  await expect(page.getByRole('button', { name: /^View cart/ })).toHaveCount(0);

  await page.goto(trackingUrl);
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByRole('heading', { name: 'Order cancelled' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);

  const tampered = trackingUrl.replace(/token=[^&]+/, `token=${'x'.repeat(43)}`);
  const response = await page.goto(tampered);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: "We couldn't find this order" })).toBeVisible();
});

test('places a pickup order', async ({ page }) => {
  await addKarahiToCart(page);
  await goToCheckout(page);
  await page.getByText('Pickup', { exact: true }).click();
  await expect(page.getByLabel('House and street')).toHaveCount(0);
  await fillContact(page);
  await expect(page.getByTestId('price-total')).toHaveText('Rs 3,000');
  await page.getByRole('button', { name: 'Place order · Rs 3,000' }).click();
  await expect(page.getByText('Pay cash at pickup · Rs 3,000 due')).toBeVisible();
});

test('rejects delivery outside the area and items that sell out during checkout', async ({
  page,
}) => {
  await addKarahiToCart(page);
  await goToCheckout(page);
  await fillContact(page);
  await page.getByLabel('House and street').fill('1 Sea View');
  await page.getByLabel('Area').fill('Clifton');
  await page.getByLabel('City').fill('Karachi');
  await expect(page.getByText('Sorry, we don’t deliver to this address yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Place order/ })).toBeDisabled();

  await page.getByLabel('Area').fill('Model Town');
  await page.getByLabel('City').fill('Lahore');
  await expect(page.getByRole('button', { name: 'Place order · Rs 3,150' })).toBeEnabled();

  await setProductAvailability(restaurant, restaurant.productIds.karahi, false);
  try {
    await page.getByRole('button', { name: 'Place order · Rs 3,150' }).click();
    await expect(page.getByText(/Chicken Karahi: Sold out/).first()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/r/${restaurant.slug}/checkout$`));
  } finally {
    await setProductAvailability(restaurant, restaurant.productIds.karahi, true);
  }
});

test('shows an empty checkout without a cart', async ({ page }) => {
  await page.goto(`/r/${restaurant.slug}/checkout`);
  await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible();
});
