# Implementation Progress — Development Steps 1, 2 & 3

Status: **Steps 1 (shared types), 2 (in-memory FSM core), and 3 (Redis-backed room store + room actor) are complete.** No WebSocket gateway, Next.js UI, PostgreSQL/Prisma, authentication accounts/payments, AWS deployment, real mini-games, or multi-instance distributed locking were implemented, per scope.

> **Note on project location:** the user's C: drive had 0 bytes free when Steps 1–2 started (confirmed via `df -h`), which blocked directory creation at the original path (`C:\Users\PC\Downloads\fdd\barqsec\jackom`). With the user's approval, all work (Steps 1–3) is built and committed at **`D:\projects\jackom`** (a local git repo — see `git log`) instead; C: is not used for any code, only kept in sync for `ARCHITECTURE.md`/`IMPLEMENTATION_PROGRESS.md` when it has a few hundred KB free (it fluctuates between 0 and ~11MB free and should not be relied on).

---

# Steps 1 & 2 (unchanged from the prior pass)

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

---

# Step 3 — Redis-Backed Room Store and Room Actor

## Files created

```
D:\projects\jackom\
  package.json                      # +ioredis, +zod dependencies
  .gitignore                        # node_modules/, dist/, coverage/, .env*, Redis data, logs, temp files

  apps/server/src/
    persistence/
      errors.ts                    # RepositoryError, RoomConsistencyError, wrapStoreError()
      kv-store.ts                  # KeyValueStore interface — the ONLY thing repos depend on
      in-memory-kv-store.ts        # InMemoryKeyValueStore — Map-based, TTL simulated via injected clock
      redis-kv-store.ts            # RedisKeyValueStore — the ONLY file importing ioredis
      keys.ts                      # roomStateKey / roomPrivateStateKey / roomCodeKey / playerSessionKey / hostSessionKey
      config.ts                    # DEFAULT_ROOM_TTL_SECONDS
      schemas.ts                   # zod schemas mirroring every shared+server type, for load-time validation
      validate.ts                  # parseStoredJson() — JSON.parse + zod validate, wrapped as typed errors
      logging.ts                   # RoomLogger type, consoleRoomLogger/noopRoomLogger — narrow, token-safe logging surface
      room-state-repo.ts           # RoomStateRepository interface + KeyValueRoomStateRepository
      room-private-state-repo.ts   # RoomPrivateStateRepository interface + KeyValueRoomPrivateStateRepository
      room-lookup-repo.ts          # RoomLookupRepository interface + KeyValueRoomLookupRepository
      session-repo.ts              # SessionRepository interface + KeyValueSessionRepository (player + host)
    actors/
      room-actor.ts                # RoomActor — one serialized event queue per room
      room-actor-manager.ts        # RoomActorManager — roomId -> RoomActor map, createRoom/get/getByRoomCode/evict(Idle)
    index.ts                       # barrel updated with every Step 3 export

  apps/server/test/
    helpers/
      persistence.ts               # buildRepos(), FailingKeyValueStore (simulates Redis read/write failures), collectingLogger()
    persistence/
      in-memory-kv-store.test.ts
      room-state-repo.test.ts
      room-private-state-repo.test.ts
      room-lookup-repo.test.ts
      session-repo.test.ts
      consistency-and-failures.test.ts   # missing public/private halves
      redis-integration.test.ts          # OPTIONAL — skipped automatically when no Redis is reachable
    actors/
      room-actor.test.ts
      room-actor-manager.test.ts
```

## Redis library chosen and why

**ioredis.** It has first-class TypeScript types with no separate `@types` package, a native promise-based API (no callback interop), sensible built-in reconnection/retry behavior for a long-lived process, and a stable, widely-used API surface covering the handful of primitives this project actually needs (`GET`/`SET ... EX`/`DEL`/`EXISTS`/`EXPIRE`). It is imported in exactly one file, `apps/server/src/persistence/redis-kv-store.ts` — nothing else in the codebase (including every repository, the FSM, and the actor) imports it or knows it exists. Swapping to the official `redis` package, or a different backend entirely, would only ever touch that one file plus whatever implements `KeyValueStore`.

## Redis abstraction

