# Implementation Progress — Development Steps 1 & 2

Status: **Step 1 (shared types) and Step 2 (in-memory FSM core) are complete.** No Redis, PostgreSQL/Prisma, WebSockets, Next.js, authentication, AWS, or real mini-game/special-game mechanics were implemented, per scope.

> **Note on project location:** the user's C: drive had 0 bytes free when this work started (confirmed via `df -h`), which blocked directory creation at the original path (`C:\Users\PC\Downloads\fdd\barqsec\jackom`). With the user's approval, the implementation was built at **`D:\projects\jackom`** instead (D: has ~319GB free). `ARCHITECTURE.md` has been kept in sync at both locations. The code itself (packages/, apps/) only exists on D: — C: still has essentially no free space (~11MB at last check) and cannot hold it.

---

## Files created

```
D:\projects\jackom\
  package.json                       # root scripts: typecheck, test, test:watch
  tsconfig.base.json                 # shared strict compiler options
  vitest.config.ts
  ARCHITECTURE.md                    # Revision 3 (one fix from this pass, see below)
  IMPLEMENTATION_PROGRESS.md          # this file

  packages/shared-types/
    package.json
    tsconfig.json
    src/
      json.ts                        # JsonValue
      enums.ts                       # GameState, Role, ConnectionStatus, Winner, TieBreakRule,
                                      # CorruptionRevealPolicy, SpecialGameInsertionPoint, MatchClockMode
      config.ts                      # RoleBalanceConfig, SpecialGameSchedulerConfig, MinigameSelectionConfig,
                                      # CorruptionConfig, EliminatedPlayerPolicy, MatchRulesConfig, RoomConfig
      players.ts                     # PlayerPublic, PublicPlayerSummary
      phase.ts                       # PhaseInfo
      match-clock.ts                 # MatchClock, MatchLogEntry
      round-state.ts                 # CurrentRoundState, CurrentSpecialRoundState, CurrentVoteState
      history.ts                     # RoundRecord, SpecialRoundRecord, VoteRecord
      views.ts                       # TvView, PlayerView, PrivatePlayerPayload, PublicPlayerSummary, LastRoundResultSummary
      minigame.ts                    # MiniGameContext, MiniGameActionValidation, MiniGameResolution,
                                      # MiniGameInstructions, MiniGameModule
      events.ts                      # InboundEvent union, EventSender, RejectionCode, ActionRejectedMessage,
                                      # CorruptionAckMessage
      index.ts                       # barrel export

  apps/server/
    tsconfig.json
    src/
      shared.ts                      # single re-export point for the shared-types package
      index.ts                       # barrel export of the server package's public surface
      types/
        deps.ts                      # Deps (now/rng/generateId) — deterministic-injection boundary
        sessions.ts                  # HostSession, PlayerPrivate (server-only)
        room-state.ts                # RoomState, RoomPrivateState (server-only)
      selectors/
        players.ts                   # getAllPlayers / getAlivePlayers / getConnectedPlayers /
                                      # getEligibleMinigamePlayers / getEligibleSpecialGamePool / getEligibleVoters
      rules/
        registries.ts                # roleBalanceRegistry, specialGameScheduleRegistry,
                                      # specialGameParticipantRegistry, minigameSelectionRegistry,
                                      # corruptionAggregationRegistry — all placeholder rule bodies
      minigames/
        generic-minigame.ts          # GenericMinigameModule (regular placeholder)
        generic-special-game.ts      # GenericSpecialGameModule (special-game placeholder)
        registry.ts                  # minigameRegistry, getMinigameModule, getSpecialGameModule
      voting/
        tally.ts                     # tally() — counts votes, applies tieBreakRule (no_elimination/random/revote)
      views/
        view-utils.ts                # toPublicSummary, lastRoundResultFor (shared by both view builders)
        build-tv-view.ts              # buildTvView(room) -> TvView
        build-player-view.ts          # buildPlayerView(room, priv, playerId) -> PlayerView
        build-private-player-view.ts  # buildPrivatePlayerView(priv, playerId) -> PrivatePlayerPayload | null
      config/
        defaults.ts                  # createDefaultConfig()
      fsm/
        result.ts                    # HandleEventResult, ok(), rejected()
        guards.ts                    # isStalePhase, checkSenderMatchesEvent, isHacker, getHackerIds,
                                      # isEligibleVoter, hasSubmittedThisPhase, recordSubmission
        random.ts                    # shuffle/randomSubset/randomChoice — all rng-injected, no Math.random()
        durations.ts                 # durationFor(state, room) — phase timer metadata
        match-clock.ts                # initMatchClock()
        win-condition.ts              # checkWinCondition()
        default-deps.ts               # createDefaultDeps() — the ONLY file allowed to touch Math.random()/Date.now()
        room-lifecycle.ts             # createRoom, joinPlayer, leavePlayer, setPlayerProfile, kickPlayer
        transitions.ts                # transition(), autoAdvance(), resolveAfterRoundOrSpecial(),
                                       # every per-state handler, handleEvent() entry point
    test/
      helpers/
        test-deps.ts                 # deterministic Deps (fake clock, seeded xorshift32 rng, incrementing ids)
        room.ts                      # setupRoom, startGame, ackAllReveals, expireTimer, driveToVoting, etc.
      room-lifecycle.test.ts         # tests 1, 2, 3, 4, 23
      roles.test.ts                  # tests 5, 6
      minigame-select.test.ts        # test 7
      corruption.test.ts             # tests 8, 9, 10, 11 (+ a non-hacker rejection case)
      minigame-play.test.ts          # tests 12, 13, 14, 15 (+ a non-participant rejection case)
      special-game.test.ts           # tests 16, 17, 18
      eligibility.test.ts            # test 19
      voting.test.ts                 # tests 20, 21 (+ ineligible-voter and host:endVoteEarly cases)
      win-conditions.test.ts         # test 22
      guards.test.ts                 # test 24 (+ NOT_HOST / IDENTITY_MISMATCH / host:closeRoom cases)
      views.test.ts                  # test 25
```

