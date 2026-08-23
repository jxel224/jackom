import { describe, expect, it } from 'vitest';
import { createTestDeps } from './helpers/test-deps.js';
import { buildRepos } from './helpers/persistence.js';
import { RoomActor } from '../src/actors/room-actor.js';
import { createDefaultConfig } from '../src/config/defaults.js';
import { buildTvView } from '../src/views/build-tv-view.js';
import { buildPlayerView } from '../src/views/build-player-view.js';
import type { EventSender, InboundEvent } from '../src/shared.js';

/**
 * Core Logic Phase 1.1 §7 — a full INTEGRATION-level negative security test: a real match, driven
 * through a real `RoomActor` (persist/reload via the same `KeyValueStore` interface Redis
 * implements — `InMemoryKeyValueStore` is a faithful implementation of that interface, not a mock
 * of the FSM or view builders), through the real hack window, built through the REAL
 * `buildTvView`/`buildPlayerView` functions this codebase ships. hack-window.test.ts already
 * covers this at the pure-FSM level in depth; this file exists specifically to prove the same
 * guarantee survives the actor's persist-and-reload boundary, not just direct function calls.
 */

function makeActor(deps: ReturnType<typeof createTestDeps>, repos: ReturnType<typeof buildRepos>, roomId: string): RoomActor {
  return new RoomActor(roomId, {
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
    ttlSeconds: 3600,
  });
}

async function dispatch(actor: RoomActor, event: InboundEvent, sender: EventSender) {
  const result = await actor.dispatch(event, sender);
  if (result.rejected) throw new Error(`unexpected rejection: ${JSON.stringify(result.rejected)} for ${event.type}`);
  return result;
}

