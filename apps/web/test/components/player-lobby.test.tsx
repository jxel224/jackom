// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsePlayerRealtimeResult } from '../../lib/realtime/usePlayerRealtime';
import type { PlayerView } from '../../lib/realtime/public-types';
import type { PlayerSessionRecord } from '../../lib/session-storage';

// `vi.mock` factories are hoisted above the rest of the file — see the same pattern in tv-lobby.test.tsx.
const { usePlayerRealtime, clearPlayerSession } = vi.hoisted(() => ({
  usePlayerRealtime: vi.fn<(session: PlayerSessionRecord | null) => UsePlayerRealtimeResult>(),
  clearPlayerSession: vi.fn(),
}));
vi.mock('../../lib/realtime/usePlayerRealtime', () => ({ usePlayerRealtime }));
vi.mock('../../lib/session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/session-storage')>()),
  clearPlayerSession,
}));

// Must follow the vi.mock() calls above.
import { PlayerLobby } from '../../components/player-lobby';

const session: PlayerSessionRecord = { roomCode: 'ABCD12', playerId: 'p1', playerSessionToken: 'tok', displayName: 'سارة' };

function baseResult(overrides: Partial<UsePlayerRealtimeResult> = {}): UsePlayerRealtimeResult {
  return {
    connectionState: 'connected',
    view: null,
    privateInfo: null,
    connectionError: null,
    retry: vi.fn(),
    ...overrides,
  };
}

// Only the fields PlayerLobby actually reads are filled in meaningfully — see the same tradeoff
// noted in tv-lobby.test.tsx's fixture.
const playerView = {
  playerId: 'p1',
  self: { playerId: 'p1', name: 'سارة', avatarId: 'a', alive: true, connectionStatus: 'connected' },
  others: [{ playerId: 'p2', name: 'أحمد', avatarId: 'a', alive: true, connectionStatus: 'connected' }],
  phase: { state: 'LOBBY', phaseId: 'p1', phaseStartedAt: 0, durationMs: null },
  isParticipantThisRound: false,
  minigameView: null,
  canVote: false,
  canAct: false,
  lastRoundResult: null,
} as unknown as PlayerView;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlayerLobby', () => {
  it('shows the join confirmation, room code, and display name', () => {
    usePlayerRealtime.mockReturnValue(baseResult());
    render(<PlayerLobby session={session} />);

    expect(screen.getByText('أهلًا، سارة!')).toBeTruthy();
    expect(screen.getByText('تم انضمامك إلى الغرفة ABCD12.')).toBeTruthy();
    expect(screen.getByText('انتظر المضيف لبدء اللعبة.')).toBeTruthy();
  });

  it('shows the current player count once PlayerView allows it', () => {
    usePlayerRealtime.mockReturnValue(baseResult({ view: playerView }));
    render(<PlayerLobby session={session} />);

    expect(screen.getByText('عدد اللاعبين في الغرفة: 2')).toBeTruthy();
  });

  it('never renders another player\'s private info or the host\'s session data', () => {
    usePlayerRealtime.mockReturnValue(baseResult({ view: playerView }));
    render(<PlayerLobby session={session} />);

    expect(screen.queryByText('أحمد')).toBeNull(); // the other player's name is not surfaced in the lobby UI
    expect(screen.queryByText(/hostSessionToken/i)).toBeNull();
  });

  it('renders the shared post-lobby placeholder once the phase leaves LOBBY', () => {
    usePlayerRealtime.mockReturnValue(baseResult({ view: { ...playerView, phase: { ...playerView.phase, state: 'ROLE_ASSIGNMENT' } } }));
    render(<PlayerLobby session={session} />);

    expect(screen.getByText('بدأت اللعبة')).toBeTruthy();
    expect(screen.queryByText('انتظر المضيف لبدء اللعبة.')).toBeNull();
  });

  it('an unauthorized connection clears the stored player session and offers a way to rejoin', () => {
    usePlayerRealtime.mockReturnValue(baseResult({ connectionState: 'unauthorized' }));
    render(<PlayerLobby session={session} />);

    expect(clearPlayerSession).toHaveBeenCalledOnce();
    expect(screen.getByText('انتهت الجلسة، انضم من جديد.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'انضم من جديد' })).toBeTruthy();
  });

  it('offers a manual retry when the connection has failed, without a raw technical error', () => {
    const retry = vi.fn();
    usePlayerRealtime.mockReturnValue(baseResult({ connectionState: 'failed', connectionError: { code: 'CONNECTION_FAILED', message: 'تعذر الاتصال بالخادم.' }, retry }));
    render(<PlayerLobby session={session} />);

    expect(screen.getByText('تعذر الاتصال بالخادم.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('shows reconnection feedback while reconnecting', () => {
    usePlayerRealtime.mockReturnValue(baseResult({ connectionState: 'reconnecting' }));
    render(<PlayerLobby session={session} />);

    expect(screen.getByText('جاري إعادة الاتصال')).toBeTruthy();
  });
});
