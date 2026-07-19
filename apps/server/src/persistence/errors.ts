/**
 * Typed errors for the persistence and actor layers (ARCHITECTURE.md Step 3 scope). Nothing here
 * ever embeds a session token or the contents of RoomPrivateState in a message — only roomIds,
 * key names, and error codes (see logging.ts for the same rule applied to logging).
 */

export type RepositoryErrorCode =
  | 'READ_FAILURE' // the underlying KeyValueStore threw on get/exists
  | 'WRITE_FAILURE' // the underlying KeyValueStore threw on set/del/expire
  | 'INVALID_JSON' // the stored string was not valid JSON
  | 'VALIDATION_FAILED'; // the parsed JSON did not match the expected shape

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  override readonly cause?: unknown;

  constructor(code: RepositoryErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
    this.cause = cause;
  }
}

export type RoomConsistencyErrorCode =
  | 'ROOM_NOT_FOUND' // neither half exists (or the room expired) — not an error condition by itself, callers may treat it as "doesn't exist"
  | 'PUBLIC_STATE_MISSING' // private state exists but public state does not
  | 'PRIVATE_STATE_MISSING' // public state exists but private state does not
  | 'PARTIAL_PERSISTENCE_FAILURE'; // one half of a save succeeded and the other failed

/**
 * Every repository method that touches a `KeyValueStore` goes through this — whatever the store
 * implementation throws (a real ioredis connection error, a fake test failure, anything) is
 * translated into a typed `RepositoryError` here, so callers get a consistent contract regardless
 * of backend. Already-typed `RepositoryError`s pass through unchanged rather than being double-wrapped.
 */
export function wrapStoreError(cause: unknown, code: RepositoryErrorCode, message: string): RepositoryError {
  if (cause instanceof RepositoryError) return cause;
  return new RepositoryError(code, message, cause);
}

export class RoomConsistencyError extends Error {
  readonly code: RoomConsistencyErrorCode;
  readonly roomId: string;

  constructor(code: RoomConsistencyErrorCode, roomId: string) {
    super(`${code} for roomId=${roomId}`);
    this.name = 'RoomConsistencyError';
    this.code = code;
    this.roomId = roomId;
  }
}
