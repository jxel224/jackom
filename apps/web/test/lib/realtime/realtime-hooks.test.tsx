// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/env', () => ({ env: { NEXT_PUBLIC_WS_URL: 'wss://gateway.example', NEXT_PUBLIC_API_URL: undefined, NEXT_PUBLIC_WEB_BASE_URL: undefined } }));

interface MockOptions {
  wsBaseUrl: string;
  kind: 'host' | 'player';
  roomCode: string;
  buildAuthMessage: () => { type: string; payload: unknown };
  onStateChange: (state: string, error: unknown) => void;
  onEnvelope: (type: string, payload: unknown) => void;
}

// `vi.mock` factories are hoisted above the rest of the file, so a plain top-level class can't be
// referenced from inside one — `vi.hoisted` runs before the mock factory and gives both sides a
// shared handle to the same class.
const { MockRealtimeSocket } = vi.hoisted(() => {
  class MockRealtimeSocket {
    static instances: MockRealtimeSocket[] = [];
    options: MockOptions;
    connect = vi.fn();
    close = vi.fn();
    retry = vi.fn();
    send = vi.fn();
    constructor(options: MockOptions) {
      this.options = options;
      MockRealtimeSocket.instances.push(this);
    }
  }
  return { MockRealtimeSocket };
});

vi.mock('../../../lib/realtime/realtime-socket', () => ({ RealtimeSocket: MockRealtimeSocket }));

// Must follow the vi.mock() calls above.
import { useHostRealtime } from '../../../lib/realtime/useHostRealtime';
import { usePlayerRealtime } from '../../../lib/realtime/usePlayerRealtime';
import type { HostSessionRecord, PlayerSessionRecord } from '../../../lib/session-storage';

const hostSession: HostSessionRecord = { roomCode: 'ABCD12', hostSessionToken: 'host-tok' };
const playerSession: PlayerSessionRecord = { roomCode: 'ABCD12', playerId: 'p1', playerSessionToken: 'player-tok', displayName: 'سارة' };

const fixtureMatchClock = { status: 'pending', clockId: '', startedAt: null, deadlineAt: null, remainingMs: 0, totalPenaltyMs: 0 };

const tvView = {
  roomCode: 'ABCD12',
  phase: { state: 'LOBBY', phaseId: 'phase-1', phaseStartedAt: 0, durationMs: null },
  players: [],
  cycle: 0,
  roundInCycle: 0,
  adminId: null,
  firewallActive: false,
  matchClock: fixtureMatchClock,
  currentMinigame: null,
  currentSpecialGame: null,
  votingProgress: null,
  hackerCount: 0,
  accusation: null,
  accusationCooldownUntil: null,
  lastRoundResult: null,
  winner: null,
  finalReveal: null,
};

const playerView = {
  playerId: 'p1',
  self: { playerId: 'p1', name: 'سارة', avatarId: 'a1', alive: true, connectionStatus: 'connected' },
  others: [],
  phase: { state: 'LOBBY', phaseId: 'phase-1', phaseStartedAt: 0, durationMs: null },
  adminId: null,
  isParticipantThisRound: false,
  isAdmin: false,
  adminSelection: null,
  hackerInfo: null,
  matchClock: fixtureMatchClock,
  minigameView: null,
  canVote: false,
  canAct: false,
  hackerCount: 0,
  canPushButton: false,
  accusation: null,
  accusationCooldownUntil: null,
  lastRoundResult: null,
  winner: null,
  finalReveal: null,
};

const privatePayload = { playerId: 'p1', role: 'CREW', fellowHackerIds: [] };

afterEach(() => {
  MockRealtimeSocket.instances = [];
  vi.clearAllMocks();
});

