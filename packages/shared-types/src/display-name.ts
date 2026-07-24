/**
 * The one place player display-name rules are defined — shared by the server (Step 7A's HTTP join
 * endpoint and, eventually, the WebSocket `player:join` path) and the web client (so a form can
 * reject an invalid name before ever making a request). Mirrors `room-code.ts`'s pattern.
 *
 * Deliberately permissive on script/charset: the brief only asks to "support Arabic and Latin
 * names" and "reject empty or control-character-only names" — it does not ask for a restrictive
 * allowlist, and no such rule exists anywhere else in the codebase to "follow" (ARCHITECTURE.md
 * §3.2's "names... unique" is a `host:startGame` precondition that was never actually implemented
 * as part of `joinPlayer`, so it is not an "existing rule" this validator needs to enforce either).
 */

export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 24;

/** Trims surrounding whitespace only — does not alter case or strip interior characters. */
export function normalizeDisplayNameInput(raw: string): string {
  return raw.trim();
}

// \p{Cc} = control characters, \p{Cf} = invisible "format" characters (e.g. zero-width joiners) —
// a name made ENTIRELY of these would render as blank/invisible even though it's "non-empty".
const CONTROL_OR_FORMAT_CHAR = /[\p{Cc}\p{Cf}]/u;

export function isValidDisplayName(name: string): boolean {
  if (name.length < DISPLAY_NAME_MIN_LENGTH || name.length > DISPLAY_NAME_MAX_LENGTH) return false;
  if (CONTROL_OR_FORMAT_CHAR.test(name)) return false;
  return true;
}
