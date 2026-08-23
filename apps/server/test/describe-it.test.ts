import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext } from '../src/shared.js';
import {
  DESCRIBE_IT_SPEAK_DURATION_MS,
  DESCRIBE_IT_THINK_DURATION_MS,
  DescribeItModule,
  type DescribeItState,
} from '../src/minigames/describe-it.js';
import { DESCRIBE_IT_FIXTURE, assignDescribeItWords } from '../src/minigames/describe-it-content.js';
import { minigameRegistry } from '../src/minigames/registry.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const participants = ['p1', 'p2', 'p3'];
const roles = { p1: 'CREW', p2: 'HACKER', p3: 'CREW' } as const;
const assignments = assignDescribeItWords(participants, roles, new Set());
const ctx: MiniGameContext = {
  roomId: 'room-1',
  minigameId: 'DESCRIBE_IT',
  participantIds: participants,
  config: {
    speakerOrder: ['p2', 'p1', 'p3'],
    promptAssignments: assignments,
    crewWord: DESCRIBE_IT_FIXTURE.crewVariant,
    hackerWord: DESCRIBE_IT_FIXTURE.hackerVariant,
  },
};

function start(): DescribeItState {
  return DescribeItModule.start(ctx);
}

function beginSpeaking(state = start()): DescribeItState {
  return DescribeItModule.handleTimeout!(state, ctx);
}

function finish(state: DescribeItState, playerId: string): DescribeItState {
  expect(DescribeItModule.validateAction(state, playerId, ctx, {}, 'FINISH_SPEAKING').valid).toBe(true);
  return DescribeItModule.handleAction(state, playerId, {}, 'FINISH_SPEAKING');
}

