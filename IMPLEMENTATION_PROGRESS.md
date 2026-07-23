# Implementation Progress — Development Steps 1, 2, 3, 4 & 5

Status: **Steps 1 (shared types), 2 (in-memory FSM core), 3 (Redis-backed room store + room actor), 4 (WebSocket gateway), and 5 (server-owned timer scheduler) are complete.** No Next.js UI, PostgreSQL/Prisma, authentication accounts/payments, AWS deployment, real mini-games, or multi-instance distributed locking/timer coordination were implemented, per scope.

> **Note on project location:** the user's C: drive had 0 bytes free when Steps 1–2 started (confirmed via `df -h`), which blocked directory creation at the original path (`C:\Users\PC\Downloads\fdd\barqsec\jackom`). With the user's approval, all work (Steps 1–4) is built and committed at **`D:\projects\jackom`** (a local git repo — see `git log`) instead; C: is not used for any code, only kept in sync for `ARCHITECTURE.md`/`IMPLEMENTATION_PROGRESS.md` when it has a few hundred KB free (it fluctuates between 0 and ~11MB free and should not be relied on). Running `npx`/`npm` commands in this environment intermittently fails with `ENOSPC` because npx's own resolution and Vite's config-resolution cache write to `C:\Users\...\AppData\Local\Temp` regardless of project location — Step 4's work redirected `TEMP`/`TMP` to a D: path for every install/build/test invocation (e.g. `TEMP="D:\npm-tmp" TMP="D:\npm-tmp" node node_modules/vitest/vitest.mjs run`) and, where even that wasn't enough, called `node node_modules/<pkg>/bin/...` directly instead of going through `npx`.

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

---

# Step 4 — WebSocket Gateway

## Files created

```
D:\projects\jackom\
  package.json                       # +ws, +@types/ws

  apps/server/src/
    gateway/
      types.ts                       # WireMessage envelope, GatewayErrorCode, ConnectionKind
      schemas.ts                      # zod schemas per wire message type; SYSTEM_ONLY_EVENT_TYPES;
                                       # GATEWAY_LIFECYCLE_EVENT_TYPES (join/reconnect/leave)
      rate-limiter.ts                 # RateLimiter — sliding window, clock-injected
      connection-registry.ts          # RoomSocketRegistry — roomId -> {host, players: Map<playerId, ws>}
      gateway-server.ts               # GatewayServer — the whole gateway (see below)
    actors/
      room-actor.ts                   # EXTENDED: getOrLoadSnapshot(), runLifecycle() (see below)
    fsm/
      guards.ts                       # EXTENDED: SYSTEM_EVENT_TYPES gained 3 new entries (see below)
      transitions.ts                  # EXTENDED: handlers for the 3 new connection-status events
    index.ts                          # barrel updated with every Step 4 export

  packages/shared-types/src/
    events.ts                         # EXTENDED: PlayerReconnectedEvent, HostSocketDisconnectedEvent,
                                       # HostSocketReconnectedEvent added to InboundEvent (see note below)

  apps/server/test/
    helpers/
      gateway.ts                      # startTestGateway, connectClient, nextMessage (inbox-backed —
                                       # see race-condition note below), collectMessages, send,
                                       # authenticateHost, joinAsPlayer
    gateway/
      auth.test.ts                    # tests 1-8
      dispatch.test.ts                # tests 11-13
      views.test.ts                   # tests 14-16
      reconnect.test.ts               # tests 17-19
      lifecycle.test.ts               # test 20 (+ host disconnect, + actor-throws-mid-session)
      multi-room.test.ts              # test 21
      message-validation.test.ts      # tests 9-10
      security.test.ts                # tests 22-24
```

## Features implemented

