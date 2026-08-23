import { describe, expect, it } from 'vitest';
import type { MiniGameContext } from '../src/shared.js';
import {
  DEFEND_IT_DEFENCE_DURATION_MS,
  DEFEND_IT_FOLLOW_UP_QUESTION_DURATION_MS,
  DEFEND_IT_FOLLOW_UP_RESPONSE_DURATION_MS,
  DEFEND_IT_PREP_DURATION_MS,
  DefendItModule,
  type DefendItState,
} from '../src/minigames/defend-it.js';
import { DEFEND_IT_FIXTURE, assignDefendItStatements } from '../src/minigames/defend-it-content.js';
import { DEFEND_IT_FOLLOW_UP_STRATEGY, selectRandomFollowUpAskers } from '../src/minigames/defend-it-selection.js';
import { minigameRegistry } from '../src/minigames/registry.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const participants = ['p1', 'p2', 'p3'];
const roles = { p1: 'CREW', p2: 'HACKER', p3: 'CREW' } as const;
const assignments = assignDefendItStatements(participants, roles, new Set());
const ctx: MiniGameContext = {
  roomId: 'room-1', minigameId: 'DEFEND_IT', participantIds: participants,
  config: {
    speakerOrder: ['p2', 'p1', 'p3'],
    statementAssignments: assignments,
    statements: [DEFEND_IT_FIXTURE.crewVariant, DEFEND_IT_FIXTURE.hackerVariant],
    followUpStrategy: DEFEND_IT_FOLLOW_UP_STRATEGY,
    followUpAskerIds: { p1: 'p3', p2: 'p1', p3: 'p2' },
  },
};

function start(): DefendItState { return DefendItModule.start(ctx); }
function timeout(state: DefendItState): DefendItState { return DefendItModule.handleTimeout!(state, ctx); }
function act(state: DefendItState, playerId: string, actionType: string): DefendItState {
  expect(DefendItModule.validateAction(state, playerId, ctx, {}, actionType).valid).toBe(true);
  return DefendItModule.handleAction(state, playerId, {}, actionType);
}

