# Implementation Progress — Development Steps 1, 2, 3, 4, 5, 6 & 7A

Status: **Steps 1 (shared types), 2 (in-memory FSM core), 3 (Redis-backed room store + room actor), 4 (WebSocket gateway), 5 (server-owned timer scheduler), 6 (Next.js frontend foundation + Arabic RTL design system), and 7A (real room create/join HTTP API + frontend integration) are complete.** No PostgreSQL/Prisma, authentication accounts/payments, AWS deployment, real mini-games, multi-instance distributed locking/timer coordination, or a real WebSocket client were implemented, per scope.

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
- Next.js UI (see Step 6, below), PostgreSQL/Prisma, AWS deployment, real mini-games, and multi-instance timer coordination/Redis distributed locks were intentionally **not** started in this step, per the requested scope.

---

# Step 6 — Next.js Frontend Foundation and Arabic RTL Design System

## Repository/tooling survey before starting (per the Step 6 brief's "inspect before building" instruction)

- No `apps/web` (or any frontend) existed. The monorepo had exactly one convention to follow: a single root `package.json`/`node_modules`/`package-lock.json`, per-project `tsconfig.json` files extending `tsconfig.base.json`, one root `vitest.config.ts`, and — notably — **no npm/yarn/pnpm workspaces**: `apps/server` has no `package.json` of its own at all and imports `packages/shared-types` via a plain relative path (`apps/server/src/shared.ts`: `export * from '../../../packages/shared-types/src/index.js'`).
- A real Next.js project fundamentally needs its own `package.json` (its own `next`/`react`/`react-dom`/build scripts), which a zero-workspace, single-root-package.json monorepo can't give it directly. Rather than retrofit npm workspaces (a structural change to how the whole repo installs dependencies, not requested and not needed for one app), `apps/web` was scaffolded as a **normal, self-contained Next.js project** (own `package.json`, own `node_modules`, own `package-lock.json` — the same relationship `packages/shared-types` already has to the rest of the repo, just with real dependencies this time) invoked either directly (`cd apps/web && npm run dev`) or via new root convenience scripts (`npm run dev:web`/`build:web`/`lint:web`). It still reuses `tsconfig.base.json`'s spirit (matching `module`/`moduleResolution`/`strict`/etc. values) and follows `apps/server/src/shared.ts`'s exact relative-import pattern for shared types (`apps/web/lib/shared.ts`).
- Scaffolded via `create-next-app@latest` (not hand-written from scratch) specifically to get a **correct, current** Next.js 16 + Tailwind v4 baseline (CSS-first `@theme` config, `@tailwindcss/postcss`, App Router, ESLint flat config) rather than risk hand-guessing an unfamiliar recent major-version config surface, then fully customized for this project (Arabic RTL, design tokens, route shells, tests) — nothing template-generated was left in place except the mechanical scaffolding files (`next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`).
- Versions resolved at scaffold time: **Next.js 16.2.11, React 19.2.4, Tailwind CSS 4.3.3.**

## Files created

