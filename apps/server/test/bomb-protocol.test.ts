import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext, RoomConfig } from '../src/shared.js';
import { BOMB_PROTOCOL_DURATION_MS, BOMB_PROTOCOL_MAX_STRIKES, BombProtocolModule, type BombProtocolState } from '../src/minigames/bomb-protocol.js';
import { createBombProtocolConfig } from '../src/minigames/bomb-protocol-content.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, sendHost, sendPlayer, setupRoom, startGame } from './helpers/room.js';
import type { Deps } from '../src/types/deps.js';
import type { HandleEventResult } from '../src/fsm/result.js';

const participantIds = ['p1', 'p2', 'p3', 'p4'];

function make(seed = 701) {
  const deps = createTestDeps(seed);
  const config = createBombProtocolConfig(participantIds, deps.rng);
  const ctx: MiniGameContext = { roomId: 'room-1', minigameId: 'BOMB_PROTOCOL', participantIds, config };
  return { deps, config, ctx, state: BombProtocolModule.start(ctx) };
}

function apply(state: BombProtocolState, ctx: MiniGameContext, actionType: string, data: JsonValue): BombProtocolState {
  expect(BombProtocolModule.validateAction(state, state.operatorId, ctx, data, actionType).valid).toBe(true);
  return BombProtocolModule.handleAction(state, state.operatorId, data, actionType);
}

function solveSymbols(state: BombProtocolState, ctx: MiniGameContext): BombProtocolState {
  for (const symbolId of state.symbols.solution) state = apply(state, ctx, 'PRESS_SYMBOL', { symbolId });
  return state;
}

function advanceOneRegularRoundAndResolve(prev: HandleEventResult, deps: Deps): HandleEventResult {
  let result = prev;
  result = expireTimer(result.room, result.priv, deps);
  result = expireTimer(result.room, result.priv, deps);
  result = expireTimer(result.room, result.priv, deps);
  result = expireTimer(result.room, result.priv, deps);
  return expireTimer(result.room, result.priv, deps);
}

function reachSpecial(deps: Deps, playerCount = 7, overrides: Partial<RoomConfig> = {}) {
  const defaults = createDefaultConfig();
  const setup = setupRoom(playerCount, deps, {
    minigameSelection: { minigameSelectionRuleId: 'rank-it-only' },
    specialGame: { ...defaults.specialGame, specialGameScheduleRuleId: 'placeholder-after-first-round-once' },
    rules: { ...defaults.rules, roundsPerCycle: 1 },
    ...overrides,
  });
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const afterIntro = expireTimer(acked.room, acked.priv, deps); // GAME_INTRO -> MINIGAME_SELECT
  const atRound = expireTimer(afterIntro.room, afterIntro.priv, deps); // Admin selection timeout -> HACKER_CORRUPTION
  const intro = advanceOneRegularRoundAndResolve(atRound, deps);
  expect(intro.room.phase.state).toBe('SPECIAL_GAME_INTRO');
  const play = expireTimer(intro.room, intro.priv, deps);
  expect(play.room.phase.state).toBe('SPECIAL_GAME_PLAY');
  return { setup, play };
}

