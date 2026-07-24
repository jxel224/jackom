import { describe, expect, it } from 'vitest';
import { startTestHttpApi, requestJson } from '../helpers/http.js';

describe('GET /health', () => {
  it('returns a minimal, safe "ok" response with no infrastructure/room detail', async () => {
    const setup = await startTestHttpApi();
    const res = await requestJson<{ status: string }>(`${setup.baseUrl}/health`, { method: 'GET' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });

    await setup.close();
  });

  it('is reachable without an Origin header and without any allowedOrigins configured', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: [] });
    const res = await requestJson<{ status: string }>(`${setup.baseUrl}/health`, { method: 'GET' });

    expect(res.status).toBe(200);

    await setup.close();
  });
});