describe('Defend It module', () => {
  it('is registered and initializes private assignments and unique order', () => {
    expect(Object.keys(minigameRegistry)).toEqual(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM', 'DRAW_IT', 'DESCRIBE_IT', 'DEFEND_IT']);
    const state = start();
    expect(state).toMatchObject({ step: 'PREP', speakerOrder: ['p2', 'p1', 'p3'], currentSpeakerIndex: 0 });
    expect(new Set(state.speakerOrder).size).toBe(3);
    expect(Object.keys(state.statementAssignments)).toEqual(participants);
    expect(state.statementAssignments.p1?.prompt).toBe(DEFEND_IT_FIXTURE.crewVariant);
    expect(state.statementAssignments.p2?.prompt).toBe(DEFEND_IT_FIXTURE.hackerVariant);
    expect(DefendItModule.buildPlayerView(state, 'outside', 'CREW', { revealResults: false })).toMatchObject({ statement: null });
  });

  it('supports two through four participants and rejects invalid configurations', () => {
    for (const count of [2, 3, 4]) {
      const ids = Array.from({ length: count }, (_, i) => `x${i}`);
      const statementAssignments = assignDefendItStatements(ids, Object.fromEntries(ids.map((id) => [id, 'CREW'])), new Set());
      const followUpAskerIds = Object.fromEntries(ids.map((id, i) => [id, ids[(i + 1) % ids.length]!])) as Record<string, string>;
      expect(DefendItModule.start({ ...ctx, participantIds: ids, config: {
        speakerOrder: ids, statementAssignments, statements: ['A', 'B'],
        followUpStrategy: DEFEND_IT_FOLLOW_UP_STRATEGY, followUpAskerIds,
      }}).participantIds).toEqual(ids);
    }
    expect(() => DefendItModule.start({ ...ctx, participantIds: ['p1'] })).toThrow();
    expect(() => DefendItModule.start({ ...ctx, participantIds: ['1', '2', '3', '4', '5'] })).toThrow();
    expect(() => DefendItModule.start({ ...ctx, participantIds: ['p1', 'p1'] })).toThrow();
    expect(() => DefendItModule.start({ ...ctx, config: { ...(ctx.config as object), speakerOrder: ['p1', 'p1', 'p3'] } })).toThrow();
    expect(() => DefendItModule.start({ ...ctx, config: { ...(ctx.config as object), followUpAskerIds: { p1: 'p1', p2: 'p1', p3: 'p2' } } })).toThrow();
  });

  it('uses the role/hack assignment boundary', () => {
    expect(assignDefendItStatements(participants, roles, new Set()).p2?.prompt).toBe(DEFEND_IT_FIXTURE.hackerVariant);
    expect(assignDefendItStatements(participants, roles, new Set(['p2'])).p2?.prompt).toBe(DEFEND_IT_FIXTURE.crewVariant);
    expect(assignDefendItStatements(participants, roles, new Set(['p2'])).p1?.prompt).toBe(DEFEND_IT_FIXTURE.crewVariant);
  });

  it('selects non-speaker askers deterministically with injected RNG', () => {
    const values = [0.1, 0.8, 0.4];
    let index = 0;
    const first = selectRandomFollowUpAskers(participants, () => values[index++]!);
    index = 0;
    expect(selectRandomFollowUpAskers(participants, () => values[index++]!)).toEqual(first);
    for (const id of participants) expect(first[id]).not.toBe(id);
  });

  it('starts in PREP, rejects verbal actions, then times into first defence', () => {
    const prep = start();
    expect(DefendItModule.validateAction(prep, 'p2', ctx, {}, 'FINISH_DEFENCE').valid).toBe(false);
    const defence = timeout(prep);
    expect(defence).toMatchObject({ step: 'DEFENCE', currentSpeakerIndex: 0 });
    expect(DefendItModule.buildPlayerView(defence, 'p2', 'HACKER', { revealResults: false })).toMatchObject({
      currentSpeaker: 'p2', isYourDefence: true,
    });
  });

  it('allows only the current defender and advances once by finish or timeout', () => {
    const defence = timeout(start());
    expect(DefendItModule.validateAction(defence, 'p1', ctx, {}, 'FINISH_DEFENCE').valid).toBe(false);
    let question = act(defence, 'p2', 'FINISH_DEFENCE');
    expect(question).toMatchObject({ step: 'FOLLOW_UP_QUESTION', turnResults: { p2: { defence: 'FINISHED', askerId: 'p1' } } });
    expect(DefendItModule.validateAction(question, 'p2', ctx, {}, 'FINISH_DEFENCE').valid).toBe(false);
    question = timeout(timeout(timeout(question)));
    expect(question).toMatchObject({ step: 'FOLLOW_UP_QUESTION', currentSpeakerIndex: 1, turnResults: { p1: { defence: 'TIMEOUT' } } });
  });

  it('allows only the designated asker and safely times into response', () => {
    const question = act(timeout(start()), 'p2', 'FINISH_DEFENCE');
    expect(DefendItModule.buildPlayerView(question, 'p1', 'CREW', { revealResults: false })).toMatchObject({ isFollowUpAsker: true });
    expect(DefendItModule.validateAction(question, 'p2', ctx, {}, 'FINISH_FOLLOW_UP_QUESTION').valid).toBe(false);
    expect(DefendItModule.validateAction(question, 'p3', ctx, {}, 'FINISH_FOLLOW_UP_QUESTION').valid).toBe(false);
    const response = timeout(question);
    expect(response).toMatchObject({ step: 'FOLLOW_UP_RESPONSE', turnResults: { p2: { followUpQuestion: 'TIMEOUT' } } });
  });

  it('allows only the original speaker to answer and advances to the next defence', () => {
    let state = act(timeout(start()), 'p2', 'FINISH_DEFENCE');
    state = act(state, 'p1', 'FINISH_FOLLOW_UP_QUESTION');
    expect(DefendItModule.buildPlayerView(state, 'p2', 'HACKER', { revealResults: false })).toMatchObject({ isFollowUpResponder: true });
    expect(DefendItModule.validateAction(state, 'p1', ctx, {}, 'FINISH_FOLLOW_UP_RESPONSE').valid).toBe(false);
    state = act(state, 'p2', 'FINISH_FOLLOW_UP_RESPONSE');
    expect(state).toMatchObject({ step: 'DEFENCE', currentSpeakerIndex: 1, turnResults: { p2: { followUpResponse: 'FINISHED' } } });
    expect(DefendItModule.isComplete(state)).toBe(false);
  });

  it('gives every player one complete turn and completes on final manual response', () => {
    let state = timeout(start());
    for (const speakerId of ['p2', 'p1', 'p3']) {
      state = act(state, speakerId, 'FINISH_DEFENCE');
      state = act(state, state.followUpAskerIds[speakerId]!, 'FINISH_FOLLOW_UP_QUESTION');
      state = act(state, speakerId, 'FINISH_FOLLOW_UP_RESPONSE');
    }
    expect(state.step).toBe('COMPLETED');
    expect(Object.keys(state.turnResults)).toEqual(['p2', 'p1', 'p3']);
    expect(DefendItModule.handleTimeout!(state, ctx)).toEqual(state);
  });

  it('completes final response by timeout but never before it', () => {
    let state = timeout(start());
    for (let i = 0; i < participants.length * 3 - 1; i++) state = timeout(state);
    expect(state.step).toBe('FOLLOW_UP_RESPONSE');
    expect(DefendItModule.isComplete(state)).toBe(false);
    expect(timeout(state).step).toBe('COMPLETED');
  });

  it('rejects spectator, malformed, unknown, wrong-stage, and completed actions', () => {
    const defence = timeout(start());
    expect(DefendItModule.validateAction(defence, 'outside', ctx, {}, 'FINISH_DEFENCE').valid).toBe(false);
    expect(DefendItModule.validateAction(defence, 'p2', ctx, { playerId: 'p2' }, 'FINISH_DEFENCE').valid).toBe(false);
    expect(DefendItModule.validateAction(defence, 'p2', ctx, {}, 'UNKNOWN').valid).toBe(false);
    expect(DefendItModule.validateAction(defence, 'p2', ctx, {}, 'FINISH_FOLLOW_UP_RESPONSE').valid).toBe(false);
    let complete = defence;
    for (let i = 0; i < participants.length * 3; i++) complete = timeout(complete);
    expect(DefendItModule.validateAction(complete, 'p3', ctx, {}, 'FINISH_FOLLOW_UP_RESPONSE').valid).toBe(false);
  });

  it('disconnects are inert in defence, question, and response so timers prevent softlock', () => {
    let state = timeout(start());
    expect(DefendItModule.handleDisconnect(state, 'p2')).toEqual(state);
    state = timeout(state);
    expect(DefendItModule.handleDisconnect(state, 'p1')).toEqual(state);
    state = timeout(state);
    expect(DefendItModule.handleDisconnect(state, 'p2')).toEqual(state);
    state = timeout(state);
    expect(state).toMatchObject({ step: 'DEFENCE', currentSpeakerIndex: 1 });
  });

  it('restores assignments, order, stage, asker, and completed turns from JSON', () => {
    let state = timeout(start());
    state = timeout(state);
    const restored = JSON.parse(JSON.stringify(state)) as DefendItState;
    const p1 = DefendItModule.buildPlayerView(restored, 'p1', 'CREW', { revealResults: false });
    const p2 = DefendItModule.buildPlayerView(restored, 'p2', 'HACKER', { revealResults: false });
    expect(p1).toMatchObject({ statement: { text: DEFEND_IT_FIXTURE.crewVariant }, isFollowUpAsker: true });
    expect(p2).toMatchObject({ statement: { text: DEFEND_IT_FIXTURE.hackerVariant }, currentSpeaker: 'p2' });
    expect(restored).toMatchObject({ step: 'FOLLOW_UP_QUESTION', speakerOrder: ['p2', 'p1', 'p3'], turnResults: { p2: { defence: 'TIMEOUT' } } });
  });

  it('hides statements and roles before reveal and reveals only a neutral pair afterward', () => {
    const state = timeout(start());
    const tv = DefendItModule.buildTvView(state, { revealResults: false });
    const spectator = DefendItModule.buildSpectatorView(state, { revealResults: false });
    const p1 = DefendItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    for (const view of [tv, spectator]) {
      expect(JSON.stringify(view)).not.toContain(DEFEND_IT_FIXTURE.crewVariant);
      expect(JSON.stringify(view)).not.toContain(DEFEND_IT_FIXTURE.hackerVariant);
    }
    expect(JSON.stringify(p1)).toContain(DEFEND_IT_FIXTURE.crewVariant);
    expect(JSON.stringify(p1)).not.toContain(DEFEND_IT_FIXTURE.hackerVariant);
    const reveal = DefendItModule.buildTvView(state, { revealResults: true });
    // Core Logic Phase 1.1: sorted, unlabeled — a fixed [crewVariant, hackerVariant] positional
    // tuple would directly identify the hack target just as much as a named field would.
    expect(reveal).toEqual({ kind: 'DEFEND_IT', status: 'REVEALED', statements: [DEFEND_IT_FIXTURE.crewVariant, DEFEND_IT_FIXTURE.hackerVariant].sort() });
    expect(JSON.stringify(reveal)).not.toContain('p1');
    expect(JSON.stringify(reveal)).not.toContain('CREW');
    expect(JSON.stringify(reveal)).not.toContain('HACKER');
  });

  it('uses all four configured durations and unique internal keys', () => {
    const prep = start();
    const defence = timeout(prep);
    const question = timeout(defence);
    const response = timeout(question);
    expect(DefendItModule.getDurationMs(ctx, prep)).toBe(DEFEND_IT_PREP_DURATION_MS);
    expect(DefendItModule.getDurationMs(ctx, defence)).toBe(DEFEND_IT_DEFENCE_DURATION_MS);
    expect(DefendItModule.getDurationMs(ctx, question)).toBe(DEFEND_IT_FOLLOW_UP_QUESTION_DURATION_MS);
    expect(DefendItModule.getDurationMs(ctx, response)).toBe(DEFEND_IT_FOLLOW_UP_RESPONSE_DURATION_MS);
    expect([prep, defence, question, response].map((s) => DefendItModule.getInternalStep!(s))).toEqual([
      'PREP:0', 'DEFENCE:0', 'FOLLOW_UP_QUESTION:0', 'FOLLOW_UP_RESPONSE:0',
    ]);
  });

  it('refreshes phase per verbal stage and rejects stale actions through the real FSM', () => {
    const deps = createTestDeps(613);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'defend-it-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // no hacks submitted -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    expect(current.room.currentRound?.participantIds).toHaveLength(4);
    const spectator = setup.playerIds.find((id) => !current.room.currentRound!.participantIds.includes(id))!;
    expect(JSON.stringify(buildPlayerView(current.room, current.priv, spectator).minigameView)).not.toContain('Working from');

    current = expireTimer(current.room, current.priv, deps);
    const state = current.room.currentRound?.moduleState as DefendItState;
    const defender = state.speakerOrder[0]!;
    const defencePhaseId = current.room.phase.phaseId;
    current = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: defencePhaseId, playerId: defender, seq: 1,
      actionId: 'defence-finished', actionType: 'FINISH_DEFENCE', data: {},
    }, defender, deps);
    expect((current.room.currentRound?.moduleState as DefendItState).step).toBe('FOLLOW_UP_QUESTION');
    expect(current.room.phase.phaseId).not.toBe(defencePhaseId);
    const stale = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: defencePhaseId, playerId: defender, seq: 2,
      actionId: 'stale-defence', actionType: 'FINISH_DEFENCE', data: {},
    }, defender, deps);
    expect(stale.rejected?.code).toBe('STALE_PHASE');

    while (current.room.phase.state === 'MINIGAME_PLAY') current = expireTimer(current.room, current.priv, deps);
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    expect(buildTvView(current.room).currentMinigame?.tvView).toEqual({
      kind: 'DEFEND_IT', status: 'REVEALED', statements: [
        'Working from home is better than working from an office.',
        'Working from an office is better than working from home.',
      ].sort(),
    });
  });
});
