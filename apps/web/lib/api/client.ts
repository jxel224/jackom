import { env } from '../env';
import type {
  ApiErrorCode,
  ApiErrorPayload,
  AuthResponseBody,
  CreateRoomRequestBody,
  CreateRoomResponseBody,
  JoinRoomRequestBody,
  JoinRoomResponseBody,
  LoginRequestBody,
  MeResponseBody,
  OwnedGamesResponseBody,
  RegisterRequestBody,
  RoomAvailabilityResponseBody,
} from '../shared';

/**
 * The one typed HTTP boundary between the frontend and Development Step 7A's room-create/join API
 * — no page/component calls `fetch()` directly. Requires `NEXT_PUBLIC_API_URL` to be configured;
 * checked at CALL time (not module load), so an unset value never breaks `next build`'s static
 * prerendering (see `lib/env.ts`).
 */

export type ApiClientErrorCode = ApiErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'NOT_CONFIGURED';

export class ApiClientError extends Error {
  readonly code: ApiClientErrorCode;
  readonly status: number | null;

  constructor(code: ApiClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

async function apiRequest<T>(path: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  if (!env.NEXT_PUBLIC_API_URL) {
    throw new ApiClientError('NOT_CONFIGURED', 'عنوان الخادم غير مهيأ.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      // Permanent Business Backend: the auth session travels as an HttpOnly cookie — every request
      // (not just /api/auth/*) must include it so the server can recognize an already-logged-in
      // caller. Harmless for the pre-existing gameplay endpoints, which never read cookies at all.
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError('TIMEOUT', 'انتهت مهلة الاتصال بالخادم.');
    }
    throw new ApiClientError('NETWORK_ERROR', 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.');
  } finally {
    clearTimeout(timer);
  }

  let parsed: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiClientError('INTERNAL_ERROR', 'استجابة غير صالحة من الخادم.', response.status);
    }
  }

  if (!response.ok) {
    const errorPayload = parsed as ApiErrorPayload | null;
    throw new ApiClientError(errorPayload?.code ?? 'INTERNAL_ERROR', errorPayload?.message ?? 'حدث خطأ غير متوقع.', response.status);
  }

  return parsed as T;
}

/** Permanent Business Backend: requires the caller to be authenticated and own an active `gameSlug` — the server is the one true gate; a rejected call throws ApiClientError with code GAME_NOT_OWNED/GAME_NOT_ACTIVE/GAME_NOT_FOUND/UNAUTHENTICATED. */
export function createRoom(body: CreateRoomRequestBody): Promise<CreateRoomResponseBody> {
  return apiRequest<CreateRoomResponseBody>('/api/rooms', { method: 'POST', body: JSON.stringify(body) });
}

export function getRoomAvailability(roomCode: string): Promise<RoomAvailabilityResponseBody> {
  return apiRequest<RoomAvailabilityResponseBody>(`/api/rooms/${encodeURIComponent(roomCode)}`, { method: 'GET' });
}

export function joinRoom(roomCode: string, body: JoinRoomRequestBody): Promise<JoinRoomResponseBody> {
  return apiRequest<JoinRoomResponseBody>(`/api/rooms/${encodeURIComponent(roomCode)}/players`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// ---- Permanent Business Backend: auth + ownership --------------------------------------------

export function registerAccount(body: RegisterRequestBody): Promise<AuthResponseBody> {
  return apiRequest<AuthResponseBody>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
}

export function login(body: LoginRequestBody): Promise<AuthResponseBody> {
  return apiRequest<AuthResponseBody>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

export function logout(): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('/api/auth/logout', { method: 'POST', body: '{}' });
}

/** Throws ApiClientError with code UNAUTHENTICATED (401) when no valid session exists — callers distinguish "logged out" from a real network/server error via `err.code`. */
export function getCurrentUser(): Promise<MeResponseBody> {
  return apiRequest<MeResponseBody>('/api/auth/me', { method: 'GET' });
}

export function getOwnedGames(): Promise<OwnedGamesResponseBody> {
  return apiRequest<OwnedGamesResponseBody>('/api/games/owned', { method: 'GET' });
}