Repositories (`RoomStateRepository`, `RoomPrivateStateRepository`, `RoomLookupRepository`, `SessionRepository`) never talk to ioredis directly — they depend only on the `KeyValueStore` interface (`get`/`set`/`del`/`exists`/`expire`). Each repository is a single concrete class parameterized over whichever `KeyValueStore` it's constructed with:

- **Production:** `new KeyValueRoomStateRepository(new RedisKeyValueStore(ioredisClient), ttlSeconds)`
- **Tests:** `new KeyValueRoomStateRepository(new InMemoryKeyValueStore(clockFn), ttlSeconds)`

This is a deliberate deviation from "write two separate repository classes" — the JSON-encoding, zod-validation, and key-naming logic lives in exactly one place per repository, and swapping backends is a one-line constructor change rather than a second maintained implementation. All 83 tests except one optional integration test run against `InMemoryKeyValueStore`; no locally running Redis server is required for the main suite.

Every repository method wraps its underlying `store` call in a try/catch and translates ANY thrown error (a real Redis outage, `InMemoryKeyValueStore`'s own bugs, a test double configured to fail) into a typed `RepositoryError` (`READ_FAILURE`/`WRITE_FAILURE`) via a shared `wrapStoreError()` helper — callers get one consistent error contract regardless of backend. Loaded JSON is parsed and validated through `zod` schemas (`schemas.ts`) mirroring every field of `RoomState`/`RoomPrivateState`/the session records; invalid JSON throws `INVALID_JSON`, a wrong shape throws `VALIDATION_FAILED` — the FSM is never handed corrupted or partially-trusted data. Validation error messages report only zod's `path`/`message` (structural info), never the offending value, so a corrupted `RoomPrivateState` document can't leak a token through an error string.

## How the room actor guarantees serialized processing

Each `RoomActor` owns exactly one `Promise` chain (`this.queue`). `dispatch(event, sender)` does:

```typescript
const task = this.queue.then(() => this.process(event, sender));
this.queue = task.then(() => undefined, () => undefined); // normalize for chaining only
return task; // the caller still sees the real resolution/rejection
```

Every call to `dispatch()` chains its work onto whatever is already queued, so a second call's `process()` cannot start — including its Redis persistence — until the first call's `process()` has fully settled, no matter how close together the two calls happen (verified in `room-actor.test.ts` test 6 by firing two dispatches via `Promise.all` without awaiting the first). `process()` also sets a `busy` flag for the duration of a single event, which `RoomActorManager.evict()`/`evictIdle()` check before removing an actor from memory — an actor mid-dispatch is never evicted out from under itself. This is the entire MVP concurrency story (ARCHITECTURE.md §7.1): one process, one queue per room, no distributed lock, Redis used purely for persistence/recovery.

`RoomActor.ensureLoaded()` lazily loads both halves from the repositories on the *first* dispatch if the actor wasn't pre-hydrated (e.g. after `RoomActorManager.evict()` + `get()` recreates a fresh, unloaded `RoomActor` for the same `roomId` — proven in `room-actor-manager.test.ts` test 9, where a second actor picks up the `stateVersion` left behind by the first).

## Failure cases handled

| Case | Behavior |
|---|---|
| Redis read failure | Repository method throws `RepositoryError('READ_FAILURE', ...)`. |
| Redis write failure | Repository method throws `RepositoryError('WRITE_FAILURE', ...)`. |
| Public state exists, private state missing | `RoomActor.ensureLoaded()` throws `RoomConsistencyError('PRIVATE_STATE_MISSING', roomId)`. |
| Private state exists, public state missing | Throws `RoomConsistencyError('PUBLIC_STATE_MISSING', roomId)`. |
| Neither half exists | Throws `RoomConsistencyError('ROOM_NOT_FOUND', roomId)` — distinguishable from a genuine mismatch. |
| Invalid/corrupted JSON | `parseStoredJson()` throws `RepositoryError('INVALID_JSON', ...)` before anything is returned. |
| Valid JSON, wrong shape | zod validation fails -> `RepositoryError('VALIDATION_FAILED', ...)`, listing only field paths, never values. |
| Unknown room code | `RoomLookupRepository.resolveRoomCode()` resolves `null`; `RoomActorManager.getByRoomCode()` returns `null`. |
| Expired session | `SessionRepository.resolve*Session()` resolves `null` once the simulated/real TTL has passed. |
| Actor receiving two simultaneous events | Serialized via the queue (see above) — never interleaved. |
| Process actor missing, Redis room still exists | `RoomActorManager.get()` creates a fresh actor; its first `dispatch()` reloads from Redis via `ensureLoaded()`. |
| Room TTL expiry | `InMemoryKeyValueStore` (and Redis, via native `EX`) treats an expired key as absent; `repo.load()` returns `null`. |
| Partial persistence failure (public saved, private save fails) | `RoomActor.persist()` best-effort **deletes** the just-written public half so Redis never has a lone mismatched public document, then throws `RoomConsistencyError('PARTIAL_PERSISTENCE_FAILURE', roomId)`. The actor's in-memory `room`/`priv` are left completely untouched — a failed persist never advances the actor's authoritative state past what's actually durable (verified in `room-actor.test.ts`: after a forced write failure, the actor is still observably in its pre-event phase, and a subsequent successful dispatch works normally from that same last-known-good state). |
| Rejected FSM events | Never reach the repository layer at all — `RoomActor.process()` only calls `persist()` when `!result.rejected`. |

## Tests passing

**83 tests passing, 1 skipped** (11 pre-existing Step 1/2 files unchanged + 9 new Step 3 files), covering all 15 required cases plus the additional failure scenarios (partial persistence, unknown room code, expired session, log redaction). The skipped test is `redis-integration.test.ts`, which probes a real Redis at `REDIS_URL` (default `redis://127.0.0.1:6379`) at module-load time and uses `describe.skipIf` to skip entirely — never fail — when nothing answers; no Redis server was running in this environment, so it skipped as designed.

```
npm run typecheck   # tsc --noEmit x2, zero errors, strict mode
npm test             # vitest run — 20 files, 84 tests (83 passed, 1 skipped)
```

**A tooling note on running these commands in this environment:** with C: still essentially full, `npx`/`npm test` intermittently fail with `ENOSPC` because `npx`'s dependency resolution and Vite's config-resolution cache both write to `C:\Users\...\AppData\Local\Temp` regardless of the project location, unless `TEMP`/`TMP` are explicitly redirected for that invocation (e.g. `TEMP="D:\npm-tmp" TMP="D:\npm-tmp" node node_modules/vitest/vitest.mjs run`). This is purely an artifact of the user's full C: drive, not a project configuration issue — once C: has normal free space again, plain `npm test`/`npm run typecheck` will work without the env var workaround.

## Architecture contradiction found

A **documentation-only** inaccuracy (not a structural/behavioral contradiction) in `ARCHITECTURE.md` §7: the key-structure table and its prose claimed `room:{roomId}` holds "no role/vote/corruption-choice content" and that a raw dump "can never leak roles or votes." Building the zod schema for `RoomState` made it obvious this is false for **votes** specifically — `CurrentVoteState.votes` and every `VoteRecord.votes` in `voteHistory` are declared directly on `RoomState` (§8.5), which is correct and intentional (votes are meant to become fully public once resolved — §3.16), just inconsistently described in §7. Fixed in place: corrected sentence + inline comment, plus a new explanatory note under the key-structure table and a `§13.8`/Revision 4 audit entry. No type or behavior changed — `RoomStateSchema` already validated `currentVote`/`voteHistory` correctly before this fix; only the prose was wrong.

## Step 3 completion

- **Redis client abstraction:** complete (`KeyValueStore` interface; `RedisKeyValueStore` + `InMemoryKeyValueStore`).
- **Repositories** (`RoomStateRepository`, `RoomPrivateStateRepository`, `RoomLookupRepository`, `SessionRepository`): complete, each with a production-usable and a test-usable configuration of the same class.
- **Room actor + manager:** complete — serialized per-room event queue, lazy load-on-first-dispatch, persist-only-on-accept, TTL refresh (room + roomCode + host session + every player session) on every accepted event, eviction (idle-based and explicit), recreation-from-Redis after eviction.
- **Failure handling:** complete per the table above, with typed errors throughout (no raw/unknown exceptions escape the persistence or actor layers).
- **Tests:** complete — all 15 required cases plus additional edge cases, 83 passing + 1 correctly-skipped optional Redis integration test.
- WebSocket gateway, Next.js UI, PostgreSQL/Prisma, AWS deployment, real mini-games, authentication accounts/payments, and multi-instance distributed locking/sticky-routing/Redlock were intentionally **not** started, per the requested scope.