```
D:\projects\jackom\
  package.json                      # +dev:web/build:web/lint:web scripts, typecheck now chains apps/web's own typecheck
  vitest.config.ts                  # include glob extended to apps/web/test/**/*.test.{ts,tsx}
  .gitignore                        # +.next/, +next-env.d.ts

  apps/web/                          # new — self-contained Next.js 16 App Router project
    package.json                     # @jackom/web — next, react, react-dom, tailwindcss v4, zod, eslint(-config-next);
                                      # devDeps: @testing-library/react, jsdom (for this repo's shared Vitest run)
    next.config.ts                   # experimental.externalDir: true (see "Architecture contradiction" below)
    tsconfig.json                    # create-next-app's generated config (already close to tsconfig.base.json's
                                      # values) + packages/shared-types/src/**/*.ts added to `include`
    postcss.config.mjs               # @tailwindcss/postcss (Tailwind v4)
    eslint.config.mjs                # eslint-config-next flat config, unmodified
    README.md                        # project-specific (replaced create-next-app's generic template)

    lib/
      shared.ts                      # `export * from '../../../packages/shared-types/src/index'` — the ONE place
                                      # apps/web touches the shared-types package, mirroring apps/server/src/shared.ts
      design-tokens.ts                # MOTION_DURATION_MS, MOBILE_MIN_TOUCH_TARGET_PX (JS-side companions to the
                                       # CSS design tokens in app/globals.css)
      env.ts                          # zod-validated env (NEXT_PUBLIC_WS_URL — unused until the WebSocket client
                                       # exists, validated now so a malformed value fails fast)
      realtime/
        public-types.ts               # re-exports TvView/PlayerView/PrivatePlayerPayload from lib/shared + DisplayError
        types.ts                      # SocketConnectionState, TvScreenState, PlayerScreenState (typed boundaries —
                                       # NO client/socket implementation, per scope)
        index.ts                      # barrel

    components/
      ui/
        Button.tsx                    # 'use client' — real <button>, disabled/loading states, aria-busy
        button-styles.ts               # buttonClassName() extracted to its OWN non-'use client' module (see
                                        # "Architecture contradiction" below — Server Components need to call it directly)
        Input.tsx                     # labeled field, aria-describedby (hint/error), aria-invalid
        RoomCodeInput.tsx             # 'use client' — sanitizes to the shared room-code alphabet/length live
        Panel.tsx                     # card/panel surface, polymorphic `as`
        PageContainer.tsx             # page width/padding + safe-area inline padding
        StatusBadge.tsx               # pill, optional `live` (role="status"/aria-live)
        Modal.tsx                     # native <dialog>-based foundation (focus trap/Escape from the platform)
        LoadingIndicator.tsx          # spinner, role="status" (suppressible label for nesting inside <Button loading>)
        ErrorMessage.tsx              # role="alert"
        SectionTitle.tsx              # semantic heading (`as`) + visual scale (`default`/`tv`)
        RoomCodeDisplay.tsx           # large per-character TV tiles, one aria-label for the whole code
        PlayerAvatar.tsx              # initials + deterministic color placeholder
        index.ts                      # barrel
      layouts/
        TvScreenLayout.tsx            # centered, large-text, minimal-input shell for the shared/host screen
        PlayerScreenLayout.tsx        # portrait, safe-area header/sticky-footer shell for a player's phone
        index.ts                      # barrel

    app/
      layout.tsx                      # <html lang="ar" dir="rtl">, Cairo font (next/font/google), metadata
      globals.css                     # Tailwind v4 `@theme` — every design token (see below)
      error.tsx                       # route-level error boundary
      global-error.tsx                # root-layout error boundary (inline styles only — see file comment)
      not-found.tsx
      loading.tsx
      page.tsx                        # / — landing
      games/page.tsx                  # /games — single-game shell (the hacker game), no multi-game registry
      tv/page.tsx                     # /tv — TV/host shell (placeholder code, QR placeholder, roster placeholder)
      join/page.tsx                   # /join — room-code entry (client component, local state only)
      join/[roomCode]/page.tsx        # /join/[roomCode] — async Server Component, safely reads+validates the param
      account/page.tsx                # /account — placeholder, no real auth

    test/
      layout.test.tsx                 # root layout lang/dir (renderToStaticMarkup, next/font mocked)
      routes.test.tsx                 # /, /games, /tv, /join, /account, not-found, loading all render
      join-room-code-route.test.tsx   # /join/[roomCode]: valid/lowercase/whitespace/malformed/empty/oversized param
      layouts.test.tsx                # TvScreenLayout/PlayerScreenLayout render their slots
      shared-boundary.test.ts         # static source scan: no import of RoomState/RoomPrivateState anywhere in apps/web
      ui/
        button.test.tsx               # real <button>, disabled blocks clicks, loading sets aria-busy+disabled
        room-code-input.test.tsx      # uppercasing, whitespace, alphabet filtering, length cap, forced dir="ltr"
        accessible-names.test.tsx     # Input/PlayerAvatar/StatusBadge/RoomCodeDisplay/Modal accessible-name wiring

  packages/shared-types/src/
    room-code.ts                      # NEW — ROOM_CODE_ALPHABET/LENGTH, normalizeRoomCodeInput(), isValidRoomCodeFormat()
    index.ts                          # +room-code export; internal `.js` extensions on every re-export dropped (see below)
    config.ts, events.ts, history.ts, match-clock.ts, minigame.ts, phase.ts, players.ts, round-state.ts, views.ts
                                       # internal `.js` extensions on relative imports dropped (mechanical, no behavior change)
```

## Files changed (backend side, both explicitly permitted by the brief)

1. **`apps/server/src/fsm/room-lifecycle.ts`** — the room-code alphabet/length constants (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, length 6) were promoted from a private local literal into the new shared `packages/shared-types/src/room-code.ts`, and `generateRoomCode()` now imports them instead of redeclaring them. Zero behavior change (same alphabet, same length) — this is exactly the "keep the room-code length configurable or based on existing shared contracts; do not invent a conflicting format" instruction: the frontend's `RoomCodeInput`/`/join/[roomCode]` now validate against the SAME constants the server generates from, instead of a second guessed-at definition.
2. **`packages/shared-types/src/*.ts`** — every internal relative import's `.js` extension was dropped (`'./enums.js'` → `'./enums'`), across `index.ts` and 9 other files (27 import specifiers total). Required because Next.js's Turbopack bundler does not apply TypeScript's `moduleResolution: "bundler"` `.js`→`.ts` extension-mapping convention for files reached through `experimental.externalDir` (see "Architecture contradiction" below) — extensionless specifiers resolve unambiguously under every resolver in this repo (tsc, Vitest/Vite, and Turbopack). Re-verified: `apps/server`'s full suite (155 tests) and `npm run typecheck` both still pass unchanged after this — `moduleResolution: "bundler"` never required the `.js` extension in the first place, so this was purely removing something extraneous, not a behavior change.

No hacker-game FSM rules, Redis schemas, `RoomActor` mutation behavior, timer scheduling, WebSocket auth model, session ownership, corruption/voting/`MatchClock` behavior were touched.

## Design-system components created

