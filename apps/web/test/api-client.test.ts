// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env', () => ({ env: { NEXT_PUBLIC_API_URL: 'http://api.example', NEXT_PUBLIC_WS_URL: undefined } }));

// Must follow the vi.mock() call above.
import { ApiClientError, createRoom, getRoomAvailability, joinRoom } from '../lib/api/client';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('API client (configured)', () => {
  it('createRoom() POSTs to /api/rooms against the configured base URL with a JSON content-type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { roomCode: 'AB23XY', hostSessionToken: 't', tv: {} }));
    await createRoom({ gameSlug: 'hackers' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.example/api/rooms');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('getRoomAvailability() GETs /api/rooms/:roomCode and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { roomCode: 'AB23XY', joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 5, maxPlayers: 12 }));
    const result = await getRoomAvailability('AB23XY');

    expect(result.roomCode).toBe('AB23XY');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api.example/api/rooms/AB23XY');
    expect(init.method).toBe('GET');
  });

  it('joinRoom() POSTs the request body as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { roomCode: 'AB23XY', playerId: 'p1', playerSessionToken: 't', view: {} }));
    await joinRoom('AB23XY', { displayName: 'سارة', requestId: 'req-1' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ displayName: 'سارة', requestId: 'req-1' });
  });

  it('maps a non-2xx JSON error response to a typed ApiClientError carrying the server code and status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(429, { code: 'RATE_LIMITED', message: 'محاولات كثيرة جدًا.' }));
    await expect(createRoom({ gameSlug: 'hackers' })).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 });
  });

  it('maps a network failure (fetch rejects) to a typed NETWORK_ERROR', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(createRoom({ gameSlug: 'hackers' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('maps an aborted/timed-out request to a typed TIMEOUT error', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new DOMException('The operation was aborted.', 'AbortError')));
    await expect(createRoom({ gameSlug: 'hackers' })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('a malformed (non-JSON) response body becomes a typed ApiClientError, never an unhandled parse exception', async () => {
    fetchMock.mockResolvedValue(new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(createRoom({ gameSlug: 'hackers' })).rejects.toBeInstanceOf(ApiClientError);
  });
});
