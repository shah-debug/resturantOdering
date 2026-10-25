import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OrderStatus, OrderType } from '../../../generated/prisma/enums';
import {
  canTransitionOrderStatus,
  isTerminalOrderStatus,
  nextOrderStatuses,
  ORDER_STATUS_TRANSITIONS,
} from './order-status';

describe('order status machine', () => {
  it('follows the happy path for delivery orders', () => {
    const path = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    path.slice(1).forEach((to, index) => {
      expect(canTransitionOrderStatus(OrderType.DELIVERY, path[index] ?? to, to)).toBe(true);
    });
  });

  it('completes pickup orders from READY without a rider', () => {
    expect(
      canTransitionOrderStatus(OrderType.PICKUP, OrderStatus.READY, OrderStatus.COMPLETED),
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderType.PICKUP, OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY),
    ).toBe(false);
    expect(
      canTransitionOrderStatus(OrderType.DELIVERY, OrderStatus.READY, OrderStatus.COMPLETED),
    ).toBe(false);
  });

  it('allows retrying a failed delivery', () => {
    expect(nextOrderStatuses(OrderType.DELIVERY, OrderStatus.DELIVERY_FAILED)).toEqual([
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.CANCELLED,
    ]);
  });

  it('does not allow skipping steps or reopening finished orders', () => {
    expect(
      canTransitionOrderStatus(OrderType.DELIVERY, OrderStatus.PENDING, OrderStatus.DELIVERED),
    ).toBe(false);
    expect(
      canTransitionOrderStatus(OrderType.DELIVERY, OrderStatus.CANCELLED, OrderStatus.PENDING),
    ).toBe(false);
  });

  it.each([
    [OrderType.DELIVERY, OrderStatus.DELIVERED],
    [OrderType.PICKUP, OrderStatus.COMPLETED],
    [OrderType.DELIVERY, OrderStatus.CANCELLED],
    [OrderType.PICKUP, OrderStatus.REJECTED],
  ])('treats %s %s as terminal', (type, status) => {
    expect(isTerminalOrderStatus(type, status)).toBe(true);
  });
});

describe('order status machine matches the database trigger', () => {
  function loadSqlTransitions(): string[] {
    const migrationsDir = resolve(process.cwd(), 'prisma/migrations');
    const definitions = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
      .filter((sql) => sql.includes('-- transitions:start'));
    const latest = definitions.at(-1);
    if (!latest) {
      throw new Error('No migration defines the order status transitions');
    }
    const block = latest.split('-- transitions:start')[1]?.split('-- transitions:end')[0] ?? '';
    return [...block.matchAll(/\('([A-Z_]+)', '([A-Z_]+)', (NULL(?:::text)?|'[A-Z_]+')\)/g)].map(
      ([, from, to, type]) =>
        `${from}->${to}:${type?.startsWith('NULL') ? 'ANY' : type?.replaceAll("'", '')}`,
    );
  }

  it('defines exactly the same transitions in SQL and TypeScript', () => {
    const fromTypeScript = ORDER_STATUS_TRANSITIONS.map(
      ({ from, to, orderType }) => `${from}->${to}:${orderType ?? 'ANY'}`,
    );
    expect(loadSqlTransitions().sort()).toEqual(fromTypeScript.sort());
  });
});
