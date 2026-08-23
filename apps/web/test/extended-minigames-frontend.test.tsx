// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JsonValue } from '../lib/shared';
import { PlayerRankIt } from '../components/gameplay/hacker/minigames/rank-it/PlayerRankIt';
import { TvRankIt } from '../components/gameplay/hacker/minigames/rank-it/TvRankIt';
import { PlayerCompleteIt } from '../components/gameplay/hacker/minigames/complete-it/PlayerCompleteIt';
import { TvCompleteIt } from '../components/gameplay/hacker/minigames/complete-it/TvCompleteIt';
import { PlayerPredictThem } from '../components/gameplay/hacker/minigames/predict-them/PlayerPredictThem';
import { PlayerDefendIt } from '../components/gameplay/hacker/minigames/defend-it/PlayerDefendIt';
import { PlayerDescribeIt } from '../components/gameplay/hacker/minigames/describe-it/PlayerDescribeIt';
import { PlayerDrawIt } from '../components/gameplay/hacker/minigames/draw-it/PlayerDrawIt';
import { PlayerBombProtocol } from '../components/gameplay/hacker/minigames/bomb-protocol/PlayerBombProtocol';
import { TvBombProtocol } from '../components/gameplay/hacker/minigames/bomb-protocol/TvBombProtocol';

afterEach(cleanup);

const players = [
  { playerId: 'p1', name: 'سارة', avatarId: 'a1', alive: true, connectionStatus: 'connected' as const },
  { playerId: 'p2', name: 'عمر', avatarId: 'a2', alive: true, connectionStatus: 'connected' as const },
  { playerId: 'p3', name: 'علي', avatarId: 'a3', alive: true, connectionStatus: 'connected' as const },
];

