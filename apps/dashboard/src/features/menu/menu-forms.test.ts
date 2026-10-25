import { CATEGORY_IDS, productDetailFixture, VARIANT_IDS } from '@/testing/menu-fixtures';
import {
  buildAddOnGroupRequest,
  buildProductRequest,
  draftFromProduct,
  emptyAddOnGroupDraft,
  emptyProductDraft,
  imageFileError,
  type ProductDraft,
  selectionSummary,
} from './menu-forms';

function productDraft(overrides: Partial<ProductDraft> = {}): ProductDraft {
  return {
    ...emptyProductDraft(CATEGORY_IDS[0]),
    name: 'Chicken Tikka',
    variants: [
      {
        key: 'a',
        name: 'Half',
        price: '450',
        sku: '',
        isAvailable: true,
        isDefault: true,
      },
      {
        key: 'b',
        name: 'Full',
        price: '800.50',
        sku: ' TK-1 ',
        isAvailable: true,
        isDefault: false,
      },
    ],
    ...overrides,
  };
}

function errorsOf(draft: ProductDraft) {
  const result = buildProductRequest(draft);
  return result.success ? {} : result.errors;
}

describe('buildProductRequest', () => {
  it('converts rupees to paisa and trims optional fields', () => {
    const result = buildProductRequest(productDraft({ description: '  ' }));
    expect(result).toEqual({
      success: true,
      data: {
        categoryId: CATEGORY_IDS[0],
        name: 'Chicken Tikka',
        description: null,
        status: 'DRAFT',
        isAvailable: true,
        variants: [
          { name: 'Half', priceMinor: 45000, sku: null, isAvailable: true, isDefault: true },
          { name: 'Full', priceMinor: 80050, sku: 'TK-1', isAvailable: true, isDefault: false },
        ],
        addOnGroupIds: [],
      },
    });
  });

  it('keeps existing variant ids so the server updates them', () => {
    const result = buildProductRequest(draftFromProduct(productDetailFixture()));
    expect(result.success && result.data.variants.map((variant) => variant.id)).toEqual([
      VARIANT_IDS[0],
      VARIANT_IDS[1],
    ]);
  });

  it('requires at least one option', () => {
    expect(errorsOf(productDraft({ variants: [] }))).toMatchObject({
      variants: 'Add at least one option',
    });
  });

  it('requires exactly one default option', () => {
    const draft = productDraft();
    draft.variants = draft.variants.map((variant) => ({ ...variant, isDefault: true }));
    expect(errorsOf(draft)).toMatchObject({ variants: 'Choose exactly one default option' });
  });

  it('rejects duplicate option names on the later option', () => {
    const draft = productDraft();
    draft.variants = draft.variants.map((variant) => ({ ...variant, name: 'Half' }));
    expect(errorsOf(draft)).toEqual({ 'variants.1.name': 'Option names must be unique' });
  });

  it('rejects negative, malformed and too-high prices', () => {
    const draft = productDraft();
    draft.variants = [
      { ...draft.variants[0]!, price: '-5' },
      { ...draft.variants[1]!, price: '100001' },
    ];
    expect(errorsOf(draft)).toEqual({
      'variants.0.priceMinor': 'Enter a price in rupees, e.g. 450',
      'variants.1.priceMinor': 'Price can be at most Rs 100,000',
    });
    expect(
      errorsOf(productDraft({ variants: [{ ...draft.variants[0]!, price: '12.345' }] })),
    ).toEqual({ 'variants.0.priceMinor': 'Enter a price in rupees, e.g. 450' });
  });

  it('needs a category and a name', () => {
    expect(errorsOf(productDraft({ categoryId: '', name: 'A' }))).toEqual({
      categoryId: 'Choose a category',
      name: 'Enter a name between 2 and 160 characters',
    });
  });

  it('refuses to publish without an available option', () => {
    const draft = productDraft({ status: 'PUBLISHED' });
    draft.variants = draft.variants.map((variant) => ({ ...variant, isAvailable: false }));
    expect(errorsOf(draft)).toEqual({
      variants: 'A published product needs at least one available option',
    });
  });
});

describe('buildAddOnGroupRequest', () => {
  const base = emptyAddOnGroupDraft();
  const addOns = [
    { key: 'x', name: 'Cola', price: '0', isAvailable: true },
    { key: 'y', name: 'Lassi', price: '150', isAvailable: true },
  ];

  it('builds an optional group with prices in paisa', () => {
    expect(buildAddOnGroupRequest({ ...base, name: 'Drinks', maxSelect: '2', addOns })).toEqual({
      success: true,
      data: {
        name: 'Drinks',
        minSelect: 0,
        maxSelect: 2,
        addOns: [
          { name: 'Cola', priceMinor: 0, isAvailable: true },
          { name: 'Lassi', priceMinor: 15000, isAvailable: true },
        ],
      },
    });
  });

  it('rejects a minimum above the maximum', () => {
    const result = buildAddOnGroupRequest({
      ...base,
      name: 'Drinks',
      required: true,
      minSelect: '2',
      maxSelect: '1',
      addOns,
    });
    expect(result.success ? {} : result.errors).toEqual({
      minSelect: 'Minimum cannot exceed maximum',
    });
  });

  it('rejects a required group without available options', () => {
    const result = buildAddOnGroupRequest({
      ...base,
      name: 'Drinks',
      required: true,
      minSelect: '1',
      maxSelect: '1',
      addOns: addOns.map((addOn) => ({ ...addOn, isAvailable: false })),
    });
    expect(result.success ? {} : result.errors).toEqual({
      minSelect: 'Not enough available options to meet the minimum',
    });
  });

  it('rejects a maximum above the number of options and too-high prices', () => {
    const result = buildAddOnGroupRequest({
      ...base,
      name: 'Drinks',
      maxSelect: '3',
      addOns: [{ key: 'z', name: 'Cola', price: '50001', isAvailable: true }],
    });
    expect(result.success ? {} : result.errors).toEqual({
      maxSelect: 'Maximum cannot exceed the number of options',
      'addOns.0.priceMinor': 'Price can be at most Rs 50,000',
    });
  });
});

describe('menu helpers', () => {
  it('summarises selection rules', () => {
    expect(selectionSummary({ minSelect: 1, maxSelect: 1 })).toBe('Required: choose 1');
    expect(selectionSummary({ minSelect: 1, maxSelect: 3 })).toBe('Required: choose 1 to 3');
    expect(selectionSummary({ minSelect: 0, maxSelect: 3 })).toBe('Optional: up to 3');
  });

  it('checks image type and size', () => {
    expect(imageFileError(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe(
      'Choose a JPEG, PNG or WebP image',
    );
    expect(
      imageFileError(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }),
      ),
    ).toBe('Images must be 5 MB or smaller');
    expect(imageFileError(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull();
  });
});