---

## Features implemented

- **Full 20-state FSM** (`ROOM_CREATED` is modeled as instantaneous — `createRoom()` returns a room already in `LOBBY`) driven by a single `handleEvent(room, priv, event, sender, deps)` entry point, pure with respect to its inputs (`structuredClone`s before mutating).
- **Host/player session separation**: `HostSession` is never a row in `players`; `PlayerPublic` has no `isHost` field; identity is passed in explicitly via an `EventSender` parameter (`{kind:'host'}` / `{kind:'player', playerId}`) representing what a (not-yet-built) gateway would have already authenticated at the socket level, and `handleEvent` cross-checks every event against it before doing anything else.
- **Corruption non-leak**: `HACKER_CORRUPTION` resolves `corrupted` server-side only; it is not exposed to any view until `corruptionRevealPolicy` says so (`'on_results'` by default, wired at `MINIGAME_PLAY` exit; `'on_instructions'` also implemented, wired right after corruption resolves; `'never'` never reveals). Hackers get a per-submission acknowledgement path (not modeled as a literal wire event in this networking-free package, but the FSM never broadcasts their choice).
- **Firewall**: blocks and consumes corruption exactly once, verified to not block subsequent rounds.
- **Two-tier idempotency**: single-submission tracking via `currentPhaseSubmissions` (reused for role-reveal acks, corruption choices, votes, rematch requests); ordered multi-action tracking via `seq`/`actionId` on `player:submitAction`, with retry-dedup and out-of-order rejection.
- **`resolveAfterRoundOrSpecial()`**: one shared decision function used by both `DISCUSSION`'s and `SPECIAL_GAME_RESULT`'s exits, driven entirely by registry rules — proven with two different `specialGameScheduleRuleId`s producing "between rounds" vs. "end of cycle" timing from the identical FSM code path.
- **Match clock**: `MatchClock.mode` defaults to `'disabled'`; special-game failure penalty only mutates `durationMs`/`penaltyMs` when `mode === 'countdown'`, otherwise it's logged to `matchLog` with no gameplay effect.
- **`EliminatedPlayerPolicy`**: every "who can act" check goes through a selector (`getEligibleMinigamePlayers`/`getEligibleSpecialGamePool`/`getEligibleVoters`) that reads this policy — verified that flipping the policy config changes eligibility with zero FSM code changes.
- **Voting**: tie-break rules `no_elimination` / `random` / `revote` all implemented, including the bounded single-revote-then-fallback behavior.
- **View projections**: `buildTvView`/`buildPlayerView`/`buildPrivatePlayerView` are the only functions that ever produce a client-facing shape; verified by direct JSON-serialization inspection that roles, session tokens, and individual vote pairs never appear in `TvView`/`PlayerView` output across every phase checkpoint in the round-trip.
- **`MiniGameModule` boundary**: `GenericMinigameModule` (regular placeholder, always "succeeds", never self-completes) and `GenericSpecialGameModule` (special-game placeholder, always "fails", never self-completes) both implement the full interface (`validateAction`, `buildTvView`/`buildPlayerView`/`buildSpectatorView`, `getInstructions`, `version`), proving the plugin boundary without any real mini-game mechanics.
- **Deterministic dependency injection**: no FSM/state-handler file calls `Math.random()`/`Date.now()` — every random selection and timestamp flows through an injected `Deps` (`now`/`rng`/`generateId`); `createDefaultDeps()` (the production wiring, unused by tests) is the sole exception, isolated in its own file with a comment saying so.

