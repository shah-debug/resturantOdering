import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Category, MembershipRole, ProductSummary } from '@app/contracts';
import { jsonResponse, renderWithStore } from '@app/web/testing';
import { makeStore } from '@/store/store';
import {
  type ApiCall,
  errorResponse,
  meFixture,
  mockApi,
  ORGANIZATION_ID,
} from '@/testing/api-mock';
import {
  CATEGORY_IDS,
  categoriesFixture,
  page,
  PRODUCT_ID,
  productDetailFixture,
  productSummaryFixture,
} from '@/testing/menu-fixtures';
import { MenuPage } from './menu-page';

const menu = `/organizations/${ORGANIZATION_ID}/menu`;

function setup({
  role = 'OWNER',
  categories = categoriesFixture(),
  products = [productSummaryFixture()],
  extra,
}: {
  role?: MembershipRole;
  categories?: Category[];
  products?: ProductSummary[];
  extra?: (call: ApiCall) => Response | undefined;
} = {}) {
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === `${menu}/categories` && call.method === 'GET') {
      return jsonResponse(categories);
    }
    if (call.path === `${menu}/products` && call.method === 'GET') {
      return jsonResponse(page(products));
    }
    return undefined;
  });
  renderWithStore(<MenuPage organizationId={ORGANIZATION_ID} />, makeStore());
  return api;
}

describe('MenuPage', () => {
  it('lists categories and products for an owner', async () => {
    setup();

    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument();
    const products = await screen.findByRole('list', { name: 'Products' });
    expect(within(products).getByRole('link', { name: 'Chicken Tikka' })).toHaveAttribute(
      'href',
      `${menu}/products/${PRODUCT_ID}`,
    );
    expect(within(products).getByText('From Rs 450')).toBeInTheDocument();
    expect(within(products).getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starters 2 products' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New product' })).toHaveAttribute(
      'href',
      `${menu}/products/new`,
    );
    expect(screen.getByRole('link', { name: 'Customizations' })).toHaveAttribute(
      'href',
      `${menu}/customizations`,
    );
  });

  it('asks an owner to create the first category', async () => {
    const { calls } = setup({
      categories: [],
      extra: (call) =>
        call.method === 'POST' && call.path === `${menu}/categories`
          ? jsonResponse(categoriesFixture()[0], 201)
          : undefined,
    });

    expect(await screen.findByText('Create your first category')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New product' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New category' }));
    const dialog = await screen.findByRole('dialog', { name: 'New category' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }));
    expect(within(dialog).getByLabelText('Category name')).toHaveAccessibleDescription(
      'Enter a name between 2 and 120 characters',
    );
    await userEvent.type(within(dialog).getByLabelText('Category name'), 'Starters');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create category' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'POST',
          path: `${menu}/categories`,
          body: { name: 'Starters', description: null, isActive: true },
        }),
      ),
    );
    expect(calls.some((call) => call.path.endsWith('/products'))).toBe(false);
  });

  it('offers a new product when a category is empty', async () => {
    setup({ products: [] });

    await userEvent.click(await screen.findByRole('button', { name: 'Drinks 0 products' }));
    expect(await screen.findByText('No products yet')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'New product' });
    expect(links.at(-1)).toHaveAttribute(
      'href',
      `${menu}/products/new?categoryId=${CATEGORY_IDS[2]}`,
    );
  });

  it('filters by category, status and a debounced search', async () => {
    const { calls } = setup();
    await screen.findByRole('list', { name: 'Products' });

    await userEvent.click(screen.getByRole('button', { name: 'Mains 2 products' }));
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'PUBLISHED');
    await userEvent.type(screen.getByLabelText('Search products'), 'tikka');

    await vi.waitFor(() => {
      const last = calls.filter((call) => call.path === `${menu}/products`).at(-1);
      const params = new URLSearchParams(last?.search);
      expect(params.get('search')).toBe('tikka');
      expect(params.get('categoryId')).toBe(CATEGORY_IDS[1]);
      expect(params.get('status')).toBe('PUBLISHED');
      expect(params.get('page')).toBe('1');
    });
    const searches = calls
      .filter((call) => call.path === `${menu}/products`)
      .map((call) => new URLSearchParams(call.search).get('search'));
    expect(searches).not.toContain('t');
  });

  it('sends the new order when a category moves', async () => {
    const reordered = categoriesFixture();
    const { calls } = setup({
      extra: (call) =>
        call.method === 'PUT' && call.path === `${menu}/categories/order`
          ? jsonResponse([reordered[1], reordered[0], reordered[2]])
          : undefined,
    });

    expect(await screen.findByRole('button', { name: 'Move Starters up' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move Starters down' }));

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'PUT',
          path: `${menu}/categories/order`,
          body: { ids: [CATEGORY_IDS[1], CATEGORY_IDS[0], CATEGORY_IDS[2]] },
        }),
      ),
    );
    await vi.waitFor(() => {
      const labels = screen
        .getAllByRole('button', { name: /^Move .+ up$/ })
        .map((button) => button.getAttribute('aria-label'));
      expect(labels).toEqual(['Move Mains up', 'Move Starters up', 'Move Drinks up']);
    });
  });

  it('shows the conflict when deleting a category that has products', async () => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'DELETE'
          ? errorResponse(409, 'CONFLICT', 'Move or delete the products in this category first')
          : undefined,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Starters' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Starters?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Move or delete the products in this category first',
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'DELETE', path: `${menu}/categories/${CATEGORY_IDS[0]}` }),
    );
  });

  it('toggles availability with a PATCH', async () => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'PATCH'
          ? jsonResponse(productDetailFixture({ isAvailable: false }))
          : undefined,
    });

    const toggle = await screen.findByRole('switch', { name: 'Available to order: Chicken Tikka' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);

    await vi.waitFor(() =>
      expect(calls).toContainEqual(
        expect.objectContaining({
          method: 'PATCH',
          path: `${menu}/products/${PRODUCT_ID}`,
          body: { isAvailable: false },
        }),
      ),
    );
  });

  it('shows why a product cannot be published', async () => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'PATCH'
          ? errorResponse(
              400,
              'VALIDATION_FAILED',
              'A published product needs an available option',
              [{ field: 'status', message: 'A published product needs an available option' }],
            )
          : undefined,
    });

    await userEvent.click(await screen.findByRole('button', { name: 'Publish Chicken Tikka' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A published product needs an available option',
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'PATCH', body: { status: 'PUBLISHED' } }),
    );
  });

  it('lets kitchen staff browse without editing controls', async () => {
    setup({ role: 'KITCHEN_STAFF' });

    await screen.findByRole('list', { name: 'Products' });
    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Publish|Move|Delete|Edit|New category/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New product' })).not.toBeInTheDocument();
  });

  it('explains that riders cannot see the menu', async () => {
    setup({
      role: 'RIDER',
      extra: (call) =>
        call.path.startsWith(menu)
          ? errorResponse(403, 'FORBIDDEN', 'Your role cannot view the menu')
          : undefined,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have access to this");
  });

  it('retries after a failed load', async () => {
    let failures = 1;
    setup({
      extra: (call) => {
        if (call.path === `${menu}/categories` && failures > 0) {
          failures -= 1;
          return errorResponse(500, 'INTERNAL_ERROR', 'Something broke');
        }
        return undefined;
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Something broke');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Products' })).toBeInTheDocument();
  });
});
