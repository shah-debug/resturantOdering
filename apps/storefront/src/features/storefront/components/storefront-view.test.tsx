import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithStore } from '@app/web/testing';
import { cartStorageKey } from '@/features/cart/use-cart-persistence';
import { makeStore } from '@/store/store';
import { IDS, storefrontFixture } from '@/testing/storefront-fixture';
import type { StoreAvailability } from '../availability';
import { StorefrontView } from './storefront-view';

const OPEN: StoreAvailability = {
  state: 'open',
  label: 'Open now',
  detail: 'Closes today at 11:00 pm',
};

function renderStorefront(
  storefront = storefrontFixture(),
  availability: StoreAvailability = OPEN,
  store = makeStore(),
) {
  return renderWithStore(
    <StorefrontView storefront={storefront} availability={availability} />,
    store,
  );
}

function desktopCart() {
  return within(screen.getByRole('complementary', { name: 'Cart' }));
}

describe('StorefrontView', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the restaurant, categories and products', () => {
    renderStorefront();
    expect(screen.getByRole('heading', { level: 1, name: 'Karahi House' })).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation', { name: 'Menu categories' }));
    expect(nav.getByRole('link', { name: 'Karahi' })).toHaveAttribute('href', '#category-karahi');
    expect(screen.getByRole('button', { name: /Chicken Karahi, From Rs 1,450/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Kheer, Rs 300, sold out/ })).toBeVisible();
    expect(desktopCart().getByText('Your cart is empty')).toBeVisible();
  });

  it('filters the menu by search and offers to clear an empty result', async () => {
    const user = userEvent.setup();
    renderStorefront();
    await user.type(screen.getByRole('searchbox', { name: 'Search the menu' }), 'lassi');
    expect(screen.getByRole('button', { name: /Sweet Lassi/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Chicken Karahi/ })).not.toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search the menu' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search the menu' }), 'pizza');
    expect(screen.getByText(/No dishes match/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: /Chicken Karahi/ })).toBeVisible();
  });

  it('requires required choices before adding and prices extras', async () => {
    const user = userEvent.setup();
    const { store } = renderStorefront();
    await user.click(screen.getByRole('button', { name: /Chicken Karahi/ }));
    const dialog = within(screen.getByRole('dialog', { name: 'Chicken Karahi' }));

    await user.click(dialog.getByRole('button', { name: /Add to cart/ }));
    expect(dialog.getByText('Choose an option for Bread')).toBeVisible();
    expect(store.getState().cart.carts['karahi-house'] ?? []).toEqual([]);

    await user.click(dialog.getByRole('radio', { name: /Full/ }));
    await user.click(dialog.getByRole('radio', { name: /Roghni Naan/ }));
    await user.click(dialog.getByRole('checkbox', { name: /Raita/ }));
    await user.click(dialog.getByRole('checkbox', { name: /Salad/ }));
    await user.click(dialog.getByRole('button', { name: 'Increase quantity of Chicken Karahi' }));
    expect(dialog.getByRole('button', { name: 'Add to cart · Rs 5,760' })).toBeEnabled();
    await user.click(dialog.getByRole('button', { name: 'Add to cart · Rs 5,760' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Added 2 × Chicken Karahi to your cart')).toBeInTheDocument();
    expect(desktopCart().getByTestId('cart-subtotal')).toHaveTextContent('Rs 5,760');
    expect(desktopCart().getByText('Full, Roghni Naan, Raita, Salad')).toBeVisible();
    expect(desktopCart().queryByText(/more for delivery/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /View cart, 2 items, subtotal Rs 5,760/ }),
    ).toBeVisible();
  });

  it('limits multi-select groups to their maximum', async () => {
    const user = userEvent.setup();
    const storefront = storefrontFixture();
    const group = storefront.categories[0]?.products[0]?.addOnGroups[1];
    if (group) {
      group.maxSelect = 1;
      group.minSelect = 0;
    }
    renderStorefront(storefront);
    await user.click(screen.getByRole('button', { name: /Chicken Karahi/ }));
    const dialog = within(screen.getByRole('dialog'));
    await user.click(dialog.getByRole('checkbox', { name: /Raita/ }));
    expect(dialog.getByRole('checkbox', { name: /Salad/ })).toBeDisabled();
  });

  it('updates quantities, shows the delivery minimum and persists per restaurant', async () => {
    const user = userEvent.setup();
    renderStorefront();
    await user.click(screen.getByRole('button', { name: /Sweet Lassi/ }));
    await user.click(screen.getByRole('button', { name: 'Add to cart · Rs 350' }));

    const cart = desktopCart();
    expect(cart.getByText('Add Rs 1,650 more for delivery (minimum Rs 2,000).')).toBeVisible();
    await user.click(cart.getByRole('button', { name: 'Increase quantity of Sweet Lassi' }));
    expect(cart.getByTestId('cart-subtotal')).toHaveTextContent('Rs 700');

    const stored: unknown = JSON.parse(
      window.localStorage.getItem(cartStorageKey('karahi-house')) ?? 'null',
    );
    expect(stored).toEqual([
      { productId: IDS.lassi, variantId: IDS.lassiRegular, addOnIds: [], quantity: 2 },
    ]);
    expect(window.localStorage.getItem(cartStorageKey('other-kitchen'))).toBeNull();

    await user.click(cart.getByRole('button', { name: 'Decrease quantity of Sweet Lassi' }));
    await user.click(cart.getByRole('button', { name: 'Remove Sweet Lassi' }));
    expect(cart.getByText('Your cart is empty')).toBeVisible();
  });

  it('restores a saved cart and flags items that became unavailable', () => {
    window.localStorage.setItem(
      cartStorageKey('karahi-house'),
      JSON.stringify([
        { productId: IDS.kheer, variantId: IDS.kheerBowl, addOnIds: [], quantity: 1 },
        { productId: IDS.lassi, variantId: IDS.lassiRegular, addOnIds: [], quantity: 3 },
      ]),
    );
    renderStorefront();
    const cart = desktopCart();
    expect(cart.getByText('1 × Kheer')).toBeVisible();
    expect(cart.getByText('Sold out')).toBeVisible();
    expect(cart.getByTestId('cart-subtotal')).toHaveTextContent('Rs 1,050');
    expect(cart.getByText(/no longer available and are not included/)).toBeVisible();
  });

  it('does not load another restaurant’s saved cart', () => {
    window.localStorage.setItem(
      cartStorageKey('other-kitchen'),
      JSON.stringify([
        { productId: IDS.lassi, variantId: IDS.lassiRegular, addOnIds: [], quantity: 3 },
      ]),
    );
    renderStorefront();
    expect(desktopCart().getByText('Your cart is empty')).toBeVisible();
  });

  it('explains when the restaurant is closed but still allows building a cart', async () => {
    const user = userEvent.setup();
    renderStorefront(storefrontFixture(), {
      state: 'closed',
      label: 'Closed now',
      detail: 'Opens tomorrow at 12:00 pm',
    });
    expect(screen.getAllByText('Opens tomorrow at 12:00 pm').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Sweet Lassi/ }));
    expect(screen.getByRole('button', { name: 'Add to cart · Rs 350' })).toBeEnabled();
  });

  it('blocks adding to the cart when online orders are off', async () => {
    const user = userEvent.setup();
    renderStorefront(storefrontFixture(), {
      state: 'unavailable',
      label: 'Not taking online orders',
      detail: 'You can still browse the menu.',
    });
    await user.click(screen.getByRole('button', { name: /Sweet Lassi/ }));
    expect(screen.getByRole('button', { name: 'Add to cart · Rs 350' })).toBeDisabled();
  });

  it('does not let a sold-out product be added', async () => {
    const user = userEvent.setup();
    renderStorefront();
    await user.click(screen.getByRole('button', { name: /Kheer/ }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/sold out right now/)).toBeVisible();
    expect(dialog.getByRole('button', { name: 'Sold out' })).toBeDisabled();
  });

  it('shows an empty menu state', () => {
    renderStorefront(storefrontFixture({ categories: [] }));
    expect(screen.getByText('The menu is coming soon')).toBeVisible();
  });
});
