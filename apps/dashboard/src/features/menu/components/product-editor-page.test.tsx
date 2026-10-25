import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { MembershipRole, ProductDetail } from '@app/contracts';
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
  addOnGroupFixture,
  CATEGORY_IDS,
  categoriesFixture,
  GROUP_IDS,
  PRODUCT_ID,
  productDetailFixture,
  VARIANT_IDS,
} from '@/testing/menu-fixtures';
import { ProductEditorPage } from './product-editor-page';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const menu = `/organizations/${ORGANIZATION_ID}/menu`;
const productPath = `${menu}/products/${PRODUCT_ID}`;
const user = userEvent.setup({ applyAccept: false });

function setup({
  role = 'OWNER',
  productId = PRODUCT_ID,
  product = productDetailFixture(),
  extra,
}: {
  role?: MembershipRole;
  productId?: string | null;
  product?: ProductDetail;
  extra?: (call: ApiCall) => Response | undefined;
} = {}) {
  navigation.push.mockClear();
  const api = mockApi((call) => {
    const handled = extra?.(call);
    if (handled) return handled;
    if (call.path === '/auth/me') return jsonResponse(meFixture(role));
    if (call.path === `${menu}/categories`) return jsonResponse(categoriesFixture());
    if (call.path === `${menu}/add-on-groups`) return jsonResponse([addOnGroupFixture()]);
    if (call.path === productPath && call.method === 'GET') return jsonResponse(product);
    return undefined;
  });
  renderWithStore(
    <ProductEditorPage
      organizationId={ORGANIZATION_ID}
      productId={productId ?? undefined}
      initialCategoryId={CATEGORY_IDS[1]}
    />,
    makeStore(),
  );
  return api;
}

function option(index: number) {
  return within(screen.getByRole('group', { name: `Option ${index}` }));
}

