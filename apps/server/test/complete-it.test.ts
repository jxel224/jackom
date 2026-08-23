import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext } from '../src/shared.js';
import {
  COMPLETE_IT_DURATION_MS,
  COMPLETE_IT_MAX_CHARACTERS,
  CompleteItModule,
  type CompleteItState,
} from '../src/minigames/complete-it.js';
import { COMPLETE_IT_FIXTURE, assignCompleteItPrompts } from '../src/minigames/complete-it-content.js';
import { minigameRegistry } from '../src/minigames/registry.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const participants = ['p1', 'p2', 'p3'];
const assignments = assignCompleteItPrompts(participants, { p1: 'CREW', p2: 'HACKER', p3: 'CREW' }, new Set());
const ctx: MiniGameContext = {
  roomId: 'room-1',
  minigameId: 'COMPLETE_IT',
  participantIds: participants,
  config: { promptAssignments: assignments },
};
const malformedActions: JsonValue[] = [null, 42, {}, { text: 42 }, { text: 'valid', extra: true }];

function start(): CompleteItState {
  return CompleteItModule.start(ctx);
}

function submit(state: CompleteItState, playerId: string, text: string): CompleteItState {
  const action = { text };
  expect(CompleteItModule.validateAction(state, playerId, ctx, action, 'SUBMIT_TEXT').valid).toBe(true);
  return CompleteItModule.handleAction(state, playerId, action);
}

