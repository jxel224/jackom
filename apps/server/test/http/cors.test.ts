import { describe, expect, it } from 'vitest';
import { startTestHttpApi } from '../helpers/http.js';

describe('CORS', () => {
  it('15a. allows a request from a configured origin, with the matching Access-Control-Allow-Origin header', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: ['http://allowed.example'] });
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://allowed.example', Cookie: setup.defaultHost.cookieHeader },
      body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://allowed.example');
    await setup.close();
  });

  it('15b. rejects a request from an unauthorized origin with 403, and no CORS header (never a wildcard fallback)', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: ['http://allowed.example'] });
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    await setup.close();
  });

  it('an empty allow-list (the default) rejects every browser-origin request', async () => {
    const setup = await startTestHttpApi();
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://anything.example' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    await setup.close();
  });

  it('handles an OPTIONS preflight for an allowed origin without ever reaching a route handler', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: ['http://allowed.example'] });
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://allowed.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://allowed.example');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    await setup.close();
  });

  it('Permanent Business Backend: sets Access-Control-Allow-Credentials for every allowed origin (the new auth session cookie requires it — never a wildcard origin alongside it, which browsers refuse anyway)', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: ['http://allowed.example'] });
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://allowed.example', Cookie: setup.defaultHost.cookieHeader },
      body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
    });
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    await setup.close();
  });

  it('a request with no Origin header (non-browser / same-origin) is not blocked by the CORS check', async () => {
    const setup = await startTestHttpApi({ allowedOrigins: ['http://allowed.example'] });
    const res = await fetch(`${setup.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: setup.defaultHost.cookieHeader },
      body: JSON.stringify({ gameSlug: setup.defaultGameSlug }),
    });
    expect(res.status).toBe(201);
    await setup.close();
  });
});
