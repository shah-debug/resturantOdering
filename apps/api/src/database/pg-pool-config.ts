import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

export interface PgPoolOptions {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  sslCaPath?: string | undefined;
}

export function createPgPoolConfig(options: PgPoolOptions): PoolConfig {
  return {
    connectionString: options.url,
    max: options.poolMax,
    connectionTimeoutMillis: options.connectionTimeoutMs,
    idleTimeoutMillis: 30_000,
    statement_timeout: options.statementTimeoutMs,
    query_timeout: options.statementTimeoutMs,
    keepAlive: true,
    ...(options.sslCaPath
      ? { ssl: { ca: readFileSync(options.sslCaPath, 'utf8'), rejectUnauthorized: true } }
      : {}),
  };
}