describe('Bomb Protocol module', () => {
  it('initializes one deterministic Operator, all Analysts, and a valid bounded puzzle', () => {
    const first = make(703);
    const second = make(703);
    expect(first.config).toEqual(second.config);
    expect(first.state.status).toBe('ACTIVE');
    expect(first.state.currentModule).toBe('SYMBOLS');
    expect(first.state.strikes).toBe(0);
    expect(first.state.maxStrikes).toBe(BOMB_PROTOCOL_MAX_STRIKES);
    expect(first.state.analystIds).toHaveLength(3);
    expect(first.state.analystIds).not.toContain(first.state.operatorId);
    expect(new Set([first.state.operatorId, ...first.state.analystIds])).toEqual(new Set(participantIds));
    expect(first.state.symbols.solution.every((id) => first.state.symbols.visible.includes(id))).toBe(true);
    expect(first.state.wires.board.some((wire) => wire.wireId === first.state.wires.correctWireId)).toBe(true);
    expect(first.state.code.solution.every((digit) => first.state.code.allowedValues.includes(digit))).toBe(true);
  });

  it('validates three through five participants and rejects invalid role/puzzle config', () => {
    for (const count of [3, 4, 5]) {
      const ids = participantIds.concat('p5').slice(0, count);
      const deps = createTestDeps(710 + count);
      const config = createBombProtocolConfig(ids, deps.rng);
      expect(BombProtocolModule.start({ ...make().ctx, participantIds: ids, config }).participantIds).toEqual(ids);
    }
    expect(() => createBombProtocolConfig(['p1', 'p2'], () => 0)).toThrow();
    const { ctx, config } = make();
    expect(() => BombProtocolModule.start({ ...ctx, config: { ...config, operatorId: 'outside' } })).toThrow();
    expect(() => BombProtocolModule.start({ ...ctx, config: { ...config, wires: { ...config.wires, correctWireId: 'missing' } } })).toThrow();
  });

  it('distributes private fragments across Analysts without giving the Operator any', () => {
    const { state } = make();
    expect(state.analystInstructions[state.operatorId]).toBeUndefined();
    for (const analystId of state.analystIds) {
      expect(state.analystInstructions[analystId]).toBeDefined();
    }
    const allSymbolClues = state.analystIds.flatMap((id) => state.analystInstructions[id]!.SYMBOLS);
    expect(allSymbolClues).toHaveLength(4);
  });

  it('advances correct Symbols presses and strikes incorrect/invalid/unauthorized presses', () => {
    const { state, ctx } = make();
    const expected = state.symbols.solution[0]!;
    const wrong = state.symbols.visible.find((id) => id !== expected)!;
    expect(apply(state, ctx, 'PRESS_SYMBOL', { symbolId: wrong }).strikes).toBe(1);
    expect(BombProtocolModule.validateAction(state, state.operatorId, ctx, { symbolId: 'invalid' }, 'PRESS_SYMBOL').valid).toBe(false);
    expect(BombProtocolModule.validateAction(state, state.analystIds[0]!, ctx, { symbolId: expected }, 'PRESS_SYMBOL').valid).toBe(false);
    expect(apply(state, ctx, 'PRESS_SYMBOL', { symbolId: expected }).symbols.progress).toBe(1);
    expect(solveSymbols(state, ctx).currentModule).toBe('WIRES');
  });

  it('keeps Wires playable after a wrong cut and advances only on the correct wire', () => {
    const { state, ctx } = make();
    let wires = solveSymbols(state, ctx);
    const wrong = wires.wires.board.find((wire) => wire.wireId !== wires.wires.correctWireId)!.wireId;
    wires = apply(wires, ctx, 'CUT_WIRE', { wireId: wrong });
    expect(wires).toMatchObject({ currentModule: 'WIRES', strikes: 1 });
    expect(BombProtocolModule.validateAction(wires, wires.operatorId, ctx, { wireId: 'missing' }, 'CUT_WIRE').valid).toBe(false);
    expect(BombProtocolModule.validateAction(wires, wires.operatorId, ctx, { symbolId: 'star' }, 'PRESS_SYMBOL').valid).toBe(false);
    expect(apply(wires, ctx, 'CUT_WIRE', { wireId: wires.wires.correctWireId }).currentModule).toBe('CODE_SEQUENCE');
  });

  it('allows bounded code retries and succeeds only on the correct code', () => {
    const { state, ctx } = make();
    let code = solveSymbols(state, ctx);
    code = apply(code, ctx, 'CUT_WIRE', { wireId: code.wires.correctWireId });
    const wrong = [...code.code.solution];
    wrong[0] = code.code.allowedValues.find((value) => value !== wrong[0])!;
    code = apply(code, ctx, 'SUBMIT_CODE', { code: wrong });
    expect(code).toMatchObject({ status: 'ACTIVE', strikes: 1 });
    expect(BombProtocolModule.validateAction(code, code.operatorId, ctx, { code: [1, 2] }, 'SUBMIT_CODE').valid).toBe(false);
    expect(apply(code, ctx, 'SUBMIT_CODE', { code: code.code.solution })).toMatchObject({ status: 'SUCCESS' });
  });

  it('increments one strike per error, continues at one/two, and fails exactly at three', () => {
    const { state, ctx } = make();
    const wrong = state.symbols.visible.find((id) => id !== state.symbols.solution[0])!;
    let current = apply(state, ctx, 'PRESS_SYMBOL', { symbolId: wrong });
    expect(current).toMatchObject({ strikes: 1, status: 'ACTIVE' });
    current = apply(current, ctx, 'PRESS_SYMBOL', { symbolId: wrong });
    expect(current).toMatchObject({ strikes: 2, status: 'ACTIVE' });
    current = apply(current, ctx, 'PRESS_SYMBOL', { symbolId: wrong });
    expect(current).toMatchObject({ strikes: 3, status: 'FAILURE' });
    expect(BombProtocolModule.isComplete(current)).toBe(true);
    expect(BombProtocolModule.validateAction(current, current.operatorId, ctx, { symbolId: wrong }, 'PRESS_SYMBOL').valid).toBe(false);
    expect(BombProtocolModule.resolve(current, 'completed').success).toBe(false);
  });

  it('resolves timeout as failure and success as success without changing the overall duration', () => {
    const { state, ctx } = make();
    expect(BombProtocolModule.getDurationMs(ctx, state)).toBe(BOMB_PROTOCOL_DURATION_MS);
    expect(BombProtocolModule.resolve(state, 'timeout')).toMatchObject({ success: false, resultSummary: { status: 'FAILURE' } });
    let success = solveSymbols(state, ctx);
    success = apply(success, ctx, 'CUT_WIRE', { wireId: success.wires.correctWireId });
    success = apply(success, ctx, 'SUBMIT_CODE', { code: success.code.solution });
    expect(BombProtocolModule.resolve(success, 'completed')).toMatchObject({ success: true, resultSummary: { status: 'SUCCESS' } });
  });

  it('keeps solutions and Analyst fragments out of TV, Operator, other Analyst, and spectator views', () => {
    const { state } = make();
    const operator = BombProtocolModule.buildPlayerView(state, state.operatorId, 'CREW', { revealResults: false });
    const analystA = BombProtocolModule.buildPlayerView(state, state.analystIds[0]!, 'HACKER', { revealResults: false });
    const analystBClue = state.analystInstructions[state.analystIds[1]!]!.SYMBOLS[0];
    const tv = BombProtocolModule.buildTvView(state, { revealResults: false });
    const spectator = BombProtocolModule.buildSpectatorView(state, { revealResults: false });
    expect(JSON.stringify(operator)).not.toContain('instructionFragments');
    if (analystBClue) expect(JSON.stringify(analystA)).not.toContain(analystBClue);
    for (const view of [operator, analystA, tv, spectator]) {
      const json = JSON.stringify(view);
      expect(json).not.toContain('correctSequence');
      expect(json).not.toContain('correctWireId');
      expect(json).not.toContain('correctCode');
      expect(json).not.toContain('solution');
    }
    expect(JSON.stringify(tv)).not.toContain('instructionFragments');
    expect(JSON.stringify(spectator)).not.toContain('instructionFragments');
  });

  it('gives a Hacker Operator/Analyst exactly the same actions and information as a Crew one — sabotage is emergent through the role, never a special Hacker-only power (Final Gameplay Closure PART 3)', () => {
    const { state, ctx } = make();
    // validateAction/handleAction never look at role at all — only at "are you the assigned
    // Operator" — so a Hacker-Operator has access to precisely the same PRESS_SYMBOL/CUT_WIRE/
    // SUBMIT_CODE actions a Crew-Operator would, and can "sabotage" only by choosing a wrong one,
    // exactly as any honestly-mistaken Crew Operator could.
    const wrong = state.symbols.visible.find((id) => id !== state.symbols.solution[0])!;
    expect(BombProtocolModule.validateAction(state, state.operatorId, ctx, { symbolId: wrong }, 'PRESS_SYMBOL').valid).toBe(true);
    expect(apply(state, ctx, 'PRESS_SYMBOL', { symbolId: wrong }).strikes).toBe(1); // identical outcome regardless of who (or which role) pressed it

    // A Hacker-Analyst receives the exact same TRUE clue fragment a Crew-Analyst assigned that same
    // slot would receive — there is no alternate "sabotage instruction" content anywhere. The only
    // way a Hacker-Analyst can mislead the group is by verbally relaying something other than what
    // they were truthfully told; the server has no field or action that models or reveals this.
    const analystId = state.analystIds[0]!;
    const asCrew = BombProtocolModule.buildPlayerView(state, analystId, 'CREW', { revealResults: false });
    const asHacker = BombProtocolModule.buildPlayerView(state, analystId, 'HACKER', { revealResults: false });
    expect(asCrew).toEqual(asHacker); // buildPlayerView's `role` parameter has zero effect on Bomb Protocol's own output
    const operatorAsCrew = BombProtocolModule.buildPlayerView(state, state.operatorId, 'CREW', { revealResults: false });
    const operatorAsHacker = BombProtocolModule.buildPlayerView(state, state.operatorId, 'HACKER', { revealResults: false });
    expect(operatorAsCrew).toEqual(operatorAsHacker);
  });

  it('restores exact puzzle, roles, progress, strikes, and private fragments from JSON', () => {
    const { state, ctx } = make();
    const expected = state.symbols.solution[0]!;
    const progressed = apply(state, ctx, 'PRESS_SYMBOL', { symbolId: expected });
    const restored = JSON.parse(JSON.stringify(progressed)) as BombProtocolState;
    expect(restored).toEqual(progressed);
    expect(BombProtocolModule.handleDisconnect(restored, restored.operatorId)).toEqual(restored);
    const analyst = restored.analystIds[0]!;
    expect(BombProtocolModule.handleDisconnect(restored, analyst)).toEqual(restored);
    expect(BombProtocolModule.buildPlayerView(restored, analyst, 'CREW', { revealResults: false })).toMatchObject({
      instructionFragments: restored.analystInstructions[analyst]!.SYMBOLS,
    });
  });
});

