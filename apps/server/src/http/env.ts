import { z } from 'zod';

/**
 * Validated HTTP-API environment config. `HttpApiServer` itself never reads `process.env` directly
 * — it only ever receives an already-validated `allowedOrigins: string[]` constructor option
 * (matching this codebase's existing rule that only ONE file is allowed to touch a real ambient
 * source: `fsm/default-deps.ts` for `Date.now()`/`Math.random()`, and this file for env vars).
 * Callers (a future production bootstrap) call `loadHttpApiEnvConfig()` and pass the result in.
 */

const envSchema = z.object({
  // Comma-separated list of origins allowed to call the HTTP API (e.g. "https://jackom.example,http://localhost:3000").
  // No default: an empty allow-list means every browser request is rejected by CORS, which is the
  // safe failure mode — better than silently defaulting to "allow everything."
  HTTP_ALLOWED_ORIGINS: z.string().optional(),
});

export interface HttpApiEnvConfig {
  allowedOrigins: string[];
}

export function loadHttpApiEnvConfig(source: NodeJS.ProcessEnv = process.env): HttpApiEnvConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid HTTP API environment variables: ${parsed.error.message}`);
  }
  const allowedOrigins = (parsed.data.HTTP_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return { allowedOrigins };
}