describe('Complete It module', () => {
  it('registers alongside Rank It and initializes exactly the supplied participants', () => {
    expect(Object.keys(minigameRegistry)).toEqual(expect.arrayContaining(['RANK_IT', 'COMPLETE_IT']));
    const state = start();
    expect(state.kind).toBe('COMPLETE_IT');
    expect(state.participantIds).toEqual(participants);
    expect(Object.keys(state.promptAssignments)).toEqual(participants);
    expect(CompleteItModule.buildPlayerView(state, 'outsider', 'CREW', { revealResults: false })).toMatchObject({ prompt: null });
  });

  it('rejects invalid start conditions', () => {
    expect(() => CompleteItModule.start({ ...ctx, participantIds: [] })).toThrow();
    expect(() => CompleteItModule.start({ ...ctx, participantIds: ['p1', 'p1'] })).toThrow();
    expect(() => CompleteItModule.start({ ...ctx, config: { promptAssignments: { p1: assignments.p1 } } })).toThrow();
  });

  it.each([
    'إجابة عربية قصيرة',
    'A short answer',
    'موعد at 7 مساءً',
    'Really?! نعم.',
    '👍 فكرة',
  ])('accepts Unicode answer: %s', (text) => {
    expect(submit(start(), 'p1', text).submissions.p1?.text).toBe(text);
  });

  it('trims only leading and trailing whitespace and preserves the wording inside', () => {
    const state = submit(start(), 'p1', '  جواب   كما كتبتهُ!  ');
    expect(state.submissions.p1?.text).toBe('جواب   كما كتبتهُ!');
  });

  it.each(['', '   ', '\n\t'])('rejects blank text %#', (text) => {
    expect(CompleteItModule.validateAction(start(), 'p1', ctx, { text }, 'SUBMIT_TEXT').valid).toBe(false);
  });

  it('accepts the maximum Unicode length and rejects anything longer', () => {
    const exact = 'ع'.repeat(COMPLETE_IT_MAX_CHARACTERS);
    const oversized = `${exact}ع`;
    expect(CompleteItModule.validateAction(start(), 'p1', ctx, { text: exact }, 'SUBMIT_TEXT').valid).toBe(true);
    expect(CompleteItModule.validateAction(start(), 'p1', ctx, { text: oversized }, 'SUBMIT_TEXT').valid).toBe(false);
  });

  it.each(malformedActions)('rejects malformed payload %#', (action) => {
    expect(CompleteItModule.validateAction(start(), 'p1', ctx, action, 'SUBMIT_TEXT').valid).toBe(false);
  });

  it('rejects wrong action, non-participant, duplicate, and post-completion submissions', () => {
    const initial = start();
    expect(CompleteItModule.validateAction(initial, 'p1', ctx, { text: 'answer' }, 'SUBMIT_RANKING').valid).toBe(false);
    expect(CompleteItModule.validateAction(initial, 'outsider', ctx, { text: 'answer' }, 'SUBMIT_TEXT').valid).toBe(false);
    const once = submit(initial, 'p1', 'first');
    expect(CompleteItModule.validateAction(once, 'p1', ctx, { text: 'second' }, 'SUBMIT_TEXT').valid).toBe(false);
    const complete = submit(submit(once, 'p2', 'two'), 'p3', 'three');
    expect(CompleteItModule.validateAction(complete, 'p1', ctx, { text: 'again' }, 'SUBMIT_TEXT').valid).toBe(false);
  });

  it('completes only when every participant submits and uses the temporary duration', () => {
    const one = submit(start(), 'p1', 'one');
    const two = submit(one, 'p2', 'two');
    expect(CompleteItModule.isComplete(one)).toBe(false);
    expect(CompleteItModule.isComplete(two)).toBe(false);
    expect(CompleteItModule.isComplete(submit(two, 'p3', 'three'))).toBe(true);
    expect(CompleteItModule.getDurationMs(ctx)).toBe(COMPLETE_IT_DURATION_MS);
  });

  it('timeout preserves submitted text and records explicit no-answer entries', () => {
    const resolution = CompleteItModule.resolve(submit(start(), 'p1', '  وصلت متأخرًا  '), 'timeout');
    expect(resolution.resultSummary).toEqual({
      kind: 'COMPLETE_IT',
      reason: 'timeout',
      results: [
        { playerId: 'p1', status: 'submitted', text: 'وصلت متأخرًا' },
        { playerId: 'p2', status: 'no_answer' },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('hides prompts and answers before reveal, then reveals all exact answers together', () => {
    const state = submit(submit(start(), 'p1', 'جوابي'), 'p2', '<script>alert(1)</script>');
    const tvActive = CompleteItModule.buildTvView(state, { revealResults: false });
    const p1Active = CompleteItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    expect(JSON.stringify(tvActive)).not.toContain('جوابي');
    expect(JSON.stringify(tvActive)).not.toContain(COMPLETE_IT_FIXTURE.crewVariant);
    expect(JSON.stringify(p1Active)).not.toContain('<script>');
    expect(JSON.stringify(p1Active)).not.toContain(COMPLETE_IT_FIXTURE.hackerVariant);
    expect(CompleteItModule.buildTvView(state, { revealResults: true })).toMatchObject({
      results: [
        { playerId: 'p1', text: 'جوابي' },
        { playerId: 'p2', text: '<script>alert(1)</script>' },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('reconnection projection restores only the owner prompt and locked submission', () => {
    const state = submit(submit(start(), 'p1', 'إجابتي'), 'p2', 'secret answer');
    const restored = CompleteItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    expect(restored).toMatchObject({
      prompt: { contentId: COMPLETE_IT_FIXTURE.id, text: COMPLETE_IT_FIXTURE.crewVariant },
      submission: { status: 'submitted', text: 'إجابتي' },
    });
    expect(JSON.stringify(restored)).not.toContain('secret answer');
    expect(CompleteItModule.validateAction(start(), 'p1', ctx, { text: 'can continue' }, 'SUBMIT_TEXT').valid).toBe(true);
  });

  it('keeps a hacked target isolated in the shared assignment boundary', () => {
    const swapped = assignCompleteItPrompts(['crew', 'hacker'], { crew: 'CREW', hacker: 'HACKER' }, new Set(['crew', 'hacker']));
    expect(swapped.crew?.prompt).toBe(COMPLETE_IT_FIXTURE.hackerVariant);
    expect(swapped.hacker?.prompt).toBe(COMPLETE_IT_FIXTURE.crewVariant);
  });

  it('runs through the real FSM and safe view builders to simultaneous reveal', () => {
    const deps = createTestDeps(211);
    const setup = setupRoom(5, deps, { minigameSelection: { minigameSelectionRuleId: 'complete-it-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // no hacks submitted -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    expect(current.room.currentRound?.minigameId).toBe('COMPLETE_IT');

    const first = setup.playerIds[0]!;
    const second = setup.playerIds[1]!;
    let submitted = sendPlayer(
      current.room,
      current.priv,
      { type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId: first, seq: 1, actionId: 'text-1', actionType: 'SUBMIT_TEXT', data: { text: 'إجابة أولى' } },
      first,
      deps,
    );
    submitted = sendPlayer(
      submitted.room,
      submitted.priv,
      { type: 'player:submitAction', phaseId: submitted.room.phase.phaseId, playerId: second, seq: 1, actionId: 'text-2', actionType: 'SUBMIT_TEXT', data: { text: 'second answer' } },
      second,
      deps,
    );
    expect(JSON.stringify(buildTvView(submitted.room))).not.toContain('إجابة أولى');
    expect(JSON.stringify(buildPlayerView(submitted.room, submitted.priv, first))).not.toContain('second answer');

    const revealed = expireTimer(submitted.room, submitted.priv, deps);
    expect(revealed.room.phase.state).toBe('RESULTS_REVEAL');
    expect(JSON.stringify(buildTvView(revealed.room))).toContain('إجابة أولى');
    expect(JSON.stringify(buildTvView(revealed.room))).toContain('second answer');
    expect(revealed.room.roundHistory[0]?.resultSummary).toMatchObject({ kind: 'COMPLETE_IT', reason: 'timeout' });
  });
});