describe('Describe It module', () => {
  it('registers as the fifth game and initializes every selected player once', () => {
    expect(Object.keys(minigameRegistry)).toEqual(expect.arrayContaining(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM', 'DRAW_IT', 'DESCRIBE_IT']));
    const state = start();
    expect(state.step).toBe('THINK');
    expect(state.speakerOrder).toEqual(['p2', 'p1', 'p3']);
    expect(new Set(state.speakerOrder).size).toBe(3);
    expect(Object.keys(state.promptAssignments)).toEqual(participants);
    expect(state.promptAssignments.p1?.prompt).toBe(DESCRIBE_IT_FIXTURE.crewVariant);
    expect(state.promptAssignments.p2?.prompt).toBe(DESCRIBE_IT_FIXTURE.hackerVariant);
  });

  it('accepts valid sets of three through five and rejects invalid participant/order/assignment sets', () => {
    for (const count of [3, 4, 5]) {
      const ids = Array.from({ length: count }, (_, index) => `x${index}`);
      const promptAssignments = assignDescribeItWords(ids, Object.fromEntries(ids.map((id) => [id, 'CREW'])), new Set());
      expect(DescribeItModule.start({
        ...ctx,
        participantIds: ids,
        config: { speakerOrder: [...ids].reverse(), promptAssignments, crewWord: 'A', hackerWord: 'B' },
      }).participantIds).toEqual(ids);
    }
    expect(() => DescribeItModule.start({ ...ctx, participantIds: ['p1', 'p2'] })).toThrow();
    expect(() => DescribeItModule.start({ ...ctx, participantIds: ['p1', 'p1', 'p3'] })).toThrow();
    expect(() => DescribeItModule.start({ ...ctx, config: { ...(ctx.config as object), speakerOrder: ['p1', 'p1', 'p3'] } })).toThrow();
    expect(() => DescribeItModule.start({ ...ctx, config: { ...(ctx.config as object), promptAssignments: { p1: assignments.p1 } } })).toThrow();
  });

  it('uses the assignment boundary for normal and hacked word variants', () => {
    expect(assignDescribeItWords(participants, roles, new Set()).p2?.prompt).toBe(DESCRIBE_IT_FIXTURE.hackerVariant);
    expect(assignDescribeItWords(participants, roles, new Set(['p2'])).p2?.prompt).toBe(DESCRIBE_IT_FIXTURE.crewVariant);
    // Only the targeted player's assignment flips — an untargeted crew participant is unaffected.
    expect(assignDescribeItWords(participants, roles, new Set(['p2'])).p1?.prompt).toBe(DESCRIBE_IT_FIXTURE.crewVariant);
  });

  it('has no active speaker in THINK, rejects actions, and advances on timeout', () => {
    const thinking = start();
    expect(DescribeItModule.buildTvView(thinking, { revealResults: false })).toMatchObject({ step: 'THINK', currentSpeaker: null });
    expect(DescribeItModule.validateAction(thinking, 'p2', ctx, {}, 'FINISH_SPEAKING').valid).toBe(false);
    const speaking = beginSpeaking(thinking);
    expect(speaking).toMatchObject({ step: 'SPEAKING', currentSpeakerIndex: 0 });
    expect(DescribeItModule.buildPlayerView(speaking, 'p2', 'HACKER', { revealResults: false })).toMatchObject({
      currentSpeaker: 'p2', isYourTurn: true,
    });
  });

  it('finishes and times out turns in order without completing early', () => {
    let state = beginSpeaking();
    state = finish(state, 'p2');
    expect(state).toMatchObject({ currentSpeakerIndex: 1, turnResults: { p2: 'FINISHED' } });
    expect(DescribeItModule.isComplete(state)).toBe(false);
    state = DescribeItModule.handleTimeout!(state, ctx);
    expect(state).toMatchObject({ currentSpeakerIndex: 2, turnResults: { p2: 'FINISHED', p1: 'TIMEOUT' } });
    state = finish(state, 'p3');
    expect(state.step).toBe('COMPLETED');
    expect(Object.keys(state.turnResults)).toEqual(['p2', 'p1', 'p3']);
  });

  it('final timeout completes exactly once', () => {
    let state = beginSpeaking();
    state = DescribeItModule.handleTimeout!(state, ctx);
    state = DescribeItModule.handleTimeout!(state, ctx);
    expect(DescribeItModule.isComplete(state)).toBe(false);
    state = DescribeItModule.handleTimeout!(state, ctx);
    expect(state.step).toBe('COMPLETED');
    expect(DescribeItModule.handleTimeout!(state, ctx)).toEqual(state);
  });

  it('rejects non-current, spectator, malformed, unknown, duplicate, and post-completion actions', () => {
    const speaking = beginSpeaking();
    expect(DescribeItModule.validateAction(speaking, 'p1', ctx, {}, 'FINISH_SPEAKING').valid).toBe(false);
    expect(DescribeItModule.validateAction(speaking, 'outside', ctx, {}, 'FINISH_SPEAKING').valid).toBe(false);
    expect(DescribeItModule.validateAction(speaking, 'p2', ctx, { playerId: 'p2' }, 'FINISH_SPEAKING').valid).toBe(false);
    expect(DescribeItModule.validateAction(speaking, 'p2', ctx, {}, 'PASS').valid).toBe(false);
    const advanced = finish(speaking, 'p2');
    expect(DescribeItModule.validateAction(advanced, 'p2', ctx, {}, 'FINISH_SPEAKING').valid).toBe(false);
    const complete = finish(finish(advanced, 'p1'), 'p3');
    expect(DescribeItModule.validateAction(complete, 'p3', ctx, {}, 'FINISH_SPEAKING').valid).toBe(false);
  });

  it('keeps disconnects inert so current and future turns resolve normally', () => {
    let state = beginSpeaking();
    expect(DescribeItModule.handleDisconnect(state, 'p2')).toEqual(state);
    state = DescribeItModule.handleTimeout!(state, ctx);
    expect(state).toMatchObject({ currentSpeakerIndex: 1, turnResults: { p2: 'TIMEOUT' } });
    state = DescribeItModule.handleDisconnect(state, 'p3');
    state = finish(state, 'p1');
    state = DescribeItModule.handleTimeout!(state, ctx);
    expect(state).toMatchObject({ step: 'COMPLETED', turnResults: { p3: 'TIMEOUT' } });
  });

  it('restores owner-only word, speaker state, and passed status from JSON', () => {
    const persisted = JSON.parse(JSON.stringify(finish(beginSpeaking(), 'p2'))) as DescribeItState;
    const p2 = DescribeItModule.buildPlayerView(persisted, 'p2', 'HACKER', { revealResults: false });
    const p1 = DescribeItModule.buildPlayerView(persisted, 'p1', 'CREW', { revealResults: false });
    expect(p2).toMatchObject({ hiddenWord: { text: DESCRIBE_IT_FIXTURE.hackerVariant }, turnStatus: 'FINISHED', isYourTurn: false });
    expect(p1).toMatchObject({ hiddenWord: { text: DESCRIBE_IT_FIXTURE.crewVariant }, currentSpeaker: 'p1', isYourTurn: true });
    expect(JSON.stringify(p1)).not.toContain(DESCRIBE_IT_FIXTURE.hackerVariant);
  });

  it('hides both words from TV/spectators and gives a selected player only their own word', () => {
    const state = beginSpeaking();
    const tv = DescribeItModule.buildTvView(state, { revealResults: false });
    const spectator = DescribeItModule.buildSpectatorView(state, { revealResults: false });
    const p1 = DescribeItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    for (const view of [tv, spectator]) {
      expect(JSON.stringify(view)).not.toContain(DESCRIBE_IT_FIXTURE.crewVariant);
      expect(JSON.stringify(view)).not.toContain(DESCRIBE_IT_FIXTURE.hackerVariant);
    }
    expect(JSON.stringify(p1)).toContain(DESCRIBE_IT_FIXTURE.crewVariant);
    expect(JSON.stringify(p1)).not.toContain(DESCRIBE_IT_FIXTURE.hackerVariant);
    expect(JSON.stringify(p1)).not.toContain('CREW');
  });

  it('reveals only the two possible words, unlabeled (Core Logic Phase 1.1 — no crewWord/hackerWord field, since that label directly identifies the hack target), without assignments, roles, or turn history', () => {
    const revealed = DescribeItModule.buildTvView(start(), { revealResults: true });
    expect(revealed).toEqual({
      kind: 'DESCRIBE_IT', status: 'REVEALED',
      words: [DESCRIBE_IT_FIXTURE.crewVariant, DESCRIBE_IT_FIXTURE.hackerVariant].sort(),
    });
    expect(JSON.stringify(revealed)).not.toContain('crewWord');
    expect(JSON.stringify(revealed)).not.toContain('hackerWord');
    expect(JSON.stringify(revealed)).not.toContain('p1');
    expect(JSON.stringify(revealed)).not.toContain('turnResults');
  });

  it('uses distinct think and speaking durations and per-turn internal keys', () => {
    const thinking = start();
    const speaking = beginSpeaking(thinking);
    expect(DescribeItModule.getDurationMs(ctx, thinking)).toBe(DESCRIBE_IT_THINK_DURATION_MS);
    expect(DescribeItModule.getDurationMs(ctx, speaking)).toBe(DESCRIBE_IT_SPEAK_DURATION_MS);
    expect(DescribeItModule.getInternalStep!(speaking)).toBe('SPEAKING:0');
    expect(DescribeItModule.getInternalStep!(finish(speaking, 'p2'))).toBe('SPEAKING:1');
  });

  it('runs think, each turn, stale protection, disconnect, and reveal through the real FSM', () => {
    const deps = createTestDeps(521);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'describe-it-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // no hacks submitted -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    expect((current.room.currentRound?.moduleState as DescribeItState).step).toBe('THINK');
    expect(current.room.currentRound?.participantIds).toHaveLength(5);
    const spectator = setup.playerIds.find((id) => !current.room.currentRound!.participantIds.includes(id))!;
    expect(JSON.stringify(buildPlayerView(current.room, current.priv, spectator).minigameView)).not.toContain('Airport');

    current = expireTimer(current.room, current.priv, deps);
    let state = current.room.currentRound?.moduleState as DescribeItState;
    expect(state.step).toBe('SPEAKING');
    const firstPhaseId = current.room.phase.phaseId;
    const first = state.speakerOrder[0]!;
    current = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: firstPhaseId, playerId: first, seq: 1,
      actionId: 'finish-first', actionType: 'FINISH_SPEAKING', data: {},
    }, first, deps);
    state = current.room.currentRound?.moduleState as DescribeItState;
    expect(state.currentSpeakerIndex).toBe(1);
    expect(current.room.phase.phaseId).not.toBe(firstPhaseId);

    const stale = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: firstPhaseId, playerId: first, seq: 2,
      actionId: 'old-timer-equivalent', actionType: 'FINISH_SPEAKING', data: {},
    }, first, deps);
    expect(stale.rejected?.code).toBe('STALE_PHASE');

    const active = state.speakerOrder[1]!;
    current = sendPlayer(current.room, current.priv, {
      type: 'player:disconnected', playerId: active,
    }, active, deps);
    expect((current.room.currentRound?.moduleState as DescribeItState).currentSpeakerIndex).toBe(1);
    while (current.room.phase.state === 'MINIGAME_PLAY') current = expireTimer(current.room, current.priv, deps);
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    expect(buildTvView(current.room).currentMinigame?.tvView).toEqual({
      kind: 'DESCRIBE_IT', status: 'REVEALED', words: ['Airport', 'Train Station'].sort(),
    });
  });
});
