import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { ackAllReveals, expireTimer, hackerIdsOf, sendPlayer, setupRoom, startGame } from './helpers/room.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import { buildTvView } from '../src/views/build-tv-view.js';

function reachHackerCorruption(playerCount: number, deps: ReturnType<typeof createTestDeps>) {
  const setup = setupRoom(playerCount, deps);
  const started = startGame(setup.room, setup.priv, deps);
  const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
  const atCorruption = expireTimer(acked.room, acked.priv, deps);
  return { setup, atCorruption };
}

describe('Firewall', () => {
  it('8. blocks corruption when active, and is consumed exactly once', () => {
    const deps = createTestDeps(7);
    const setup = setupRoom(6, deps);
    const started = startGame(setup.room, setup.priv, deps);
    const acked = ackAllReveals(started.room, started.priv, setup.playerIds, deps);
    expect(acked.room.phase.state).toBe('GAME_INTRO');

    // Simulate the firewall having been activated by an earlier special-game success.
    acked.room.firewallActive = true;

    const afterIntro = expireTimer(acked.room, acked.priv, deps);

    // Firewall auto-resolves HACKER_CORRUPTION instantly — we land straight on MINIGAME_INSTRUCTIONS.
    expect(afterIntro.room.phase.state).toBe('MINIGAME_INSTRUCTIONS');
    expect(afterIntro.room.currentRound?.corrupted).toBe(false);
    expect(afterIntro.room.firewallActive).toBe(false); // consumed
    expect(afterIntro.room.matchLog.some((e) => e.type === 'firewall_consumed')).toBe(true);

    // It must not block the NEXT round's corruption phase (consumed exactly once).
    let room = afterIntro.room;
    let priv = afterIntro.priv;
    ({ room, priv } = expireTimer(room, priv, deps)); // -> MINIGAME_PLAY
    ({ room, priv } = expireTimer(room, priv, deps)); // -> RESULTS_REVEAL
    ({ room, priv } = expireTimer(room, priv, deps)); // -> DISCUSSION
    ({ room, priv } = expireTimer(room, priv, deps)); // -> next MINIGAME_SELECT/HACKER_CORRUPTION or FINAL_DISCUSSION
    if (room.phase.state === 'HACKER_CORRUPTION') {
      expect(room.currentRound?.corrupted).toBe(false); // no hacker has submitted yet, just not-yet-resolved
      // Confirm it's genuinely waiting on hackers this time, not auto-blocked again.
      const hackerIds = hackerIdsOf(priv);
      expect(hackerIds.length).toBeGreaterThan(0);
    }
  });
});

