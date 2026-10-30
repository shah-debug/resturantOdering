import {
  type CheckoutQuoteRequest,
  normalizePhoneNumber,
  type OrderType,
  type PaymentMethod,
  type PlaceOrderRequest,
  placeOrderRequestSchema,
} from '@app/contracts';
import type { CartLine } from '@/features/cart/cart-slice';

export interface CheckoutForm {
  type: OrderType;
  branchId: string;
  name: string;
  phone: string;
  addressLine: string;
  area: string;
  city: string;
  landmark: string;
  instructions: string;
  note: string;
  promoCode: string;
  paymentMethod: PaymentMethod;
}

export type CheckoutErrors = Partial<Record<keyof CheckoutForm, string>>;

function items(lines: readonly CartLine[]): CheckoutQuoteRequest['items'] {
  return lines.map(({ productId, variantId, addOnIds, quantity }) => ({
    productId,
    variantId,
    addOnIds,
    quantity,
  }));
}

export function canQuoteDelivery(form: CheckoutForm): boolean {
  return form.area.trim().length >= 2 && form.city.trim().length >= 2;
}

export function buildQuoteRequest(
  form: CheckoutForm,
  lines: readonly CartLine[],
): CheckoutQuoteRequest | null {
  if (lines.length === 0 || !form.branchId) {
    return null;
  }
  if (form.type === 'DELIVERY' && !canQuoteDelivery(form)) {
    return null;
  }
  return {
    branchId: form.branchId,
    fulfillment:
      form.type === 'DELIVERY'
        ? { type: 'DELIVERY', address: { area: form.area.trim(), city: form.city.trim() } }
        : { type: 'PICKUP' },
    paymentMethod: form.paymentMethod,
    promoCode: form.promoCode.trim() || null,
    items: items(lines),
  };
}

const FIELD_FOR_PATH: Record<string, keyof CheckoutForm> = {
  'customer.name': 'name',
  'customer.phone': 'phone',
  'fulfillment.address.addressLine': 'addressLine',
  'fulfillment.address.area': 'area',
  'fulfillment.address.city': 'city',
  'fulfillment.address.landmark': 'landmark',
  'fulfillment.instructions': 'instructions',
  note: 'note',
  promoCode: 'promoCode',
};

const FRIENDLY_MESSAGES: Partial<Record<keyof CheckoutForm, string>> = {
  name: 'Enter your name',
  phone: 'Enter a valid mobile number, e.g. 0300 1234567',
  addressLine: 'Enter your house number and street',
  area: 'Enter your area or neighbourhood',
  city: 'Enter your city',
};

export function buildOrderRequest(
  form: CheckoutForm,
  lines: readonly CartLine[],
  expectedTotalMinor: number,
): { ok: true; body: PlaceOrderRequest } | { ok: false; errors: CheckoutErrors } {
  const body: PlaceOrderRequest = {
    branchId: form.branchId,
    fulfillment:
      form.type === 'DELIVERY'
        ? {
            type: 'DELIVERY',
            address: {
              addressLine: form.addressLine.trim(),
              area: form.area.trim(),
              city: form.city.trim(),
              landmark: form.landmark.trim() || null,
            },
            instructions: form.instructions.trim() || null,
          }
        : { type: 'PICKUP' },
    paymentMethod: form.paymentMethod,
    promoCode: form.promoCode.trim() || null,
    items: items(lines),
    customer: {
      name: form.name.trim(),
      phone: normalizePhoneNumber(form.phone) ?? form.phone.trim(),
    },
    note: form.note.trim() || null,
    expectedTotalMinor,
  };
  const result = placeOrderRequestSchema.safeParse(body);
  if (result.success) {
    return { ok: true, body };
  }
  const errors: CheckoutErrors = {};
  for (const issue of result.error.issues) {
    const field = FIELD_FOR_PATH[issue.path.map(String).join('.')];
    if (field) {
      errors[field] ??= FRIENDLY_MESSAGES[field] ?? issue.message;
    }
  }
  return { ok: false, errors };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
