// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlayerView } from '../lib/shared';

vi.mock('../lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/client')>();
  return { ...actual, getRoomAvailability: vi.fn(), joinRoom: vi.fn() };
});

// Must follow the vi.mock() call above.
import { getRoomAvailability, joinRoom, ApiClientError } from '../lib/api/client';
import { loadPlayerSession } from '../lib/session-storage';
import { JoinRoomForm } from '../components/join-room-form';

const mockedGetRoomAvailability = vi.mocked(getRoomAvailability);
const mockedJoinRoom = vi.mocked(joinRoom);

const AVAILABLE = { roomCode: 'AB23XY', joinable: true, full: false, matchStarted: false, playerCount: 0, maxPlayers: 12 };

const MINIMAL_PLAYER_VIEW: PlayerView = {
  playerId: 'player-1',
  self: { playerId: 'player-1', name: 'سارة', avatarId: 'default', alive: true, connectionStatus: 'connected' },
  others: [],
  phase: { state: 'LOBBY', phaseId: 'p1', phaseStartedAt: 0, durationMs: null },
  isParticipantThisRound: false,
  minigameView: null,
  canVote: false,
  canAct: false,
  lastRoundResult: null,
};

afterEach(() => {
  cleanup();
  mockedGetRoomAvailability.mockReset();
  mockedJoinRoom.mockReset();
  window.sessionStorage.clear();
});

describe('JoinRoomForm', () => {
  it('shows a loading state while checking room availability, then the name form once joinable', async () => {
    mockedGetRoomAvailability.mockResolvedValue(AVAILABLE);
    render(<JoinRoomForm roomCode="AB23XY" formatValid />);

    expect(screen.getByRole('status')).toBeTruthy(); // LoadingIndicator
    expect(await screen.findByLabelText('اسمك')).toBeTruthy();
  });

  it('shows an Arabic "room full" message and never shows the name form', async () => {
    mockedGetRoomAvailability.mockResolvedValue({ ...AVAILABLE, joinable: false, full: true });
    render(<JoinRoomForm roomCode="AB23XY" formatValid />);

    expect(await screen.findByText('الغرفة ممتلئة.')).toBeTruthy();
    expect(screen.queryByLabelText('اسمك')).toBeNull();
  });

  it('20. a successful join stores the player session and shows the Arabic waiting screen', async () => {
    mockedGetRoomAvailability.mockResolvedValue(AVAILABLE);
    mockedJoinRoom.mockResolvedValue({ roomCode: 'AB23XY', playerId: 'player-1', playerSessionToken: 'player-token-1', view: MINIMAL_PLAYER_VIEW });

    render(<JoinRoomForm roomCode="AB23XY" formatValid />);
    fireEvent.change(await screen.findByLabelText('اسمك'), { target: { value: 'سارة' } });
    fireEvent.click(screen.getByRole('button', { name: 'انضم' }));

    expect(await screen.findByText('أهلًا، سارة!')).toBeTruthy();
    expect(loadPlayerSession()).toEqual({ roomCode: 'AB23XY', playerId: 'player-1', playerSessionToken: 'player-token-1', displayName: 'سارة' });
  });

  it('sends the SAME requestId on every submit from one mounted form instance (idempotent retry)', async () => {
    mockedGetRoomAvailability.mockResolvedValue(AVAILABLE);
    mockedJoinRoom.mockRejectedValueOnce(new ApiClientError('INTERNAL_ERROR', 'حدث خطأ في الخادم. حاول مرة أخرى.', 500));
    mockedJoinRoom.mockResolvedValueOnce({ roomCode: 'AB23XY', playerId: 'player-1', playerSessionToken: 'player-token-1', view: MINIMAL_PLAYER_VIEW });

    render(<JoinRoomForm roomCode="AB23XY" formatValid />);
    fireEvent.change(await screen.findByLabelText('اسمك'), { target: { value: 'سارة' } });
    fireEvent.click(screen.getByRole('button', { name: 'انضم' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'انضم' }));
    await waitFor(() => expect(mockedJoinRoom).toHaveBeenCalledTimes(2));

    const [firstCallRequestId] = [mockedJoinRoom.mock.calls[0]![1].requestId, mockedJoinRoom.mock.calls[1]![1].requestId];
    expect(mockedJoinRoom.mock.calls[1]![1].requestId).toBe(firstCallRequestId);
  });

  it('21. displays a typed Arabic error state on join failure, without storing a session', async () => {
    mockedGetRoomAvailability.mockResolvedValue(AVAILABLE);
    mockedJoinRoom.mockRejectedValue(new ApiClientError('INVALID_DISPLAY_NAME', 'الاسم غير صالح. الرجاء إدخال اسم صحيح.', 400));

    render(<JoinRoomForm roomCode="AB23XY" formatValid />);
    fireEvent.change(await screen.findByLabelText('اسمك'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'انضم' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('الاسم غير صالح');
    expect(loadPlayerSession()).toBeNull();
  });

  it('never calls the availability API when the format was already known to be invalid', () => {
    render(<JoinRoomForm roomCode="" formatValid={false} />);
    expect(screen.getByText('رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.')).toBeTruthy();
    expect(mockedGetRoomAvailability).not.toHaveBeenCalled();
  });
});