describe('Bomb Protocol FSM integration', () => {
  it.each([[5, 3], [7, 4], [8, 5]])('scales %s room players to %s participants', (playerCount, expected) => {
    const { play } = reachSpecial(createTestDeps(750 + playerCount), playerCount);
    expect(play.room.currentSpecialRound?.participantIds).toHaveLength(expected);
  });

  it('keeps one phase/deadline across modules and rejects stale/unauthorized actions', () => {
    const deps = createTestDeps(773);
    const { setup, play } = reachSpecial(deps);
    let current = play;
    let state = current.room.currentSpecialRound!.moduleState as BombProtocolState;
    const phaseId = current.room.phase.phaseId;
    const startedAt = current.room.phase.phaseStartedAt;
    const analyst = state.analystIds[0]!;
    const denied = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId, playerId: analyst, seq: 1, actionId: 'analyst-press',
      actionType: 'PRESS_SYMBOL', data: { symbolId: state.symbols.solution[0]! },
    }, analyst, deps);
    expect(denied.rejected?.code).toBe('INVALID_ACTION');
    const spectator = setup.playerIds.find((id) => !state.participantIds.includes(id))!;
    const spectatorDenied = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId, playerId: spectator, seq: 1, actionId: 'spectator-press',
      actionType: 'PRESS_SYMBOL', data: { symbolId: state.symbols.solution[0]! },
    }, spectator, deps);
    expect(spectatorDenied.rejected?.code).toBe('NOT_PARTICIPANT');

    for (const symbolId of state.symbols.solution) {
      current = sendPlayer(current.room, current.priv, {
        type: 'player:submitAction', phaseId, playerId: state.operatorId,
        seq: (current.room.currentSpecialRound!.lastSeq[state.operatorId] ?? 0) + 1,
        actionId: `symbol-${symbolId}`, actionType: 'PRESS_SYMBOL', data: { symbolId },
      }, state.operatorId, deps);
    }
    state = current.room.currentSpecialRound!.moduleState as BombProtocolState;
    expect(state.currentModule).toBe('WIRES');
    expect(current.room.phase.phaseId).toBe(phaseId);
    expect(current.room.phase.phaseStartedAt).toBe(startedAt);
    expect(current.room.phase.durationMs).toBe(BOMB_PROTOCOL_DURATION_MS);
    expect(JSON.stringify(buildTvView(current.room))).not.toContain('correctWireId');
  });

  it('success records once and activates the existing Firewall integration', () => {
    const deps = createTestDeps(787);
    let { play: current } = reachSpecial(deps);
    let state = current.room.currentSpecialRound!.moduleState as BombProtocolState;
    let seq = 0;
    const send = (actionType: string, data: JsonValue) => {
      current = sendPlayer(current.room, current.priv, {
        type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId: state.operatorId,
        seq: ++seq, actionId: `solve-${seq}`, actionType, data,
      }, state.operatorId, deps);
      state = current.room.currentSpecialRound?.moduleState as BombProtocolState;
    };
    for (const symbolId of state.symbols.solution) send('PRESS_SYMBOL', { symbolId });
    send('CUT_WIRE', { wireId: state.wires.correctWireId });
    send('SUBMIT_CODE', { code: state.code.solution });
    expect(current.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    expect(current.room.specialRoundHistory.at(-1)?.success).toBe(true);
    const resolved = sendHost(current.room, current.priv, { type: 'host:advance', phaseId: current.room.phase.phaseId }, deps);
    expect(resolved.room.firewallActive).toBe(true);
    expect(resolved.room.matchLog.filter((entry) => entry.type === 'firewall_activated')).toHaveLength(1);
  });

  it('third strike fails and applies the configured 180-second countdown penalty exactly once', () => {
    const deps = createTestDeps(797);
    let { play: current } = reachSpecial(deps);
    const state = current.room.currentSpecialRound!.moduleState as BombProtocolState;
    const wrong = state.symbols.visible.find((id) => id !== state.symbols.solution[0])!;
    for (let seq = 1; seq <= 3; seq++) current = sendPlayer(current.room, current.priv, {
      type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId: state.operatorId,
      seq, actionId: `strike-${seq}`, actionType: 'PRESS_SYMBOL', data: { symbolId: wrong },
    }, state.operatorId, deps);
    expect(current.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    expect(current.room.specialRoundHistory.at(-1)?.success).toBe(false);
    expect(current.room.matchClock.status).toBe('paused'); // real match clock, paused for the whole special-game sequence
    const remainingBefore = current.room.matchClock.remainingMs;
    const resolved = sendHost(current.room, current.priv, { type: 'host:advance', phaseId: current.room.phase.phaseId }, deps);
    expect(resolved.room.matchClock.status).toBe('running');
    expect(resolved.room.matchClock.remainingMs).toBe(remainingBefore - 180_000);
    expect(resolved.room.matchClock.totalPenaltyMs).toBe(180_000);
    expect(resolved.room.matchLog.filter((entry) => entry.type === 'penalty_applied')).toHaveLength(1);
  });

  it('overall timeout fails once while preserving reconnect-safe views and deadline metadata', () => {
    const deps = createTestDeps(809);
    let { play } = reachSpecial(deps);
    const state = play.room.currentSpecialRound!.moduleState as BombProtocolState;
    const operatorView = buildPlayerView(play.room, play.priv, state.operatorId);
    expect(operatorView.phase.durationMs).toBe(BOMB_PROTOCOL_DURATION_MS);
    expect(operatorView.minigameView).toMatchObject({ specialRole: 'OPERATOR', currentModule: 'SYMBOLS', strikes: 0 });
    play = expireTimer(play.room, play.priv, deps);
    expect(play.room.phase.state).toBe('SPECIAL_GAME_RESULT');
    expect(play.room.specialRoundHistory.at(-1)).toMatchObject({ success: false, resultSummary: { status: 'FAILURE' } });
  });
});