- **Separate connection paths**: `/host/{roomCode}` and `/play/{roomCode}`, validated (path shape + roomCode existence) at the HTTP-upgrade stage via `verifyClient` — an unknown room code or malformed path is rejected before a WebSocket connection is ever established (HTTP 404/400), never as a JSON error over an open socket.
- **Authentication happens via an explicit first message, not a query string**: every socket opens "unauthenticated"; a host socket's only legal first move is `host:reconnect {hostSessionToken}`, a player socket's is either `player:join {name, avatarId}` (brand new) or `player:reconnect {sessionToken}` (existing). Any other message type before that succeeds is rejected `NOT_AUTHENTICATED`; an unauthenticated socket is force-closed after `authTimeoutMs` if it never authenticates.
- **Identity is bound at the socket, never trusted from a payload**: once authenticated, every subsequent FSM event's `InboundEvent` is constructed by the gateway itself — `playerId` comes from the socket's own tracked identity, never from anything inside the wire payload (the payload schemas don't even declare a `playerId` field, so there's nothing to spoof).
- **`host:`/`player:` events cannot cross connections**: a message's `type` prefix must match the connection's kind or it's rejected `WRONG_CONNECTION_KIND` — before it even reaches the lifecycle/FSM branches.
- **System-only FSM events can never be sent by a client**: `timer:expired`, `player:disconnected`, `player:reconnected`, `host:disconnected`, `host:reconnected`, `host:graceExpired` are all rejected `SYSTEM_EVENT_NOT_ALLOWED` if a client tries to send them directly — they're synthesized internally only, by the gateway's own connection tracker.
- **View delivery**: after every accepted mutation, `broadcastRoom()` sends a fresh `TvView` to the room's host socket (if any) and a personalized `PlayerView` to every connected player socket; `PrivatePlayerPayload` is sent once per socket lifetime (tracked via a per-socket `privateInfoSent` flag, reset to `false` on every fresh authenticate/reconnect so a reconnecting player is always re-sent it if their role already exists).
- **Reconnection**: `player:reconnect`/`host:reconnect` resolve the session via `SessionRepository`, verify it belongs to the room being connected to (`SESSION_ROOM_MISMATCH` if not), replace any existing socket bound to that same identity (the old one is sent a notice and closed with code `4000`), and dispatch a synthesized `player:reconnected`/`host:reconnected` FSM event to flip `connectionStatus` back to `'connected'` before sending the current view. Reconnecting NEVER creates a new player row — it only rebinds a socket to the existing `playerId`/session.
- **Disconnect handling**: a socket's `close` event (graceful or abrupt — `ws` treats both identically) removes it from the room registry and, if it was authenticated, dispatches `player:disconnected`/`host:disconnected` to flip `connectionStatus`. A socket closed because it was *replaced* by a newer connection for the same session is flagged (`meta.replaced`) so this does NOT fire — reconnecting doesn't spuriously mark the player disconnected a moment after they reconnected.
- **Heartbeat**: classic `ws` ping/pong pattern — the server pings every socket on `heartbeatIntervalMs`; a socket that didn't answer the previous ping (tracked via a per-socket `isAlive` flag, reset false before each ping and set true on `pong`) is terminated at the next tick, which triggers the normal `close` → disconnect-handling path.
- **Security**: per-socket sliding-window rate limiting (`RateLimiter`, clock-injected); a hard message-size check (`maxPayloadBytes`) ahead of a larger ws-protocol-level `maxPayload` backstop; malformed-JSON/schema-invalid/rate-limited messages all count toward a `malformedCount` that force-closes the socket past `maxViolations`; every rejection is a typed, sanitized error (`error:actionRejected {code, message}`) that never echoes internal exception details.
- **Failure isolation**: a thrown `RoomConsistencyError('ROOM_NOT_FOUND', …)` (the room expired out of Redis while a client was connected) is caught, translated into `ROOM_UNAVAILABLE` for the requester, and evicts + closes every other socket still connected to that (now-nonexistent) room — the gateway process itself never crashes; other rooms are provably unaffected (see multi-room test).
- **Logging never includes tokens/private state**: the gateway reuses the same narrow `RoomLogger` type from Step 3 (`{roomId, event, detail?}` — no raw-object escape hatch) for every internal failure it logs.

## RoomActor extensions (small, needed for the gateway; same serialization guarantees)

- **`getOrLoadSnapshot()`**: lets the gateway read a room's current state (e.g. to build a view immediately after a reconnect) without fabricating a fake FSM event just to trigger a load. Goes through the same queue as `dispatch()`.
- **`runLifecycle()`**: lets the gateway run the pure Step 2 lifecycle functions (`joinPlayer`, `leavePlayer` — which are NOT part of `handleEvent()`'s switch, per ARCHITECTURE.md §9) through the SAME serialized queue and persist-only-on-accept path as FSM events, so two players joining at the same moment can never race on the room's player map. This was explicitly flagged as deferred in the Step 3 progress notes ("join/leave orchestration... intentionally deferred to the WebSocket gateway step") — this is that follow-through.

## WebSocket library chosen and why

**`ws`**, over Socket.IO. `ws` is a thin, spec-compliant WebSocket implementation with no built-in room/namespace/fallback-transport abstractions — since this project already has its own room routing (`RoomActorManager`) and message envelope (zod-validated `WireMessage`), Socket.IO's extra abstractions would either go unused or fight with the ones already built in Step 3. `ws` also has a native, well-documented `verifyClient` hook for rejecting connections at the HTTP-upgrade stage (used here for path/room-code validation) and exposes raw ping/pong control frames directly, which the heartbeat mechanism uses as-is.

## Authentication flow

Identity is established once, at the WebSocket layer, exactly per ARCHITECTURE.md §1.1: the `EventSender` passed into every `RoomActor.dispatch()` call is built by the gateway from the socket's OWN tracked state (`SocketMeta.kind`/`playerId`), never from message content. Concretely:

1. Client opens `/host/{roomCode}` or `/play/{roomCode}`. `verifyClient` resolves the roomCode to a roomId (or rejects the upgrade entirely if unknown).
2. The socket is tracked as unauthenticated, with an `authTimeoutMs` force-close timer running.
3. Host sends `host:reconnect {hostSessionToken}`; player sends `player:join {name, avatarId}` or `player:reconnect {sessionToken}`. The gateway validates the token/session against `SessionRepository`, cross-checks it belongs to THIS room, and only then marks the socket authenticated and binds it in `RoomSocketRegistry`.
4. Every subsequent message is checked against connection kind, authentication state, and (for FSM events) the exact payload schema for its `type` — in that order — before ever reaching `RoomActor.dispatch()`.

## Reconnection behavior

Covered in detail above ("Features implemented"). In short: same session, same playerId, new socket; the old socket (if still open) is notified and closed (code `4000`); the current view (+ private role info, if applicable) is sent immediately; `connectionStatus` flips back to `'connected'` via a synthesized FSM event, never a direct `RoomState` mutation from the gateway.

## View broadcast behavior

`broadcastRoom(roomId)` is called after every accepted mutation (FSM dispatch, join, leave, reconnect). It reads the actor's current snapshot once and, per recipient: the host gets exactly one `TvView`; each connected player gets exactly one personalized `PlayerView` (via `buildPlayerView`, which already knows to render participant vs. spectator content); a player whose role exists and hasn't yet received it this socket-lifetime also gets `PrivatePlayerPayload`. A per-recipient try/catch means one player's view failing to build (or one socket's send failing) never prevents the others from receiving theirs.