`Button`, `Input`, `RoomCodeInput`, `Panel`, `PageContainer`, `StatusBadge`, `Modal`, `LoadingIndicator`, `ErrorMessage`, `SectionTitle`, `RoomCodeDisplay`, `PlayerAvatar` — see the file tree above for what each does. All are small, single-purpose, typed with an exported `*Props` interface, and every interactive one is a real semantic element (`<button>`, `<input>`, `<label for>`, native `<dialog>`) — never a styled `<div>` standing in for a control. Keyboard/focus-visible/disabled/loading states are covered per the brief's requirements (see "Tests added" below for what's actually verified, not just asserted in a comment).

## RTL decisions

- `app/layout.tsx` sets `<html lang="ar" dir="rtl">` unconditionally — Arabic is the only supported language for this step (no i18n framework, as explicitly out of scope).
- **Logical properties over manual flex-reversal**: `PageContainer` uses `paddingInlineStart`/`paddingInlineEnd` (not `padding-left`/`-right`); Tailwind's own logical-property utilities (`ms-*`/`me-*`/`ps-*`/`pe-*`, `text-start`/`text-end`) are the intended default for any future spacing/alignment work — nothing in this step hardcodes a physical `left`/`right` value except where direction is genuinely content-driven, not layout-driven (see next point).
- **Deliberate `dir="ltr"` islands**: room codes are always Latin letters/digits (`packages/shared-types/src/room-code.ts`), so `RoomCodeDisplay` and `RoomCodeInput` force `dir="ltr"` on just the code itself — the same pattern real-world Arabic UIs use for phone numbers/codes embedded in RTL text. Everything else inherits the page's RTL direction.
- **Font**: `next/font/google`'s Cairo (Arabic + Latin subsets, weights 400–800), exposed as a CSS variable (`--font-cairo`) and wired into Tailwind's `--font-sans` theme token in `globals.css`, so every component's default text uses it without a per-component font class.
- Focus rings, selection color, and reduced-motion handling are all direction-agnostic (outline/box-shadow-based), so RTL never fights keyboard-navigation visibility.

## Design tokens (centralized in `app/globals.css`'s Tailwind v4 `@theme` block)

Background surfaces (`surface-0/1/2`), text hierarchy (`ink`/`ink-muted`/`ink-subtle`), brand+action+status colors, borders, one soft `shadow-glow` for primary CTAs, TV-safe font sizes (`text-tv-sm/base/lg/xl`), and a `control` spacing token (`h-control`/`p-control`, 48px — the mobile touch-target minimum) are all declared exactly once there and consumed via ordinary Tailwind utility classes everywhere else. Radius/shadow/spacing otherwise deliberately reuse Tailwind's own built-in scale (already centralized by Tailwind itself) rather than inventing parallel names for values Tailwind already provides consistently. Motion durations are documented as constants (`lib/design-tokens.ts`) mapped onto Tailwind's built-in `duration-150/200/300` utilities, and global `prefers-reduced-motion` handling collapses all animation/transition durations to ~0.

## Responsive TV/mobile layout approach

