// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '../lib/realtime/public-types';
import { AdminMinigameSelect } from '../components/gameplay/hacker/AdminMinigameSelect';
import { HackerTargetSelect } from '../components/gameplay/hacker/HackerTargetSelect';
import { PushButtonControl } from '../components/gameplay/hacker/PushButtonControl';
import { AccusationSelect } from '../components/gameplay/hacker/AccusationSelect';
import { AccusationVote } from '../components/gameplay/hacker/AccusationVote';
import { FinalResultsPanel } from '../components/gameplay/hacker/FinalResultsPanel';

afterEach(cleanup);

const self = { playerId: 'p1', name: 'سارة', avatarId: 'a1', alive: true, connectionStatus: 'connected' as const };
const others = [
  { playerId: 'p2', name: 'عمر', avatarId: 'a2', alive: true, connectionStatus: 'connected' as const },
  { playerId: 'p3', name: 'علي', avatarId: 'a3', alive: true, connectionStatus: 'connected' as const },
];
const matchClock = { status: 'running' as const, clockId: 'c1', startedAt: 0, deadlineAt: 900_000, remainingMs: 900_000, totalPenaltyMs: 0 };

const baseView: PlayerView = {
  playerId: 'p1', self, others, phase: { state: 'MINIGAME_SELECT', phaseId: 'phase-1', phaseStartedAt: 0, durationMs: null },
  adminId: 'p1', isParticipantThisRound: false, isAdmin: true, adminSelection: null, hackerInfo: null, matchClock,
  minigameView: null, canAct: false, hackerCount: 0, canPushButton: false, accusation: null,
  accusationCooldownUntil: null, lastRoundResult: null, winner: null, finalReveal: null,
};