## Security protections implemented

Connection-path validation before upgrade · authenticate-before-gameplay · identity bound server-side (never payload-supplied) · max message size (graceful check + protocol-level backstop) · per-socket sliding-window rate limiting · reject unsupported/system-only/wrong-kind event types · sanitized error payloads (no internal exception detail ever reaches a client) · socket force-close after repeated malformed/rate-limited messages · logger never receives tokens or private state.

## Tests passing

**117 tests passing, 1 skipped** (all 92 pre-existing Steps 1–3 tests unchanged and still passing + 25 new gateway test files covering all 25 required cases, several with additional adjacent cases). The skip is the same pre-existing optional Redis integration test from Step 3.

```
npm run typecheck   # tsc --noEmit x2, zero errors, strict mode
npm test             # vitest run — 28 files, 118 tests (117 passed, 1 skipped)
```

## A real bug this pass found and fixed (in test infrastructure, not the gateway)

While writing the gateway tests, two back-to-back server messages (e.g. an auth ack immediately followed by the first broadcast view) occasionally arrived at the test client before a *second* sequential `await nextMessage(...)` call had gotten around to attaching its listener — because the original `nextMessage()` helper attached and removed a fresh one-shot `ws.on('message', ...)` listener per call. A message arriving in the gap between one call resolving and the next call's listener being attached was silently lost forever. Fixed by centralizing every socket's message handling into ONE persistent listener (attached the moment the test client connects) that feeds either a currently-waiting `nextMessage()` call or a per-socket inbox array that later `nextMessage()`/`collectMessages()` calls check first before waiting for anything new. This is a general lesson about testing real async transports, not a gateway defect — the gateway's own message ordering was always correct.

## Implementation clarifications (documented here, not architecture contradictions)

1. **Three new FSM events were added**: `player:reconnected`, `host:disconnected`, `host:reconnected` (alongside the existing `player:disconnected` and `host:graceExpired`). ARCHITECTURE.md §9.1 describes reconnection rebinding `connectionStatus` back to `'connected'` in prose, but the `InboundEvent` union (as coded through Step 3) had no formal event for it — only the disconnect direction existed. Rather than have the gateway mutate `RoomState.host`/`players[x].connectionStatus` directly (which would violate "the WebSocket gateway must not contain game logic"), these three events were added to `packages/shared-types/src/events.ts`, wired into `guards.ts`'s `SYSTEM_EVENT_TYPES` exemption list and `transitions.ts`'s top-level event handling (immediate status flip only — `host:disconnected`/`host:reconnected` are explicitly NOT the same as `host:graceExpired`, which remains reserved for timer-driven final abandonment once server timers exist). This is an **addition that fills in an implementation detail the architecture left implicit**, not a contradiction of anything stated — ARCHITECTURE.md's InboundEvent listing (§8.1) is technically now one revision behind the code as a result; per the instruction to update ARCHITECTURE.md only for genuine contradictions, this is recorded here rather than as an architecture revision.
2. **No query-string authentication.** ARCHITECTURE.md left the exact wire mechanics of Step 4 to this implementation. Rather than authenticate via a `?token=` query parameter at the HTTP-upgrade stage, every connection authenticates via an explicit first WebSocket message after the raw socket opens (`host:reconnect`/`player:join`/`player:reconnect`). This keeps `verifyClient` scoped to path/room-code validation only (which can reject the upgrade outright, before any client-controlled data beyond the URL is trusted) and keeps token validation inside the same typed-schema + typed-error pipeline every other message goes through.
3. **`player:leave` was implemented** (via `RoomActor.runLifecycle()` + the existing `leavePlayer()` pure function from Step 2) even though it isn't in the required test list — it was a natural, small addition once `runLifecycle()` existed for `player:join`, and leaving without it would have been a conspicuous gap in an otherwise-complete lifecycle story.

