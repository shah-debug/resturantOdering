import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

export async function connectSqlClient(): Promise<Client> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set; run this file in the "integration" project.');
  }
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

export async function inRollback(client: Client, work: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await work();
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function checkDeferredConstraints(client: Client): Promise<void> {
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
}

async function insertReturningId(client: Client, sql: string, values: unknown[]): Promise<string> {
  const result = await client.query<{ id: string }>(sql, values);
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Insert returned no id: ${sql}`);
  }
  return id;
}

export interface SqlTenant {
  organizationId: string;
  branchId: string;
  customerId: string;
  productId: string;
  variantId: string;
  otherVariantId: string;
}

export async function createSqlTenant(client: Client): Promise<SqlTenant> {
  const suffix = randomUUID().slice(0, 8);
  const organizationId = await insertReturningId(
    client,
    `INSERT INTO organizations (id, slug, name, updated_at) VALUES (gen_random_uuid(), $1, $2, now()) RETURNING id`,
    [`itest-${suffix}`, `Integration ${suffix}`],
  );
  const branchId = await insertReturningId(
    client,
    `INSERT INTO branches (id, organization_id, name, slug, address_line, city, updated_at)
     VALUES (gen_random_uuid(), $1, 'Main', 'main', '1 Test Road', 'Lahore', now()) RETURNING id`,
    [organizationId],
  );
  const customerId = await insertReturningId(
    client,
    `INSERT INTO customers (id, organization_id, phone, full_name, updated_at)
     VALUES (gen_random_uuid(), $1, '+920000009999', 'Test Customer', now()) RETURNING id`,
    [organizationId],
  );
  const categoryId = await insertReturningId(
    client,
    `INSERT INTO categories (id, organization_id, name, slug, updated_at)
     VALUES (gen_random_uuid(), $1, 'Test', 'test', now()) RETURNING id`,
    [organizationId],
  );
  const insertProduct = (slug: string) =>
    insertReturningId(
      client,
      `INSERT INTO products (id, organization_id, category_id, name, slug, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $3, now()) RETURNING id`,
      [organizationId, categoryId, slug],
    );
  const insertVariant = (productId: string, priceMinor: number) =>
    insertReturningId(
      client,
      `INSERT INTO product_variants (id, organization_id, product_id, name, price_minor, is_default, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Regular', $3, true, now()) RETURNING id`,
      [organizationId, productId, priceMinor],
    );
  const productId = await insertProduct('test-dish');
  const variantId = await insertVariant(productId, 50_000);
  const otherProductId = await insertProduct('other-dish');
  const otherVariantId = await insertVariant(otherProductId, 30_000);
  return { organizationId, branchId, customerId, productId, variantId, otherVariantId };
}

export interface SqlOrderOptions {
  branchId?: string;
  subtotalMinor?: number;
  totalMinor?: number;
  withHistory?: boolean;
}

export async function createSqlPickupOrder(
  client: Client,
  tenant: SqlTenant,
  options: SqlOrderOptions = {},
): Promise<string> {
  const subtotal = options.subtotalMinor ?? 50_000;
  const orderId = await insertReturningId(
    client,
    `INSERT INTO orders (id, organization_id, branch_id, customer_id, order_number, type, payment_method,
                         subtotal_minor, total_minor, customer_name, customer_phone, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 1, 'PICKUP', 'CASH', $4, $5, 'Test Customer', '+920000009999', now())
     RETURNING id`,
    [
      tenant.organizationId,
      options.branchId ?? tenant.branchId,
      tenant.customerId,
      subtotal,
      options.totalMinor ?? subtotal,
    ],
  );
  await client.query(
    `INSERT INTO order_items (id, organization_id, order_id, product_id, variant_id, product_name, variant_name,
                              quantity, unit_price_minor, line_subtotal_minor)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'Test Dish', 'Regular', 1, 50000, 50000)`,
    [tenant.organizationId, orderId, tenant.productId, tenant.variantId],
  );
  if (options.withHistory ?? true) {
    await addHistory(client, tenant, orderId, null, 'PENDING');
  }
  return orderId;
}

export async function addHistory(
  client: Client,
  tenant: SqlTenant,
  orderId: string,
  fromStatus: string | null,
  toStatus: string,
): Promise<void> {
  await client.query(
    `INSERT INTO order_status_history (organization_id, order_id, from_status, to_status, actor_type)
     VALUES ($1, $2, $3, $4, 'STAFF')`,
    [tenant.organizationId, orderId, fromStatus, toStatus],
  );
}