---

## Tests passing

**46/46 tests passing** across 11 files, covering all 25 required cases (several files also add a couple of adjacent edge-case tests beyond the minimum, e.g. non-hacker/non-participant rejection, `host:endVoteEarly`). `npm run typecheck` (both `packages/shared-types` and `apps/server`, including test files) passes with zero errors under `strict` mode.

```
npm run typecheck   # tsc --noEmit x2, zero errors
npm test             # vitest run — 11 files, 46 tests, all passing
```

---

## Placeholder logic still unresolved (by design — see ARCHITECTURE.md §12/§13.4)

These are implemented as real, working rule-id + registry entries, but the rule *bodies* are explicitly not final balancing/design decisions:

- `roleBalanceRegistry['placeholder-linear']` — hacker count = round(playerCount × 0.25), clamped to `[minHackers, maxHackers, playerCount]`.
- `minigameSelectionRegistry['placeholder-random']` — picks uniformly among registered minigame ids (currently just one).
- `corruptionAggregationRegistry['placeholder-any-corrupts']` — any one hacker choosing to corrupt corrupts the round.
- `specialGameScheduleRegistry` — three placeholder rules included: `'placeholder-end-of-cycle-once'`, `'placeholder-after-first-round-once'` (demonstrates `between_rounds` timing), and `'placeholder-never'` (a legitimate "no special game this match" config, added to make certain tests deterministic without an unrelated special-game detour).
- `specialGameParticipantRegistry['placeholder-fixed-four']` — always requests 4 (clamped to `[min, max, pool size]`).
- `checkWinCondition` — "hackers ≥ remaining crew" ratio, `maxCycles` forced-end defaults to `'crew'`.
- `EliminatedPlayerPolicy` defaults — matches ARCHITECTURE.md's recommended defaults (§13.3): eliminated players can't play mini-games, can't be special-game participants, can't vote, still show as "present" in discussion, retain their own role knowledge forever.
- The three real special-game concepts and the six regular mini-games remain entirely unimplemented — only the plugin boundary (`MiniGameModule`) and its two placeholder implementations exist.

---

## Implementation clarifications (not architecture contradictions — resolved by a concrete choice, documented here rather than in ARCHITECTURE.md)

