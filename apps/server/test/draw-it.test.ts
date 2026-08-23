import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext } from '../src/shared.js';
import {
  DRAW_IT_DURATION_MS,
  DRAW_IT_MAX_POINTS_PER_STROKE,
  DRAW_IT_MAX_STROKES,
  DRAW_IT_MAX_TOTAL_POINTS,
  DrawItModule,
  type DrawItState,
} from '../src/minigames/draw-it.js';
import { DRAW_IT_FIXTURE, assignDrawItPrompts } from '../src/minigames/draw-it-content.js';
import { minigameRegistry } from '../src/minigames/registry.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendPlayer, setupRoom, startGame } from './helpers/room.js';

const participants = ['p1', 'p2', 'p3'];
const assignments = assignDrawItPrompts(participants, { p1: 'CREW', p2: 'HACKER', p3: 'CREW' }, new Set());
const ctx: MiniGameContext = {
  roomId: 'room-1',
  minigameId: 'DRAW_IT',
  participantIds: participants,
  config: { promptAssignments: assignments },
};
const point = { x: 0.42, y: 0.71 };
const malformedPayloads: JsonValue[] = [
  null,
  {},
  { strokes: null },
  { strokes: [{}] },
  { strokes: [{ points: [null] }] },
  { strokes: [{ points: [{ x: '0.5', y: 0.5 }] }] },
  { strokes: [{ points: [{ x: 0.5 }] }] },
  { strokes: [{ points: [point], role: 'HACKER' }] },
  { strokes: [], playerId: 'spoofed' },
];

function start(): DrawItState {
  return DrawItModule.start(ctx);
}

function submit(state: DrawItState, playerId: string, strokes: Array<{ points: Array<{ x: number; y: number }> }>): DrawItState {
  const data = { strokes };
  expect(DrawItModule.validateAction(state, playerId, ctx, data, 'SUBMIT_DRAWING').valid).toBe(true);
  return DrawItModule.handleAction(state, playerId, data);
}

