// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/client')>();
  return { ...actual, getRoomAvailability: vi.fn(), joinRoom: vi.fn(), createRoom: vi.fn() };
});

// Must follow the vi.mock() call above.
import { getRoomAvailability } from '../lib/api/client';
import JoinWithCodePage from '../app/join/[roomCode]/page';

const mockedGetRoomAvailability = vi.mocked(getRoomAvailability);

afterEach(() => {
  cleanup();
  mockedGetRoomAvailability.mockReset();
});

/** `params` is a Promise in the App Router (Next 15+) — await the async Server Component directly to get its JSX, the same way Next's own renderer would. */
async function renderRoute(roomCode: string) {
  const element = await JoinWithCodePage({ params: Promise.resolve({ roomCode }) });
  render(element);
}

describe('/join/[roomCode] reads the route param safely', () => {
  it('19a. shows a fallback message for a malformed code instead of crashing, and never calls the API', async () => {
    await renderRoute('not-a-real-code!!');
    expect(screen.getByText('رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.')).toBeTruthy();
    expect(mockedGetRoomAvailability).not.toHaveBeenCalled();
  });

  it('19b. never crashes on an empty route param', async () => {
    await renderRoute('');
    expect(screen.getByRole('heading', { level: 1, name: 'الانضمام إلى غرفة' })).toBeTruthy();
    expect(screen.getByText('رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.')).toBeTruthy();
  });

  it('19c. never crashes on an unexpectedly long/garbage param', async () => {
    await renderRoute('x'.repeat(500) + '<script>alert(1)</script>');
    expect(screen.getByRole('heading', { level: 1, name: 'الانضمام إلى غرفة' })).toBeTruthy();
    expect(mockedGetRoomAvailability).not.toHaveBeenCalled();
  });

  it('always offers a way back to manual entry for an invalid code', async () => {
    await renderRoute('not-a-real-code!!');
    expect(screen.getByRole('link', { name: 'إدخال الرمز يدويًا' })).toBeTruthy();
  });

  it('18/normalizes a lowercase, valid code before checking availability', async () => {
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'AB23XY', joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 5, maxPlayers: 12 });
    await renderRoute('ab23xy');
    await waitFor(() => expect(mockedGetRoomAvailability).toHaveBeenCalledWith('AB23XY'));
    expect(await screen.findByLabelText('اسمك')).toBeTruthy();
  });

  it('trims surrounding whitespace from the param before checking availability', async () => {
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'AB23XY', joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 5, maxPlayers: 12 });
    await renderRoute('  AB23XY  ');
    await waitFor(() => expect(mockedGetRoomAvailability).toHaveBeenCalledWith('AB23XY'));
  });

  it('shows an Arabic "unavailable" message when the room exists but is not joinable', async () => {
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'AB23XY', joinable: false, full: true, matchStarted: false, playerCount: 12, minPlayers: 5, maxPlayers: 12 });
    await renderRoute('AB23XY');
    expect(await screen.findByText('الغرفة ممتلئة.')).toBeTruthy();
  });
});
