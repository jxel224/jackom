// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/client')>();
  return { ...actual, getRoomAvailability: vi.fn() };
});

// Must follow the vi.mock() call above.
import { getRoomAvailability, ApiClientError } from '../lib/api/client';
import { saveHostSession } from '../lib/session-storage';
import TvPage from '../app/tv/page';

const mockedGetRoomAvailability = vi.mocked(getRoomAvailability);

afterEach(() => {
  cleanup();
  mockedGetRoomAvailability.mockReset();
  window.sessionStorage.clear();
});

describe('/tv with a real stored host session', () => {
  it('displays the REAL room code from the stored session (never a placeholder) once availability resolves', async () => {
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 0, maxPlayers: 12 });

    render(<TvPage />);

    expect(await screen.findByText('انضموا إلى الغرفة')).toBeTruthy();
    expect(mockedGetRoomAvailability).toHaveBeenCalledWith('QR7K2M');
    // The room code is rendered as one tile per character (RoomCodeDisplay) — check the accessible label instead of a single text node.
    expect(screen.getByRole('text', { name: 'رمز الغرفة Q R 7 K 2 M' })).toBeTruthy();
    expect(screen.getByText('بانتظار انضمام اللاعبين...')).toBeTruthy();
  });

  it('shows a live-updating player count once players have joined', async () => {
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 3, maxPlayers: 12 });

    render(<TvPage />);

    expect(await screen.findByText('3 لاعبًا انضموا حتى الآن')).toBeTruthy();
  });

  it('shows a typed Arabic error state if the stored room no longer exists', async () => {
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockRejectedValue(new ApiClientError('ROOM_NOT_FOUND', 'الغرفة غير موجودة.', 404));

    render(<TvPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('الغرفة غير موجودة');
    expect(screen.getByRole('link', { name: 'إنشاء غرفة جديدة' })).toBeTruthy();
  });

  it('never renders a WebSocket-live claim — connection status is explicitly labeled "coming soon"', async () => {
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 0, maxPlayers: 12 });

    render(<TvPage />);

    expect(await screen.findByText('الاتصال المباشر باللاعبين قادم قريبًا')).toBeTruthy();
  });
});
