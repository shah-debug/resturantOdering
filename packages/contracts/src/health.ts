import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const databaseHealthSchema = z.object({
  status: z.enum(['up', 'down']),
  latencyMs: z.number().int().nonnegative(),
});

export type DatabaseHealth = z.infer<typeof databaseHealthSchema>;

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  checks: z.object({
    database: databaseHealthSchema,
  }),
  timestamp: z.iso.datetime(),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