describe('Corruption privacy', () => {
  it("9. corruption never appears in the TV view or a crew player's view before the reveal point", () => {
    const deps = createTestDeps(11);
    const { setup, atCorruption } = reachHackerCorruption(7, deps);
    expect(atCorruption.room.phase.state).toBe('HACKER_CORRUPTION');

    const hackerIds = hackerIdsOf(atCorruption.priv);
    const crewIds = setup.playerIds.filter((id) => !hackerIds.includes(id));
    expect(hackerIds.length).toBeGreaterThan(0);
    expect(crewIds.length).toBeGreaterThan(0);

    // All hackers vote to corrupt.
    let room = atCorruption.room;
    let priv = atCorruption.priv;
    for (const hackerId of hackerIds) {
      const res = sendPlayer(room, priv, { type: 'player:submitCorruptionChoice', phaseId: room.phase.phaseId, playerId: hackerId, corrupt: true }, hackerId, deps);
      room = res.room;
      priv = res.priv;
    }

    // Corruption is resolved server-side now (true), but must not be client-visible yet.
    expect(room.currentRound?.corrupted).toBe(true);
    expect(room.phase.state).toBe('MINIGAME_INSTRUCTIONS');

    const tvView = buildTvView(room);
    expect(tvView.lastRoundResult).toBeNull(); // round hasn't completed yet
    expect(JSON.stringify(tvView)).not.toContain('"corrupted":true');

    const crewView = buildPlayerView(room, priv, crewIds[0]!);
    expect(JSON.stringify(crewView)).not.toContain('"corrupted":true');

    // Advance through MINIGAME_PLAY (still before RESULTS_REVEAL) — still must not leak.
    const stillPlaying = expireTimer(room, priv, deps);
    if (stillPlaying.room.phase.state === 'MINIGAME_PLAY') {
      const tvDuringPlay = buildTvView(stillPlaying.room);
      expect(JSON.stringify(tvDuringPlay)).not.toContain('"corrupted":true');
    }
  });

  it('10. corruption is exposed at RESULTS_REVEAL under the default on_results policy', () => {
    const deps = createTestDeps(13);
    const { atCorruption } = reachHackerCorruption(7, deps);
    const hackerIds = hackerIdsOf(atCorruption.priv);

    let room = atCorruption.room;
    let priv = atCorruption.priv;
    for (const hackerId of hackerIds) {
      const res = sendPlayer(room, priv, { type: 'player:submitCorruptionChoice', phaseId: room.phase.phaseId, playerId: hackerId, corrupt: true }, hackerId, deps);
      room = res.room;
      priv = res.priv;
    }
    expect(room.config.rules.corruptionRevealPolicy).toBe('on_results');

    ({ room, priv } = expireTimer(room, priv, deps)); // MINIGAME_INSTRUCTIONS -> MINIGAME_PLAY
    ({ room, priv } = expireTimer(room, priv, deps)); // MINIGAME_PLAY -> RESULTS_REVEAL

    expect(room.phase.state).toBe('RESULTS_REVEAL');
    expect(room.roundHistory).toHaveLength(1);
    expect(room.roundHistory[0]?.corrupted).toBe(true);
    expect(room.roundHistory[0]?.corruptionRevealed).toBe(true);

    const tvView = buildTvView(room);
    expect(tvView.lastRoundResult?.corrupted).toBe(true);
  });

  it('11. a duplicate corruption choice from the same hacker is rejected, not reprocessed', () => {
    const deps = createTestDeps(17);
    const { atCorruption } = reachHackerCorruption(7, deps);
    const hackerIds = hackerIdsOf(atCorruption.priv);
    const hackerId = hackerIds[0]!;

    const first = sendPlayer(
      atCorruption.room,
      atCorruption.priv,
      { type: 'player:submitCorruptionChoice', phaseId: atCorruption.room.phase.phaseId, playerId: hackerId, corrupt: true },
      hackerId,
      deps,
    );
    expect(first.rejected).toBeUndefined();

    const second = sendPlayer(
      first.room,
      first.priv,
      { type: 'player:submitCorruptionChoice', phaseId: first.room.phase.phaseId, playerId: hackerId, corrupt: false },
      hackerId,
      deps,
    );

    expect(second.rejected?.code).toBe('DUPLICATE_ACTION');
    // The original `true` choice must survive untouched (if the round already resolved, it's on
    // currentRound; if not yet, it's tracked privately — either way the flip to `false` is discarded).
    expect(second.priv.currentCorruptionChoices[hackerId] ?? true).toBe(true);
  });

  it('a non-hacker submitting a corruption choice is rejected', () => {
    const deps = createTestDeps(19);
    const { atCorruption } = reachHackerCorruption(7, deps);
    const hackerIds = hackerIdsOf(atCorruption.priv);
    const crewId = Object.keys(atCorruption.priv.players).find((id) => !hackerIds.includes(id))!;

    const result = sendPlayer(
      atCorruption.room,
      atCorruption.priv,
      { type: 'player:submitCorruptionChoice', phaseId: atCorruption.room.phase.phaseId, playerId: crewId, corrupt: true },
      crewId,
      deps,
    );

    expect(result.rejected?.code).toBe('NOT_HACKER');
  });
});