## Architecture contradiction found

**None.** Everything in ARCHITECTURE.md Revision 4 relevant to Step 4 (host/player session separation, identity-from-socket-not-payload, view-projection-only client exposure, reconnection rebinding rather than re-creating a player) was implementable exactly as designed. The one gap noted above (three new connection-status FSM events) is an addition/clarification, not a contradiction — nothing in the architecture had to be reversed or corrected to build this step.

## Step 4 completion

- **WebSocket server, separate host/player connection flows, room-code routing**: complete.
- **Host and player session authentication**: complete, including cross-checking a session belongs to the room being connected to.
- **Client event parsing and validation**: complete — envelope schema, then per-type payload schema, before anything reaches `RoomActor.dispatch()`.
- **Routing valid events to `RoomActor.dispatch()`**: complete.
- **View delivery** (`TvView` to host only, `PlayerView` per player, `PrivatePlayerPayload` to the owning player only): complete.
- **Broadcasting after accepted mutations**: complete.
- **Player and host reconnect support**, including replacing a superseded socket and never creating a duplicate player: complete.
- **Heartbeat/ping-pong**: complete.
- **Disconnect handling, multiple-socket cleanup**: complete.
- **Typed WebSocket errors**: complete (`GatewayErrorCode` — FSM `RejectionCode`s forwarded verbatim, plus gateway-specific codes).
- **Security requirements** (auth-before-gameplay, server-side identity binding, max message size, rate limiting, reject unsupported/cross-kind events, sanitized errors, no token/private-state logging, close-after-abuse): complete.
- **Tests**: complete — all 25 required cases plus additional edge cases, 117 passing + 1 correctly-skipped (pre-existing, unrelated to this step).
- Server timers (phase-duration expiry scheduling — see Step 5, below), Next.js UI, PostgreSQL/Prisma, AWS deployment, and real mini-games were intentionally **not** started in this step, per the requested scope.

---

# Step 5 — Server-Owned Timer Scheduler

## Files created

```
D:\projects\jackom\
  apps/server/src/
    timers/
      types.ts                       # TimerScheduler interface, ScheduledTimerInfo, TimerExpiryCallback, TimerSchedulerFactory
      real-timer-scheduler.ts        # RealTimerScheduler — production, real setTimeout per room
      fake-timer-scheduler.ts        # FakeTimerScheduler — deterministic, advanceTo()/fireNow() test control
      phase-timer-service.ts         # PhaseTimerService — the actual orchestrator (see below)
    actors/
      room-actor.ts                  # EXTENDED: RoomActorDeps.onMutated hook, fired after every accepted mutation
      room-actor-manager.ts          # EXTENDED: RoomActorLifecycleHooks (onMutated/onActorCreated/onActorEvicted) + setLifecycleHooks()
    gateway/
      gateway-server.ts              # EXTENDED: GatewayDeps.timerService, public broadcastRoom(), close() shuts the timer service down
    index.ts                          # barrel updated with every Step 5 export

  apps/server/test/
    helpers/
      timers.ts                      # buildTimerHarness(), setupRoomViaActor/startGameViaActor/ackAllRevealsViaActor/
                                      # hostDispatch/playerDispatch (actor-mediated, so onMutated fires), driveViaTimersUntil()
      gateway.ts                     # EXTENDED: startTestGatewayWithTimers() — same as startTestGateway() plus a wired PhaseTimerService
    timers/
      # TimerScheduler (types.ts) has no dedicated test file — it's exercised only through its implementations:
      real-timer-scheduler.test.ts        # short real setTimeout waits — the one place real time is used
      fake-timer-scheduler.test.ts        # schedule/cancel/replace/advanceTo/fireNow/shutdown, fully deterministic
      phase-timer-service.test.ts         # the bulk of the 24 required cases (1–13, 15–22), deterministic
      gateway-timer-integration.test.ts   # real WebSocket broadcast delivery + multi-room independence through the full gateway stack
```

## Timer architecture chosen

Two-layer design, mirroring the existing `KeyValueStore`/`RoomStateRepository` split from Step 3 (a thin, swappable low-level primitive underneath a stateful orchestrator that owns the actual business rules):