1. **Auto-advancing "instant" states.** `ROLE_ASSIGNMENT` and `MINIGAME_SELECT` (and `HACKER_CORRUPTION` when the Firewall is active) have no real external event that could ever legally advance them per the original pseudocode — they're described as immediate/no-timer. Implemented via `transition()` always calling `autoAdvance()` immediately after moving into a new phase; `autoAdvance()` performs that phase's synchronous work (role assignment, mini-game selection, firewall auto-block) and recursively calls `transition()` again until the FSM lands on a phase that genuinely waits for an event. This is why, e.g., `host:startGame` from `LOBBY` returns a room already sitting in `ROLE_REVEAL`, not `ROLE_ASSIGNMENT` — the intermediate phase is real (it gets its own `phaseId`/`stateVersion` bump internally) but is never externally observable as "waiting."
2. **`FINAL_RESULTS` → `REMATCH_LOBBY` → `LOBBY` vs. the `host:restartMatch` shortcut.** ARCHITECTURE.md §3.18's prose (`startRematch`/`returnToMenu`) doesn't exactly line up with §6's event catalog (`host:restartMatch` valid at both `FINAL_RESULTS` and `REMATCH_LOBBY`) and the state diagram (`FINAL_RESULTS → REMATCH_LOBBY` unconditionally). Implemented per the diagram + event catalog: a generic `host:advance` moves `FINAL_RESULTS → REMATCH_LOBBY`; `host:startGame` moves `REMATCH_LOBBY → LOBBY`; and `host:restartMatch` is a direct shortcut valid from either state that resets match-scoped fields and jumps straight to `LOBBY`. All three paths are exercised by the test suite (`room-lifecycle.test.ts` test 23 uses the shortcut).
3. **System-originated events are exempt from the host/player sender check.** `timer:expired`, `player:disconnected`, and `host:graceExpired` are not produced by an authenticated client socket — they come from a (not-yet-built) timer scheduler / connection tracker. `checkSenderMatchesEvent` exempts these three event types explicitly, rather than trying to force them through the `host:`/`player:` naming-prefix convention used for genuinely client-originated events.
4. **`RoomConfig.corruption.aggregationRuleId`** was promoted from architecture's "named stub, not yet a registry" (`aggregateCorruption()`) into a full one-entry registry (`corruptionAggregationRegistry`), matching the same pattern as every other rule-id field — architecture itself suggested this promotion once more than one rule is needed, and doing it now keeps `RoomConfig` uniform.

## Architecture contradiction found (and fixed in ARCHITECTURE.md — see Revision 3, §13.7)

`CurrentRoundState.corruptionRevealed` lived only on the ephemeral active-round state, which is cleared (`null`) the moment `RESULTS_REVEAL` exits. `RoundRecord` (the permanent history entry) had no equivalent field, so any view built after that point — a `DISCUSSION` recap, a later match summary — reading `roundHistory` directly would either have no reveal signal at all, or (if it trusted `RoundRecord.corrupted` directly) would leak corruption retroactively even under `corruptionRevealPolicy: 'never'`. Fixed by adding `corruptionRevealed: boolean` to `RoundRecord` itself, computed once at push time and persisted permanently. This also wired up the previously-unimplemented `'on_instructions'` reveal-policy value. `ARCHITECTURE.md` has been updated in place (Revision 3 banner + §8.5 `RoundRecord` + §9 pseudocode + new §13.7).

---

## Step 1 / Step 2 completion

- **Step 1 (shared types): complete.** Every type in the required list exists in `packages/shared-types/src/`, is `JsonValue`-serializable where required, and compiles under `strict` mode.
- **Step 2 (in-memory FSM core): complete.** State handlers, guards, selectors, placeholder rule registries, placeholder mini-game registry, generic regular + special mini-game placeholders, vote tallying, `resolveAfterRoundOrSpecial()`, phase timer metadata calculation, and public/private view projections are all implemented with no dependency on Redis, WebSockets, React, Next.js, or AWS — confirmed by `grep`-level inspection of imports (only `node:crypto`, used solely inside `default-deps.ts`, and the shared-types package).
- Redis, WebSockets, UI, and real mini-game work were intentionally **not** started, per the requested scope.
