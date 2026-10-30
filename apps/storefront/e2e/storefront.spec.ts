import { expect, test } from '@playwright/test';
import {
  closeCart,
  createOwner,
  expectNoHorizontalScroll,
  openCart,
  type SeededRestaurant,
  seedRestaurant,
  setProductAvailability,
} from './support';

let open: SeededRestaurant;
let neighbour: SeededRestaurant;
let closed: SeededRestaurant;
let draft: SeededRestaurant;

test.beforeAll(async () => {
  const owner = await createOwner();
  open = await seedRestaurant(owner, { label: 'tikka', dish: 'Chicken Karahi' });
  neighbour = await seedRestaurant(owner, { label: 'tikka-2', dish: 'Mutton Karahi' });
  closed = await seedRestaurant(owner, { label: 'nihari', dish: 'Beef Nihari', openNow: false });
  draft = await seedRestaurant(owner, { label: 'draft', dish: 'Secret Dish', publish: false });
});

test('browses the menu, customises a dish and builds a cart', async ({ page }) => {
  await page.goto(`/r/${open.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: open.name })).toBeVisible();
  await expect(page.getByText('Open now')).toBeVisible();
  await expect(page.locator('header .bg-primary')).toHaveCSS('background-color', 'rgb(180, 83, 9)');
  await expectNoHorizontalScroll(page);

  await page.getByRole('searchbox', { name: 'Search the menu' }).fill('lassi');
  await expect(page.getByRole('button', { name: /Chicken Karahi/ })).toBeHidden();
  await page.getByRole('searchbox', { name: 'Search the menu' }).fill('');

  await page.getByRole('button', { name: /Chicken Karahi, From Rs 1,450/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Chicken Karahi' });
  await dialog.getByRole('button', { name: /Add to cart/ }).click();
  await expect(dialog.getByText('Choose an option for Bread')).toBeVisible();
  await dialog.getByText('Full').click();
  await dialog.getByText('Roghni Naan').click();
  await dialog.getByRole('button', { name: 'Increase quantity of Chicken Karahi' }).click();
  await dialog.getByRole('button', { name: 'Add to cart · Rs 5,560' }).click();
  await expect(dialog).toBeHidden();
  await expectNoHorizontalScroll(page);

  const cart = await openCart(page);
  await expect(cart.getByTestId('cart-subtotal')).toHaveText('Rs 5,560');
  await expect(cart.getByText('Full, Roghni Naan')).toBeVisible();
  await cart.getByRole('button', { name: 'Decrease quantity of Chicken Karahi' }).click();
  await expect(cart.getByTestId('cart-subtotal')).toHaveText('Rs 2,780');
  await expect(cart.getByRole('link', { name: 'Checkout' })).toHaveAttribute(
    'href',
    `/r/${open.slug}/checkout`,
  );
  await closeCart(page);

  await page.reload();
  const restored = await openCart(page);
  await expect(restored.getByTestId('cart-subtotal')).toHaveText('Rs 2,780');
});

test('keeps restaurants and their carts separate', async ({ page }) => {
  await page.goto(`/r/${open.slug}`);
  await page.getByRole('button', { name: /Sweet Lassi/ }).click();
  await page.getByRole('button', { name: 'Add to cart · Rs 350' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.goto(`/r/${neighbour.slug}`);
  await expect(page.getByRole('heading', { level: 1, name: neighbour.name })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mutton Karahi/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Chicken Karahi/ })).toHaveCount(0);
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await expect(page.getByRole('button', { name: /^View cart/ })).toHaveCount(0);
  } else {
    await expect(
      page.getByRole('complementary', { name: 'Cart' }).getByText('Your cart is empty'),
    ).toBeVisible();
  }
});

test('reflects availability changes and flags affected cart items', async ({ page }) => {
  const restaurant = await seedRestaurant(open.api, { label: 'stock', dish: 'Daal Makhni' });
  await page.goto(`/r/${restaurant.slug}`);
  await page.getByRole('button', { name: /Sweet Lassi/ }).click();
  await page.getByRole('button', { name: 'Add to cart · Rs 350' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  await setProductAvailability(restaurant, restaurant.productIds.lassi, false);
  await page.reload();
  await expect(page.getByRole('button', { name: /Sweet Lassi, Rs 350, sold out/ })).toBeVisible();
  const cart = await openCart(page);
  await expect(cart.getByText('Sold out')).toBeVisible();
  await expect(cart.getByTestId('cart-subtotal')).toHaveText('Rs 0');
  await closeCart(page);

  await setProductAvailability(restaurant, restaurant.productIds.lassi, true);
  await page.reload();
  const again = await openCart(page);
  await expect(again.getByTestId('cart-subtotal')).toHaveText('Rs 350');
});

test('tells customers when the restaurant is closed', async ({ page }) => {
  await page.goto(`/r/${closed.slug}`);
  await expect(page.getByRole('status').filter({ hasText: 'Closed now' })).toBeVisible();
  await expect(page.getByText(/Opens .* at 12:00 pm/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('serves one not-found page for unknown, unpublished and malformed addresses', async ({
  page,
}) => {
  for (const path of [`/r/no-such-${open.slug}`, `/r/${draft.slug}`, '/r/..%2Fadmin', '/r/a']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(
      page.getByRole('heading', { name: "This restaurant isn't available" }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.getByText('Secret Dish')).toHaveCount(0);
  }
});

test('redirects mixed-case addresses to the canonical lowercase URL', async ({ page }) => {
  await page.goto(`/r/${open.slug.toUpperCase()}`);
  await expect(page).toHaveURL(new RegExp(`/r/${open.slug}$`));
  await expect(page.getByRole('heading', { level: 1, name: open.name })).toBeVisible();
});

test('publishes per-restaurant metadata, sitemap and robots rules', async ({ page, request }) => {
  await page.goto(`/r/${open.slug}`);
  await expect(page).toHaveTitle(`${open.name} · Order online`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `http://localhost:3101/r/${open.slug}`,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /serves charcoal grills/,
  );
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? '{}')).toMatchObject({ '@type': 'Restaurant', name: open.name });

  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain(`http://localhost:3101/r/${open.slug}`);
  expect(sitemap).not.toContain(draft.slug);

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Sitemap: http://localhost:3101/sitemap.xml');
  expect(robots).toContain('Disallow: /api/');
});