describe('RANK_IT', () => {
  const cards = [
    { id: 'card_1', text: 'بطاقة أولى' },
    { id: 'card_2', text: 'بطاقة ثانية' },
    { id: 'card_3', text: 'بطاقة ثالثة' },
    { id: 'card_4', text: 'بطاقة رابعة' },
  ];
  const activeView = {
    kind: 'RANK_IT', status: 'ACTIVE', prompt: { contentId: 'r1', text: 'رتّبها من الأكثر إلى الأقل' },
    cards, initialOrder: cards.map((c) => c.id), submission: { status: 'not_submitted' },
  };

  it('reorders cards with the up/down controls and submits the exact resulting order', () => {
    const submitAction = vi.fn(() => true);
    render(<PlayerRankIt view={activeView} actionPending={false} actionError={null} submitAction={submitAction} />);
    // Move the second card ("بطاقة ثانية") up, swapping positions 1 and 2.
    fireEvent.click(screen.getAllByRole('button', { name: 'نقل لأعلى' })[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'تثبيت الترتيب' }));
    expect(submitAction).toHaveBeenCalledWith('SUBMIT_RANKING', { order: ['card_2', 'card_1', 'card_3', 'card_4'] });
  });

  it('disables moving the first card up and the last card down', () => {
    render(<PlayerRankIt view={activeView} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    const ups = screen.getAllByRole('button', { name: 'نقل لأعلى' });
    const downs = screen.getAllByRole('button', { name: 'نقل لأسفل' });
    expect((ups[0] as HTMLButtonElement).disabled).toBe(true);
    expect((downs[downs.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the locked own order and never another player order', () => {
    const { container } = render(<PlayerRankIt view={{ ...activeView, submission: { status: 'submitted', order: ['card_3', 'card_1', 'card_4', 'card_2'] } }} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText('تم تثبيت الإجابة')).toBeTruthy();
    expect(screen.getByText(/بطاقة ثالثة/)).toBeTruthy();
    expect(container.querySelector('[data-rank-it-list]')).toBeTruthy();
  });

  it('TV shows progress without leaking the instruction or any submitted order', () => {
    render(<TvRankIt view={{ kind: 'RANK_IT', status: 'ACTIVE', submittedCount: 1, participantCount: 3 }} players={players} reveal={false} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    expect(screen.queryByText('رتّبها من الأكثر إلى الأقل')).toBeNull();
  });

  it('TV reveal shows every submitted order resolved to card text, and who did not answer', () => {
    const view: JsonValue = {
      kind: 'RANK_IT', status: 'REVEALED', cards,
      results: [
        { playerId: 'p1', status: 'submitted', order: ['card_2', 'card_1', 'card_3', 'card_4'] },
        { playerId: 'p2', status: 'no_answer' },
      ],
    };
    render(<TvRankIt view={view} players={players} reveal />);
    expect(screen.getByText('سارة')).toBeTruthy();
    expect(screen.getByText(/بطاقة ثانية/)).toBeTruthy();
    expect(screen.getByText('لم يرسلوا ترتيبًا')).toBeTruthy();
    expect(screen.getByText('عمر')).toBeTruthy();
  });
});

describe('COMPLETE_IT', () => {
  const activeView = { kind: 'COMPLETE_IT', status: 'ACTIVE', prompt: { contentId: 'c1', text: 'أكمل: أفضل هاكر هو...' }, submission: { status: 'not_submitted' }, maxCharacters: 80 };

  it('submits the trimmed text and blocks an empty submission', () => {
    const submitAction = vi.fn(() => true);
    render(<PlayerCompleteIt view={activeView} actionPending={false} actionError={null} submitAction={submitAction} />);
    expect((screen.getByRole('button', { name: 'إرسال الإجابة' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('اكتب إجابتك هنا…'), { target: { value: '  أنا أفضل هاكر  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الإجابة' }));
    expect(submitAction).toHaveBeenCalledWith('SUBMIT_TEXT', { text: 'أنا أفضل هاكر' });
  });

  it('shows the locked own answer and never another player answer', () => {
    render(<PlayerCompleteIt view={{ ...activeView, submission: { status: 'submitted', text: 'إجابتي' } }} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText('إجابتي')).toBeTruthy();
    expect(screen.getByText('تم تثبيت الإجابة')).toBeTruthy();
  });

  it('TV shows progress without leaking the prompt or any answer text', () => {
    render(<TvCompleteIt view={{ kind: 'COMPLETE_IT', status: 'ACTIVE', submittedCount: 2, participantCount: 3 }} players={players} reveal={false} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
    expect(screen.queryByText('أكمل: أفضل هاكر هو...')).toBeNull();
  });
});

describe('PREDICT_THEM', () => {
  it('an audience member votes with the real question options', () => {
    const submitAction = vi.fn(() => true);
    const view = { kind: 'PREDICT_THEM', group: 'AUDIENCE', step: 'AUDIENCE_VOTE', question: 'من سيفوز؟', options: { A: 'سارة', B: 'عمر' }, submission: { status: 'not_submitted' } };
    render(<PlayerPredictThem view={view} actionPending={false} actionError={null} submitAction={submitAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'سارة' }));
    expect(submitAction).toHaveBeenCalledWith('SUBMIT_AUDIENCE_VOTE', { choice: 'A' });
  });

  it('a selected predictor sees their private prompt and submits a prediction', () => {
    const submitAction = vi.fn(() => true);
    const view = {
      kind: 'PREDICT_THEM', group: 'SELECTED', step: 'PREDICTION', prompt: { contentId: 'q1', text: 'بماذا سيصوت الجمهور؟' },
      options: { A: 'سارة', B: 'عمر' }, submission: { status: 'not_submitted' },
    };
    render(<PlayerPredictThem view={view} actionPending={false} actionError={null} submitAction={submitAction} />);
    expect(screen.getByText('بماذا سيصوت الجمهور؟')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'عمر' }));
    expect(submitAction).toHaveBeenCalledWith('SUBMIT_PREDICTION', { choice: 'B' });
  });

  it('a selected predictor waits during AUDIENCE_VOTE instead of seeing options', () => {
    const view = { kind: 'PREDICT_THEM', group: 'SELECTED', step: 'AUDIENCE_VOTE', prompt: null, options: null, submission: { status: 'not_submitted' } };
    render(<PlayerPredictThem view={view} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText(/بانتظار انتهاء تصويت الجمهور/)).toBeTruthy();
  });
});

describe('DEFEND_IT', () => {
  const baseProgress = { participantIds: ['p1', 'p2'], speakerOrder: ['p1', 'p2'], currentSpeakerIndex: 0, completedPlayerIds: [] };

  it('the active defender gets a real finish control naming their own turn', () => {
    const submitAction = vi.fn(() => true);
    const view = { kind: 'DEFEND_IT', ...baseProgress, step: 'DEFENCE', currentSpeaker: 'p1', currentFollowUpAsker: null, statement: { contentId: 's1', text: 'أنا لست هاكرًا' }, isYourDefence: true, isFollowUpAsker: false, isFollowUpResponder: false };
    render(<PlayerDefendIt view={view} actionPending={false} actionError={null} submitAction={submitAction} players={players} />);
    fireEvent.click(screen.getByRole('button', { name: 'انتهيت من الدفاع' }));
    expect(submitAction).toHaveBeenCalledWith('FINISH_DEFENCE', {});
  });

  it('a non-active player sees who is speaking instead of a finish control', () => {
    const view = { kind: 'DEFEND_IT', ...baseProgress, step: 'DEFENCE', currentSpeaker: 'p1', currentFollowUpAsker: null, statement: null, isYourDefence: false, isFollowUpAsker: false, isFollowUpResponder: false };
    render(<PlayerDefendIt view={view} actionPending={false} actionError={null} submitAction={vi.fn()} players={players} />);
    expect(screen.getByText(/سارة يدافع الآن/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /انتهيت/ })).toBeNull();
  });
});

describe('DESCRIBE_IT', () => {
  it('the active speaker gets a real finish control', () => {
    const submitAction = vi.fn(() => true);
    const view = { kind: 'DESCRIBE_IT', participantIds: ['p1', 'p2', 'p3'], step: 'SPEAKING', speakerOrder: ['p1', 'p2', 'p3'], currentSpeaker: 'p1', currentSpeakerIndex: 0, completedPlayerIds: [], hiddenWord: { contentId: 'w1', text: 'قطة' }, isYourTurn: true, turnStatus: 'CURRENT' };
    render(<PlayerDescribeIt view={view} actionPending={false} actionError={null} submitAction={submitAction} players={players} />);
    fireEvent.click(screen.getByRole('button', { name: 'انتهيت من الوصف' }));
    expect(submitAction).toHaveBeenCalledWith('FINISH_SPEAKING', {});
  });

  it('shows the private word during THINK without a finish control', () => {
    const view = { kind: 'DESCRIBE_IT', participantIds: ['p1', 'p2', 'p3'], step: 'THINK', speakerOrder: ['p1', 'p2', 'p3'], currentSpeaker: null, currentSpeakerIndex: 0, completedPlayerIds: [], hiddenWord: { contentId: 'w1', text: 'قطة' }, isYourTurn: false, turnStatus: 'UPCOMING' };
    render(<PlayerDescribeIt view={view} actionPending={false} actionError={null} submitAction={vi.fn()} players={players} />);
    expect(screen.getByText('قطة')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /انتهيت/ })).toBeNull();
  });
});

describe('DRAW_IT', () => {
  it('undo and clear are disabled with no strokes, and locks after submission', () => {
    const view = { kind: 'DRAW_IT', status: 'ACTIVE', prompt: { contentId: 'd1', text: 'ارسم قطة' }, submission: { status: 'not_submitted' }, limits: { maxStrokes: 32, maxPointsPerStroke: 256 } };
    render(<PlayerDrawIt view={view} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'تراجع' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'مسح الكل' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the locked state once the drawing is submitted', () => {
    const view = { kind: 'DRAW_IT', status: 'ACTIVE', prompt: { contentId: 'd1', text: 'ارسم قطة' }, submission: { status: 'submitted', blank: false }, limits: { maxStrokes: 32, maxPointsPerStroke: 256 } };
    render(<PlayerDrawIt view={view} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText('تم إرسال رسمتك.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'إرسال الرسمة' })).toBeNull();
  });
});

describe('BOMB_PROTOCOL', () => {
  const baseState = { operatorId: 'p1', analystIds: ['p2', 'p3'], currentModule: 'SYMBOLS', status: 'ACTIVE', strikes: 0, maxStrikes: 3 };

  it('the Operator presses a symbol from the real visible board', () => {
    const submitAction = vi.fn(() => true);
    const view = { kind: 'BOMB_PROTOCOL', specialRole: 'OPERATOR', ...baseState, board: { symbols: ['circle', 'star', 'square', 'triangle'], pressedCount: 0 }, allowedAction: 'PRESS_SYMBOL' };
    render(<PlayerBombProtocol view={view} actionPending={false} actionError={null} submitAction={submitAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'circle' }));
    expect(submitAction).toHaveBeenCalledWith('PRESS_SYMBOL', { symbolId: 'circle' });
  });

  it('the Operator cuts a wire from the real board layout', () => {
    const submitAction = vi.fn(() => true);
    const view = {
      kind: 'BOMB_PROTOCOL', specialRole: 'OPERATOR', ...baseState, currentModule: 'WIRES',
      board: { wires: [{ wireId: 'wire-1', color: 'red', position: 1 }, { wireId: 'wire-2', color: 'blue', position: 2 }] },
      allowedAction: 'CUT_WIRE',
    };
    render(<PlayerBombProtocol view={view} actionPending={false} actionError={null} submitAction={submitAction} />);
    fireEvent.click(screen.getByRole('button', { name: /سلك #2/ }));
    expect(submitAction).toHaveBeenCalledWith('CUT_WIRE', { wireId: 'wire-2' });
  });

  it('an Analyst sees their private clue fragments and no board controls', () => {
    const view = { kind: 'BOMB_PROTOCOL', specialRole: 'ANALYST', ...baseState, instructionFragments: ['Symbol position 1 is circle.'] };
    render(<PlayerBombProtocol view={view} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText('Symbol position 1 is circle.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'circle' })).toBeNull();
  });

  it('shows a resolved status banner instead of controls once SUCCESS', () => {
    const view = { kind: 'BOMB_PROTOCOL', specialRole: 'OPERATOR', ...baseState, status: 'SUCCESS', board: null, allowedAction: null };
    render(<PlayerBombProtocol view={view} actionPending={false} actionError={null} submitAction={vi.fn()} />);
    expect(screen.getByText(/تم تفكيك القنبلة/)).toBeTruthy();
  });

  it('TV shows the operator identity and strike count without leaking the analyst clues', () => {
    const view = { kind: 'BOMB_PROTOCOL', ...baseState, board: { symbols: ['circle', 'star', 'square', 'triangle'], pressedCount: 1 } };
    render(<TvBombProtocol view={view} players={players} />);
    expect(screen.getByText(/سارة/)).toBeTruthy();
    expect(screen.getByText('circle')).toBeTruthy();
  });
});
