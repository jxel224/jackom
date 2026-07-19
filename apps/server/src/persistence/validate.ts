import type { z } from 'zod';
import { RepositoryError } from './errors.js';

/**
 * Parses `raw` (a JSON string read back from the store) through `schema`, wrapping every failure
 * mode in a typed `RepositoryError` — never returns partially-trusted data, and never a raw parse
 * exception leaking whatever the corrupted payload happened to contain.
 */
export function parseStoredJson<T>(raw: string, schema: z.ZodType<T>, description: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new RepositoryError('INVALID_JSON', `Stored value for ${description} is not valid JSON`, cause);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    // Only structural info (path + message) ever surfaces — never the offending value, so a
    // corrupted RoomPrivateState document can't leak a token/role through a validation error.
    const issues = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    throw new RepositoryError('VALIDATION_FAILED', `Stored value for ${description} failed validation: ${JSON.stringify(issues)}`);
  }
  return result.data;
}
