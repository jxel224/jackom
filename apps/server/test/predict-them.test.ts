import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext } from '../src/shared.js';
import {
  PREDICT_THEM_AUDIENCE_DURATION_MS,
  PREDICT_THEM_PREDICTION_DURATION_MS,
  PredictThemModule,
  resolveMajority,
  type PredictThemState,
} from '../src/minigames/predict-them.js';
import { PREDICT_THEM_FIXTURE, assignPredictThemPrompts } from '../src/minigames/predict-them-content.js';
import { minigameRegistry } from '../src/minigames/registry.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const participants = ['s1', 's2', 'a1', 'a2', 'a3'];
const selectedPlayerIds = ['s1', 's2'];
const promptAssignments = assignPredictThemPrompts(selectedPlayerIds, { s1: 'CREW', s2: 'HACKER' }, new Set());
const ctx: MiniGameContext = {
  roomId: 'room-1',
  minigameId: 'PREDICT_THEM',
  participantIds: participants,
  config: {
    selectedPlayerIds,
    audienceQuestion: PREDICT_THEM_FIXTURE.audienceQuestion,
    optionA: PREDICT_THEM_FIXTURE.optionA,
    optionB: PREDICT_THEM_FIXTURE.optionB,
    promptAssignments,
  },
};
const malformedChoices: JsonValue[] = [null, {}, { choice: 'C' }, { choice: 1 }, { choice: 'A', extra: true }];

function start(): PredictThemState {
  return PredictThemModule.start(ctx);
}

function act(state: PredictThemState, playerId: string, actionType: string, choice: 'A' | 'B'): PredictThemState {
  const data = { choice };
  expect(PredictThemModule.validateAction(state, playerId, ctx, data, actionType).valid).toBe(true);
  return PredictThemModule.handleAction(state, playerId, data, actionType);
}

