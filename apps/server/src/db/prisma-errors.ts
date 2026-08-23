import { Prisma } from '../generated/prisma/client.js';

/**
 * Detects Prisma's unique-constraint-violation error (P2002) and, when a field name is given, that
 * the violation was specifically on that field/constraint — so a repository never mis-reports e.g.
 * a `(userId, gameId)` composite-key violation as an email conflict just because both happen to be
 * P2002s. See PART 11 (database error handling): raw Prisma errors never reach a caller unmapped.
 */
export function isUniqueConstraintViolation(cause: unknown, field?: string): boolean {
  if (!(cause instanceof Prisma.PrismaClientKnownRequestError) || cause.code !== 'P2002') return false;
  if (!field) return true;
  return uniqueConstraintFields(cause.meta).some((f) => f.includes(field));
}

/**
 * The affected-field list lives in a DIFFERENT place in `meta` depending on the query engine: the
 * classic query engine puts it at `meta.target`; the `@prisma/adapter-pg` driver adapter this
 * project uses instead nests it at `meta.driverAdapterError.cause.constraint.fields` (found by
 * writing a real duplicate-email integration test against real Postgres and observing the actual
 * shape — the classic `meta.target` path silently never matched anything under the adapter,
 * letting the raw PrismaClientKnownRequestError leak past every repository's own try/catch). Both
 * shapes are checked so this keeps working regardless of which engine configuration is active.
 */
function uniqueConstraintFields(meta: Record<string, unknown> | undefined): string[] {
  if (!meta) return [];
  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];

  const adapterError = meta.driverAdapterError as { cause?: { constraint?: { fields?: unknown } } } | undefined;
  const fields = adapterError?.cause?.constraint?.fields;
  return Array.isArray(fields) ? fields.map(String) : [];
}

/** Detects Prisma's "database unreachable" family of connection errors (P1001/P1002/P1017 + the initialization error class). */
export function isDatabaseUnavailable(cause: unknown): boolean {
  if (cause instanceof Prisma.PrismaClientInitializationError) return true;
  if (cause instanceof Prisma.PrismaClientKnownRequestError) {
    return cause.code === 'P1001' || cause.code === 'P1002' || cause.code === 'P1017';
  }
  return false;
}
