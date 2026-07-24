import { z } from 'zod';
import { loadHttpApiEnvConfig } from './http/env.js';
import { DEFAULT_ROOM_TTL_SECONDS } from './persistence/config.js';

/**
 * Development Step 7C's server-wide environment loader. Like `http/env.ts` (whose narrower
 * `HTTP_ALLOWED_ORIGINS` concern this composes rather than duplicates), this is the only OTHER file
 * allowed to read `process.env` directly for server bootstrap concerns — `bootstrap.ts`/`main.ts`
 * only ever receive an already-validated `ServerEnvConfig`, never touching `process.env` themselves.
 *
 * Every variable has a safe localhost default so a founder who just cloned the repo and ran
 * `npm run dev` gets a working local setup without first hand-writing a `.env` file — see
 * `apps/server/.env.example` for the documented, overridable set.
 */

const envSchema = z.object({
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  HTTP_API_PORT: z.coerce.number().int().positive().default(4000),
  WS_GATEWAY_PORT: z.coerce.number().int().positive().default(4001),
  ROOM_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  /** Display-only, for the local startup banner — this process never makes a request to it. */
  FRONTEND_URL: z.string().min(1).default('http://localhost:3000'),
});

export interface ServerEnvConfig {
  redisUrl: string;
  httpApiPort: number;
  wsGatewayPort: number;
  roomTtlSeconds: number;
  frontendUrl: string;
  allowedOrigins: string[];
}

export function loadServerEnvConfig(source: NodeJS.ProcessEnv = process.env): ServerEnvConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid server environment variables: ${parsed.error.message}`);
  }
  const { allowedOrigins } = loadHttpApiEnvConfig(source);

  return {
    redisUrl: parsed.data.REDIS_URL,
    httpApiPort: parsed.data.HTTP_API_PORT,
    wsGatewayPort: parsed.data.WS_GATEWAY_PORT,
    roomTtlSeconds: parsed.data.ROOM_TTL_SECONDS ?? DEFAULT_ROOM_TTL_SECONDS,
    frontendUrl: parsed.data.FRONTEND_URL,
    allowedOrigins,
  };
}

/** Strips userinfo (`redis://user:pass@host`) before a Redis URL is ever printed or logged. */
export function redactRedisUrl(redisUrl: string): string {
  try {
    const url = new URL(redisUrl);
    if (url.username || url.password) {
      url.username = '';
      url.password = '';
      return url.toString();
    }
    return redisUrl;
  } catch {
    return redisUrl; // not a parseable URL — nothing structured to redact, but also nothing to leak
  }
}
