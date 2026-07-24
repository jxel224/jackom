/**
 * Typed `sessionStorage` boundary (Development Step 7A). `sessionStorage` — not `localStorage` and
 * not a cookie — so a refresh on the current tab keeps working, but host and player sessions opened
 * in different tabs never collide, and no token ever appears in a URL. Every read/write is wrapped
 * in try/catch: private browsing, storage quota, or a corrupted value must degrade to "no session"
 * rather than throw and break the page.
 */

const HOST_SESSION_KEY = 'jackom.hostSession';
const PLAYER_SESSION_KEY = 'jackom.playerSession';

export interface HostSessionRecord {
  roomCode: string;
  hostSessionToken: string;
}

export interface PlayerSessionRecord {
  roomCode: string;
  playerId: string;
  playerSessionToken: string;
  displayName: string;
}

function readStorage<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupted JSON, storage disabled, or unavailable (e.g. some private-browsing modes) — treat
    // exactly like "no session" rather than surfacing a storage implementation detail to the UI.
    return null;
  }
}

function writeStorage(key: string, value: unknown): boolean {
  try {
    if (typeof window === 'undefined') return false;
    window.sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function clearStorage(key: string): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing sane to do if storage itself is unavailable — the session just won't persist.
  }
}

export function saveHostSession(record: HostSessionRecord): boolean {
  return writeStorage(HOST_SESSION_KEY, record);
}
export function loadHostSession(): HostSessionRecord | null {
  return readStorage<HostSessionRecord>(HOST_SESSION_KEY);
}
export function clearHostSession(): void {
  clearStorage(HOST_SESSION_KEY);
}

export function savePlayerSession(record: PlayerSessionRecord): boolean {
  return writeStorage(PLAYER_SESSION_KEY, record);
}
export function loadPlayerSession(): PlayerSessionRecord | null {
  return readStorage<PlayerSessionRecord>(PLAYER_SESSION_KEY);
}
export function clearPlayerSession(): void {
  clearStorage(PLAYER_SESSION_KEY);
}