- **`TvScreenLayout`**: centered column, large max-width, `text-tv-*` sizes, one subtle decorative blur (not excessive gradients/glassmorphism per the brief's visual-direction constraints), designed to be read from across a room rather than interacted with closely.
- **`PlayerScreenLayout`**: portrait-first, safe-area-aware header/footer padding (`env(safe-area-inset-*)`), an optional sticky bottom footer slot so a phone's one primary action always stays in thumb reach without the player scrolling or reaching across the screen.
- Both are thin slot-based wrappers (`children`/`header`/`footer`/`eyebrow` props) — actual page content composes them, they don't assume specific page content.

## Route shells implemented

`/` (landing), `/games` (single hacker-game card, no registry), `/tv` (host/TV preview — placeholder room code, QR placeholder box, roster placeholder, disabled start button), `/join` (room-code entry form, client-side validated only), `/join/[roomCode]` (async Server Component reading the route param safely), `/account` (placeholder). `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/loading.tsx` complete the App Router foundation. Every placeholder/not-yet-wired action is labeled in visible Arabic text (e.g. "سيتم تفعيل إنشاء الغرف الفعلي في خطوة قادمة") — nothing pretends a real create/join/auth flow exists.

## Shared types reused (no duplication)

`apps/web/lib/shared.ts` re-exports the entire `packages/shared-types` barrel — `TvView`, `PlayerView`, `PrivatePlayerPayload`, every enum/config/event type, and the new `ROOM_CODE_ALPHABET`/`ROOM_CODE_LENGTH`/`normalizeRoomCodeInput`/`isValidRoomCodeFormat`. `RoomState`/`RoomPrivateState` are not exported by that package at all (they live only in `apps/server/src/types/room-state.ts`), so there is structurally nothing raw for a frontend component to import even by mistake — verified by `apps/web/test/shared-boundary.test.ts`.

## Tests added

**69 new frontend tests, 8 files**, covering every item in the Step 6 test list:

1. Root layout lang/dir — `layout.test.tsx`.
2. Core route shells render without crashing — `routes.test.tsx` (6 routes) + `join-room-code-route.test.tsx` (6 param-handling cases).
3. Button disabled/loading states — `ui/button.test.tsx`.
4. Room-code input format acceptance (uppercase, trim, alphabet filtering incl. the excluded `O`/`1`/`0`/`I`, length cap) — `ui/room-code-input.test.tsx`.
5. Direct join route reads the param safely (valid/lowercase/whitespace/malformed/empty/500-char-plus-`<script>` payload, never crashes) — `join-room-code-route.test.tsx`.
6. TV/player layouts render children (+ header/footer slots) — `layouts.test.tsx`.
7. Accessible names — `ui/accessible-names.test.tsx` (Input label association + error wiring, PlayerAvatar, StatusBadge, RoomCodeDisplay, Modal/`aria-labelledby`); also implicitly covered throughout `routes.test.tsx`/`button.test.tsx` via `getByRole(..., {name})` queries, which only pass if accessible-name computation actually resolves correctly.
8. No raw private backend state — `shared-boundary.test.ts` (static source scan of every `.ts`/`.tsx` under `app/`/`components/`/`lib/` for an import of `RoomState`/`RoomPrivateState` or the server-only `types/room-state` module path — deliberately NOT a runtime `Object.keys()` check, since type-only exports have no runtime representation and such a check would pass vacuously regardless of the codebase's actual state).
9. Existing backend tests continue passing — verified: all 155 pre-existing tests unchanged and passing.
10. Strict TypeScript clean workspace-wide — verified via `npm run typecheck` (now a 3-stage chain: shared-types → server → web).

Tests run through the repo's single shared `vitest.config.ts` (extended to include `apps/web/test/**/*.test.{ts,tsx}`), using `@testing-library/react` + `jsdom` (added as dependencies) — no second/competing test framework introduced. Per-file `// @vitest-environment jsdom` docblocks scope the DOM environment only to files that need it, so `apps/server`'s node-environment tests are unaffected by a single shared config. `next/font/google` is mocked in `layout.test.tsx` (the standard pattern for testing Next.js apps outside `next build`/`next dev`, since the real implementation is a build-time-only transform).

## Tests passing

**224 tests passing, 1 skipped** (155 pre-existing backend + 69 new frontend). The skip is the same pre-existing optional Redis integration test from Step 3, untouched by this step.

```
npm run typecheck   # 3-stage chain (shared-types / server / web), zero errors, strict mode
npm test              # vitest run — 40 files, 225 tests (224 passed, 1 skipped)
npm --prefix apps/web run lint    # eslint (eslint-config-next) — 0 errors, 0 warnings
npm --prefix apps/web run build   # next build — succeeds, all 7 routes compile (5 static, 1 dynamic, 1 not-found)
```

## Architecture contradiction found

**None in ARCHITECTURE.md itself** (that document doesn't specify frontend build tooling). Two **implementation-only** obstacles surfaced while wiring the Next.js build, both resolved without touching any game-logic/behavior:

1. **Turbopack + `.js`-extension relative imports crossing outside the project root don't resolve together.** `apps/web` needed `experimental.externalDir: true` (Next restricts module resolution to the project directory by default) to reach `packages/shared-types/src` at all; even with that enabled, Turbopack failed to resolve `packages/shared-types`'s own internal `'./enums.js'`-style imports (which point at `.ts` files, a convention `moduleResolution: "bundler"` explicitly supports and which `tsc`/Vitest both already handled fine). Resolved by dropping the `.js` extensions from `packages/shared-types`'s internal imports (see "Files changed" above) — extensionless specifiers are unambiguous under every resolver involved, and this required zero behavior change since `moduleResolution: "bundler"` never mandated the extension in the first place.
2. **React Server Components cannot call a plain function exported from a `'use client'` module** — only render its components as JSX. `buttonClassName()` (used so Server Component pages like `/`, `/games`, `/join/[roomCode]`, and `not-found.tsx` can style a real navigation `<Link>` identically to `<Button>` without the link itself becoming a `<button>`) originally lived inside `Button.tsx` (`'use client'`), which broke static prerendering. Resolved by extracting `buttonClassName` (and its supporting types/style tables) into `components/ui/button-styles.ts`, a plain module with no client directive — `Button.tsx` imports from it internally, and every Server Component page imports it directly from `button-styles.ts` rather than through `Button.tsx`.

Neither finding touches ARCHITECTURE.md's actual subject matter (server FSM/persistence/gateway/timers) — both are Next.js/React build-tooling specifics, documented here per the "update ARCHITECTURE.md only if a genuine contradiction is discovered" instruction (this isn't one).

## Known cosmetic item (not fixed, documented instead)

`next build` prints a harmless warning: "Next.js inferred your workspace root... Detected additional lockfiles: apps/web/package-lock.json" (because the repo root also has its own `package-lock.json` for `apps/server`/`packages/shared-types`). The suggested fix (`turbopack.root` in `next.config.ts`) was tried and **reverted** — setting it broke `externalDir` resolution of `packages/shared-types` entirely. The warning is non-fatal and the build succeeds correctly with the inferred root; not worth the risk of re-breaking a working build to silence a warning. Also: `npm audit` reports 5 vulnerabilities (3 moderate, 1 high, 1 critical) among transitive dev-only dependencies pulled in by `jsdom`/tooling — not investigated further (out of scope for this step; `jsdom` is a test-only dependency, never shipped).

## Remaining frontend work (deferred — explicitly out of scope for Step 6)

- Real WebSocket client (connect/reconnect/dispatch/subscribe) implementing the `SocketConnectionState`/`TvScreenState`/`PlayerScreenState` interfaces already prepared in `lib/realtime/`.
- Real `room:create`/`player:join` API wiring (`/tv`'s "ابدأ اللعبة" and `/join`'s "انضم" buttons are currently inert/disabled).
- QR code generation (a placeholder box exists on `/tv`; no QR library was added, per the brief).
- Authentication/account system (`/account` is a placeholder).
- Multi-game registry / `/games` becoming a real catalog (only the one hacker game is listed today).
- Full hacker-game screens per FSM phase (`ROLE_REVEAL`, `HACKER_CORRUPTION`, `MINIGAME_PLAY`, `VOTING`, etc. have no UI yet — only the design system + layouts they'll be built from).
- Final visual polish/animation, real avatar images (currently initials-only placeholders).

## Exact next recommended step

**Development Step 7 — WebSocket client + live room lifecycle (create/join) wired into the `/tv` and `/join` shells**, implementing `lib/realtime/`'s prepared `SocketConnectionState`/`TvScreenState`/`PlayerScreenState` boundary against the real Step 4 gateway (`/host/{roomCode}`, `/play/{roomCode}`), starting with `LOBBY` (room creation, roster display, player join) before any FSM phase past it — mirroring how the backend build order itself started with the lobby/role-reveal vertical slice before real mini-games.

## Step 6 completion

- **Frontend application setup** (App Router, root layout, global CSS, Tailwind config, font config, metadata, error boundary, not-found, loading, env validation): complete.
- **Arabic RTL foundation**: complete — `lang="ar"`/`dir="rtl"`, Cairo font, logical-property-based spacing, deliberate `dir="ltr"` islands for codes, RTL-safe focus/selection/reduced-motion.
- **Design system foundation** (12 primitives + 2 layouts, all keyboard/focus-visible/disabled/loading/accessible-label aware): complete.
- **Visual direction**: complete — dark, playful, TV-legible, no corporate-dashboard/glassmorphism/terminal-hacker clichés.
- **Centralized design tokens**: complete, in `app/globals.css`'s `@theme` block + `lib/design-tokens.ts`.
- **Route shells** (`/`, `/games`, `/tv`, `/join`, `/join/[roomCode]`, `/account`): complete, all clearly marked placeholder-vs-implemented.
- **Responsive TV/mobile layouts** (`TvScreenLayout`, `PlayerScreenLayout`): complete.
- **Frontend state boundaries** (`TvScreenState`/`PlayerScreenState`/`SocketConnectionState`/`DisplayError`, reusing shared contracts, zero raw `RoomState`/`RoomPrivateState` exposure): complete — types only, no client implementation, per scope.
- **Basic accessibility** (semantic HTML, keyboard access, labels, focus-visible, accessible errors, reduced-motion, no clickable-div buttons): complete.
- **Room-code UI foundation** (shared alphabet/length/normalize/validate, now also used by the server): complete.
- **QR placeholder**: complete (visible placeholder box, no library added).
- **Tests**: complete — all 10 required verification points, 224 passing + 1 correctly-skipped (pre-existing, unrelated to this step).
- **Verification**: full test suite, full 3-stage typecheck, eslint, and `next build` all pass.
- Full WebSocket client, real create/join-room API flow (see Step 7A, below), authentication, Stripe/purchases, PostgreSQL, Prisma, AWS deployment, Redis changes, Seen Jeem, multi-game registry, real mini-games, final art/animations, admin dashboard, and multi-language localization were intentionally **not** started in this step, per the requested scope.

---

# Step 7A — Real Room HTTP API and Frontend Create/Join Flow

## HTTP server architecture

A new `apps/server/src/http/` module, deliberately built on Node's built-in `http` module rather than a framework (Express/Fastify/etc.) — the same "no framework, match the existing style" choice Step 4 made for the WebSocket gateway (`ws` over Socket.IO). `HttpApiServer` mirrors `GatewayServer`'s exact shape: `constructor(deps, options)` + `listen(port)`/`close()`, constructed with the SAME `RoomActorManager`/`roomLookupRepo`/`sessionRepo`/`fsmDeps` a `GatewayServer` would use. It is a **separate listener on its own port** — not merged onto the WebSocket gateway's internal HTTP server — but "reuse the existing infrastructure" is satisfied where it actually matters: both share one `RoomActorManager` (and therefore the same in-memory actors, the same Redis-backed repositories) when constructed together in the same process, so a room/session created over HTTP is immediately usable over the WebSocket gateway with no second registration path. This is proven directly by `apps/server/test/http/http-gateway-integration.test.ts`, which builds one `RoomActorManager` and hands it to both an `HttpApiServer` and a `GatewayServer` in the same test.

There is still no production bootstrap/`main.ts` (consistent with every prior step — everything is exercised through test helpers, e.g. `startTestHttpApi()` mirroring `startTestGateway()`); wiring a real process that starts both listeners together is deployment work, out of scope here.

## Endpoints implemented

| Endpoint | Purpose |
|---|---|
| `POST /api/rooms` | Creates a room via `RoomActorManager.createRoom()` (the exact Step 3 method — no new room-creation logic). Returns `{ roomCode, hostSessionToken, tv: TvView }`. |
| `GET /api/rooms/:roomCode` | Read-only availability check via `RoomActor.getOrLoadSnapshot()`. Returns `{ roomCode, joinable, full, matchStarted, playerCount, maxPlayers }` — no roster, no private content. |
| `POST /api/rooms/:roomCode/players` | Registers a player via `RoomActor.runLifecycle(joinPlayer)` (the exact Step 2/4 function, the same path the WebSocket gateway's `player:join` uses). Returns `{ roomCode, playerId, playerSessionToken, view: PlayerView }`. |

All three, plus their DTOs (`CreateRoomResponseBody`, `RoomAvailabilityResponseBody`, `JoinRoomRequestBody`, `JoinRoomResponseBody`, `ApiErrorPayload`, `ApiErrorCode`) live in `packages/shared-types/src/http-api.ts` — genuinely shared between server and client, the same relationship `WireMessage`/`InboundEvent` already have for the WebSocket boundary, so the frontend never hand-duplicates these shapes.

## How RoomActor authority is preserved

No HTTP handler ever touches Redis or `RoomState` directly, and none calls an FSM transition function. `handleCreateRoom` calls `RoomActorManager.createRoom(config)` (Step 3, unchanged). `handleJoinRoom` calls `RoomActor.runLifecycle()` with the exact same `joinPlayer` pure function `gateway-server.ts`'s `handlePlayerJoin` already calls — HTTP join and WebSocket join are the SAME registration path, not two implementations; a request that lands while a WebSocket join for the same room is in flight is naturally serialized by the room's single actor queue (Step 3's per-room `Promise` chain), exactly as any two concurrent player joins already were. Rejections from that authoritative path (`INVALID_PLAYER_COUNT`, `MATCH_IN_PROGRESS`) are mapped to typed HTTP errors (`ROOM_FULL`, `ROOM_NOT_JOINABLE`) — the HTTP layer translates rejection vocabulary, it does not decide anything itself.

Host and player identity remain structurally separate exactly as ARCHITECTURE.md §1.1 requires: `createRoom()` issues a `hostSessionToken` bound to `roomId` only; `joinPlayer()` issues a `sessionToken` bound to `{roomId, playerId}`. No endpoint accepts a client-supplied `playerId` or session token as an input claiming an identity — every identity in every response is freshly server-generated.

**One deliberate placeholder**: no avatar-selection UI exists yet, so every HTTP-created player gets a fixed `avatarId: 'default'` (`http-api-server.ts`'s `DEFAULT_AVATAR_ID` constant) — clearly marked as a placeholder pending a real avatar picker, not a new design decision.

## Idempotency (duplicate-request protection)

`joinRoom`'s request body accepts an optional client-generated `requestId`. A retried request with the SAME `{roomId, requestId}` replays the ORIGINAL response (200, not 201) instead of registering a second player — implemented as a small single-instance, in-memory `IdempotencyCache` (TTL-evicted `Map`, `apps/server/src/http/idempotency-cache.ts`). Reusing a `requestId` with a genuinely DIFFERENT `displayName` is rejected as `DUPLICATE_PLAYER` (409) rather than silently replaying a mismatched result. `JoinRoomForm` (frontend) generates one `requestId` per mount via `crypto.randomUUID()` and reuses it for every submit from that component instance, so an accidental double-click or a retry after a dropped response is safe; a genuinely new page visit gets a fresh id and legitimately creates a new player.

## Sessions: creation and storage

Creation is unchanged from Steps 3/4 — `sessionRepo.setHostSession()`/`setPlayerSession()`, same Redis keys, same TTL refresh behavior, called from the exact same places (`RoomActorManager.createRoom()` for host; the HTTP handler's post-`runLifecycle` step for player, mirroring `gateway-server.ts`'s `handlePlayerJoin` line-for-line).

Storage is new: `apps/web/lib/session-storage.ts`, a typed `sessionStorage` (not `localStorage`, not a cookie) boundary. Every read/write is wrapped in try/catch, degrading to "no session" rather than throwing on private-browsing/quota/corrupted-JSON failures. `sessionStorage` specifically because: a tab refresh keeps working, host and player sessions opened in separate tabs never collide, and no token ever appears in a URL or gets rendered into visible UI. Two keys: `jackom.hostSession` (`roomCode`, `hostSessionToken`) and `jackom.playerSession` (`roomCode`, `playerId`, `playerSessionToken`, `displayName`) — exactly the fields the brief specifies, nothing extra.

## Frontend pieces created

- **`lib/api/client.ts`** — the one typed HTTP boundary; no page calls `fetch()` directly. `createRoom()`/`getRoomAvailability()`/`joinRoom()`, each going through one internal `apiRequest<T>()` that adds a `AbortController`-based timeout (8s default), maps non-2xx JSON error bodies to a typed `ApiClientError` (carrying the server's `code`/`status`), and maps network failures/aborts to typed `NETWORK_ERROR`/`TIMEOUT` codes distinct from server-side error codes. Checks `NEXT_PUBLIC_API_URL` at CALL time (not module load), so an unset value never breaks `next build`'s static prerendering (`NOT_CONFIGURED` error instead) — same reasoning Step 6 already applied to `NEXT_PUBLIC_WS_URL`.
- **`lib/api/error-messages.ts`** — one Arabic message per `ApiClientErrorCode` (server codes + the three client-only ones), so every error surface in the app renders the same message for the same failure.
- **`lib/session-storage.ts`** — described above.
- **`components/create-room-button.tsx`** — the one client-interactive island on the otherwise server-rendered landing page: owns loading/error state, calls `createRoom()`, stores the host session, navigates to `/tv`.
- **`components/join-room-form.tsx`** — the client component behind `/join/[roomCode]`: one-time room-availability check → display-name form → real join request → stores the player session → Arabic waiting screen. A five-state machine (`invalid-format` / `checking` / `unavailable` / `ready` / `joined`), never polling, never claiming a live roster.

## Frontend routes connected

- **`/` (home)**: "أنشئ غرفة" is now a real button (`CreateRoomButton`), not a `<Link>` — it performs the actual API call before navigating. "انضم إلى غرفة" stays a plain `<Link>` to `/join` (no API call needed there).
- **`/tv`**: reads the stored host session on mount; with no session, shows an honest "لم يتم إنشاء غرفة بعد" state (never fabricated room content). With a session, does ONE availability check and displays the REAL room code (`RoomCodeDisplay`) and current player count — explicitly labeled "الاتصال المباشر باللاعبين قادم قريبًا" (live connection coming soon), never implying a live roster. "ابدأ اللعبة" remains disabled (Step 7B).
- **`/join`**: unchanged room-code entry UX, but the submit button ("متابعة") now performs real client-side validation and navigates to `/join/[code]` for a complete code (previously a no-op `preventDefault`).
- **`/join/[roomCode]`**: the server page still only does the cheap, safe param normalization/format-check (unchanged from Step 6); everything requiring a network call or `sessionStorage` was extracted into `JoinRoomForm` (a client component), keeping the async Server Component pattern Step 6 established for the param-safety guarantee.

## Validation and security behavior

- **Room code**: normalized (`trim` + uppercase) and format-checked via the SAME shared helpers (`packages/shared-types/src/room-code.ts`) on both the URL path segment (HTTP) and the route param (frontend) — one definition, not two.
- **Display name**: new `packages/shared-types/src/display-name.ts` (mirrors `room-code.ts`'s pattern) — `normalizeDisplayNameInput()` (trim only) + `isValidDisplayName()` (length 1–24 after trim, rejects `\p{Cc}`/`\p{Cf}` control/format-only content). Deliberately permissive on script (Arabic and Latin both accepted, and anything else too) since no restrictive-charset rule exists anywhere else in the codebase to "follow," per the brief's own instruction.
- **Request size**: 16KB body limit (matches the WebSocket gateway's `maxPayloadBytes` default), enforced by aborting the body-read stream mid-flight, not after buffering an oversized payload.
- **Malformed JSON / missing fields / wrong types**: all zod-validated (`apps/server/src/http/schemas.ts`), producing typed 400 errors, never a raw parse exception.
- **CORS**: exact-origin allow-list only (`HttpApiOptions.allowedOrigins`, validated via `loadHttpApiEnvConfig()` reading `HTTP_ALLOWED_ORIGINS`) — no wildcard, ever. A request WITH an `Origin` header not on the list is rejected 403 **before routing**, not just left for the browser to silently block — defense in depth, not just "let CORS handle it." `Access-Control-Allow-Credentials` is never set (sessions travel in response/request bodies, never cookies, per the brief's explicit instruction not to invent cookie auth this step). A request with NO `Origin` header (non-browser callers, e.g. the test suite's own `fetch`) is not blocked — CORS is a browser enforcement mechanism, so there's nothing to check without an `Origin` to check against.
- **Rate limiting**: reuses the existing `RateLimiter` class (Step 4, sliding window, clock-injected) — one bucket per client IP, shared across `POST /api/rooms` and `POST /api/rooms/:roomCode/players` (the two "creation and joining" endpoints named in the brief); `GET` availability checks are not rate-limited. **In-memory, single-instance only** — explicitly not backed by Redis, matching the brief's instruction not to add distributed rate limiting; documented in `http-api-server.ts`'s own comments.
- **No trust of client-supplied identity**: no endpoint accepts a `playerId`/host token as input for anything other than looking up an EXISTING session (which none of these three endpoints even do) — every id in every response is freshly generated server-side.
- **Logging**: every HTTP failure path logs through the same narrow `RoomLogger` (`{roomId, event}`, no raw-object escape hatch) Steps 3–5 already established; verified directly (`14.` in both `create-room.test.ts` and `join-room.test.ts`) that a session token never appears in a captured log entry.

## Tests added

**40 new backend tests** (`apps/server/test/http/`, 6 files) covering requirements 1–16 from the brief (room-code normalization, host-session validity/persistence, availability success/not-found/expired/malformed, exactly-one-player joins, valid player sessions, malformed-code/invalid-name/full-room/started-room rejections, idempotent-vs-distinct requestId behavior, no raw `RoomState`/`RoomPrivateState` in any response, no logged tokens, CORS accept/reject/preflight/no-credentials, typed rate-limit response) plus the HTTP↔WebSocket shared-infrastructure integration test described above.

**32 new frontend tests** (8 files) covering requirements 17–21: `create-room-button.test.tsx` (stores host session + navigates on success, loading state, typed Arabic error on failure), `tv-page.test.tsx` (real room code display, live-updating-count-is-still-one-time-fetch, typed error state, "coming soon" connection label), `join-room-form.test.tsx` (availability-gated form, stores player session on success, same `requestId` across retries, typed Arabic error on failure), rewritten `join-room-code-route.test.tsx` (malformed param never calls the API; valid param normalizes before checking availability), `api-client.test.ts` + `api-client-not-configured.test.ts` (request shape, error-code mapping, network/timeout mapping, unconfigured-URL short-circuit), `session-storage.test.ts` (round-trip, independence, corrupted-JSON and storage-failure degradation), and an updated `routes.test.tsx` reflecting the new interactive `/`/`/tv`/`/join` states.

**22 (backend #22/#23), 24, 25, 26, 27**: verified by running the existing suites/tools unchanged — all 155 pre-existing backend tests (including every WebSocket gateway and timer test) and all 70 pre-existing frontend tests still pass; full 3-stage typecheck, eslint, and `next build` all succeed (see below).

## Tests passing

**297 tests passing, 1 skipped** (195 backend incl. 40 new HTTP tests + 102 frontend incl. 32 new). The skip is the same pre-existing optional Redis integration test from Step 3.

```
npm run typecheck   # 3-stage chain, zero errors, strict mode
npm test              # vitest run — 52 files, 298 tests (297 passed, 1 skipped)
npm --prefix apps/web run lint    # 0 errors, 0 warnings
npm --prefix apps/web run build   # succeeds, all 7 routes compile (5 static, 1 dynamic, 1 not-found)
```

## A real lint finding this pass caught (fixed, not suppressed blindly)

`app/tv/page.tsx`'s `useEffect` reads `sessionStorage` (browser-only, unavailable during SSR) and calls `setState` synchronously in the effect body — `eslint-config-next`'s `react-hooks/set-state-in-effect` rule flags this as a potential unnecessary-effect anti-pattern. It is NOT one here: a `useState` lazy initializer would only ever see the SSR-time `null` result even after client hydration (React does not re-run lazy initializers during hydration), permanently hiding a real session. The effect-based read is the architecturally correct pattern for "synchronize with an external system" (the exact case the rule's own guidance carves out) — documented inline and the rule suppressed for that one line with a comment explaining why, rather than either silently accepting a broken pattern or contorting the code to please the linter.

## Architecture contradiction found

**None.** Everything in ARCHITECTURE.md relevant to Step 7A (host/player session separation, identity bound server-side, `joinPlayer`/`createRoom` as the sole registration paths, view-projection-only client exposure, single-actor-per-room serialization) was implementable exactly as designed — the HTTP layer is a second entry point INTO the same authoritative path, not a new one.

## Deferred Step 7B items (explicitly out of scope for 7A)

- Browser WebSocket client (the `SocketConnectionState`/`TvScreenState`/`PlayerScreenState` interfaces `lib/realtime/` already declares, per Step 6, are still unimplemented).
- Live player-list updates on `/tv` (today: one-time availability fetch on mount, explicitly labeled "coming soon").
- Reconnection UI.
- Host start-game action (`/tv`'s "ابدأ اللعبة" stays disabled).
- QR generation, gameplay/role-reveal/voting/mini-game screens.
- Authentication accounts, purchases, Stripe, PostgreSQL, Prisma, AWS deployment, Redis schema changes.

## Exact recommended next step

**Development Step 7B — Browser WebSocket client + live lobby**: implement the actual WebSocket connection (using the stored `hostSessionToken`/`playerSessionToken` from `lib/session-storage.ts` to authenticate via `host:reconnect`/`player:reconnect`, exactly as `http-gateway-integration.test.ts` already proves works end-to-end at the protocol level), populate `lib/realtime/`'s `TvScreenState`/`PlayerScreenState` from real `view:tv`/`view:player` messages, make `/tv`'s roster and player count live, and enable the host's real "ابدأ اللعبة" action — still stopping short of any actual gameplay-phase UI (role reveal, corruption, voting, mini-games), which remains later work.

## Step 7A completion

- **HTTP boundary** (`POST /api/rooms`, `GET /api/rooms/:roomCode`, `POST /api/rooms/:roomCode/players`): complete.
- **Authoritative-path reuse** (no direct Redis/RoomState access, no FSM calls from HTTP handlers, join registration shared with the WebSocket gateway): complete.
- **Typed error format** across all three endpoints: complete.
- **Security** (size limits, per-IP rate limiting on create/join, exact-origin CORS with no wildcard/credentials, no client-trusted identity, no token logging): complete.
- **Idempotent join retries**: complete.
- **Frontend integration** (home create button, `/tv` real room display, `/join` navigation, `/join/[roomCode]` availability check + name form + real join + waiting screen): complete.
- **Session storage** (`sessionStorage`, typed, degrade-safe): complete.
- **Typed API client**: complete.
- **Tests**: complete — all 27 required verification points, 297 passing + 1 correctly-skipped (pre-existing, unrelated to this step).
- **Verification**: full test suite, full 3-stage typecheck, eslint, and `next build` all pass.
- Browser WebSocket client, live lobby updates, host start-game, QR generation, gameplay screens, authentication, payments, PostgreSQL, Prisma, AWS deployment, and Redis schema changes were intentionally **not** started, per the requested scope.
