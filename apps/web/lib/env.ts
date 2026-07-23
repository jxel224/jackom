import { z } from 'zod';

/**
 * Validated environment variables. `NEXT_PUBLIC_WS_URL` is not consumed by anything yet (the
 * WebSocket client is out of scope for this step) — it's validated now so a malformed value fails
 * fast at build/start time instead of silently becoming an unvalidated string deep inside a future
 * realtime hook.
 */
const envSchema = z.object({
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
});

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
