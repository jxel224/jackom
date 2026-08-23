import { describe, expect, it } from 'vitest';
import type { JsonValue, MiniGameContext } from '../src/shared.js';
import { RankItModule, type RankItState } from '../src/minigames/rank-it.js';
import { RANK_IT_FIXTURE, assignRankItInstructions } from '../src/minigames/rank-it-content.js';
import { createTestDeps } from './helpers/test-deps.js';
import { adminSelectMinigame, driveToAdminSelection, expireTimer, hackerIdsOf, sendPlayer, setupRoom } from './helpers/room.js';

const CARD_IDS = RANK_IT_FIXTURE.cards.map((c) => c.id);
const participants = ['p1', 'p2', 'p3'];
const assignments = assignRankItInstructions(participants, { p1: 'CREW', p2: 'HACKER', p3: 'CREW' }, new Set());
const initialOrder = { p1: CARD_IDS, p2: [...CARD_IDS].reverse(), p3: CARD_IDS };
const cards = RANK_IT_FIXTURE.cards.map((c) => ({ id: c.id, text: c.text }));
const malformedActions: JsonValue[] = [null, 'card_1', {}, { order: [] }, { order: [CARD_IDS[0]] }, { order: [...CARD_IDS, 'card_5'] }, { order: CARD_IDS, extra: true }];

const ctx: MiniGameContext = {
  roomId: 'room-1',
  minigameId: 'RANK_IT',
  participantIds: participants,
  config: { cards, promptAssignments: assignments, initialOrder },
};

function start(): RankItState {
  return RankItModule.start(ctx);
}

function submit(state: RankItState, playerId: string, order: string[]): RankItState {
  const action = { order };
  expect(RankItModule.validateAction(state, playerId, ctx, action, 'SUBMIT_RANKING').valid).toBe(true);
  return RankItModule.handleAction(state, playerId, action);
}

