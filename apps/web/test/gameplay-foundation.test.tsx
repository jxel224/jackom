// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, PrivatePlayerPayload, TvView } from '../lib/realtime/public-types';
import { Countdown } from '../components/gameplay/shared/Countdown';
import { ConnectionBanner } from '../components/gameplay/shared/ConnectionBanner';
import { SubmissionStatus } from '../components/gameplay/shared/GameplayStates';
import { PlayerMinigameRouter } from '../components/gameplay/hacker/PlayerMinigameRouter';
import { TvMinigameRouter } from '../components/gameplay/hacker/TvMinigameRouter';
import { PlayerPhaseRouter } from '../components/gameplay/hacker/PlayerPhaseRouter';
import { TvPhaseRouter } from '../components/gameplay/hacker/TvPhaseRouter';
import { PlayerGameplayRoot } from '../components/gameplay/hacker/GameplayRoots';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const baseMatchClock = { status: 'running' as const, clockId: 'clock-1', startedAt: 0, deadlineAt: 900_000, remainingMs: 900_000, totalPenaltyMs: 0 };
const baseTv: TvView = {
  roomCode: 'ABC123', phase: { state: 'MINIGAME_PLAY', phaseId: 'phase-1', phaseStartedAt: 1_000, durationMs: 20_000 },
  players: [], cycle: 1, roundInCycle: 1, adminId: null, firewallActive: false,
  matchClock: baseMatchClock,
  currentMinigame: { minigameId: 'RANK_IT', tvView: { kind: 'RANK_IT', status: 'ACTIVE' } },
  currentSpecialGame: null, hackerCount: 0, accusation: null, accusationCooldownUntil: null, lastRoundResult: null, winner: null, finalReveal: null,
};
const basePlayer: PlayerView = {
  playerId: 'p1', self: { playerId: 'p1', name: 'سارة', avatarId: 'a1', alive: true, connectionStatus: 'connected' },
  others: [], phase: baseTv.phase, adminId: null, isParticipantThisRound: true,
  isAdmin: false, adminSelection: null, hackerInfo: null, matchClock: baseMatchClock,
  minigameView: { kind: 'RANK_IT', status: 'ACTIVE', prompt: { contentId: 'q1', text: 'سر خاص' } },
  canAct: true, hackerCount: 0, canPushButton: false, accusation: null, accusationCooldownUntil: null, lastRoundResult: null, winner: null, finalReveal: null,
};
const privateInfo: PrivatePlayerPayload = { playerId: 'p1', role: 'CREW', fellowHackerIds: [] };

describe('gameplay phase routing', () => {
  it('routes known TV and Player phases into their gameplay families', () => {
    const { rerender } = render(<TvPhaseRouter view={baseTv} />);
    expect(screen.getByText('رتّبها')).toBeTruthy();
    rerender(<PlayerPhaseRouter view={{ ...basePlayer, phase: { ...basePlayer.phase, state: 'DISCUSSION' } }} privateInfo={privateInfo} />);
    expect(screen.getAllByText('النقاش')).toHaveLength(2);
  });

  it('shows safe fallbacks for unknown TV and Player phases', () => {
    const badTv = { ...baseTv, phase: { ...baseTv.phase, state: 'UNKNOWN' } } as unknown as TvView;
    const badPlayer = { ...basePlayer, phase: { ...basePlayer.phase, state: 'UNKNOWN' } } as unknown as PlayerView;
    const { rerender } = render(<TvPhaseRouter view={badTv} />);
    expect(screen.getByText('مرحلة غير مدعومة')).toBeTruthy();
    rerender(<PlayerPhaseRouter view={badPlayer} privateInfo={privateInfo} />);
    expect(screen.getByText('مرحلة غير مدعومة')).toBeTruthy();
  });
});