describe('Hack secrecy — full integration test through a real RoomActor and the real view builders', () => {
  it('starts a real match, enters the hack window, accepts a real targeted hack, and verifies every viewer sees only what they are allowed to', async () => {
    const deps = createTestDeps(601);
    const repos = buildRepos(deps);
    const config = createDefaultConfig({ minigameSelection: { minigameSelectionRuleId: 'rank-it-only' } });

    // 1. Start a real match — create the room, join 7 players, all through the real create/join path.
    const { createRoom, joinPlayer } = await import('../src/fsm/room-lifecycle.js');
    let created = createRoom(config, deps);
    const playerIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const res = joinPlayer(created.room, created.priv, { name: `Player${i}`, avatarId: `a${i}` }, deps);
      if (!res.playerId) throw new Error('join failed');
      created = { room: res.room, priv: res.priv, hostSessionToken: created.hostSessionToken };
      playerIds.push(res.playerId);
    }
    await repos.roomStateRepo.save(created.room, 3600);
    await repos.roomPrivateStateRepo.save(created.priv, 3600);

    const actor = makeActor(deps, repos, created.room.roomId);
    await dispatch(actor, { type: 'host:startGame', phaseId: created.room.phase.phaseId }, { kind: 'host' });

    let snapshot = actor.getSnapshot()!;
    for (const playerId of playerIds) {
      await dispatch(actor, { type: 'player:acknowledgeReveal', phaseId: snapshot.room.phase.phaseId, playerId }, { kind: 'player', playerId });
      snapshot = actor.getSnapshot()!;
    }
    // GAME_INTRO -> MINIGAME_SELECT (match clock starts)
    await dispatch(actor, { type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' });

    snapshot = actor.getSnapshot()!;
    const adminId = snapshot.room.adminId!;
    expect(adminId).toBeTruthy();
    const hackerIds = Object.values(snapshot.priv.players).filter((p) => p.role === 'HACKER').map((p) => p.playerId);
    const crewIds = Object.values(snapshot.priv.players).filter((p) => p.role === 'CREW').map((p) => p.playerId);
    expect(hackerIds.length).toBeGreaterThanOrEqual(1); // 7p -> exactly 2 by the role-balance formula, but >=1 is all this needs
    expect(crewIds.length).toBeGreaterThanOrEqual(2);

    const hackerA = hackerIds[0]!;
    const hackerB = hackerIds[1]; // may be undefined at some configs — handled explicitly below, not silently skipped
    const crewTarget = crewIds[0]!;
    const unrelatedCrew = crewIds[1]!;
    const participantIds = [adminId, hackerA, crewTarget, unrelatedCrew, ...(hackerB ? [hackerB] : [])].filter((id, i, arr) => arr.indexOf(id) === i);

    // 2. Admin makes a real, server-validated selection.
    await dispatch(
      actor,
      { type: 'player:adminSelectMinigame', phaseId: actor.getSnapshot()!.room.phase.phaseId, playerId: adminId, minigameId: 'RANK_IT', participantIds },
      { kind: 'player', playerId: adminId },
    );
    expect(actor.getSnapshot()!.room.phase.state).toBe('HACKER_CORRUPTION');

    // 3. Hacker A successfully targets the Crew participant — the real hack action, through the real actor.
    const beforeHack = actor.getSnapshot()!.room.phase.phaseId;
    await dispatch(
      actor,
      { type: 'player:submitHack', phaseId: beforeHack, playerId: hackerA, targetPlayerId: crewTarget },
      { kind: 'player', playerId: hackerA },
    );
    expect(actor.getSnapshot()!.room.currentRound?.hackedPlayerIds).toEqual([crewTarget]);
    expect(actor.getSnapshot()!.priv.hacksRemaining[hackerA]).toBe(1);

    // Advance through the hack window's own timeout, into MINIGAME_INSTRUCTIONS -> MINIGAME_PLAY,
    // so the module has actually started (moduleState populated) and there's something to build a
    // real minigameView from — the scenario an actual client would observe mid-round.
    await dispatch(actor, { type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' });
    await dispatch(actor, { type: 'timer:expired', phaseId: actor.getSnapshot()!.room.phase.phaseId }, { kind: 'host' });
    expect(actor.getSnapshot()!.room.phase.state).toBe('MINIGAME_PLAY');

    // Reload from the persistence layer (the SAME KeyValueStore interface a real Redis-backed
    // deployment uses) to prove the guarantee survives the actor's persist/reload boundary, not
    // just an in-memory reference that happens to never have been serialized.
    const reloadedRoom = await repos.roomStateRepo.load(created.room.roomId);
    const reloadedPriv = await repos.roomPrivateStateRepo.load(created.room.roomId);
    expect(reloadedRoom).not.toBeNull();
    expect(reloadedPriv).not.toBeNull();
    expect(reloadedRoom!.currentRound?.hackedPlayerIds).toEqual([crewTarget]); // internal, server-only — fine to be present here

    // 4. Build every viewer's REAL payload through the REAL view builders, off the reloaded state.
    const tvPayload = buildTvView(reloadedRoom!);
    const targetedCrewPayload = buildPlayerView(reloadedRoom!, reloadedPriv!, crewTarget);
    const unrelatedCrewPayload = buildPlayerView(reloadedRoom!, reloadedPriv!, unrelatedCrew);
    const hackerAPayload = buildPlayerView(reloadedRoom!, reloadedPriv!, hackerA);
    const hackerBPayload = hackerB ? buildPlayerView(reloadedRoom!, reloadedPriv!, hackerB) : null;

    // 5. Explicitly verify each viewer receives only allowed information.
    for (const [label, payload] of [
      ['TV', tvPayload],
      ['targeted Crew', targetedCrewPayload],
      ['unrelated Crew', unrelatedCrewPayload],
      ['Hacker A', hackerAPayload],
      ...(hackerBPayload ? [['Hacker B', hackerBPayload] as const] : []),
    ] as const) {
      const json = JSON.stringify(payload);
      expect(json, `${label} payload must never contain "hackedPlayerIds"`).not.toContain('hackedPlayerIds');
      expect(json, `${label} payload must never contain "hackerActionsUsed"`).not.toContain('hackerActionsUsed');
      expect(json, `${label} payload must never contain a raw role`).not.toContain('"role"');
      expect(json, `${label} payload must never contain the literal string HACKER`).not.toContain('HACKER');
    }

    // TV-specific: no hacksRemaining field anywhere, no per-player role/hack info at all.
    expect('hackerInfo' in tvPayload).toBe(false);
    expect(JSON.stringify(tvPayload)).not.toContain('hacksRemaining');

    // Crew-specific (both targeted and unrelated): hackerInfo must be null.
    expect(targetedCrewPayload.hackerInfo).toBeNull();
    expect(unrelatedCrewPayload.hackerInfo).toBeNull();

    // Hacker A: sees their OWN hacksRemaining (1, since they just spent one) and nothing about B.
    expect(hackerAPayload.hackerInfo?.hacksRemaining).toBe(1);
    if (hackerBPayload) {
      // Hacker B (who did not act) still has both charges, and Hacker A's payload must not mention it.
      expect(hackerBPayload.hackerInfo?.hacksRemaining).toBe(2);
      expect(JSON.stringify(hackerAPayload)).not.toContain('"hacksRemaining":2');
    }

    // The hack's actual gameplay effect (RANK_IT/prompt-pair modules: the hacked player receives
    // the "hacker variant" prompt text instead of their normal "crew variant") must be observable
    // ONLY as a content difference — never accompanied by any field revealing WHY the content
    // differs. crewTarget (hacked) must receive different prompt text than unrelatedCrew (not
    // hacked, same CREW role), while neither payload exposes hack/role metadata (already asserted
    // above via the blanket "hackedPlayerIds"/"hackerActionsUsed"/"role"/"HACKER" checks).
    const crewTargetPrompt = JSON.stringify((targetedCrewPayload.minigameView as { prompt?: unknown })?.prompt ?? null);
    const unrelatedCrewPrompt = JSON.stringify((unrelatedCrewPayload.minigameView as { prompt?: unknown })?.prompt ?? null);
    expect(crewTargetPrompt).not.toBe('null'); // the targeted Crew participant does have a prompt assigned
    expect(crewTargetPrompt).not.toBe(unrelatedCrewPrompt); // the hack visibly altered content for its target only
  });
});
