import { normalizePhoneNumber } from '@app/contracts';
import { IDS } from '@/testing/storefront-fixture';
import { buildOrderRequest, buildQuoteRequest, type CheckoutForm } from './checkout-form';

const lines = [
  {
    key: 'k',
    productId: IDS.karahi,
    variantId: IDS.karahiHalf,
    addOnIds: [IDS.naan],
    quantity: 2,
  },
];

function form(overrides: Partial<CheckoutForm> = {}): CheckoutForm {
  return {
    type: 'DELIVERY',
    branchId: IDS.branch,
    name: 'Ayesha Khan',
    phone: '0300 1234567',
    addressLine: '45 Canal View Road',
    area: 'Model Town',
    city: 'Lahore',
    landmark: '',
    instructions: '',
    note: '',
    promoCode: '',
    paymentMethod: 'CASH',
    ...overrides,
  };
}

describe('normalizePhoneNumber', () => {
  it.each([
    ['0300 1234567', '+923001234567'],
    ['03001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['+447700900123', '+447700900123'],
  ])('normalises %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each(['12345', '0300-12', 'call me', ''])('rejects %s', (input) => {
    expect(normalizePhoneNumber(input)).toBeNull();
  });
});

describe('buildQuoteRequest', () => {
  it('needs an area and city before quoting delivery', () => {
    expect(buildQuoteRequest(form({ area: '' }), lines)).toBeNull();
    expect(buildQuoteRequest(form(), lines)).toEqual({
      branchId: IDS.branch,
      fulfillment: { type: 'DELIVERY', address: { area: 'Model Town', city: 'Lahore' } },
      paymentMethod: 'CASH',
      promoCode: null,
      items: [
        { productId: IDS.karahi, variantId: IDS.karahiHalf, addOnIds: [IDS.naan], quantity: 2 },
      ],
    });
  });

  it('quotes pickup without an address and never sends prices', () => {
    const request = buildQuoteRequest(form({ type: 'PICKUP', area: '' }), lines);
    expect(request?.fulfillment).toEqual({ type: 'PICKUP' });
    expect(JSON.stringify(request)).not.toMatch(/price/i);
  });

  it('needs items', () => {
    expect(buildQuoteRequest(form(), [])).toBeNull();
  });
});

describe('buildOrderRequest', () => {
  it('builds a valid order with a normalised phone number', () => {
    const result = buildOrderRequest(form({ landmark: ' Near the mosque ' }), lines, 350_000);
    expect(result).toMatchObject({
      ok: true,
      body: {
        customer: { name: 'Ayesha Khan', phone: '+923001234567' },
        fulfillment: { address: { landmark: 'Near the mosque' }, instructions: null },
        expectedTotalMinor: 350_000,
        note: null,
      },
    });
  });

  it('returns friendly field errors', () => {
    const result = buildOrderRequest(
      form({ name: '', phone: '12', addressLine: 'x', city: '' }),
      lines,
      1,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        name: 'Enter your name',
        phone: 'Enter a valid mobile number, e.g. 0300 1234567',
        addressLine: 'Enter your house number and street',
        city: 'Enter your city',
      },
    });
  });

  it('does not require an address for pickup', () => {
    expect(
      buildOrderRequest(form({ type: 'PICKUP', addressLine: '', area: '', city: '' }), lines, 1).ok,
    ).toBe(true);
  });
});