describe('ProductEditorPage — new product', () => {
  it('validates options before sending anything', async () => {
    const { calls } = setup({ productId: null });

    expect(await screen.findByRole('heading', { name: 'New product' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Category')).toHaveValue(CATEGORY_IDS[1]);
    await user.type(screen.getByLabelText('Product name'), 'Chicken Tikka');
    await user.type(option(1).getByLabelText('Price (Rs)'), '-20');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(option(2).getByLabelText('Option name'), 'regular');
    await user.type(option(2).getByLabelText('Price (Rs)'), '200000');
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    expect(option(1).getByLabelText('Price (Rs)')).toHaveAccessibleDescription(
      'Enter a price in rupees, e.g. 450',
    );
    expect(option(2).getByLabelText('Option name')).toHaveAccessibleDescription(
      'Option names must be unique',
    );
    expect(option(2).getByLabelText('Price (Rs)')).toHaveAccessibleDescription(
      'Price can be at most Rs 100,000',
    );
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('requires an option and keeps exactly one default', async () => {
    const { calls } = setup({ productId: null });

    await user.type(await screen.findByLabelText('Product name'), 'Chicken Tikka');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.click(option(2).getByRole('radio', { name: 'Default' }));
    expect(option(1).getByRole('radio', { name: 'Default' })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Remove option 1' }));
    await user.click(screen.getByRole('button', { name: 'Remove option 1' }));
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    expect(screen.getByText('Add at least one option')).toBeInTheDocument();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('creates the product in paisa and opens its edit page', async () => {
    const created = productDetailFixture({ categoryId: CATEGORY_IDS[1] });
    const { calls } = setup({
      productId: null,
      extra: (call) =>
        call.method === 'POST' && call.path === `${menu}/products`
          ? jsonResponse(created, 201)
          : undefined,
    });

    await user.type(await screen.findByLabelText('Product name'), 'Chicken Tikka');
    await user.type(option(1).getByLabelText('Price (Rs)'), '450.50');
    await user.click(screen.getByRole('radio', { name: 'Published' }));
    await user.selectOptions(screen.getByLabelText('Add a customization group'), GROUP_IDS[0]);
    await user.click(screen.getByRole('button', { name: 'Add group' }));
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    await vi.waitFor(() =>
      expect(navigation.push).toHaveBeenCalledWith(`${menu}/products/${PRODUCT_ID}`),
    );
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      categoryId: CATEGORY_IDS[1],
      name: 'Chicken Tikka',
      description: null,
      status: 'PUBLISHED',
      isAvailable: true,
      variants: [
        { name: 'Regular', priceMinor: 45050, sku: null, isAvailable: true, isDefault: true },
      ],
      addOnGroupIds: [GROUP_IDS[0]],
    });
  });

  it('maps server field errors onto the matching option', async () => {
    setup({
      productId: null,
      extra: (call) =>
        call.method === 'POST'
          ? errorResponse(400, 'VALIDATION_FAILED', 'Validation failed', [
              { field: 'variants.1.name', message: 'That option name is already used' },
            ])
          : undefined,
    });

    await user.type(await screen.findByLabelText('Product name'), 'Chicken Tikka');
    await user.type(option(1).getByLabelText('Price (Rs)'), '450');
    await user.click(screen.getByRole('button', { name: 'Add option' }));
    await user.type(option(2).getByLabelText('Option name'), 'Large');
    await user.type(option(2).getByLabelText('Price (Rs)'), '700');
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    await vi.waitFor(() =>
      expect(option(2).getByLabelText('Option name')).toHaveAccessibleDescription(
        'That option name is already used',
      ),
    );
    expect(option(1).getByLabelText('Option name')).not.toHaveAttribute('aria-invalid');
    expect(navigation.push).not.toHaveBeenCalled();
  });
});

describe('ProductEditorPage — existing product', () => {
  it('sends edited prices in paisa and keeps option ids', async () => {
    const { calls } = setup({
      extra: (call) => (call.method === 'PUT' ? jsonResponse(productDetailFixture()) : undefined),
    });

    expect(await screen.findByRole('heading', { name: 'Edit product' })).toBeInTheDocument();
    const price = option(2).getByLabelText('Price (Rs)');
    expect(price).toHaveValue('800');
    await user.clear(price);
    await user.type(price, '925.75');
    await user.click(screen.getByRole('button', { name: 'Save product' }));

    expect(await screen.findByText('Product saved.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PUT')).toMatchObject({
      path: productPath,
      body: {
        variants: [
          { id: VARIANT_IDS[0], name: 'Half', priceMinor: 45000, isDefault: true },
          { id: VARIANT_IDS[1], name: 'Full', priceMinor: 92575, sku: 'TIKKA-F' },
        ],
      },
    });
  });

  it('rejects a wrong file type or an oversized image before uploading', async () => {
    const { calls } = setup();

    const input = await screen.findByLabelText('Upload image');
    await user.upload(input, new File(['gif'], 'dish.gif', { type: 'image/gif' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPEG, PNG or WebP image');

    await user.upload(
      input,
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'dish.png', { type: 'image/png' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Images must be 5 MB or smaller');
    expect(calls.some((call) => call.path.endsWith('/image'))).toBe(false);
  });

  it.each([
    [415, 'UNSUPPORTED_MEDIA_TYPE', 'This file is not a supported image'],
    [413, 'PAYLOAD_TOO_LARGE', 'The image is larger than 5 MB'],
  ] as const)('shows a %i upload error from the server', async (status, code, message) => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'POST' && call.path === `${productPath}/image`
          ? errorResponse(status, code, message)
          : undefined,
    });

    await user.upload(
      await screen.findByLabelText('Upload image'),
      new File(['png'], 'dish.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    const upload = calls.find((call) => call.path === `${productPath}/image`);
    expect(upload?.body).toBeInstanceOf(FormData);
    expect((upload?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('uploads and removes the product image', async () => {
    const withImage = productDetailFixture({ imageUrl: '/api/v1/media/products/dish.webp' });
    let current = productDetailFixture();
    const { calls } = setup({
      extra: (call) => {
        if (call.path === `${productPath}/image`) {
          current = call.method === 'POST' ? withImage : productDetailFixture();
          return jsonResponse(current, call.method === 'POST' ? 201 : 200);
        }
        if (call.path === productPath && call.method === 'GET') return jsonResponse(current);
        return undefined;
      },
    });

    await user.upload(
      await screen.findByLabelText('Upload image'),
      new File(['webp'], 'dish.webp', { type: 'image/webp' }),
    );
    expect(await screen.findByRole('img', { name: 'Photo of Chicken Tikka' })).toHaveAttribute(
      'src',
      '/api/v1/media/products/dish.webp',
    );
    await user.click(screen.getByRole('button', { name: 'Remove image' }));
    await vi.waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Photo of Chicken Tikka' })).not.toBeInTheDocument(),
    );
    expect(
      calls.filter((call) => call.path === `${productPath}/image`).map((c) => c.method),
    ).toEqual(['POST', 'DELETE']);
  });

  it('only deletes after confirmation, then returns to the menu', async () => {
    const { calls } = setup({
      extra: (call) =>
        call.method === 'DELETE' && call.path === productPath
          ? new Response(null, { status: 204 })
          : undefined,
    });

    await user.click(await screen.findByRole('button', { name: 'Delete product' }));
    let dialog = await screen.findByRole('alertdialog', { name: 'Delete Chicken Tikka?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Delete product' }));
    dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete product' }));

    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith(menu));
    expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', path: productPath }));
  });

  it('is read-only for kitchen staff', async () => {
    setup({ role: 'KITCHEN_STAFF' });

    expect(await screen.findByText('View only')).toBeInTheDocument();
    expect(screen.getByLabelText('Product name')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete product' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload image')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add option' })).not.toBeInTheDocument();
  });
});
