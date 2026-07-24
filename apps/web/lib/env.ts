import { z } from 'zod';

/**
 * Validated environment variables. Both are `.optional()` rather than required: `NEXT_PUBLIC_*`
 * vars are inlined at BUILD time, and this module is imported (transitively, via the API client)
 * by pages that `next build` prerenders — a required-but-unset var would throw here and fail the
 * build itself, not just the one feature that needs it. `lib/api/client.ts` checks
 * `NEXT_PUBLIC_API_URL` at CALL time instead, throwing a clear typed error only when a component
 * actually tries to reach the API without it configured.
 */
const envSchema = z.object({
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

export const env = parsed.data;