describe('AdminMinigameSelect', () => {
  const view: PlayerView = {
    ...baseView,
    adminSelection: {
      availableMinigameIds: ['RANK_IT', 'COMPLETE_IT'],
      participantLimits: { RANK_IT: { min: 2, max: 3 }, COMPLETE_IT: { min: 2, max: 3 } },
      eligiblePlayerIds: ['p1', 'p2', 'p3'],
    },
  };

  it('walks choose-game then choose-participants, and submits the exact selection', () => {
    const sendPlayerEvent = vi.fn(() => true);
    render(<AdminMinigameSelect view={view} actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    fireEvent.click(screen.getByRole('button', { name: 'رتّبها' }));
    fireEvent.click(screen.getByRole('button', { name: /عمر/ }));
    fireEvent.click(screen.getByRole('button', { name: /علي/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاختيار' }));
    expect(sendPlayerEvent).toHaveBeenCalledWith('player:adminSelectMinigame', { minigameId: 'RANK_IT', participantIds: ['p2', 'p3'] });
  });

  it('keeps the submit button disabled below the minigame minimum', () => {
    render(<AdminMinigameSelect view={view} actionPending={false} actionError={null} sendPlayerEvent={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'رتّبها' }));
    fireEvent.click(screen.getByRole('button', { name: /عمر/ }));
    expect((screen.getByRole('button', { name: 'تأكيد الاختيار' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('HackerTargetSelect', () => {
  const view: PlayerView = { ...baseView, hackerInfo: { hacksRemaining: 1, canHackNow: true, eligibleTargetIds: ['p2', 'p3'] } };

  it('requires a target then a confirm step before sending the hack', () => {
    const sendPlayerEvent = vi.fn(() => true);
    render(<HackerTargetSelect view={view} actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /عمر/ }));
    fireEvent.click(screen.getByRole('button', { name: 'اختراق' }));
    expect(screen.getByText(/تأكيد اختراق عمر؟/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(sendPlayerEvent).toHaveBeenCalledWith('player:submitHack', { targetPlayerId: 'p2' });
  });

  it('shows an unavailable state and never a target list when canHackNow is false', () => {
    const unavailable: PlayerView = { ...baseView, hackerInfo: { hacksRemaining: 0, canHackNow: false, eligibleTargetIds: [] } };
    render(<HackerTargetSelect view={unavailable} actionPending={false} actionError={null} sendPlayerEvent={vi.fn()} />);
    expect(screen.getByText('لا يمكنك الاختراق الآن.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'اختراق' })).toBeNull();
  });
});

describe('PushButtonControl', () => {
  it('requires explicit confirmation before sending player:pushButton', () => {
    const sendPlayerEvent = vi.fn(() => true);
    render(<PushButtonControl actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /اتهام نهائي/ }));
    expect(screen.getByText('هل أنت متأكد أنك تريد بدء الاتهام؟')).toBeTruthy();
    expect(sendPlayerEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(sendPlayerEvent).toHaveBeenCalledWith('player:pushButton');
  });

  it('cancel returns to the idle state without sending anything', () => {
    const sendPlayerEvent = vi.fn(() => true);
    render(<PushButtonControl actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    fireEvent.click(screen.getByRole('button', { name: /اتهام نهائي/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByRole('button', { name: /اتهام نهائي/ })).toBeTruthy();
    expect(sendPlayerEvent).not.toHaveBeenCalled();
  });
});

describe('AccusationSelect', () => {
  it('shows a naming waiting panel for non-initiators, never a selection grid', () => {
    const view: PlayerView = {
      ...baseView,
      accusation: { initiatorId: 'p2', requiredSuspectCount: 1, suspectIds: null, votedCount: null, totalEligible: null, isInitiator: false, eligibleSuspectIds: null, hasVoted: false },
    };
    render(<AccusationSelect view={view} actionPending={false} actionError={null} sendPlayerEvent={vi.fn()} />);
    expect(screen.getByText('عمر يختار المشتبهين')).toBeTruthy();
  });

  it('enforces the exact required count before enabling submit, for the initiator', () => {
    const view: PlayerView = {
      ...baseView,
      accusation: { initiatorId: 'p1', requiredSuspectCount: 1, suspectIds: null, votedCount: null, totalEligible: null, isInitiator: true, eligibleSuspectIds: ['p2', 'p3'], hasVoted: false },
    };
    const sendPlayerEvent = vi.fn(() => true);
    render(<AccusationSelect view={view} actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    expect((screen.getByRole('button', { name: 'تأكيد الاتهام' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /عمر/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاتهام' }));
    expect(sendPlayerEvent).toHaveBeenCalledWith('player:submitAccusation', { suspectIds: ['p2'] });
  });
});

describe('AccusationVote', () => {
  it('sends the exact APPROVE/REJECT vote and locks once hasVoted', () => {
    const active: PlayerView = {
      ...baseView,
      accusation: { initiatorId: 'p2', requiredSuspectCount: 1, suspectIds: ['p3'], votedCount: 0, totalEligible: 3, isInitiator: false, eligibleSuspectIds: null, hasVoted: false },
    };
    const sendPlayerEvent = vi.fn(() => true);
    const { rerender } = render(<AccusationVote view={active} actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الاتهام' }));
    expect(sendPlayerEvent).toHaveBeenCalledWith('player:submitAccusationVote', { vote: 'APPROVE' });

    const locked: PlayerView = { ...active, accusation: { ...active.accusation!, hasVoted: true, votedCount: 1 } };
    rerender(<AccusationVote view={locked} actionPending={false} actionError={null} sendPlayerEvent={sendPlayerEvent} />);
    expect(screen.getByText('تم تسجيل صوتك')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'تأكيد الاتهام' })).toBeNull();
  });
});

describe('FinalResultsPanel', () => {
  it('shows a win banner and the full role reveal, with no rematch affordance', () => {
    const view: PlayerView = {
      ...baseView, winner: 'crew',
      finalReveal: [{ playerId: 'p1', role: 'CREW' }, { playerId: 'p2', role: 'HACKER' }, { playerId: 'p3', role: 'CREW' }],
    };
    render(<FinalResultsPanel view={view} />);
    expect(screen.getByText('فاز الطاقم')).toBeTruthy();
    expect(screen.getByText('أنت فزت! 🎉')).toBeTruthy();
    expect(screen.getAllByText('هاكر')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /جولة جديدة/ })).toBeNull();
  });
});
