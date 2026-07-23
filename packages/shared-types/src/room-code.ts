/**
 * The one place the room-code format is defined — shared by the server (which generates codes,
 * `apps/server/src/fsm/room-lifecycle.ts`) and the web client (which validates/normalizes what a
 * player types or pastes). Neither side may invent a second, possibly-conflicting definition.
 */

/** Excludes ambiguous characters (0/O, 1/I) so a code is easy to read aloud and type on a phone. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ROOM_CODE_LENGTH = 6;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** Uppercases and trims surrounding whitespace only — does not strip or silently repair invalid characters. */
export function normalizeRoomCodeInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/** True only for a full-length code drawn entirely from `ROOM_CODE_ALPHABET`. */
export function isValidRoomCodeFormat(code: string): boolean {
  return ROOM_CODE_PATTERN.test(code);
}