describe('useHostRealtime', () => {
  it('constructs a RealtimeSocket using host:reconnect with the stored token, and connects on mount', () => {
    renderHook(() => useHostRealtime(hostSession));

    expect(MockRealtimeSocket.instances).toHaveLength(1);
    const instance = MockRealtimeSocket.instances[0]!;
    expect(instance.options.kind).toBe('host');
    expect(instance.options.roomCode).toBe('ABCD12');
    expect(instance.options.buildAuthMessage()).toEqual({ type: 'host:reconnect', payload: { hostSessionToken: 'host-tok' } });
    expect(instance.connect).toHaveBeenCalledOnce();
  });

  it('reflects connection state and the latest validated TvView pushed through onStateChange/onEnvelope', () => {
    const { result } = renderHook(() => useHostRealtime(hostSession));
    const instance = MockRealtimeSocket.instances[0]!;

    act(() => instance.options.onStateChange('connected', null));
    expect(result.current.connectionState).toBe('connected');

    act(() => instance.options.onEnvelope('view:tv', tvView));
    expect(result.current.view).toEqual(tvView);
  });

  it('startGame() sends host:startGame with the current phaseId, and clears on the next view', () => {
    const { result } = renderHook(() => useHostRealtime(hostSession));
    const instance = MockRealtimeSocket.instances[0]!;
    act(() => instance.options.onEnvelope('view:tv', tvView));

    act(() => result.current.startGame());
    expect(result.current.startPending).toBe(true);
    expect(instance.send).toHaveBeenCalledWith('host:startGame', { phaseId: 'phase-1' });

    act(() => instance.options.onEnvelope('view:tv', { ...tvView, phase: { ...tvView.phase, state: 'ROLE_ASSIGNMENT' } }));
    expect(result.current.startPending).toBe(false);
  });

  it('a rejected start shows a safe error and clears the pending state', () => {
    const { result } = renderHook(() => useHostRealtime(hostSession));
    const instance = MockRealtimeSocket.instances[0]!;
    act(() => instance.options.onEnvelope('view:tv', tvView));
    act(() => result.current.startGame());

    // The server's own `message` is intentionally ignored — every rejection code maps through the
    // client's own centralized Arabic copy (`rejection-messages.ts`), the same way `usePlayerRealtime`
    // already behaves, so wording stays consistent regardless of what the server happens to send.
    act(() => instance.options.onEnvelope('error:actionRejected', { code: 'INVALID_PLAYER_COUNT', message: 'ignored server text' }));
    expect(result.current.startPending).toBe(false);
    expect(result.current.startError).toEqual({ code: 'INVALID_PLAYER_COUNT', message: 'عدد اللاعبين غير مناسب لبدء الجولة.' });
  });

  it('closes the socket on unmount', () => {
    const { unmount } = renderHook(() => useHostRealtime(hostSession));
    const instance = MockRealtimeSocket.instances[0]!;
    unmount();
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it('session === null never opens a connection', () => {
    renderHook(() => useHostRealtime(null));
    expect(MockRealtimeSocket.instances).toHaveLength(0);
  });

  it('reconnecting to a new session replaces the old socket instead of reusing it', () => {
    const { rerender } = renderHook(({ session }) => useHostRealtime(session), { initialProps: { session: hostSession } });
    const first = MockRealtimeSocket.instances[0]!;

    const otherSession: HostSessionRecord = { roomCode: 'ZZZZ99', hostSessionToken: 'other-tok' };
    rerender({ session: otherSession });

    expect(first.close).toHaveBeenCalledOnce();
    expect(MockRealtimeSocket.instances).toHaveLength(2);
    expect(MockRealtimeSocket.instances[1]!.options.roomCode).toBe('ZZZZ99');
  });
});

describe('usePlayerRealtime', () => {
  it('constructs a RealtimeSocket using player:reconnect (never player:join) with the stored token', () => {
    renderHook(() => usePlayerRealtime(playerSession));

    const instance = MockRealtimeSocket.instances[0]!;
    expect(instance.options.kind).toBe('player');
    expect(instance.options.buildAuthMessage()).toEqual({ type: 'player:reconnect', payload: { sessionToken: 'player-tok' } });
  });

  it('exposes the personalized PlayerView and isolates PrivatePlayerPayload to this connection', () => {
    const { result } = renderHook(() => usePlayerRealtime(playerSession));
    const instance = MockRealtimeSocket.instances[0]!;

    act(() => instance.options.onEnvelope('view:player', playerView));
    expect(result.current.view).toEqual(playerView);
    expect(result.current.privateInfo).toBeNull();

    act(() => instance.options.onEnvelope('player:privateRoleInfo', privatePayload));
    expect(result.current.privateInfo).toEqual(privatePayload);
  });

  it('clears privateInfo when the connection becomes unauthorized', () => {
    const { result } = renderHook(() => usePlayerRealtime(playerSession));
    const instance = MockRealtimeSocket.instances[0]!;
    act(() => instance.options.onEnvelope('player:privateRoleInfo', privatePayload));
    expect(result.current.privateInfo).toEqual(privatePayload);

    act(() => instance.options.onStateChange('unauthorized', { code: 'SESSION_INVALID', message: 'انتهت الجلسة، انضم من جديد.' }));
    expect(result.current.privateInfo).toBeNull();
  });

  it('clears privateInfo on unmount', () => {
    const { result, unmount } = renderHook(() => usePlayerRealtime(playerSession));
    const instance = MockRealtimeSocket.instances[0]!;
    act(() => instance.options.onEnvelope('player:privateRoleInfo', privatePayload));
    expect(result.current.privateInfo).toEqual(privatePayload);

    unmount();
    expect(instance.close).toHaveBeenCalledOnce();
  });

  it('sends a generic minigame intent with current phase, monotonic seq, and generated action id', () => {
    const { result } = renderHook(() => usePlayerRealtime(playerSession));
    const instance = MockRealtimeSocket.instances[0]!;
    act(() => instance.options.onStateChange('connected', null));
    act(() => instance.options.onEnvelope('view:player', { ...playerView, phase: { ...playerView.phase, state: 'MINIGAME_PLAY' } }));
    act(() => expect(result.current.submitMinigameAction('SUBMIT_RANKING', { order: ['card_1', 'card_2', 'card_3', 'card_4'] })).toBe(true));
    expect(instance.send).toHaveBeenCalledWith('player:submitAction', expect.objectContaining({
      phaseId: 'phase-1', actionType: 'SUBMIT_RANKING', data: { order: ['card_1', 'card_2', 'card_3', 'card_4'] }, seq: expect.any(Number), actionId: expect.any(String),
    }));
    expect(result.current.actionPending).toBe(true);
    const payload = instance.send.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('playerId');
  });

  it('session === null never opens a connection', () => {
    renderHook(() => usePlayerRealtime(null));
    expect(MockRealtimeSocket.instances).toHaveLength(0);
  });
});

describe('useHostRealtime / usePlayerRealtime — WS not configured', () => {
  it('useHostRealtime reports a safe failed state instead of throwing when NEXT_PUBLIC_WS_URL is unset', async () => {
    vi.doMock('../../../lib/env', () => ({ env: { NEXT_PUBLIC_WS_URL: undefined, NEXT_PUBLIC_API_URL: undefined, NEXT_PUBLIC_WEB_BASE_URL: undefined } }));
    vi.resetModules();
    const { useHostRealtime: freshHook } = await import('../../../lib/realtime/useHostRealtime');

    const { result } = renderHook(() => freshHook(hostSession));
    await waitFor(() => expect(result.current.connectionState).toBe('failed'));
    expect(result.current.connectionError?.code).toBe('NOT_CONFIGURED');

    vi.doUnmock('../../../lib/env');
    vi.resetModules();
  });
});