describe('Draw It module', () => {
  it('registers as the fourth production minigame and initializes selected participants only', () => {
    expect(Object.keys(minigameRegistry)).toEqual(expect.arrayContaining(['RANK_IT', 'COMPLETE_IT', 'PREDICT_THEM', 'DRAW_IT']));
    const state = start();
    expect(state.participantIds).toEqual(participants);
    expect(Object.keys(state.promptAssignments)).toEqual(participants);
    expect(state.status).toBe('ACTIVE');
    expect(DrawItModule.buildPlayerView(state, 'outsider', 'CREW', { revealResults: false })).toMatchObject({ prompt: null });
  });

  it('rejects invalid participant sets and missing assignments', () => {
    expect(() => DrawItModule.start({ ...ctx, participantIds: ['p1'] })).toThrow();
    expect(() => DrawItModule.start({ ...ctx, participantIds: ['p1', 'p1'] })).toThrow();
    expect(() => DrawItModule.start({ ...ctx, participantIds: ['1', '2', '3', '4', '5'] })).toThrow();
    expect(() => DrawItModule.start({ ...ctx, config: { promptAssignments: { p1: assignments.p1 } } })).toThrow();
  });

  it('accepts a valid single stroke and preserves normalized coordinates exactly', () => {
    const strokes = [{ points: [{ x: 0, y: 0 }, point, { x: 1, y: 1 }] }];
    expect(submit(start(), 'p1', strokes).submissions.p1?.strokes).toEqual(strokes);
  });

  it('accepts multiple strokes and every coordinate boundary', () => {
    const strokes = [
      { points: [{ x: 0, y: 1 }] },
      { points: [{ x: 1, y: 0 }, { x: 0.5, y: 0.5 }] },
    ];
    expect(submit(start(), 'p1', strokes).submissions.p1?.strokes).toEqual(strokes);
  });

  it('accepts an intentional blank canvas and distinguishes it from timeout', () => {
    const state = submit(start(), 'p1', []);
    expect(state.submissions.p1).toEqual({ status: 'submitted', strokes: [] });
    expect(DrawItModule.resolve(state, 'timeout').resultSummary).toMatchObject({
      drawings: [
        { playerId: 'p1', status: 'submitted', strokes: [] },
        { playerId: 'p2', status: 'no_answer' },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it.each([
    [{ x: -0.001, y: 0.5 }],
    [{ x: 1.001, y: 0.5 }],
    [{ x: 0.5, y: -0.001 }],
    [{ x: 0.5, y: 1.001 }],
    [{ x: Number.NaN, y: 0.5 }],
    [{ x: Number.POSITIVE_INFINITY, y: 0.5 }],
    [{ x: 0.5, y: Number.NEGATIVE_INFINITY }],
  ])('rejects invalid coordinate set %#', (points) => {
    expect(DrawItModule.validateAction(start(), 'p1', ctx, { strokes: [{ points }] }, 'SUBMIT_DRAWING').valid).toBe(false);
  });

  it.each(malformedPayloads)('rejects malformed or authority-bearing payload %#', (data) => {
    expect(DrawItModule.validateAction(start(), 'p1', ctx, data, 'SUBMIT_DRAWING').valid).toBe(false);
  });

  it('enforces maximum strokes', () => {
    const strokes = Array.from({ length: DRAW_IT_MAX_STROKES + 1 }, () => ({ points: [point] }));
    expect(DrawItModule.validateAction(start(), 'p1', ctx, { strokes }, 'SUBMIT_DRAWING').valid).toBe(false);
  });

  it('enforces maximum points per stroke', () => {
    const points = Array.from({ length: DRAW_IT_MAX_POINTS_PER_STROKE + 1 }, () => point);
    expect(DrawItModule.validateAction(start(), 'p1', ctx, { strokes: [{ points }] }, 'SUBMIT_DRAWING').valid).toBe(false);
  });

  it('enforces maximum total points before state mutation', () => {
    const fullStroke = { points: Array.from({ length: DRAW_IT_MAX_POINTS_PER_STROKE }, () => point) };
    const strokeCount = Math.floor(DRAW_IT_MAX_TOTAL_POINTS / DRAW_IT_MAX_POINTS_PER_STROKE) + 1;
    const data = { strokes: Array.from({ length: strokeCount }, () => fullStroke) };
    const state = start();
    expect(DrawItModule.validateAction(state, 'p1', ctx, data, 'SUBMIT_DRAWING').valid).toBe(false);
    expect(state.submissions).toEqual({});
  });

  it('rejects wrong action, non-participant, duplicate, and post-completion submissions', () => {
    const initial = start();
    expect(DrawItModule.validateAction(initial, 'p1', ctx, { strokes: [] }, 'DRAW_POINT').valid).toBe(false);
    expect(DrawItModule.validateAction(initial, 'outsider', ctx, { strokes: [] }, 'SUBMIT_DRAWING').valid).toBe(false);
    const once = submit(initial, 'p1', []);
    expect(DrawItModule.validateAction(once, 'p1', ctx, { strokes: [] }, 'SUBMIT_DRAWING').valid).toBe(false);
    const complete = submit(submit(once, 'p2', [{ points: [point] }]), 'p3', []);
    expect(DrawItModule.validateAction(complete, 'p1', ctx, { strokes: [] }, 'SUBMIT_DRAWING').valid).toBe(false);
  });

  it('completes only after every selected participant submits', () => {
    const one = submit(start(), 'p1', []);
    const two = submit(one, 'p2', [{ points: [point] }]);
    expect(DrawItModule.isComplete(one)).toBe(false);
    expect(DrawItModule.isComplete(two)).toBe(false);
    expect(DrawItModule.isComplete(submit(two, 'p3', []))).toBe(true);
    expect(DrawItModule.getDurationMs(ctx)).toBe(DRAW_IT_DURATION_MS);
  });

  it('timeout preserves submitted vectors and marks missing players without fake blank canvases', () => {
    const state = submit(start(), 'p1', [{ points: [point] }]);
    expect(DrawItModule.resolve(state, 'timeout').resultSummary).toEqual({
      kind: 'DRAW_IT',
      reason: 'timeout',
      drawings: [
        { playerId: 'p1', status: 'submitted', strokes: [{ points: [point] }] },
        { playerId: 'p2', status: 'no_answer' },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('reveals every drawing simultaneously and keeps the correct player association', () => {
    let state = submit(start(), 'p1', [{ points: [{ x: 0.1, y: 0.2 }] }]);
    state = submit(state, 'p2', [{ points: [{ x: 0.8, y: 0.9 }] }]);
    expect(DrawItModule.buildTvView(state, { revealResults: true })).toMatchObject({
      drawings: [
        { playerId: 'p1', strokes: [{ points: [{ x: 0.1, y: 0.2 }] }] },
        { playerId: 'p2', strokes: [{ points: [{ x: 0.8, y: 0.9 }] }] },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('does not leak strokes or prompts before reveal', () => {
    let state = submit(start(), 'p1', [{ points: [{ x: 0.123456, y: 0.654321 }] }]);
    state = submit(state, 'p2', [{ points: [{ x: 0.987654, y: 0.111111 }] }]);
    const tv = DrawItModule.buildTvView(state, { revealResults: false });
    const p1 = DrawItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    expect(JSON.stringify(tv)).not.toContain('0.123456');
    expect(JSON.stringify(tv)).not.toContain(DRAW_IT_FIXTURE.crewVariant);
    expect(JSON.stringify(p1)).not.toContain('0.987654');
    expect(JSON.stringify(p1)).not.toContain(DRAW_IT_FIXTURE.hackerVariant);
    expect(p1).toMatchObject({ prompt: { text: DRAW_IT_FIXTURE.crewVariant }, submission: { status: 'submitted' } });
  });

  it('restores owner prompt and lock from JSON state without restoring an unsent local draft', () => {
    const persisted = JSON.parse(JSON.stringify(submit(start(), 'p1', [{ points: [point] }]))) as DrawItState;
    const restored = DrawItModule.buildPlayerView(persisted, 'p1', 'CREW', { revealResults: false });
    expect(restored).toMatchObject({
      prompt: { text: DRAW_IT_FIXTURE.crewVariant },
      submission: { status: 'submitted', blank: false },
    });
    expect(JSON.stringify(restored)).not.toContain('0.42');
    expect(DrawItModule.validateAction(start(), 'p1', ctx, { strokes: [] }, 'SUBMIT_DRAWING').valid).toBe(true);
  });

  it('runs selected-player enforcement, stale protection, timeout, and reveal through the real FSM', () => {
    const deps = createTestDeps(419);
    const setup = setupRoom(6, deps, { minigameSelection: { minigameSelectionRuleId: 'draw-it-only' } });
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    let current = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
    current = expireTimer(current.room, current.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
    current = expireTimer(current.room, current.priv, deps); // no hacks submitted -> MINIGAME_INSTRUCTIONS
    current = expireTimer(current.room, current.priv, deps); // -> MINIGAME_PLAY
    expect(current.room.phase.state).toBe('MINIGAME_PLAY');
    const selected = current.room.currentRound!.participantIds;
    // Fallback auto-selection now uses the real DRAW_IT limit (2-4, rules/participant-limits.ts) —
    // with a 6-player pool it picks the max, 4 (the old auto-narrowing logic could never reach 4).
    expect(selected).toHaveLength(4);
    const spectator = setup.playerIds.find((id) => !selected.includes(id))!;
    expect(buildPlayerView(current.room, current.priv, spectator).minigameView).toMatchObject({ status: 'SPECTATING' });

    const rejected = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId: spectator, seq: 1,
      actionId: 'spectator-drawing', actionType: 'SUBMIT_DRAWING', data: { strokes: [] },
    }, spectator, deps);
    expect(rejected.rejected?.code).toBe('NOT_PARTICIPANT');

    const oldPhaseId = current.room.phase.phaseId;
    const first = selected[0]!;
    current = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: oldPhaseId, playerId: first, seq: 1,
      actionId: 'drawing-1', actionType: 'SUBMIT_DRAWING', data: { strokes: [{ points: [point] }] },
    }, first, deps);
    expect(JSON.stringify(buildTvView(current.room))).not.toContain('0.42');
    current = expireTimer(current.room, current.priv, deps);
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    expect(JSON.stringify(buildTvView(current.room))).toContain('0.42');

    const stale = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: oldPhaseId, playerId: first, seq: 2,
      actionId: 'late-drawing', actionType: 'SUBMIT_DRAWING', data: { strokes: [] },
    }, first, deps);
    expect(stale.rejected?.code).toBe('STALE_PHASE');
  });
});
