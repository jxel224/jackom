// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TvView } from '../lib/shared';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

vi.mock('../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/client')>();
  return { ...actual, createRoom: vi.fn() };
});

// Must follow the vi.mock() calls above.
import { createRoom, ApiClientError } from '../lib/api/client';
import { CreateRoomButton } from '../components/create-room-button';
import { loadHostSession } from '../lib/session-storage';

const mockedCreateRoom = vi.mocked(createRoom);

const MINIMAL_TV_VIEW: TvView = {
  roomCode: 'AB23XY',
  phase: { state: 'LOBBY', phaseId: 'p1', phaseStartedAt: 0, durationMs: null },
  players: [],
  cycle: 0,
  roundInCycle: 0,
  firewallActive: false,
  matchClock: { mode: 'disabled', startedAt: null, durationMs: null, penaltyMs: 0, pausedAt: null },
  currentMinigame: null,
  currentSpecialGame: null,
  votingProgress: null,
  lastRoundResult: null,
  winner: null,
};

afterEach(() => {
  cleanup();
  pushMock.mockClear();
  mockedCreateRoom.mockReset();
  window.sessionStorage.clear();
});

describe('CreateRoomButton', () => {
  it('17. on success, stores the host session and navigates to /tv', async () => {
    mockedCreateRoom.mockResolvedValue({ roomCode: 'AB23XY', hostSessionToken: 'host-token-123', tv: MINIMAL_TV_VIEW });

    render(<CreateRoomButton>أنشئ غرفة</CreateRoomButton>);
    fireEvent.click(screen.getByRole('button', { name: 'أنشئ غرفة' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/tv'));
    expect(loadHostSession()).toEqual({ roomCode: 'AB23XY', hostSessionToken: 'host-token-123' });
  });

  it('shows a loading state (disabled + aria-busy) while the request is in flight', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof createRoom>>) => void;
    mockedCreateRoom.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    render(<CreateRoomButton>أنشئ غرفة</CreateRoomButton>);
    const button = screen.getByRole('button', { name: 'أنشئ غرفة' }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(button.getAttribute('aria-busy')).toBe('true'));
    expect(button.disabled).toBe(true);

    resolveCreate({ roomCode: 'AB23XY', hostSessionToken: 't', tv: MINIMAL_TV_VIEW });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });

  it('21. displays a typed Arabic error state on failure, without navigating or storing a session', async () => {
    mockedCreateRoom.mockRejectedValue(new ApiClientError('RATE_LIMITED', 'محاولات كثيرة جدًا. حاول مرة أخرى بعد قليل.', 429));

    render(<CreateRoomButton>أنشئ غرفة</CreateRoomButton>);
    fireEvent.click(screen.getByRole('button', { name: 'أنشئ غرفة' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('محاولات كثيرة جدًا');
    expect(pushMock).not.toHaveBeenCalled();
    expect(loadHostSession()).toBeNull();
  });
});
