// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/env', () => ({ env: {} }));

// Must follow the vi.mock() call above.
import { createRoom } from '../lib/api/client';

describe('API client without NEXT_PUBLIC_API_URL configured', () => {
  it('rejects immediately with a typed NOT_CONFIGURED error, never attempting a network call', async () => {
    await expect(createRoom({ gameSlug: 'hackers' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
