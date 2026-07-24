// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseHostRealtimeResult } from '../../lib/realtime/useHostRealtime';
import type { TvView } from '../../lib/realtime/public-types';
import type { HostSessionRecord } from '../../lib/session-storage';

// `vi.mock` factories are hoisted above the rest of the file, so the mock fns must be created
// inside `vi.hoisted` to be safely referenced both there and later in the test body.
const { useHostRealtime, clearHostSession } = vi.hoisted(() => ({
  useHostRealtime: vi.fn<(session: HostSessionRecord | null) => UseHostRealtimeResult>(),
  clearHostSession: vi.fn(),
}));
vi.mock('../../lib/realtime/useHostRealtime', () => ({ useHostRealtime }));
vi.mock('../../lib/session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/session-storage')>()),
  clearHostSession,
}));

// Must follow the vi.mock() calls above.
import { TvLobby } from '../../components/tv-lobby';

const session: HostSessionRecord = { roomCode: 'ABCD12', hostSessionToken: 'tok' };

function baseResult(overrides: Partial<UseHostRealtimeResult> = {}): UseHostRealtimeResult {
  return {
    connectionState: 'connected',
    view: null,
    connectionError: null,
    startGame: vi.fn(),
    startPending: false,
    startError: null,
    retry: vi.fn(),
    ...overrides,
  };
}

// Only the fields TvLobby actually reads are filled in meaningfully — the rest are out of scope for
// Step 7B's lobby-only UI (see `wire-schemas.ts`'s note on the same tradeoff), so this fixture is
// cast rather than hand-satisfying the full real-gameplay `TvView` shape.
const tvView = {
  roomCode: 'ABCD12',
  phase: { state: 'LOBBY', phaseId: 'p1', phaseStartedAt: 0, durationMs: null },
  players: [
    { playerId: 'p1', name: 'سارة', avatarId: 'a', alive: true, connectionStatus: 'connected' as const },
    { playerId: 'p2', name: 'أحمد', avatarId: 'a', alive: true, connectionStatus: 'disconnected' as const },
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
} as unknown as TvView;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TvLobby', () => {
  it('shows the real room code and a waiting message when no players have joined yet', () => {
    useHostRealtime.mockReturnValue(baseResult({ view: { ...tvView, players: [] } }));
    render(<TvLobby session={session} minPlayers={4} maxPlayers={12} />);

    // RoomCodeDisplay renders one span per character — read the whole thing via its role="text" container.
    expect(screen.getByRole('text').textContent).toBe('ABCD12');
    expect(screen.getByText('بانتظار انضمام اللاعبين...')).toBeTruthy();
  });

  it('lists every live player from TvView with a visible (non-color-only) connection status', () => {
    useHostRealtime.mockReturnValue(baseResult({ view: tvView }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    expect(screen.getByText('سارة')).toBeTruthy();
    expect(screen.getByText('أحمد')).toBeTruthy();
    // "متصل" also appears once in the top-level connection-status badge, so scope to the roster.
    const roster = screen.getByText('سارة').closest('li')!.parentElement!;
    expect(within(roster).getByText('متصل')).toBeTruthy();
    expect(within(roster).getByText('غير متصل')).toBeTruthy();
  });

  it('disables "ابدأ اللعبة" below minPlayers, and enables it once enough players joined', () => {
    useHostRealtime.mockReturnValue(baseResult({ view: tvView })); // 2 players
    const { rerender } = render(<TvLobby session={session} minPlayers={4} maxPlayers={12} />);
    expect((screen.getByRole('button', { name: 'ابدأ اللعبة' }) as HTMLButtonElement).disabled).toBe(true);

    useHostRealtime.mockReturnValue(baseResult({ view: tvView }));
    rerender(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);
    expect((screen.getByRole('button', { name: 'ابدأ اللعبة' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('clicking "ابدأ اللعبة" calls startGame() — it never transitions the UI itself', () => {
    const startGame = vi.fn();
    useHostRealtime.mockReturnValue(baseResult({ view: tvView, startGame }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ اللعبة' }));
    expect(startGame).toHaveBeenCalledOnce();
    // Still on the lobby screen — only the server's next TvView can move it forward.
    expect(screen.getByText('سارة')).toBeTruthy();
  });

  it('shows a safe Arabic error when the host start action is rejected', () => {
    useHostRealtime.mockReturnValue(baseResult({ view: tvView, startError: { code: 'NOT_ENOUGH_PLAYERS', message: 'عدد اللاعبين غير كافٍ.' } }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    expect(screen.getByText('عدد اللاعبين غير كافٍ.')).toBeTruthy();
  });

  it('renders the shared post-lobby placeholder once the phase leaves LOBBY, and does not render the roster/start button', () => {
    useHostRealtime.mockReturnValue(baseResult({ view: { ...tvView, phase: { ...tvView.phase, state: 'ROLE_ASSIGNMENT' } } }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    expect(screen.getByText('بدأت اللعبة')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ابدأ اللعبة' })).toBeNull();
    expect(screen.queryByText('سارة')).toBeNull();
  });

  it('an unauthorized connection clears the stored host session and offers a way back home', () => {
    useHostRealtime.mockReturnValue(baseResult({ connectionState: 'unauthorized' }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    expect(clearHostSession).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'العودة إلى الرئيسية' })).toBeTruthy();
    // Never the roster/room-code screen for an invalid session.
    expect(screen.queryByText('ABCD12')).toBeNull();
  });

  it('offers a manual retry when the connection has failed', () => {
    const retry = vi.fn();
    useHostRealtime.mockReturnValue(baseResult({ connectionState: 'failed', connectionError: { code: 'CONNECTION_FAILED', message: 'تعذر الاتصال بالخادم.' }, retry }));
    render(<TvLobby session={session} minPlayers={2} maxPlayers={12} />);

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