- **`TimerScheduler`** (`timers/types.ts`) — deliberately dumb. It only knows "fire this callback at this deadline, for this room+phase" and "cancel/replace whatever is scheduled for this room." It never reads `RoomState`, never calls `RoomActor`, never knows about WebSockets. Exactly one timer may be scheduled per room at a time — `schedule()` always replaces whatever was previously scheduled for that `roomId`, so callers never explicitly cancel-then-schedule.
  - `RealTimerScheduler` — production, one real `setTimeout` per room (`.unref()`'d so a lone pending timer never blocks process shutdown).
  - `FakeTimerScheduler` — deterministic, used by every test except `real-timer-scheduler.test.ts`. `advanceTo(now)` fires every due timer in deadline order; `fireNow(roomId)` force-fires regardless of deadline (for duplicate/racing-callback tests) without consuming the schedule entry. Both are `async` and await each fired callback in turn, so `await scheduler.advanceTo(...)` only resolves once the downstream dispatch/persist/broadcast it triggered has fully settled — this is what makes timer-driven test assertions deterministic without any real waiting.
- **`PhaseTimerService`** (`timers/phase-timer-service.ts`) — the actual orchestrator, and the ONLY thing in the timer subsystem that ever touches `RoomState` (read-only) or calls `RoomActor.dispatch()`. It:
  - constructs its `TimerScheduler` via an injected factory (`TimerSchedulerFactory`) rather than receiving a pre-built one, specifically to avoid a construction-order cycle (the scheduler needs `PhaseTimerService`'s own expiry handler as its callback, but that handler is a bound method of the service being constructed);
  - registers itself as `RoomActorManager`'s lifecycle hooks (`setLifecycleHooks`) in its own constructor, so `manager` is a plain constructor dependency with no cycle back;
  - exposes `syncFromRoom(room)` (schedule/cancel/replace based on the room's CURRENT phase), `recoverRoom(roomId)` (recovery, see below), `cancelRoom(roomId)`, and `setOnRoomMutated(callback)` (the late-bound broadcast boundary `GatewayServer` wires itself into after construction).

**Integration with `RoomActor`/`RoomActorManager`** uses a generic hook mechanism rather than scattering timer-sync calls through every gateway call site:
- `RoomActorDeps` gained an optional `onMutated?: (room: RoomState) => void`, fired (wrapped in try/catch, logged on failure, never rethrown) after every ACCEPTED `dispatch()`/`runLifecycle()` call — this is what implements "schedule after phase transitions," "cancel on phase change," and "replace on a newer phase" as one uniform rule: whatever phase the room is in right now is what gets scheduled, unconditionally superseding anything scheduled before.
- `RoomActorManager` gained `RoomActorLifecycleHooks` (`onMutated`/`onActorCreated`/`onActorEvicted`) plus `setLifecycleHooks()`. `onActorCreated` fires only on a cache MISS in `get()` — a fresh process touching a room for the first time, or a recreation after `evict()` — never on a cache hit, which is what makes actor recreation immune to duplicate active timers. `onActorEvicted` fires from both `evict()` and `evictIdle()`.
- Neither `RoomActor` nor `RoomActorManager` imports anything from `timers/` — they only know about the generic hook shape. `PhaseTimerService` is the only file that closes the loop.

**Integration with the WebSocket gateway** reuses the exact existing broadcast path rather than re-implementing it: `GatewayServer.broadcastRoom()` (private in Step 4) is now `public`, and `GatewayDeps` gained an optional `timerService?: PhaseTimerService`. In the constructor, if provided, the gateway calls `timerService.setOnRoomMutated((roomId) => this.broadcastRoom(roomId))` — the callback boundary the architecture brief asked for: `PhaseTimerService` only ever calls back with a bare `roomId`, and has no import of `WireMessage`/`WebSocket`/anything gateway-shaped. `GatewayServer.close()` also calls `timerService?.shutdown()`.

## How stale timers are prevented

Every scheduled timer is identified by `{roomId, phaseId, deadline}`. When `PhaseTimerService`'s expiry handler (`handleExpiry`, the callback every `TimerScheduler` fires into) runs:

1. It reloads the room via `RoomActor.getOrLoadSnapshot()` (the same actor-queue-serialized read path used everywhere else — this itself may trigger a Redis reload if the actor wasn't hydrated).
2. It compares `snapshot.room.phase.phaseId` to the timer's own `phaseId`. A mismatch means the phase already moved on (host skip, player action, another timer callback) — the handler logs `timer_stale_ignored` and returns, touching nothing.
3. Only on a match does it call `actor.dispatch({ type: 'timer:expired', phaseId }, { kind: 'host' })` — which is itself protected a SECOND time, independently, by the FSM's own `isStalePhase` guard (`fsm/guards.ts`, unchanged from Step 1/2) inside `handleEvent()`. So even in the (structurally impossible under the serialized queue, but defensively handled anyway) case where the pre-check's read is itself stale by the time `dispatch()` actually runs, the FSM rejects it with `STALE_PHASE` and `handleExpiry` treats a rejection identically to a stale pre-check: log and return, no persistence, no broadcast.

This double protection is what makes duplicate callbacks, host-skip races, player-action races, and actor-recreation races all resolve to "harmless no-op" rather than needing special-cased handling for each — they're all just "the phaseId didn't match" from two independent angles.

## How restart/recovery works

`PhaseTimerService.recoverRoom(roomId)` is wired to fire automatically via `RoomActorManager`'s `onActorCreated` hook — i.e. any time `RoomActorManager.get()` has a cache MISS (a genuinely fresh process touching this room for the first time, or a recreation after `evict()`). It:

1. Loads the room's current snapshot (`RoomActor.getOrLoadSnapshot()`, reading from Redis if not already hydrated).
2. If `phase.durationMs === null` (host-paced), cancels/no-ops — nothing to schedule.
3. Computes `deadline = phase.phaseStartedAt + phase.durationMs` — the SAME absolute deadline that was already persisted; recovery never recomputes it from "now."
4. If `deadline > now()`, schedules the REMAINING time only (`scheduler.schedule(roomId, phaseId, deadline)` — the scheduler computes its own delay as `deadline - now()`, so a 30s phase 20s in only gets ~10s left, exactly as the architecture's own example describes; a dedicated test (`11. actor recovery schedules only the remaining duration...`) asserts the scheduled deadline is byte-identical to the original, not reset).
5. If `deadline <= now()` (overdue), it dispatches `timer:expired` immediately (`await this.handleExpiry(...)`) instead of registering a timer at all — proven by test 12, which asserts the phase has already moved on and a broadcast already happened by the time `recoverRoom()` resolves.

A full **process restart** is handled by the same mechanism with no separate code path: the in-memory actor map starts empty, so the very first `get()`/`getByRoomCode()` call for any room (from a reconnecting client, or any other trigger) is a cache miss and triggers recovery exactly as above. This is a deliberate scope limitation, consistent with how Step 3/4 never eagerly rehydrate every room at boot either: there is no "list all rooms" capability anywhere in the persistence layer (`RoomLookupRepository` only resolves one `roomCode` at a time), so a room that nobody touches after a restart has its overdue timer recovered lazily, the next time anything does touch it, rather than proactively at boot. Adding a proactive full-room-scan-and-recover-at-startup would require a new Redis `SCAN`-based capability that doesn't exist in the current `KeyValueStore` abstraction — out of scope here, and not requested.

## How simultaneous events remain serialized

Unchanged from Step 3's actor design, and this step deliberately does not add any new concurrency primitive: `handleExpiry()`'s call to `actor.dispatch({ type: 'timer:expired', ... }, ...)` enters the EXACT SAME per-room `Promise` queue (`RoomActor`'s `this.queue`) as every player/host-originated event. Whichever of two near-simultaneous events (e.g. a player's final vote and that phase's own timer expiry) gets queued first is the one that actually transitions the phase; the second one's dispatch runs afterward, sees the now-different `phase.phaseId`, and is rejected `STALE_PHASE` by the FSM — becoming a harmless no-op, never a double-transition. `phase-timer-service.test.ts` test 21 fires a real player vote dispatch and a real timer-expiry callback via `Promise.all` (unawaited relative to each other) and asserts the room ends in exactly one `ELIMINATION_RESULT` with exactly one `voteHistory` entry, regardless of which one happened to win the race.

## Failure cases handled

| Case | Behavior |
|---|---|
| Room not found when timer fires / during recovery | `getOrLoadSnapshot()` throws `RoomConsistencyError`; caught, the scheduler entry (if any) is cancelled, `timer_room_unavailable`/`timer_recovery_load_failed` is logged, nothing else happens. |
| Actor missing but persisted state still exists | Handled by the ordinary `RoomActor.ensureLoaded()` path — `getOrLoadSnapshot()` transparently reloads; no timer-specific code needed. |
| Repository read failure | `RepositoryError` (a different, TYPED error from `RoomConsistencyError`) propagates out of `getOrLoadSnapshot()`; caught, logged as `timer_snapshot_load_failed`/`timer_recovery_load_failed` with a sanitized `errorKind` (never the raw error message/value — same discipline as `persistence/validate.ts`), never thrown further. |
| Actor dispatch failure | Caught around `actor.dispatch(...)`, logged as `timer_dispatch_failed`, no persistence/broadcast attempted. |
| Gateway broadcast failure | `onRoomMutated` callback wrapped in try/catch; a throw is logged as `timer_broadcast_failed` and swallowed — the state transition already committed before this point and is never rolled back (test 20 asserts the persisted state survives a throwing broadcast callback). |
| Timer callback firing twice | See "stale timers" above — the second firing's phaseId no longer matches and becomes a no-op (test 8). |
| Stale phaseId | See "stale timers" above (tests 7, 9, 10). |
| Invalid deadline | Structurally can't diverge from a valid one while `phaseId` still matches — `phaseId` is unique per phase entry, so a phaseId match implies `phaseStartedAt`/`durationMs` haven't changed either; still defensively re-checked (`durationMs === null` guard) in `handleExpiry` before dispatching. |
| Actor eviction with an active timer | `onActorEvicted` hook cancels the scheduler entry synchronously inside `evict()`/`evictIdle()` — never left dangling (test 15). |
| Process recovery with an overdue timer | See "restart/recovery" above (test 12). |
| Room TTL expiry | If the actor is still cached in memory, ordinary Step 3/4 semantics apply (a subsequent dispatch just persists over the expired key, unchanged by this step). If the actor was evicted AND the Redis TTL expired in between, recovery's `getOrLoadSnapshot()` finds both halves missing and treats it exactly like "room not found" above (test 17). |
| Scheduler shutdown | `TimerScheduler.shutdown()` clears every pending timer; `GatewayServer.close()` calls `timerService?.shutdown()` automatically. |

## Deterministic testing

`FakeTimerScheduler` never calls `setTimeout` — `advanceTo(now)`/`fireNow(roomId)` are the only ways anything fires, and both are `async`, awaiting each triggered callback (in deadline order for `advanceTo`) before resolving. Every test in `phase-timer-service.test.ts` and `gateway-timer-integration.test.ts` drives the timer subsystem exclusively through these two methods (plus direct calls to the harness's captured raw expiry callback, `fireExpiry`, for simulating an arbitrary/duplicate/late `(roomId, phaseId)` firing independent of whatever the scheduler currently has scheduled). `real-timer-scheduler.test.ts` is the one file using real (short, tens-of-ms) waits, proving `RealTimerScheduler` itself is wired correctly — exactly the split the architecture brief asked for ("real `setTimeout` in the production implementation only").

Every room in the deterministic tests is driven through `RoomActor`/`RoomActorManager` (`test/helpers/timers.ts`: `setupRoomViaActor`, `startGameViaActor`, `ackAllRevealsViaActor`, `hostDispatch`, `playerDispatch`, `driveViaTimersUntil`), never through the pure-FSM helpers in `test/helpers/room.ts` — only actor-mediated mutations fire the `onMutated` lifecycle hook that keeps `PhaseTimerService` in sync, so this proves the integration path, not just the FSM.

## Required tests — status

All 24 required cases are covered:

1–5 (schedule-one-timer / host-paced-none / dispatch / persist / broadcast) — `phase-timer-service.test.ts`.
6 (old timer cancelled on phase change) / 7 (stale phaseId no-op) / 8 (duplicate callback no-op) / 9 (host skip pre-empts) / 10 (player action pre-empts) — `phase-timer-service.test.ts`.
11 (recovery schedules remaining time only) / 12 (overdue recovery dispatches immediately) / 13 (recreation doesn't duplicate timers) — `phase-timer-service.test.ts`.
14 (two independent rooms) — both `phase-timer-service.test.ts` (actor level) and `gateway-timer-integration.test.ts` (full WebSocket stack).
15 (eviction cancels timer) / 16 (recreation restores it exactly) / 17 (room-expiry-while-evicted is handled cleanly) / 18 (recovery reads purely from the persisted store, not memory) — `phase-timer-service.test.ts`.
19 (typed repository-failure error) / 20 (broadcast failure doesn't undo persisted state) — `phase-timer-service.test.ts`.
21 (simultaneous vote + timer expiry serialize, never double-apply) — `phase-timer-service.test.ts`.
22 (MatchClock untouched by the timer subsystem) — `phase-timer-service.test.ts`.
23 (existing tests still pass) — verified: 117 pre-existing tests unchanged and passing.
24 (Redis integration test still independently skippable) — verified: still 1 skipped, untouched by this step.

Plus a full `view:tv`/`view:player` WebSocket delivery test and a full-stack two-room independence test in `gateway-timer-integration.test.ts`, and dedicated `FakeTimerScheduler`/`RealTimerScheduler` unit tests.

## Tests passing

**155 tests passing, 1 skipped** (all 117 pre-existing Steps 1–4 tests unchanged and still passing + 38 new Step 5 tests across 4 files). The skip is the same pre-existing optional Redis integration test from Step 3, untouched by this step.

```
npm run typecheck   # tsc --noEmit x2, zero errors, strict mode
npm test             # vitest run — 32 files, 156 tests (155 passed, 1 skipped)
```

## Security and logging

Every timer-subsystem log entry goes through the same narrow `RoomLogger` (`{roomId, event, detail?}`) from Step 3 — no raw-object escape hatch. On any failure, `PhaseTimerService.logFailure()` logs only `{roomId, event: 'timer_<reason>', detail: {errorKind}}` where `errorKind` is the thrown value's constructor name (or `typeof` for non-Error throws) — never the error's message, stack, or any part of the room/private state. No session token, role, corruption choice, vote content, or `RoomPrivateState` field is ever referenced by anything in `timers/`.

## Implementation clarifications (not architecture contradictions — resolved by a concrete choice, documented here rather than in ARCHITECTURE.md)

1. **`RoomActorLifecycleHooks` (`onMutated`/`onActorCreated`/`onActorEvicted`) is a new, generic extension point on `RoomActorManager`/`RoomActor`.** ARCHITECTURE.md's Step 5 brief says to "integrate scheduling with RoomActor and RoomActorManager" without prescribing a mechanism. Rather than have `PhaseTimerService` poll, or have every gateway call site remember to call into it after every dispatch, `RoomActor`/`RoomActorManager` gained a small, timer-agnostic hook surface (named generically, not `onTimerSync`/etc., so it could serve other cross-cutting concerns later) that `PhaseTimerService` registers itself into via `setLifecycleHooks()` in its own constructor. Neither `RoomActor` nor `RoomActorManager` imports anything from `timers/`.
2. **`GatewayServer.broadcastRoom()` was made `public`** (previously `private`, Step 4) specifically so `PhaseTimerService`'s broadcast callback (wired via `GatewayDeps.timerService` + `setOnRoomMutated`) reuses the exact same view-projection/send path as every client-originated mutation, rather than re-implementing it. No behavior of `broadcastRoom()` itself changed.
3. **`TimerExpiryCallback` may return `void | Promise<void>`.** `RealTimerScheduler` treats it as fire-and-forget inside its `setTimeout` callback (matching real-world timer semantics — nothing is "awaiting" a real timer firing). `FakeTimerScheduler.advanceTo()`/`fireNow()` await it, which is what makes `await scheduler.advanceTo(deadline)` in a test a fully deterministic point to assert against, with no `setImmediate`/microtask-flush workaround needed anywhere except the one test that specifically exercises the fire-and-forget `onActorCreated` recovery hook (test 13), which is inherently disconnected from any promise a test could await (its trigger, `RoomActorManager.get()`, is and must stay a synchronous method — it's called synchronously throughout the existing Step 4 gateway code).

## Architecture contradiction found

**None.** Everything in ARCHITECTURE.md relevant to Step 5 (timers as start-timestamp + duration rather than a ticking counter — §1 principle 5; the timer authority rules, stale-timer protection, and recovery-behavior examples given nearly verbatim in the task brief; MatchClock staying a separate, untouched concept) was implementable exactly as specified. §11's development-order list still shows the timer scheduler as item 6 in its own internal numbering (because that list also counts "view builders" as a separate item 3, which was folded into Steps 1–2 in practice, same offset already noted in the Step 3/4 sections above) — not a new finding, just the same pre-existing numbering offset continuing to apply.

## Step 5 completion

- **`TimerScheduler` interface, production (`RealTimerScheduler`) and deterministic test (`FakeTimerScheduler`) implementations**: complete.
- **One active phase timer per room, scheduling after phase transitions, cancellation on phase change, replacement on a newer phase**: complete, uniformly via `PhaseTimerService.syncFromRoom()` fired from the `onMutated` hook after every accepted actor mutation.
- **Timer recovery after actor recreation and after process restart, using persisted phase timestamps, without resetting to full duration**: complete.
- **Overdue timer handling**: complete — dispatched immediately on recovery, never scheduled with a negative/zero delay masquerading as "on time."
- **Host-paced phase support (`durationMs === null` schedules nothing)**: complete.
- **Integration with `RoomActor` and `RoomActorManager`**: complete, via the new generic lifecycle-hook surface.
- **Integration with the WebSocket gateway's existing view-broadcast path**: complete, via `GatewayServer.broadcastRoom()` made public + `PhaseTimerService.setOnRoomMutated()`.
- **Timer lifecycle cleanup on actor eviction / room unavailability**: complete.
- **Stale-timer protection** (roomId/phaseId/deadline verification, harmless duplicate/late/superseded callbacks): complete.
- **Typed failure handling** for every required case in the brief: complete, all non-fatal, all logged without leaking tokens/private state/error internals.
- **Deterministic tests**: complete — `FakeTimerScheduler` with no real waiting time in any test except `real-timer-scheduler.test.ts`'s dedicated (short, real) wiring proof.
- **Tests**: complete — all 24 required cases plus a full WebSocket-delivery integration test and a full-stack multi-room test, 155 passing + 1 correctly-skipped (pre-existing, unrelated to this step).
- Next.js UI, PostgreSQL/Prisma, AWS deployment, real mini-games, and multi-instance timer coordination/Redis distributed locks were intentionally **not** started, per the requested scope.
