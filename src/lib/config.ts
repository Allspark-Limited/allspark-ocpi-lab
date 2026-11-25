import { createHash } from 'node:crypto';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  LAB_MASTER_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  LAB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  LAB_ADMIN_SECRET: z.string().min(12),
  LAB_ENVIRONMENT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  LAB_MAX_ENVIRONMENTS: z.coerce.number().int().min(1).max(1000).default(25),
});

export type LabConfig = z.infer<typeof schema>;

let cached: LabConfig | undefined;

export function config(): LabConfig {
  cached ??= schema.parse(process.env);
  return cached;
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function publicOrigin(requestUrl?: string): string {
  const configured = config().LAB_PUBLIC_URL.replace(/\/$/, '');
  if (configured !== 'http://localhost:3000' || !requestUrl) return configured;
  return new URL(requestUrl).origin;
}
