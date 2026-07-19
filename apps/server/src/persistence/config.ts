/**
 * Default TTL for room-related Redis keys. ARCHITECTURE.md §7 specifies that `roomCode`/
 * `session`/`hostSession` keys' TTLs "match room" — this is the shared default all of them use
 * unless a caller overrides it. Not a balancing decision, just an operational default (rooms with
 * no activity for this long are considered abandoned and may be garbage-collected by Redis itself).
 */
export const DEFAULT_ROOM_TTL_SECONDS = 6 * 60 * 60; // 6 hours