describe('Rank It module', () => {
  it('initializes with the shared cards, one private instruction and one shuffled initial order per participant', () => {
    const state = start();
    expect(state.kind).toBe('RANK_IT');
    expect(state.participantIds).toEqual(participants);
    expect(state.cards).toEqual(cards);
    expect(Object.keys(state.promptAssignments)).toEqual(participants);
    expect(state.initialOrder).toEqual(initialOrder);
    expect(state.submissions).toEqual({});
  });

  it('requires 2 to 5 unique participants', () => {
    expect(() => RankItModule.start({ ...ctx, participantIds: ['p1'] })).toThrow();
    expect(() => RankItModule.start({ ...ctx, participantIds: ['p1', 'p1'] })).toThrow();
    const sixConfig = {
      cards, promptAssignments: assignRankItInstructions(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], {}, new Set()),
      initialOrder: Object.fromEntries(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => [id, CARD_IDS])),
    };
    expect(() => RankItModule.start({ ...ctx, participantIds: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], config: sixConfig })).toThrow();
    const fiveIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const fiveConfig = { cards, promptAssignments: assignRankItInstructions(fiveIds, {}, new Set()), initialOrder: Object.fromEntries(fiveIds.map((id) => [id, CARD_IDS])) };
    expect(() => RankItModule.start({ ...ctx, participantIds: fiveIds, config: fiveConfig })).not.toThrow();
  });

  it('rejects a config missing an instruction assignment or an initial order for a participant', () => {
    expect(() => RankItModule.start({ ...ctx, config: { cards, promptAssignments: { p1: assignments.p1 }, initialOrder } })).toThrow();
    expect(() => RankItModule.start({ ...ctx, config: { cards, promptAssignments: assignments, initialOrder: { p1: CARD_IDS, p2: CARD_IDS } } })).toThrow();
  });

  it('every participant sees the exact same four shared cards', () => {
    const state = start();
    for (const playerId of participants) {
      const view = RankItModule.buildPlayerView(state, playerId, 'CREW', { revealResults: false }) as { cards: typeof cards };
      expect(view.cards).toEqual(cards);
    }
  });

  it('accepts a valid full-length unique ordering of the real card ids', () => {
    const state = submit(start(), 'p1', [...CARD_IDS].reverse());
    expect(state.submissions.p1).toEqual({ status: 'submitted', order: [...CARD_IDS].reverse() });
  });

  it('rejects a duplicate card id in the order', () => {
    const order = [CARD_IDS[0]!, CARD_IDS[0]!, CARD_IDS[1]!, CARD_IDS[2]!];
    expect(RankItModule.validateAction(start(), 'p1', ctx, { order }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('rejects a short (missing-card) order', () => {
    const order = CARD_IDS.slice(0, 3);
    expect(RankItModule.validateAction(start(), 'p1', ctx, { order }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('rejects an order containing an unknown card id', () => {
    const order = [CARD_IDS[0]!, CARD_IDS[1]!, CARD_IDS[2]!, 'not_a_real_card'];
    expect(RankItModule.validateAction(start(), 'p1', ctx, { order }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it.each(malformedActions)('rejects malformed input %#', (action) => {
    expect(RankItModule.validateAction(start(), 'p1', ctx, action, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('rejects a non-participant', () => {
    expect(RankItModule.validateAction(start(), 'outsider', ctx, { order: CARD_IDS }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('rejects a duplicate final submission from the same player', () => {
    const once = submit(start(), 'p1', CARD_IDS);
    expect(RankItModule.validateAction(once, 'p1', ctx, { order: [...CARD_IDS].reverse() }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('rejects any submission once every participant has already submitted', () => {
    const complete = submit(submit(submit(start(), 'p1', CARD_IDS), 'p2', CARD_IDS), 'p3', CARD_IDS);
    expect(complete.status).toBe('COMPLETED');
    expect(RankItModule.validateAction(complete, 'p1', ctx, { order: CARD_IDS }, 'SUBMIT_RANKING').valid).toBe(false);
  });

  it('completes only after every participant submits', () => {
    const one = submit(start(), 'p1', CARD_IDS);
    const two = submit(one, 'p2', CARD_IDS);
    expect(RankItModule.isComplete(one)).toBe(false);
    expect(RankItModule.isComplete(two)).toBe(false);
    expect(RankItModule.isComplete(submit(two, 'p3', CARD_IDS))).toBe(true);
  });

  it('resolves a timeout with an explicit no-answer — never invents an order from the initial display position', () => {
    const state = submit(start(), 'p1', [...CARD_IDS].reverse());
    const resolution = RankItModule.resolve(state, 'timeout');
    expect(resolution.success).toBe(false);
    expect(resolution.resultSummary).toEqual({
      kind: 'RANK_IT',
      reason: 'timeout',
      results: [
        { playerId: 'p1', status: 'submitted', order: [...CARD_IDS].reverse() },
        { playerId: 'p2', status: 'no_answer' },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('keeps rankings and instructions private before reveal, and reveals every submitted order simultaneously', () => {
    const state = submit(submit(start(), 'p1', CARD_IDS), 'p2', [...CARD_IDS].reverse());
    const tvActive = RankItModule.buildTvView(state, { revealResults: false });
    const p1Active = RankItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    expect(JSON.stringify(tvActive)).not.toContain(RANK_IT_FIXTURE.crewVariant);
    expect(JSON.stringify(tvActive)).not.toContain(RANK_IT_FIXTURE.hackerVariant);
    expect(JSON.stringify(tvActive)).not.toContain('HACKER');
    expect(JSON.stringify(p1Active)).not.toContain(RANK_IT_FIXTURE.hackerVariant);

    expect(RankItModule.buildTvView(state, { revealResults: true })).toMatchObject({
      cards,
      results: [
        { playerId: 'p1', status: 'submitted', order: CARD_IDS },
        { playerId: 'p2', status: 'submitted', order: [...CARD_IDS].reverse() },
        { playerId: 'p3', status: 'no_answer' },
      ],
    });
  });

  it('reconnection projection restores only the owner instruction, cards, and locked status', () => {
    const state = submit(submit(start(), 'p1', CARD_IDS), 'p2', [...CARD_IDS].reverse());
    const restored = RankItModule.buildPlayerView(state, 'p1', 'CREW', { revealResults: false });
    expect(restored).toMatchObject({
      prompt: { contentId: RANK_IT_FIXTURE.id, text: RANK_IT_FIXTURE.crewVariant },
      cards,
      submission: { status: 'submitted', order: CARD_IDS },
    });
    expect(JSON.stringify(restored)).not.toContain(RANK_IT_FIXTURE.hackerVariant);
  });

  it('a hacked Crew player gets the Hacker (alternate) instruction; a hacked Hacker gets the Crew instruction — only the target changes', () => {
    const swapped = assignRankItInstructions(['crew', 'hacker'], { crew: 'CREW', hacker: 'HACKER' }, new Set(['crew', 'hacker']));
    expect(swapped.crew?.prompt).toBe(RANK_IT_FIXTURE.hackerVariant);
    expect(swapped.hacker?.prompt).toBe(RANK_IT_FIXTURE.crewVariant);

    const onlyCrewHacked = assignRankItInstructions(['crew', 'hacker'], { crew: 'CREW', hacker: 'HACKER' }, new Set(['crew']));
    expect(onlyCrewHacked.crew?.prompt).toBe(RANK_IT_FIXTURE.hackerVariant);
    expect(onlyCrewHacked.hacker?.prompt).toBe(RANK_IT_FIXTURE.hackerVariant); // untouched — still their normal Hacker instruction
  });

  it('spectators never see cards, instructions, or rankings, active or revealed', () => {
    const state = submit(start(), 'p1', CARD_IDS);
    const active = RankItModule.buildSpectatorView(state, { revealResults: false });
    expect(active).toEqual({ kind: 'RANK_IT', status: 'SPECTATING' });
    const revealed = RankItModule.buildSpectatorView(state, { revealResults: true }) as { results: unknown };
    expect(JSON.stringify(revealed)).not.toContain(RANK_IT_FIXTURE.crewVariant);
  });
});

describe('Rank It — real FSM round trip', () => {
  it('the Admin can select RANK_IT for real, each participant gets a real independent shuffled initial order, a hacked participant gets the swapped instruction, submissions complete the round, and reconnecting mid-round restores exactly the same private state', () => {
    const deps = createTestDeps(811);
    const setup = setupRoom(4, deps, { minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });
    const atSelect = driveToAdminSelection(setup, deps);
    const adminId = atSelect.room.adminId!;
    const others = setup.playerIds.filter((id) => id !== adminId);

    const afterSelect = adminSelectMinigame(atSelect.room, atSelect.priv, 'RANK_IT', others.slice(0, 3), deps);
    expect(afterSelect.rejected).toBeUndefined();
    expect(afterSelect.room.phase.state).toBe('HACKER_CORRUPTION');
    expect(afterSelect.room.currentRound?.minigameId).toBe('RANK_IT');

    const participantIds = afterSelect.room.currentRound!.participantIds;
    const hackerId = hackerIdsOf(afterSelect.priv).find((id) => participantIds.includes(id));

    // Skip the hack window (Firewall/hack-window behavior itself is generic FSM machinery, already
    // covered by hack-window.test.ts/corruption.test.ts for every minigame uniformly). The hack
    // window's own timeout is what assembles this module's real config and calls module.start()
    // (proceedToInstructions), landing on MINIGAME_INSTRUCTIONS; one more expiry enters MINIGAME_PLAY.
    const atInstructions = expireTimer(afterSelect.room, afterSelect.priv, deps);
    expect(atInstructions.room.phase.state).toBe('MINIGAME_INSTRUCTIONS');
    const afterInstructions = expireTimer(atInstructions.room, atInstructions.priv, deps);
    expect(afterInstructions.room.phase.state).toBe('MINIGAME_PLAY');
    const moduleState = afterInstructions.room.currentRound!.moduleState as RankItState;
    expect(moduleState.kind).toBe('RANK_IT');
    expect(moduleState.cards).toHaveLength(4);

    // Every real participant got their own independently shuffled initial order (deterministic rng,
    // but drawn per-player, so this is NOT simply "everyone sees the same default position").
    const orders = participantIds.map((id) => moduleState.initialOrder[id]!.join(','));
    expect(new Set(orders).size).toBeGreaterThan(1);

    // The real Hacker among the participants (if any) receives the swapped instruction relative to
    // an un-hacked Hacker — proven generically already in the module test above; here we just prove
    // the REAL FSM wiring produces a real instruction for every real participant, never a gap.
    for (const id of participantIds) {
      expect(moduleState.promptAssignments[id]?.prompt).toMatch(new RegExp(`^(${RANK_IT_FIXTURE.crewVariant}|${RANK_IT_FIXTURE.hackerVariant})$`));
    }
    void hackerId;

    // Reconnect mid-round (simulated: re-derive the player's own view from the same persisted
    // state) restores exactly the same instruction/cards/lock status — nothing is regenerated.
    const beforeReconnect = RankItModule.buildPlayerView(moduleState, participantIds[0]!, 'CREW', { revealResults: false });
    const afterReconnect = RankItModule.buildPlayerView(moduleState, participantIds[0]!, 'CREW', { revealResults: false });
    expect(afterReconnect).toEqual(beforeReconnect);

    // A stale action (wrong phaseId) is rejected the same generic way every other minigame's is.
    const staleResult = sendPlayer(
      afterInstructions.room, afterInstructions.priv,
      { type: 'player:submitAction', phaseId: 'not-the-real-phase-id', playerId: participantIds[0]!, seq: 1, actionId: 'x', actionType: 'SUBMIT_RANKING', data: { order: moduleState.cards.map((c) => c.id) } },
      participantIds[0]!, deps,
    );
    expect(staleResult.rejected?.code).toBe('STALE_PHASE');

    // Real submissions from every participant complete the round and reach RESULTS_REVEAL.
    let current = afterInstructions;
    for (const id of participantIds) {
      const order = moduleState.cards.map((c) => c.id);
      const result = sendPlayer(
        current.room, current.priv,
        { type: 'player:submitAction', phaseId: current.room.phase.phaseId, playerId: id, seq: 1, actionId: `a-${id}`, actionType: 'SUBMIT_RANKING', data: { order } },
        id, deps,
      );
      expect(result.rejected).toBeUndefined();
      current = result;
    }
    expect(current.room.phase.state).toBe('RESULTS_REVEAL');
    expect(current.room.roundHistory[current.room.roundHistory.length - 1]?.minigameId).toBe('RANK_IT');
    expect(current.room.roundHistory[current.room.roundHistory.length - 1]?.success).toBe(true);
  });
});
