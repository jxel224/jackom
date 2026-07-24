import { env } from '../env';
import type { ApiErrorCode, ApiErrorPayload, CreateRoomResponseBody, JoinRoomRequestBody, JoinRoomResponseBody, RoomAvailabilityResponseBody } from '../shared';

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

export function createRoom(): Promise<CreateRoomResponseBody> {
  return apiRequest<CreateRoomResponseBody>('/api/rooms', { method: 'POST', body: '{}' });
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