describe('Predict Them module', () => {
  it('registers as the third production minigame and creates disjoint groups', () => {
    expect(Object.keys(minigameRegistry)).toEqual(expect.arrayContaining(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM']));
    const state = start();
    expect(state.selectedPlayerIds).toEqual(['s1', 's2']);
    expect(state.audiencePlayerIds).toEqual(['a1', 'a2', 'a3']);
    expect(state.selectedPlayerIds.filter((id) => state.audiencePlayerIds.includes(id))).toEqual([]);
    expect(Object.keys(state.promptAssignments)).toEqual(selectedPlayerIds);
    expect(state.step).toBe('AUDIENCE_VOTE');
  });

  it('rejects invalid or overlapping participant configurations', () => {
    expect(() => PredictThemModule.start({ ...ctx, participantIds: ['only-one'] })).toThrow();
    expect(() => PredictThemModule.start({ ...ctx, participantIds: ['s1', 's1'] })).toThrow();
    expect(() => PredictThemModule.start({ ...ctx, config: { ...(ctx.config as object), selectedPlayerIds: ['outsider'] } })).toThrow();
    expect(() => PredictThemModule.start({ ...ctx, config: { ...(ctx.config as object), selectedPlayerIds: participants, promptAssignments: {} } })).toThrow();
  });

  it.each(['A', 'B'] as const)('accepts audience choice %s and locks it', (choice) => {
    const state = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', choice);
    expect(state.audienceVotes.a1).toEqual({ status: 'submitted', choice });
    expect(PredictThemModule.validateAction(state, 'a1', ctx, { choice: 'B' }, 'SUBMIT_AUDIENCE_VOTE').valid).toBe(false);
  });

  it.each(malformedChoices)('rejects malformed binary choice %#', (data) => {
    expect(PredictThemModule.validateAction(start(), 'a1', ctx, data, 'SUBMIT_AUDIENCE_VOTE').valid).toBe(false);
  });

  it('enforces group and internal-step permissions', () => {
    const audienceStep = start();
    expect(PredictThemModule.validateAction(audienceStep, 's1', ctx, { choice: 'A' }, 'SUBMIT_AUDIENCE_VOTE').valid).toBe(false);
    expect(PredictThemModule.validateAction(audienceStep, 'a1', ctx, { choice: 'A' }, 'SUBMIT_PREDICTION').valid).toBe(false);
    expect(PredictThemModule.validateAction(audienceStep, 'outside', ctx, { choice: 'A' }, 'SUBMIT_AUDIENCE_VOTE').valid).toBe(false);
    expect(PredictThemModule.validateAction(audienceStep, 'a1', ctx, { choice: 'A' }, 'WRONG').valid).toBe(false);
  });

  it('moves to prediction only when all audience players vote', () => {
    const one = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'A');
    const two = act(one, 'a2', 'SUBMIT_AUDIENCE_VOTE', 'B');
    expect(one.step).toBe('AUDIENCE_VOTE');
    expect(two.step).toBe('AUDIENCE_VOTE');
    expect(act(two, 'a3', 'SUBMIT_AUDIENCE_VOTE', 'A').step).toBe('PREDICTION');
  });

  it('audience timeout advances with missing votes left explicit', () => {
    const voted = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'A');
    const prediction = PredictThemModule.handleTimeout!(voted, ctx);
    expect(prediction.step).toBe('PREDICTION');
    expect(PredictThemModule.resolve(PredictThemModule.handleTimeout!(prediction, ctx), 'timeout').resultSummary).toMatchObject({
      audienceResult: { aVotes: 1, bVotes: 0, noVotes: 2, majority: 'A' },
    });
  });

  it.each(['A', 'B'] as const)('accepts selected prediction %s and locks it', (choice) => {
    const prediction = PredictThemModule.handleTimeout!(start(), ctx);
    const state = act(prediction, 's1', 'SUBMIT_PREDICTION', choice);
    expect(state.predictions.s1).toEqual({ status: 'submitted', choice });
    expect(PredictThemModule.validateAction(state, 's1', ctx, { choice: 'B' }, 'SUBMIT_PREDICTION').valid).toBe(false);
    expect(PredictThemModule.validateAction(state, 'a1', ctx, { choice: 'A' }, 'SUBMIT_PREDICTION').valid).toBe(false);
  });

  it('completes when every selected player predicts', () => {
    const prediction = PredictThemModule.handleTimeout!(start(), ctx);
    const one = act(prediction, 's1', 'SUBMIT_PREDICTION', 'A');
    expect(PredictThemModule.isComplete(one)).toBe(false);
    expect(PredictThemModule.isComplete(act(one, 's2', 'SUBMIT_PREDICTION', 'B'))).toBe(true);
  });

  it('prediction timeout produces explicit no_prediction entries', () => {
    let state = PredictThemModule.handleTimeout!(start(), ctx);
    state = act(state, 's1', 'SUBMIT_PREDICTION', 'B');
    state = PredictThemModule.handleTimeout!(state, ctx);
    expect(state.step).toBe('COMPLETED');
    expect(PredictThemModule.resolve(state, 'timeout').resultSummary).toMatchObject({
      predictions: [
        { playerId: 's1', status: 'submitted', choice: 'B' },
        { playerId: 's2', status: 'no_prediction' },
      ],
    });
  });

  it.each([
    [4, 2, 'A'],
    [2, 4, 'B'],
    [2, 2, 'TIE'],
    [0, 0, 'TIE'],
  ] as const)('resolves majority A=%s B=%s as %s', (a, b, expected) => {
    expect(resolveMajority(a, b)).toBe(expected);
  });

  it('counts only aggregate audience votes and ignores missing votes', () => {
    let state = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'A');
    state = act(state, 'a2', 'SUBMIT_AUDIENCE_VOTE', 'B');
    state = PredictThemModule.handleTimeout!(state, ctx);
    state = PredictThemModule.handleTimeout!(state, ctx);
    const result = PredictThemModule.resolve(state, 'timeout').resultSummary;
    expect(result).toMatchObject({ audienceResult: { aVotes: 1, bVotes: 1, noVotes: 1, majority: 'TIE' } });
    expect(JSON.stringify(result)).not.toContain('audienceVotes');
    expect(JSON.stringify(result)).not.toContain('a1');
  });

  it('prevents early vote, majority, prediction, and prompt leaks', () => {
    let state = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'A');
    const tvAudience = PredictThemModule.buildTvView(state, { revealResults: false });
    const selectedAudienceStep = PredictThemModule.buildPlayerView(state, 's1', 'CREW', { revealResults: false });
    expect(JSON.stringify(tvAudience)).not.toContain('aVotes');
    expect(JSON.stringify(selectedAudienceStep)).not.toContain(PREDICT_THEM_FIXTURE.crewVariant);
    expect(JSON.stringify(selectedAudienceStep)).not.toContain(PREDICT_THEM_FIXTURE.audienceQuestion);

    state = PredictThemModule.handleTimeout!(state, ctx);
    state = act(state, 's1', 'SUBMIT_PREDICTION', 'B');
    const selectedView = PredictThemModule.buildPlayerView(state, 's1', 'CREW', { revealResults: false });
    const otherSelectedView = PredictThemModule.buildPlayerView(state, 's2', 'HACKER', { revealResults: false });
    const audienceView = PredictThemModule.buildPlayerView(state, 'a1', 'CREW', { revealResults: false });
    expect(selectedView).toMatchObject({ prompt: { text: PREDICT_THEM_FIXTURE.crewVariant }, submission: { choice: 'B' } });
    expect(JSON.stringify(selectedView)).not.toContain(PREDICT_THEM_FIXTURE.hackerVariant);
    expect(JSON.stringify(otherSelectedView)).not.toContain(PREDICT_THEM_FIXTURE.crewVariant);
    expect(JSON.stringify(audienceView)).not.toContain('predictions');
    expect(JSON.stringify(selectedView)).not.toContain('majority');
  });

  it('reveals aggregate counts and selected predictions together, never individual audience votes', () => {
    let state = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'A');
    state = act(state, 'a2', 'SUBMIT_AUDIENCE_VOTE', 'A');
    state = act(state, 'a3', 'SUBMIT_AUDIENCE_VOTE', 'B');
    state = act(state, 's1', 'SUBMIT_PREDICTION', 'A');
    state = PredictThemModule.handleTimeout!(state, ctx);
    const revealed = PredictThemModule.buildTvView(state, { revealResults: true });
    expect(revealed).toMatchObject({
      audienceResult: { aVotes: 2, bVotes: 1, noVotes: 0, majority: 'A' },
      predictions: [
        { playerId: 's1', choice: 'A' },
        { playerId: 's2', status: 'no_prediction' },
      ],
    });
    expect(JSON.stringify(revealed)).not.toContain('audienceVotes');
    expect(JSON.stringify(revealed)).not.toContain(PREDICT_THEM_FIXTURE.crewVariant);
  });

  it('reconnection views restore only the owner submission and selected prompt', () => {
    let state = act(start(), 'a1', 'SUBMIT_AUDIENCE_VOTE', 'B');
    expect(PredictThemModule.buildPlayerView(state, 'a1', 'CREW', { revealResults: false })).toMatchObject({
      submission: { status: 'submitted', choice: 'B' },
    });
    expect(PredictThemModule.validateAction(state, 'a2', ctx, { choice: 'A' }, 'SUBMIT_AUDIENCE_VOTE').valid).toBe(true);
    state = PredictThemModule.handleTimeout!(state, ctx);
    state = act(state, 's1', 'SUBMIT_PREDICTION', 'A');
    const restored = PredictThemModule.buildPlayerView(state, 's1', 'CREW', { revealResults: false });
    expect(restored).toMatchObject({ prompt: { text: PREDICT_THEM_FIXTURE.crewVariant }, submission: { choice: 'A' } });
    expect(JSON.stringify(restored)).not.toContain('aVotes');
  });

  it('uses two distinct internal step durations', () => {
    const audience = start();
    const prediction = PredictThemModule.handleTimeout!(audience, ctx);
    expect(PredictThemModule.getDurationMs(ctx, audience)).toBe(PREDICT_THEM_AUDIENCE_DURATION_MS);
    expect(PredictThemModule.getDurationMs(ctx, prediction)).toBe(PREDICT_THEM_PREDICTION_DURATION_MS);
  });

  it('runs both internal steps through the real FSM with a fresh phaseId and stale protection', () => {
    const deps = createTestDeps(313);
    const setup = setupRoom(5, deps, { minigameSelection: { minigameSelectionRuleId: 'predict-them-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // no hacks submitted -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    const audiencePhaseId = current.room.phase.phaseId;
    const moduleState = current.room.currentRound?.moduleState as PredictThemState;

    for (const playerId of moduleState.audiencePlayerIds) {
      current = sendPlayer(current.room, current.priv, {
        type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId, seq: 1,
        actionId: `vote-${playerId}`, actionType: 'SUBMIT_AUDIENCE_VOTE', data: { choice: 'A' },
      }, playerId, deps);
    }
    expect((current.room.currentRound?.moduleState as PredictThemState).step).toBe('PREDICTION');
    expect(current.room.phase.phaseId).not.toBe(audiencePhaseId);
    expect(JSON.stringify(buildTvView(current.room))).not.toContain('aVotes');

    const stalePlayer = moduleState.audiencePlayerIds[0]!;
    const stale = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: audiencePhaseId, playerId: stalePlayer, seq: 2,
      actionId: 'stale-vote', actionType: 'SUBMIT_AUDIENCE_VOTE', data: { choice: 'B' },
    }, stalePlayer, deps);
    expect(stale.rejected?.code).toBe('STALE_PHASE');

    const selected = (current.room.currentRound?.moduleState as PredictThemState).selectedPlayerIds;
    expect(buildPlayerView(current.room, current.priv, selected[0]!).minigameView).toMatchObject({ group: 'SELECTED', step: 'PREDICTION' });
    for (const playerId of selected) {
      current = sendPlayer(current.room, current.priv, {
        type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId, seq: 1,
        actionId: `prediction-${playerId}`, actionType: 'SUBMIT_PREDICTION', data: { choice: 'A' },
      }, playerId, deps);
    }
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    expect(buildTvView(current.room).currentMinigame?.tvView).toMatchObject({
      audienceResult: { majority: 'A' },
    });
  });
});
