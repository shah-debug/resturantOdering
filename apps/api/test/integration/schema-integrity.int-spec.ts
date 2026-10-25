import type { Client } from 'pg';
import {
  addHistory,
  checkDeferredConstraints,
  connectSqlClient,
  createSqlPickupOrder,
  createSqlTenant,
  inRollback,
} from '../support/sql-fixtures';

describe('database integrity rules (in-memory Postgres, every test rolled back)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectSqlClient();
  });

  afterAll(async () => {
    await client.end();
  });

  describe('tenant isolation', () => {
    it('rejects an order that points at another organization’s branch', async () => {
      await inRollback(client, async () => {
        const tenantA = await createSqlTenant(client);
        const tenantB = await createSqlTenant(client);
        await expect(
          createSqlPickupOrder(client, tenantA, { branchId: tenantB.branchId }),
        ).rejects.toThrow(/foreign key/);
      });
    });

    it('rejects an order item whose variant belongs to a different product', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        await expect(
          client.query(
            `INSERT INTO order_items (id, organization_id, order_id, product_id, variant_id, product_name,
                                      variant_name, quantity, unit_price_minor, line_subtotal_minor)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, 'x', 'x', 1, 30000, 30000)`,
            [tenant.organizationId, orderId, tenant.productId, tenant.otherVariantId],
          ),
        ).rejects.toThrow(/foreign key|not available to order/);
      });
    });

    it('rejects a child row whose organization differs from its parent', async () => {
      await inRollback(client, async () => {
        const tenantA = await createSqlTenant(client);
        const tenantB = await createSqlTenant(client);
        await expect(
          client.query(
            `INSERT INTO customer_addresses (id, organization_id, customer_id, address_line, city, updated_at)
             VALUES (gen_random_uuid(), $1, $2, 'Somewhere', 'Lahore', now())`,
            [tenantB.organizationId, tenantA.customerId],
          ),
        ).rejects.toThrow(/foreign key/);
      });
    });

    it('rejects moving a branch to another organization while it is referenced', async () => {
      await inRollback(client, async () => {
        const tenantA = await createSqlTenant(client);
        const tenantB = await createSqlTenant(client);
        await createSqlPickupOrder(client, tenantA);
        await expect(
          client.query(`UPDATE branches SET organization_id = $1, slug = 'moved' WHERE id = $2`, [
            tenantB.organizationId,
            tenantA.branchId,
          ]),
        ).rejects.toThrow(/foreign key/);
      });
    });
  });

  describe('order consistency', () => {
    it('accepts a consistent order', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await createSqlPickupOrder(client, tenant);
        await expect(checkDeferredConstraints(client)).resolves.toBeUndefined();
      });
    });

    it('rejects an order whose subtotal does not match its items', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await createSqlPickupOrder(client, tenant, { subtotalMinor: 40_000 });
        await expect(checkDeferredConstraints(client)).rejects.toThrow(/totals do not match/);
      });
    });

    it('rejects an order without a matching status history entry', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await createSqlPickupOrder(client, tenant, { withHistory: false });
        await expect(checkDeferredConstraints(client)).rejects.toThrow(/latest status history/);
      });
    });

    it('rejects a broken status history chain', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        await client.query(`UPDATE orders SET status = 'CONFIRMED' WHERE id = $1`, [orderId]);
        await addHistory(client, tenant, orderId, 'PREPARING', 'CONFIRMED');
        await expect(checkDeferredConstraints(client)).rejects.toThrow(/continuous chain/);
      });
    });

    it('rejects a total that breaks the total formula', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await expect(createSqlPickupOrder(client, tenant, { totalMinor: 1 })).rejects.toThrow(
          /orders_total_formula_check/,
        );
      });
    });

    it('rejects deleting an order', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        await expect(client.query('DELETE FROM orders WHERE id = $1', [orderId])).rejects.toThrow(
          /cannot be deleted/,
        );
      });
    });
  });

  describe('only orderable menu items enter orders', () => {
    type Target = 'product' | 'variant';

    async function expectRejected(sql: string, target: Target): Promise<void> {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await client.query(sql, [target === 'product' ? tenant.productId : tenant.variantId]);
        await expect(createSqlPickupOrder(client, tenant)).rejects.toThrow(
          /not available to order/,
        );
      });
    }

    it('rejects draft products', async () => {
      await expectRejected(`UPDATE products SET status = 'DRAFT' WHERE id = $1`, 'product');
    });

    it('rejects products marked unavailable', async () => {
      await expectRejected('UPDATE products SET is_available = false WHERE id = $1', 'product');
    });

    it('rejects archived products', async () => {
      await expectRejected('UPDATE products SET archived_at = now() WHERE id = $1', 'product');
    });

    it('rejects unavailable or archived options', async () => {
      await expectRejected(
        'UPDATE product_variants SET is_available = false WHERE id = $1',
        'variant',
      );
      await expectRejected(
        'UPDATE product_variants SET archived_at = now() WHERE id = $1',
        'variant',
      );
    });

    it('rejects products in a hidden category', async () => {
      await expectRejected(
        'UPDATE categories SET is_active = false WHERE id = (SELECT category_id FROM products WHERE id = $1)',
        'product',
      );
    });

    it('accepts add-ons only when they are available and linked to the product', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const group = await client.query<{ id: string }>(
          `INSERT INTO add_on_groups (id, organization_id, name, min_select, max_select, updated_at)
           VALUES (gen_random_uuid(), $1, 'Extras', 0, 2, now()) RETURNING id`,
          [tenant.organizationId],
        );
        const groupId = group.rows[0]?.id;
        const addOns = await client.query<{ id: string; name: string }>(
          `INSERT INTO add_ons (id, organization_id, add_on_group_id, name, price_minor, is_available, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'Naan', 6000, true, now()),
                  (gen_random_uuid(), $1, $2, 'Sold out', 1000, false, now())
           RETURNING id, name`,
          [tenant.organizationId, groupId],
        );
        const naan = addOns.rows.find((row) => row.name === 'Naan')?.id;
        const soldOut = addOns.rows.find((row) => row.name === 'Sold out')?.id;
        const orderId = await createSqlPickupOrder(client, tenant);
        const item = await client.query<{ id: string }>(
          'SELECT id FROM order_items WHERE order_id = $1',
          [orderId],
        );
        const itemId = item.rows[0]?.id;
        const insertAddOn = (addOnId: string | undefined) =>
          client.query(
            `INSERT INTO order_item_add_ons (id, organization_id, order_item_id, add_on_id, group_name, name, unit_price_minor)
             VALUES (gen_random_uuid(), $1, $2, $3, 'Extras', 'x', 0)`,
            [tenant.organizationId, itemId, addOnId],
          );

        await client.query('SAVEPOINT unlinked');
        await expect(insertAddOn(naan)).rejects.toThrow(/not available for this product/);
        await client.query('ROLLBACK TO SAVEPOINT unlinked');

        await client.query(
          'INSERT INTO product_add_on_groups (organization_id, product_id, add_on_group_id) VALUES ($1, $2, $3)',
          [tenant.organizationId, tenant.productId, groupId],
        );
        await client.query('SAVEPOINT unavailable');
        await expect(insertAddOn(soldOut)).rejects.toThrow(/not available for this product/);
        await client.query('ROLLBACK TO SAVEPOINT unavailable');
        await expect(insertAddOn(naan)).resolves.toBeDefined();
      });
    });
  });

  describe('order status transitions', () => {
    it('rejects creating an order in a status other than PENDING', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        await expect(
          client.query(
            `INSERT INTO orders (id, organization_id, branch_id, customer_id, order_number, type, status,
                                 payment_method, subtotal_minor, total_minor, customer_name, customer_phone, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, 1, 'PICKUP', 'CONFIRMED', 'CASH', 0, 0, 'x', '+920000009999', now())`,
            [tenant.organizationId, tenant.branchId, tenant.customerId],
          ),
        ).rejects.toThrow(/must start in PENDING/);
      });
    });

    it('rejects skipping from PENDING straight to COMPLETED', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        await expect(
          client.query(`UPDATE orders SET status = 'COMPLETED' WHERE id = $1`, [orderId]),
        ).rejects.toThrow(/Invalid order status transition/);
      });
    });

    it('rejects terminal timestamps on an order that is not finished', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        await expect(
          client.query('UPDATE orders SET completed_at = now() WHERE id = $1', [orderId]),
        ).rejects.toThrow(/orders_terminal_timestamps_check/);
      });
    });

    it('accepts a valid transition recorded in history and stamps the timestamp', async () => {
      await inRollback(client, async () => {
        const tenant = await createSqlTenant(client);
        const orderId = await createSqlPickupOrder(client, tenant);
        const updated = await client.query<{ cancelled_at: Date | null }>(
          `UPDATE orders SET status = 'REJECTED' WHERE id = $1 RETURNING cancelled_at`,
          [orderId],
        );
        await addHistory(client, tenant, orderId, 'PENDING', 'REJECTED');
        expect(updated.rows[0]?.cancelled_at).toBeInstanceOf(Date);
        await expect(checkDeferredConstraints(client)).resolves.toBeUndefined();
      });
    });
  });

  describe('audit logs', () => {
    it('cannot be updated or deleted', async () => {
      await inRollback(client, async () => {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO audit_logs (id, action, entity_type) VALUES (gen_random_uuid(), 'test.created', 'test') RETURNING id`,
        );
        await client.query('SAVEPOINT before_update');
        await expect(
          client.query(`UPDATE audit_logs SET action = 'test.tampered' WHERE id = $1`, [
            inserted.rows[0]?.id,
          ]),
        ).rejects.toThrow(/append-only/);
        await client.query('ROLLBACK TO SAVEPOINT before_update');
        await expect(
          client.query('DELETE FROM audit_logs WHERE id = $1', [inserted.rows[0]?.id]),
        ).rejects.toThrow(/append-only/);
      });
    });
  });

  describe('Supabase hardening', () => {
    it('enables row level security on every table in the public schema', async () => {
      const result = await client.query<{ table_name: string }>(`
        SELECT c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      `);
      expect(result.rows).toEqual([]);
    });

    it('does not let PUBLIC execute the integrity functions', async () => {
      const result = await client.query<{ proname: string }>(`
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND has_function_privilege('public', p.oid, 'EXECUTE')
      `);
      expect(result.rows).toEqual([]);
    });
  });
});
