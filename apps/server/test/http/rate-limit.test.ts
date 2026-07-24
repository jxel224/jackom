import { describe, expect, it } from 'vitest';
import { startTestHttpApi, requestJson } from '../helpers/http.js';
import type { ApiErrorPayload, CreateRoomResponseBody } from '../../src/shared.js';

describe('HTTP rate limiting (in-memory, single-instance only — see IMPLEMENTATION_PROGRESS.md Step 7A)', () => {
  it('16. returns a typed 429 RATE_LIMITED response once the per-IP limit is exceeded', async () => {
    const setup = await startTestHttpApi({ rateLimitMaxRequests: 2, rateLimitWindowMs: 60_000 });
    const attempt = () => requestJson<CreateRoomResponseBody | ApiErrorPayload>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' });

    const first = await attempt();
    const second = await attempt();
    const third = await attempt();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(third.status).toBe(429);
    expect((third.body as ApiErrorPayload).code).toBe('RATE_LIMITED');

    await setup.close();
  });

  it('rate limiting also applies to the join endpoint, sharing one per-IP bucket with create-room', async () => {
    const setup = await startTestHttpApi({ rateLimitMaxRequests: 3, rateLimitWindowMs: 60_000 });
    const created = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' }); // consumes 1 of 3

    const join = () =>
      requestJson<ApiErrorPayload>(`${setup.baseUrl}/api/rooms/${created.body.roomCode}/players`, {
        method: 'POST',
        body: JSON.stringify({ displayName: 'لاعب' }),
      });

    const second = await join(); // 2 of 3
    const third = await join(); // 3 of 3
    const fourth = await join(); // over limit — same IP, shared bucket across both endpoints

    expect(second.status).toBe(201);
    expect(third.status).toBe(201);
    expect(fourth.status).toBe(429);
    expect(fourth.body.code).toBe('RATE_LIMITED');

    await setup.close();
  });

  it('the GET availability check is not rate-limited (only create/join are, per the brief)', async () => {
    const setup = await startTestHttpApi({ rateLimitMaxRequests: 1, rateLimitWindowMs: 60_000 });
    const created = await requestJson<CreateRoomResponseBody>(`${setup.baseUrl}/api/rooms`, { method: 'POST', body: '{}' }); // consumes the only allowed request

    const availability1 = await requestJson(`${setup.baseUrl}/api/rooms/${created.body.roomCode}`);
    const availability2 = await requestJson(`${setup.baseUrl}/api/rooms/${created.body.roomCode}`);

    expect(availability1.status).toBe(200);
    expect(availability2.status).toBe(200);

    await setup.close();
  });
});