describe('minigame routing and privacy', () => {
  it.each(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM', 'DRAW_IT', 'DESCRIBE_IT', 'DEFEND_IT', 'BOMB_PROTOCOL'])('routes %s on TV', (id) => {
    const { container } = render(<TvMinigameRouter minigameId={id} view={{ kind: id, status: 'ACTIVE' }} />);
    expect(container.querySelector(`[data-minigame-id="${id}"][data-surface="tv"]`)).toBeTruthy();
  });

  it.each(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM', 'DRAW_IT', 'DESCRIBE_IT', 'DEFEND_IT', 'BOMB_PROTOCOL'])('routes %s on Player', (id) => {
    const { container } = render(<PlayerMinigameRouter view={{ kind: id, status: 'ACTIVE' }} isParticipant />);
    expect(container.querySelector(`[data-minigame-id="${id}"][data-surface="player"]`)).toBeTruthy();
  });

  it('renders unknown games safely', () => {
    render(<TvMinigameRouter minigameId="UNKNOWN" view={{}} />);
    expect(screen.getByText('لعبة غير مدعومة')).toBeTruthy();
  });

  it('keeps private prompt rendering on Player path only', () => {
    const { container, rerender } = render(<TvMinigameRouter minigameId="RANK_IT" view={{ kind: 'RANK_IT', prompt: { text: 'سر خاص' } }} />);
    expect(screen.queryByText('سر خاص')).toBeNull();
    expect(container.querySelector('[data-private-prompt]')).toBeNull();
    rerender(<PlayerMinigameRouter view={basePlayer.minigameView!} isParticipant />);
    expect(screen.getByText('سر خاص')).toBeTruthy();
    expect(container.querySelector('[data-private-prompt]')).toBeTruthy();
  });

  it('renders spectators without private prompts', () => {
    const { container } = render(<PlayerMinigameRouter view={basePlayer.minigameView!} isParticipant={false} />);
    expect(container.querySelector('[data-spectator-state]')).toBeTruthy();
    expect(container.querySelector('[data-private-prompt]')).toBeNull();
    expect(screen.queryByText('سر خاص')).toBeNull();
  });
});

describe('shared gameplay components', () => {
  it('counts down locally, reaches zero safely, and calls no transition callback', () => {
    vi.useFakeTimers();
    let now = 10_000;
    render(<Countdown deadlineAt={12_100} now={() => now} />);
    expect(screen.getByLabelText('الوقت المتبقي').textContent).toBe('3');
    now = 12_200;
    act(() => vi.advanceTimersByTime(250));
    expect(screen.getByLabelText('الوقت المتبقي').textContent).toBe('0');
    expect(screen.getByLabelText('الوقت المتبقي').getAttribute('data-countdown-state')).toBe('expired');
  });

  it.each([
    ['READY', 'جاهز للإرسال'], ['SUBMITTING', 'جاري الإرسال…'], ['LOCKED', 'تم تثبيت الإجابة'],
    ['TIMEOUT', 'انتهى الوقت'], ['ERROR', 'تعذر إرسال الإجابة'],
  ] as const)('renders submission state %s', (state, label) => {
    render(<SubmissionStatus state={state} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows reconnecting, restored, and recoverable connection states', () => {
    const { rerender } = render(<ConnectionBanner state="reconnecting" />);
    expect(screen.getByText('جاري إعادة الاتصال…')).toBeTruthy();
    rerender(<ConnectionBanner state="connected" />);
    expect(screen.queryByText('جاري إعادة الاتصال…')).toBeNull();
    rerender(<ConnectionBanner state="failed" onRetry={() => undefined} />);
    expect(screen.getByRole('button', { name: 'إعادة المحاولة' })).toBeTruthy();
  });

  it('replaces a stale screen with the latest server phase and remains RTL-compatible', () => {
    const { container, rerender } = render(<PlayerGameplayRoot view={basePlayer} privateInfo={privateInfo} connectionState="reconnecting" />);
    expect(screen.getByText('رتّبها')).toBeTruthy();
    const restored: PlayerView = { ...basePlayer, phase: { state: 'DISCUSSION', phaseId: 'phase-2', phaseStartedAt: 2_000, durationMs: 60_000 }, minigameView: null };
    rerender(<PlayerGameplayRoot view={restored} privateInfo={privateInfo} connectionState="connected" />);
    expect(screen.queryByText('رتّبها')).toBeNull();
    expect(screen.getAllByText('النقاش')).toHaveLength(2);
    expect(container.querySelector('.min-h-dvh')).toBeTruthy();
    expect(document.documentElement.dir === '' || document.documentElement.dir === 'rtl').toBe(true);
  });
});
