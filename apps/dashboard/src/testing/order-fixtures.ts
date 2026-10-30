import type { OrderDetail, OrderListItem, Rider } from '@app/contracts';
import { BRANCH_ID } from './api-mock';

export const ORDER_ID = '018f0000-0000-7000-8000-0000000000aa';
export const RIDER_ID = '018f0000-0000-7000-8000-0000000000cc';

export function orderListItem(overrides: Partial<OrderListItem> = {}): OrderListItem {
  return {
    id: ORDER_ID,
    orderNumber: 42,
    status: 'PENDING',
    type: 'DELIVERY',
    branchId: BRANCH_ID,
    branchName: 'Gulberg',
    customerName: 'Bilal Ahmed',
    customerPhone: '+923009876543',
    deliveryArea: 'Model Town',
    itemCount: 2,
    lines: [{ productName: 'Chicken Karahi', variantName: 'Half', quantity: 2, addOns: ['Naan'] }],
    customerNote: 'Less spicy',
    totalMinor: 315_000,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    rider: null,
    placedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    statusChangedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    availableTransitions: ['CONFIRMED', 'REJECTED', 'CANCELLED'],
    ...overrides,
  };
}

export function orderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    ...orderListItem(),
    cancellationReason: null,
    delivery: {
      addressLine: '45 Canal View Road',
      area: 'Model Town',
      city: 'Lahore',
      landmark: null,
      instructions: 'Ring twice',
      zoneName: 'Standard delivery',
    },
    branch: {
      id: BRANCH_ID,
      name: 'Gulberg',
      phone: '+924235000000',
      addressLine: '12 Main Boulevard',
      city: 'Lahore',
    },
    items: [
      {
        id: '018f0000-0000-7000-8000-0000000000dd',
        productName: 'Chicken Karahi',
        variantName: 'Half',
        quantity: 2,
        unitPriceMinor: 145_000,
        addOns: [{ name: 'Naan', groupName: 'Bread', unitPriceMinor: 5_000 }],
        lineSubtotalMinor: 300_000,
        note: null,
      },
    ],
    totals: {
      currency: 'PKR',
      subtotalMinor: 300_000,
      discountMinor: 0,
      taxMinor: 0,
      taxRateBps: 0,
      pricesIncludeTax: false,
      deliveryFeeMinor: 15_000,
      deliveryDiscountMinor: 0,
      roundingAdjustmentMinor: 0,
      totalMinor: 315_000,
    },
    promotionCode: null,
    timeline: [
      {
        fromStatus: null,
        toStatus: 'PENDING',
        actorType: 'CUSTOMER',
        actorName: null,
        note: null,
        at: '2026-10-31T10:00:00.000Z',
      },
    ],
    canAssignRider: false,
    completedAt: null,
    cancelledAt: null,
    restaurantName: 'Karachi Grill',
    ...overrides,
  };
}

export function riderFixture(overrides: Partial<Rider> = {}): Rider {
  return {
    id: RIDER_ID,
    branchId: BRANCH_ID,
    branchName: 'Gulberg',
    fullName: 'Imran Khan',
    phone: '+923001110001',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: 'LEA-1234',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    activeDeliveries: 0,
    createdAt: '2026-10-31T09:00:00.000Z',
    ...overrides,
  };
}
