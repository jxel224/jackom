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
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 5, maxPlayers: 12 });

    render(<TvPage />);

    expect(await screen.findByText('انضموا إلى الغرفة')).toBeTruthy();
    expect(mockedGetRoomAvailability).toHaveBeenCalledWith('QR7K2M');
    // The room code is rendered as one tile per character (RoomCodeDisplay) — check the accessible label instead of a single text node.
    expect(screen.getByRole('text', { name: 'رمز الغرفة Q R 7 K 2 M' })).toBeTruthy();
    expect(screen.getByText('بانتظار انضمام اللاعبين...')).toBeTruthy();
  });

  it('wires the real, live TvLobby: the roster it shows comes from useHostRealtime, not the one-time availability check', async () => {
    // Live player updates are WebSocket-driven (Step 7B) — the availability check only supplies
    // minPlayers/maxPlayers for the start-button UX. Mock just the realtime hook to prove TvPage
    // correctly passes the session/props down into the real TvLobby, without re-testing TvLobby's
    // own internals (already covered by components/tv-lobby.test.tsx).
    vi.resetModules();
    vi.doMock('../lib/realtime/useHostRealtime', () => ({
      useHostRealtime: () => ({
        connectionState: 'connected',
        view: {
          roomCode: 'QR7K2M',
          phase: { state: 'LOBBY', phaseId: 'p1', phaseStartedAt: 0, durationMs: null },
          players: [
            { playerId: 'p1', name: 'سارة', avatarId: 'a', alive: true, connectionStatus: 'connected' },
            { playerId: 'p2', name: 'أحمد', avatarId: 'a', alive: true, connectionStatus: 'connected' },
            { playerId: 'p3', name: 'محمد', avatarId: 'a', alive: true, connectionStatus: 'connected' },
          ],
          cycle: 0,
          roundInCycle: 0,
          firewallActive: false,
          matchClock: null,
          currentMinigame: null,
          currentSpecialGame: null,
          votingProgress: null,
          lastRoundResult: null,
          winner: null,
        },
        connectionError: null,
        startGame: vi.fn(),
        startPending: false,
        startError: null,
        retry: vi.fn(),
      }),
    }));

    const { default: FreshTvPage } = await import('../app/tv/page');
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 3, minPlayers: 2, maxPlayers: 12 });

    render(<FreshTvPage />);

    expect(await screen.findByText('اللاعبون (3)')).toBeTruthy();
    expect(screen.getByText('سارة')).toBeTruthy();
    expect(screen.getByText('أحمد')).toBeTruthy();
    expect(screen.getByText('محمد')).toBeTruthy();

    vi.doUnmock('../lib/realtime/useHostRealtime');
    vi.resetModules();
  });

  it('shows a typed Arabic error state if the stored room no longer exists', async () => {
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockRejectedValue(new ApiClientError('ROOM_NOT_FOUND', 'الغرفة غير موجودة.', 404));

    render(<TvPage />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('الغرفة غير موجودة');
    expect(screen.getByRole('link', { name: 'إنشاء غرفة جديدة' })).toBeTruthy();
  });

  it('never silently claims to be live when the WebSocket gateway is unconfigured — shows a clear failed state instead', async () => {
    // This test intentionally does NOT mock NEXT_PUBLIC_WS_URL/useHostRealtime — it verifies the
    // REAL failure path when the env var is genuinely unset (as it is in this test process).
    saveHostSession({ roomCode: 'QR7K2M', hostSessionToken: 'host-token' });
    mockedGetRoomAvailability.mockResolvedValue({ roomCode: 'QR7K2M', joinable: true, full: false, matchStarted: false, playerCount: 0, minPlayers: 5, maxPlayers: 12 });

    render(<TvPage />);

    expect(await screen.findByText('تعذر الاتصال بالخادم')).toBeTruthy();
    expect(screen.getByText('الخدمة غير متاحة حاليًا.')).toBeTruthy();
  });
});
