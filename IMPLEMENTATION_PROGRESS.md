# Implementation Progress — Development Steps 1, 2, 3, 4, 5, 6, 7A, 7B, 7C & 8A

Status: **Steps 1 (shared types), 2 (in-memory FSM core), 3 (Redis-backed room store + room actor), 4 (WebSocket gateway), 5 (server-owned timer scheduler), 6 (Next.js frontend foundation + Arabic RTL design system), 7A (real room create/join HTTP API + frontend integration), 7B (browser WebSocket client + real-time lobby), 7C (full local development runner), 8A (Jackom visual identity + product UX redesign), all six production normal minigames, and the Bomb Protocol special-game backend are complete.** No PostgreSQL/Prisma, authentication accounts/payments, AWS deployment, multi-instance distributed locking/timer coordination, gameplay-phase UI, or dedicated backend hardening audit was implemented, per scope.

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

---

# Step 7B — Browser WebSocket Client and Real-Time Lobby

## Repository state before starting

Verified clean at `4bb551c` ("feat(server): add room create and join api", HEAD, matching Step 7A's completion commit) before any Step 7B work began — `git status` showed no uncommitted changes and `git log` confirmed the expected history (`4bb551c` → `c6972fb` → `9cff682` → `b5a3a4f` → `909bb67`).

## Files created

```
D:\projects\jackom\
  apps/web/
    package.json                       # +qrcode dependency, +@types/qrcode devDependency

    lib/realtime/
      wire-schemas.ts                  # NEW — small, dedicated frontend zod schemas mirroring the
                                        # gateway's wire format (envelope, error payload, TvView/
                                        # PlayerView/PrivatePlayerPayload — validates only the fields
                                        # this lobby-only UI actually renders, z.unknown()/.passthrough()
                                        # for the rest; see the file's own comment for why this doesn't
                                        # duplicate packages/shared-types or add a cross-package zod dep)
      types.ts                         # REWRITTEN — ConnectionState is now the real 8-state union
                                        # ('idle'|'connecting'|'authenticating'|'connected'|
                                        # 'reconnecting'|'disconnected'|'unauthorized'|'failed'),
                                        # replacing Step 6's placeholder SocketConnectionState
      connection-status.ts             # NEW — describeConnectionState(): one Arabic label + visual
                                        # tone per ConnectionState, shared by both lobbies
      realtime-socket.ts               # NEW — RealtimeSocket, the one place raw WebSocket code lives
      useHostRealtime.ts               # NEW — host connection hook (view:tv, startGame())
      usePlayerRealtime.ts             # NEW — player connection hook (view:player, privateInfo)
      index.ts                         # REWRITTEN barrel — exports the above plus the Step 6 types

    components/
      ui/QrCode.tsx                     # NEW — client-side QR generation via the `qrcode` package
      tv-lobby.tsx                      # NEW — the real, live host lobby
      player-lobby.tsx                  # NEW — the real, live player lobby
      post-lobby-placeholder.tsx        # NEW — shared, static, non-interpretive post-LOBBY screen

    test/
      helpers/realtime-server.ts        # NEW — boots a REAL GatewayServer (reusing apps/server's own
                                        # test helpers) for WebSocket-client tests to connect a REAL
                                        # WebSocket to; seedRoom() persists a room (+ optional
                                        # pre-joined players) directly via the repositories
      lib/realtime/
        realtime-socket.test.ts         # NEW — protocol-level tests against the real GatewayServer
        realtime-socket-backoff.test.ts # NEW — backoff/cap/jitter/reset + online/offline, fake WebSocket
        realtime-hooks.test.tsx         # NEW — useHostRealtime/usePlayerRealtime, mocked RealtimeSocket
      components/
        tv-lobby.test.tsx               # NEW — mocked useHostRealtime
        player-lobby.test.tsx           # NEW — mocked usePlayerRealtime
        qr-code.test.tsx                # NEW — mocked `qrcode` package
        post-lobby-placeholder.test.tsx # NEW
```

## Files changed

```
  packages/shared-types/src/http-api.ts       # RoomAvailabilityResponseBody gained `minPlayers: number`
                                               # (TvLobby's start-button UX needs it; the server remains
                                               # the sole authority over whether a start is actually
                                               # accepted, regardless of what this disables client-side)
  apps/server/src/http/http-api-server.ts     # handleGetRoomAvailability now returns minPlayers
  apps/server/test/http/room-availability.test.ts  # updated assertion for the new field

  apps/web/lib/env.ts                          # +NEXT_PUBLIC_WEB_BASE_URL (QR join-link base only —
                                               # never sent to the server, never contains a token)
  apps/web/components/ui/index.ts              # +QrCode export
  apps/web/app/tv/page.tsx                     # 'ready' state now renders <TvLobby> (real, live)
                                               # instead of Step 7A's static "coming soon" placeholder
  apps/web/components/join-room-form.tsx       # +'checking-session' phase (restores an already-joined
                                               # session on refresh instead of re-running the join flow);
                                               # 'joined' phase now renders <PlayerLobby> (real, live)

  apps/web/test/api-client.test.ts             # +minPlayers in mocked availability responses
  apps/web/test/join-room-code-route.test.tsx  # +minPlayers (3 occurrences)
  apps/web/test/join-room-form.test.tsx        # +minPlayers; +2 new tests for 'checking-session'
                                               # restoration (same room vs. a different room)
  apps/web/test/tv-page.test.tsx               # 2 of the 4 existing tests REWRITTEN — Step 7A's
                                               # assertions against static "coming soon" text no longer
                                               # apply now that a real TvLobby renders; see "Tests added"
```

## WebSocket client architecture chosen

A framework-agnostic core class, `RealtimeSocket` (`lib/realtime/realtime-socket.ts`), wrapped by two thin React hooks (`useHostRealtime`/`usePlayerRealtime`). This is the one place in the frontend that touches the raw `WebSocket` API — no page or component ever constructs a socket directly. `RealtimeSocket` owns: building the URL (`{wsBaseUrl}/{host|play}/{roomCode}`) from a validated `wsBaseUrl` the caller supplies, opening/closing the connection, sending the auth message first, safely parsing/validating every inbound message before handing it to the caller, exposing an 8-state `ConnectionState` via an `onStateChange` callback, capped-exponential-backoff-with-jitter reconnection, and online/offline handling. It knows nothing about React, TvView/PlayerView rendering, or session storage — those are the hooks' job. This split is what let the protocol-level tests (`realtime-socket.test.ts`) exercise the real class against a real `GatewayServer` with zero React/DOM involved, and let the hook tests (`realtime-hooks.test.tsx`) exercise the React wiring with the transport entirely mocked out — two genuinely independent test surfaces instead of one that has to fake both at once.

`useHostRealtime`/`usePlayerRealtime` each own exactly one `RealtimeSocket` instance per mounted session, via `useRef` (never re-created on re-render) constructed inside a `useEffect` keyed on the session's **primitive fields** (`session?.roomCode`, `session?.hostSessionToken`/`playerSessionToken`) rather than the session object's reference identity — this is what makes the effect correctly a no-op across ordinary re-renders and correctly re-run only on a genuine session change, and what makes React Strict Mode's dev-only double-invocation safe: the effect's cleanup (`socket.close()`) runs between the two invocations, and `RealtimeSocket` itself guards every event handler with a `this.ws !== socket` staleness check, so a stale first-invocation socket's late-arriving events can never leak into the second invocation's state.

## Auth-first-message implementation

`RealtimeSocket.openSocket()` attaches its `'open'` listener before anything else, and that listener's ONLY job is to call `this.options.buildAuthMessage()` and send the result — nothing else can run between the socket opening and that send, because the listener body is synchronous. `useHostRealtime` supplies `buildAuthMessage: () => ({ type: 'host:reconnect', payload: { hostSessionToken: session.hostSessionToken } })`; `usePlayerRealtime` supplies `buildAuthMessage: () => ({ type: 'player:reconnect', payload: { sessionToken: session.playerSessionToken } })` — the exact existing gateway reconnect events from Step 4, unchanged. **`player:join` is never sent by this client layer at all** — Step 7A's HTTP API remains the only path that ever registers a new player; the WebSocket layer only ever re-authenticates an identity that already exists. This is verified directly: `realtime-socket.test.ts` test "8. connecting via WebSocket (player:reconnect) never creates a duplicate player" seeds one player via the repositories, connects via WS, and asserts the persisted room still has exactly one player afterward.

## Host/player session restoration

- **TV**: unchanged from Step 7A's `checking-session`/`no-session`/`loading`/`error` flow (`app/tv/page.tsx`) — only the terminal `'ready'` branch changed, from static placeholder JSX to `<TvLobby session={...} minPlayers={...} maxPlayers={...} />`, which itself calls `useHostRealtime(session)` and authenticates via `host:reconnect` using the stored `hostSessionToken`.
- **Player**: `JoinRoomForm` gained a new initial `'checking-session'` phase (`components/join-room-form.tsx`) that reads `loadPlayerSession()` and, if an existing session matches the CURRENT room code, skips straight to rendering `<PlayerLobby session={existing} />` — never re-running the availability check or the join flow. A session for a *different* room code does not leak in; the normal flow runs as if no session existed (verified by a dedicated test). `PlayerLobby` itself then authenticates via `player:reconnect` using the stored `playerSessionToken`.

Both restore the SAME identity on every reconnect — never a new player, never a new room. `realtime-socket.test.ts` test "16" simulates a browser refresh (closing one `RealtimeSocket` instance, constructing a brand-new one with the same stored token, exactly like a fresh page load would) and confirms it reconnects and authenticates correctly as the same player.

## Reconnection / backoff strategy

Capped exponential backoff with jitter, implemented in `RealtimeSocket.scheduleReconnect()`: `delay = min(10_000ms, 500ms × 1.8^attempt) ± 20% random jitter`, `attempt` incrementing on every scheduled retry and resetting to `0` on the next successful `host:authenticated`/`player:reconnected` ack. Verified in `realtime-socket-backoff.test.ts` (using a fake `WebSocket` implementation injected via `RealtimeSocket`'s test-only `webSocketImpl` option, plus `vi.useFakeTimers()`, so nothing in this test file waits in real time):

- Delay grows within the exact computed `[min, max]` bounds for consecutive attempt indices 0 and 1.
- Delay never exceeds the `MAX_DELAY_MS` cap (`± jitter`), verified across 8 consecutive failures where an uncapped formula would already be in the tens of seconds.
- A successful connection resets the attempt counter — the NEXT disconnect's delay is back at attempt-0 bounds, not continuing to grow.
- After `maxConsecutiveFailures` consecutive failures, automatic reconnection stops entirely and the state becomes `'failed'` with the Arabic message "تعذر الاتصال بالخادم." — and stays stopped (no further attempts) until `retry()` is called explicitly (the "إعادة المحاولة" button).
- An `'unauthorized'` state (session rejected — `SESSION_INVALID`/`SESSION_ROOM_MISMATCH`) also stops automatic reconnection immediately, independent of the failure counter — a bad/expired session is never worth retrying automatically (verified in `realtime-socket.test.ts`).
- `navigator.onLine === false` short-circuits `scheduleReconnect()` into a `'disconnected'`/`OFFLINE` state without burning an attempt; a `window` `'online'` event triggers an immediate reconnection attempt (bypassing the backoff timer) if the socket isn't already open; a `window` `'offline'` event immediately reflects the offline state. Both listeners are attached on `connect()`/`retry()` and detached on `close()` — no leak across unmounts.
- `RealtimeSocket.close()` is terminal: cancels any pending reconnect timer, detaches the online/offline listeners, and closes the socket — called from every hook's `useEffect` cleanup, so unmounting mid-connection (or mid-backoff-wait) never leaves a dangling timer or a socket that later resurrects stale state into an unmounted component.

## TV lobby implementation

`components/tv-lobby.tsx`, rendered by `/tv` once a host session and its one-time `minPlayers`/`maxPlayers` availability check both exist. Shows: the real room code (`RoomCodeDisplay`, always from the stored session, never a placeholder), a QR panel (real QR if `NEXT_PUBLIC_WEB_BASE_URL` is configured, an honest text fallback otherwise — see "QR implementation" below), a live player roster built directly from `TvView.players` (name, avatar, per-player connection-status badge — "متصل"/"غير نشط"/"غير متصل", never color-only), a live player count, a connection-status badge (`describeConnectionState`, `aria-live="polite"`), and the "ابدأ اللعبة" button. An `'unauthorized'` connection clears the stored host session and shows a link back home instead of any lobby content. A `'failed'`/`'disconnected'` state shows the specific error message plus a manual "إعادة المحاولة" button. Once the server's view reports a phase other than `LOBBY`, the roster/QR/start-button section is replaced entirely by `PostLobbyPlaceholder`.

## Player phone lobby implementation

`components/player-lobby.tsx`, rendered once a player session exists (fresh join or restored). Shows: a join confirmation with the display name ("أهلًا، سارة!" / "تم انضمامك إلى الغرفة {code}."), the connection-status badge, the current total player count once `PlayerView` provides it (`others.length + 1`), the waiting instruction ("انتظر المضيف لبدء اللعبة."), and — on failure/disconnection — the specific error message plus a manual retry button. An `'unauthorized'` connection clears the stored player session and shows "انتهت الجلسة، انضم من جديد." with a link back to `/join`. Never renders another player's name/status, the host's session, or any private role/vote content — `PlayerView`/`PrivatePlayerPayload` isolation is structural (see below), not a UI-level filter. Once the phase leaves `LOBBY`, the whole panel is replaced by the shared `PostLobbyPlaceholder`.

## Live player update behavior

Entirely server-driven, unchanged gateway mechanics: a player's `RealtimeSocket` authenticating via `player:reconnect` triggers the SAME existing gateway path Step 4 already built (session resolve → room-match check → socket bind → synthesized `player:reconnected` FSM event → `connectionStatus` flips to `'connected'` → `broadcastRoom()`), and a socket closing triggers the SAME existing disconnect path (`player:disconnected`). The frontend does nothing but render whatever `TvView`/`PlayerView` the server sends after each of those transitions. Verified end-to-end against a REAL `GatewayServer` in `realtime-socket.test.ts`: connecting one, then a second, live player socket produces a `TvView` roster showing both as `'connected'`; disconnecting and reconnecting the same player's socket leaves the room with exactly one player (never a duplicate) whose status returns to `'connected'`; each player's `PlayerView` correctly identifies only themselves as `self` and never receives another player's `PrivatePlayerPayload`.

## QR implementation

`components/ui/QrCode.tsx`, using the `qrcode` npm package (small, actively maintained, MIT-licensed) — generates a PNG data URL client-side (`QRCode.toDataURL`) and renders it as a plain `<img>` (never `dangerouslySetInnerHTML`), with an animated placeholder while generating and a clear Arabic text fallback ("تعذر إنشاء رمز QR") on failure, never a broken image. `TvLobby` builds the encoded value itself — `{NEXT_PUBLIC_WEB_BASE_URL}/join/{roomCode}`, using the SAME normalized room code shown in `RoomCodeDisplay`, validated through the existing `env.ts` boundary — and passes only that URL string to `QrCode`; the component has no knowledge of sessions/tokens/playerIds, so there is nothing to leak even by mistake. If `NEXT_PUBLIC_WEB_BASE_URL` isn't configured, the QR panel shows the same visible-room-code fallback text instead of guessing at a base URL. The `<img>` always carries accessible `alt` text containing the full join URL. Verified directly: `qr-code.test.tsx` mocks the `qrcode` package and asserts the value passed to `toDataURL` is exactly the caller-supplied URL — never a token or playerId.

## Host start behavior

`useHostRealtime.startGame()` reads the CURRENT `phase.phaseId` from the latest received `TvView` (via a ref kept in sync by its own `useEffect`, never read/written during render) and sends the exact existing `host:startGame {phaseId}` event through `RealtimeSocket.send()` — into the real gateway, into the real `RoomActor.dispatch()`, through the real FSM. The frontend never transitions itself: `startPending` becomes `true` immediately (loading state on the button) and only clears once the NEXT `view:tv` or an `error:actionRejected` arrives — an accepted start moves the room's real phase off `LOBBY`, which `TvLobby` detects and swaps to `PostLobbyPlaceholder`; a rejected start (e.g. not enough players by the time it's processed) surfaces the server's own message via `ErrorMessage` and re-enables the button. The button's `disabled` state is driven by `minPlayers`/`maxPlayers` from Step 7A's availability check purely for UX — this is explicitly never treated as authoritative; the server's own FSM guard is what actually accepts or rejects the event regardless of what the button shows.

## How RoomActor authority is preserved

No line of frontend or gateway code changed how `RoomActor`/the FSM work. Every event this client layer ever sends (`host:reconnect`, `player:reconnect`, `host:startGame`) is one of the gateway's existing, unchanged wire message types, routed through the exact same `RoomActor.dispatch()` path every other step's tests already exercise. The client's own zod schemas (`wire-schemas.ts`) validate only what's RECEIVED and rendered — they impose no new constraint on what the server accepts, and nothing in the client can call the FSM directly, mutate `RoomState`, or bypass `RoomActor`.

## How private payload isolation is preserved

Structural, not a UI-level filter. `PrivatePlayerPayload` only ever reaches a socket that is (a) authenticated as that specific player and (b) connected to `/play/{roomCode}` — the host's `TvView` never contains it (verified directly: `realtime-socket.test.ts` test "13" connects a host to a room with a joined player and asserts no `player:privateRoleInfo` envelope is ever received on the host connection), and `usePlayerRealtime` scopes `privateInfo` to its own single `RealtimeSocket` instance, clearing it on session change, on `'unauthorized'`, and on unmount — it is never cached globally, never written to `localStorage`, and never logged. (In the LOBBY-only scope this step covers, roles don't exist yet, so `privateInfo` is always `null` in practice today — the isolation mechanism is built and tested regardless, ready for the phase after LOBBY.)

## Gateway changes

**None.** Every WebSocket message type, close code (`4000`/`4001`/`4002`/`4003`), auth flow, and broadcast path this step relies on already existed, unchanged, from Step 4/5. The only backend change at all was the small, HTTP-only `minPlayers` DTO addition described above (`packages/shared-types/src/http-api.ts` + `apps/server/src/http/http-api-server.ts`) — it does not touch the WebSocket gateway, `RoomActor`, or the FSM in any way.

## Tests added

**60 new/changed tests across 7 new files, plus 2 rewritten tests in an existing file and 2 new tests in another:**

- `realtime-socket.test.ts` (12 tests) — protocol-level, against a REAL `GatewayServer` + a REAL WebSocket client (`ws`'s own client, injected via `RealtimeSocket`'s test-only `webSocketImpl` option — see the jsdom/undici note below): host/player auth via the exact existing reconnect events, invalid-session rejection, no duplicate player created via WS, PrivatePlayerPayload never reaching the host, live multi-player TvView updates, personalized PlayerView isolation, disconnect/reconnect restoring the same player, a simulated browser-refresh reconnect, duplicate-socket replacement, and unauthorized-stops-auto-reconnect-until-manual-retry.
- `realtime-socket-backoff.test.ts` (6 tests) — backoff growth/cap/jitter-bounds/reset-on-success, max-consecutive-failures terminal state, and offline/online handling — a fake `WebSocket` + `vi.useFakeTimers()`, no real waiting time anywhere.
- `realtime-hooks.test.tsx` (13 tests) — `useHostRealtime`/`usePlayerRealtime` with `RealtimeSocket` mocked entirely: auth message construction, state/view wiring, `startGame()`/rejection handling, private-info isolation and clearing (unauthorized, unmount), session-change socket replacement, unmount cleanup, and the `NEXT_PUBLIC_WS_URL`-unconfigured failure path.
- `components/tv-lobby.test.tsx` (8 tests) / `components/player-lobby.test.tsx` (7 tests) — with the realtime hooks mocked: real room code + waiting state, live roster with visible (non-color-only) status, start-button min-player gating, rejected-start error display, post-lobby placeholder swap, unauthorized session-clearing, manual retry.
- `components/qr-code.test.tsx` (2 tests) / `components/post-lobby-placeholder.test.tsx` (1 test).
- `tv-page.test.tsx` — 2 of the 4 pre-existing tests were REWRITTEN (not merely patched): Step 7A's assertions against a static "coming soon" placeholder and a one-time `playerCount` snapshot no longer describe real behavior now that a live `TvLobby` renders. Replaced with (a) a test that mocks `useHostRealtime` to prove `TvPage` correctly wires the session/`minPlayers`/`maxPlayers` props down into the real `TvLobby` (live-roster behavior itself is covered by `tv-lobby.test.tsx`, not duplicated here), and (b) a test verifying the REAL, unmocked failure path when `NEXT_PUBLIC_WS_URL` is genuinely unconfigured — a clear `'failed'` state, never a silent false "live" claim.
- `join-room-form.test.tsx` — 2 new tests: a stored session for the CURRENT room restores the lobby directly without re-checking availability or re-joining; a stored session for a DIFFERENT room does not leak in and the normal join flow runs.

**A note on `jsdom` and the WebSocket client**: `realtime-socket.test.ts` and `realtime-socket-backoff.test.ts` deliberately run in Vitest's plain `"node"` environment (no `@vitest-environment jsdom` pragma) rather than jsdom. Node's own native `WebSocket` (undici-based) intermittently crashes when combined, in the same process, with a gateway server built on the `ws` package — an internal undici `Event`-instanceof mismatch, unrelated to anything in this project's own code. `realtime-socket.test.ts` sidesteps it by injecting `ws`'s own client (via the same `webSocketImpl` test hook used for the fake-WebSocket backoff tests) — genuinely exercising the wire protocol end-to-end, just not through Node's native client. React-DOM-rendering tests (`realtime-hooks.test.tsx`, the component tests) DO use jsdom, but mock the transport entirely (`RealtimeSocket` itself, or the hooks), so they never touch a real socket and never hit this issue.

## Tests passing

**357 tests passing, 1 skipped** (up from 297 passing/1 skipped at the end of Step 7A) — 358 total across 59 files (up from 298 across 52). The skip is the same pre-existing optional Redis integration test from Step 3, untouched by this step. Every pre-Step-7B test still passes, except the 2 `tv-page.test.tsx` tests deliberately rewritten above (their premises — a static placeholder — no longer exist).

```
npm run typecheck                 # 3-stage chain (shared-types / server / web), zero errors, strict mode
npm test                          # vitest run — 59 files, 358 tests (357 passed, 1 skipped)
npm --prefix apps/web run lint    # eslint — 0 errors, 1 pre-existing-pattern warning (see below)
npm --prefix apps/web run build   # next build — succeeds, all 7 routes compile (5 static, 1 dynamic, 1 not-found)
```

## A real lint finding this pass caught (fixed, not suppressed blindly)

`react-hooks/refs`: `useHostRealtime` originally wrote `viewRef.current = view` directly in the render body (to give `startGame()` synchronous access to the latest view without depending on it in a `useCallback`). Writing to a ref during render is flagged because it's an impure side effect that can behave unpredictably under React's concurrent rendering. Fixed by moving it into its own `useEffect(() => { viewRef.current = view; }, [view])` — a genuine correctness fix, not a suppression.

`react-hooks/set-state-in-effect`: three call sites (`QrCode`'s loading-state reset before starting async generation, and `useHostRealtime`/`usePlayerRealtime` resetting connection/private state when the session changes) reset React state synchronously at the top of an effect. Each is a legitimate "synchronize with an external system" case — the exact pattern the rule's own guidance carves out, and the same pattern Step 7A's `app/tv/page.tsx`/`join-room-form.tsx` already established for `sessionStorage` reads — documented inline and suppressed for that one line each, matching the existing repo convention exactly (`// eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above`).

The one remaining lint warning (`@next/next/no-img-element` on `QrCode.tsx`'s `<img>`) is intentional and was already documented in the component's own comment before this lint pass — a locally-generated data URL is not a remote image `next/image` optimizes meaningfully, and using `next/image` for a `data:` URI would add complexity for no real benefit.

## Architecture contradiction found

**None.** Everything in ARCHITECTURE.md relevant to Step 7B (host/player authentication via the existing reconnect events, identity bound server-side and never trusted from a later payload, `RoomActor`/FSM as the sole authority over game-state transitions, view-projection-only client exposure, `PrivatePlayerPayload` isolation) was implementable exactly as designed, using the WebSocket gateway exactly as Step 4 built it. No gateway behavior, close-code semantics, or session model needed to change.

## Deferred items (explicitly out of scope for Step 7B)

- Role reveal UI, and every gameplay-phase screen after it (corruption choice, discussion, mini-game play, voting, elimination, results, rematch, match clock) — `PostLobbyPlaceholder` intentionally renders a static, non-interpretive message once the phase leaves `LOBBY` and does nothing else.
- Any client-side simulation of role assignment, timers, phase progression, corruption, voting, or win conditions — the server remains the sole authority for all of it; this step's client never assumes a transition happened before the server's own view says so.
- Seen Jeem, multi-game registry, authentication accounts, purchases/Stripe, PostgreSQL/Prisma, AWS deployment, final visual artwork/advanced animation, analytics events.

## Exact next recommended step

**Development Step 8 — Role reveal and the first real gameplay-phase screens**, building the `ROLE_ASSIGNMENT`/`ROLE_REVEAL` UI on top of the now-live `TvScreenState`/`PlayerScreenState` boundary and `PrivatePlayerPayload` delivery this step already wired and tested — the natural next slice past `PostLobbyPlaceholder`, mirroring how the backend build order (Steps 1–2) implemented role assignment before any mini-game.

## Step 7B completion

- **Typed, reusable WebSocket client layer** (`RealtimeSocket` + `useHostRealtime`/`usePlayerRealtime`): complete.
- **Auth-as-first-message** (`host:reconnect`/`player:reconnect`, never `player:join`, never a query-string token): complete.
- **Host/player session restoration** (stored `sessionStorage` sessions, browser refresh, wrong-room-session rejection): complete.
- **Reconnection**: complete — capped exponential backoff with jitter, online/offline handling, unauthorized/max-failures stop auto-reconnect, manual retry, reset-on-success, cleanup on unmount.
- **TV lobby** (real room code, real QR, live roster, live connection status, start button): complete.
- **Player phone lobby** (join confirmation, room code, connection status, live player count, waiting instructions, reconnection/session-expired feedback): complete.
- **Live player connection updates**: complete, entirely via the existing gateway/FSM path — no new game logic in the frontend.
- **QR code** (real generation, correct join-link encoding, no tokens/playerId, visible fallback): complete.
- **Host start-game action** (real event, waits for authoritative response, never transitions locally): complete.
- **Private payload isolation** (structural, never cross-player, never cached/logged/persisted): complete.
- **Gateway changes**: none required or made.
- **Tests**: complete — 357 passing + 1 correctly-skipped (pre-existing, unrelated to this step), covering every numbered requirement in the Step 7B brief.
- **Verification**: full test suite, full 3-stage typecheck, eslint, and `next build` all pass.
- Role reveal, gameplay-phase UI, multi-game registry, authentication, payments, PostgreSQL, Prisma, AWS deployment, and final visual polish were intentionally **not** started, per the requested scope.

---

# Step 7C — Full Local Development Runner

## Repository state before starting

Verified clean at `4df0523` ("feat(web): add realtime room lobby", HEAD, matching Step 7B's completion commit) before any Step 7C work began — `git status` showed no uncommitted changes and `git log` confirmed the expected history back through `4bb551c`, `c6972fb`, and every earlier step commit.

## Local runner architecture

A new `apps/server/src/bootstrap.ts`, deliberately split into small, independently-testable pieces rather than one monolithic `main()` — mirroring this codebase's existing separation of "the one real-ambient-source file" (`fsm/default-deps.ts` for `Date.now()`/`Math.random()`, `http/env.ts` for `process.env`) from everything downstream that only ever receives already-resolved values:

- **`connectToRedis(redisUrl)`** — a bounded-timeout Redis reachability probe (reusing the exact `lazyConnect`/`retryStrategy: () => null`/`connectTimeout` idiom `test/persistence/redis-integration.test.ts` already established), throwing a typed `RedisUnavailableError` with a clear, actionable message on failure. Never falls back to an in-memory store — that fallback exists only in the test suite (`InMemoryKeyValueStore`) and is never reachable from this file.
- **`buildProductionRepos(redisClient)`** — the one place `RedisKeyValueStore` is constructed for a real run; returns the same four repository interfaces (`RoomStateRepository`, `RoomPrivateStateRepository`, `RoomLookupRepository`, `SessionRepository`) every other part of the codebase already depends on, never a concrete Redis type.
- **`createJackomRuntime({ repos, fsmDeps, env })`** — builds exactly ONE `RoomActorManager`, hands it to both a `PhaseTimerService` (constructed exactly once, registering itself as the manager's lifecycle hooks per Step 5) and to both the `HttpApiServer` and `GatewayServer` constructors (the timer service passed only into the gateway's deps, exactly as Step 5 already wired it) — then starts both listeners, translating a bound-port failure into a typed `PortInUseError` and cleaning up the HTTP listener if the WebSocket gateway's `listen()` fails after it. Returns a `JackomRuntime` handle with a single `close()` that shuts the HTTP API, then the gateway (which also calls `timerService.shutdown()`), down in order.

`apps/server/src/main.ts` is intentionally thin: `dotenv/config` loads `apps/server/.env` (if present), `loadServerEnvConfig()` (new `apps/server/src/env.ts`, composing the existing `loadHttpApiEnvConfig()` for CORS rather than duplicating it) resolves the rest of the environment, then `main()` calls the three `bootstrap.ts` functions above in sequence, prints the sanitized ready banner, and registers `SIGINT`/`SIGTERM` handlers for a clean combined shutdown (with a 5-second force-exit fallback in case `close()` ever hangs). Nothing game-logic-related lives in either file — nothing here duplicates or bypasses `RoomActorManager`, the FSM, or the WebSocket gateway's own message handling.

## How one shared RoomActorManager is preserved

Exactly the same shape `apps/server/test/http/http-gateway-integration.test.ts` already proved for Step 7A ("HTTP API and WebSocket gateway share the same authoritative RoomActorManager"), now wired for a real, long-running local process instead of a test: `createJackomRuntime` constructs ONE `RoomActorManager` and passes the SAME instance into both the `HttpApiServer` and `GatewayServer` constructors' `roomActorManager` field. There is no code path in `bootstrap.ts` that constructs a second manager. `apps/server/test/dev/bootstrap.test.ts`'s first test proves this behaviorally through the new bootstrap function itself (not just through the pre-existing hand-wired test helper): a room created via `runtime.httpApiPort`'s HTTP API is immediately connectable and authenticatable via `runtime.wsGatewayPort`'s WebSocket gateway — which is only possible if both sides are reading from the same in-memory actor map.

## Root development scripts

| Script | Does |
|---|---|
| `npm run dev` | Starts the Next.js frontend AND the server bootstrap together (`scripts/dev.mjs`), with prefixed (`[web]`/`[server]`) output and a clean combined shutdown on `Ctrl+C`. |
| `npm run dev:web` | Frontend only (unchanged from Step 6 — `npm --prefix apps/web run dev`). |
| `npm run dev:server` | Server only — `tsx watch apps/server/src/main.ts` (auto-restarts the ENTIRE process on any `apps/server` file change). |
| `npm run dev:server:debug` | Same, with Node's `--inspect` flag, for the VS Code "Attach to Jackom Server" debug config. |
| `npm run dev:check` | `npm run typecheck` + a read-only diagnostic (`scripts/check-dev-env.mjs`) of env files / installed dependencies / Redis reachability — warns, never silently hides a problem, never itself starts a server. |
| `npm run dev:redis` / `npm run dev:redis:stop` | Starts/stops the optional Docker Redis (`docker-compose.dev.yml`). |

`scripts/dev.mjs` uses `concurrently`'s programmatic API (`killOthersOn: ['failure', 'success']`) rather than a hand-rolled `child_process` orchestration — reliably killing a whole Windows process tree (`npm` → `tsx`/`next` → their own children) is a known-hard, easy-to-get-subtly-wrong problem that `concurrently` already solves correctly; verified directly in this session (`npm run dev` started, both services running, then a single `taskkill /T /F` on the top-level PID cleanly terminated the entire multi-level process tree — see "Smoke-test result" below). `scripts/dev-paths.mjs` is a small shared helper (used by both `dev.mjs` and `check-dev-env.mjs`) that creates and points at the three project-local D:-drive folders described below.

## VS Code tasks added

`.vscode/tasks.json`: **Start Jackom Development** (the default build task — same as `npm run dev`), **Start Frontend Only**, **Start Server Only**, **Run All Checks** (`dev:check` + full test suite + lint, no servers started), **Start Development Redis**, **Stop Development Redis**. Every task's `cwd` is `${workspaceFolder}` (not a hardcoded path) — correct as long as the founder opens `D:\projects\jackom` itself as the VS Code workspace folder, per this guide's own instructions, without assuming anything else about their machine.

`.vscode/launch.json`: one **Attach to Jackom Server** Node "attach" config (port 9229), for use alongside `npm run dev:server:debug`.

Both files are the only things Step 7C adds under `.vscode/` — `.gitignore` was changed from blanket-ignoring the whole directory to ignoring everything EXCEPT `tasks.json`/`launch.json`/`extensions.json` (none of the latter added), so these shared, project-level configs are committed while any future personal `settings.json` a founder adds locally stays untracked, exactly as before.

## Environment setup

Two new files: `apps/server/.env.example` (`REDIS_URL`, `HTTP_API_PORT`, `WS_GATEWAY_PORT`, `HTTP_ALLOWED_ORIGINS`, `FRONTEND_URL` for the banner, optional `ROOM_TTL_SECONDS`) and `apps/web/.env.example` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_WEB_BASE_URL` — the exact existing variable names Steps 6/7A/7B already validate in `apps/web/lib/env.ts`, nothing renamed). Every server-side variable has a safe localhost default in `apps/server/src/env.ts`'s zod schema, so `npm run dev` works even with no `.env` file at all — the example files exist to make overriding something (a different port, a remote Redis) discoverable, not because any of them are strictly required. `.gitignore` already protected `.env`/`.env.*` (with an `!.env.example` carve-out) before this step; unchanged.

## Redis local-development approach

Both supported, per the brief's "support the existing approach first" instruction:

1. **Any reachable Redis** at `REDIS_URL` (default `redis://127.0.0.1:6379`) — this is the approach the codebase already established (`test/persistence/redis-integration.test.ts`'s own `REDIS_URL` convention, reused verbatim rather than inventing a new variable name).
2. **`docker-compose.dev.yml`** (new) — a minimal, single-service Redis container for founders without a native Redis install: bound to `127.0.0.1:6379` only (never publicly reachable), no password/secret set or committed, a named Docker volume for persistence between restarts, `redis:7-alpine`. Started/stopped via `npm run dev:redis`/`npm run dev:redis:stop`.

`npm run dev`/`npm run dev:server` never silently substitutes an in-memory store if Redis is unreachable — `connectToRedis()` throws a clear, actionable `RedisUnavailableError` and the process exits with a non-zero code instead of a partially-working "real" run. The in-memory fallback (`InMemoryKeyValueStore`) is used ONLY by the automated test suite, never by anything reachable from `main.ts`.

## D-drive cache redirection

`scripts/dev-paths.mjs` creates (if missing) and points at three project-local folders, all newly `.gitignore`d:

- `D:\projects\jackom\.tmp` — `TEMP`/`TMP`
- `D:\projects\jackom\.npm-cache` — `npm_config_cache`
- `D:\projects\jackom\.logs` — reserved for future dev-script logging (not yet written to by anything in this step)

`scripts/dev.mjs` passes this redirected environment into both the `dev:server` and `dev:web` child processes it starts. This is the same pattern used throughout this whole project's development sessions (previously via ad hoc `TEMP="D:/npm-tmp" ...` prefixes on individual commands) — Step 7C formalizes it into the actual committed tooling so a founder gets it automatically, without needing to know it's necessary. LOCAL_DEVELOPMENT.md is explicit that this only redirects Jackom's OWN temporary/cache files — Windows and VS Code themselves may still use a small amount of `C:` space for their own unrelated normal operation, which is outside this project's control.

## Health check

A new `GET /health` route on the EXISTING `HttpApiServer` (not a new server/listener) returns exactly `{"status":"ok"}` — no room state, no infrastructure detail, reachable without an `Origin` header and without any `allowedOrigins` configured (a health checker is not a browser). Covered by `apps/server/test/http/health.test.ts`.

## Hot reload

- **Frontend**: unchanged Next.js dev-server hot reload (Step 6).
- **Server**: `tsx watch` restarts the ENTIRE `main.ts` process (not a partial/in-place hot-swap) on any `apps/server` file change — a deliberate choice, not a limitation: a full process restart is what structurally guarantees there can never be two overlapping WebSocket listeners or two `PhaseTimerService` instances after an edit, since the old process (and everything it held — sockets, timers, the in-memory actor map) is completely gone before the new one starts. Observed directly in this session's manual verification: after a startup failure (Redis unreachable), the `tsx watch` supervisor stays alive waiting for a file change rather than busy-retrying on a timer — correct, intentional `tsx watch` behavior, documented in LOCAL_DEVELOPMENT.md's troubleshooting section so it doesn't read as a bug.

## Smoke-test result

**Automated (this session), fully verified:**
- Full test suite: 365 passing, 1 skipped (up from 357/1 at the end of Step 7B) — including the 8 new Step 7C tests (`apps/server/test/dev/bootstrap.test.ts` ×6, `apps/server/test/http/health.test.ts` ×2) and every pre-existing test unchanged and passing.
- `apps/server/test/dev/bootstrap.test.ts` directly proves, using the same `InMemoryKeyValueStore`-backed repos every other test uses (no real Redis needed): a room created through the new bootstrap's HTTP API is immediately reachable through its WebSocket gateway (shared manager); a freshly created LOBBY room correctly shows no scheduled phase timer (the single `PhaseTimerService` is observing the same manager); a port already in use produces a typed `PortInUseError` and cleans up the other listener rather than leaking it; `close()` releases both ports immediately (a second runtime can reuse them right away).
- `connectToRedis()` against an unreachable address (`redis://127.0.0.1:1`, and a version with embedded credentials) rejects with `RedisUnavailableError` whose message never contains the raw credentials — verified directly.
- Manually ran `npm run dev:server` (via the real `tsx watch` CLI, not just the unit-tested `bootstrap.ts` functions) with no Redis running: printed the exact clear, actionable error message and exited the underlying script non-zero, exactly as designed.
- Manually ran `npm run dev:check` with no `.env` files and no Redis running: correctly reported all three warnings (missing `apps/server/.env`, missing `apps/web/.env.local`, Redis unreachable) without crashing, exit code 0 (diagnostics, not a hard gate).
- Manually ran the full `npm run dev` (via `scripts/dev.mjs`) twice: both `[web]` and `[server]`-prefixed output appeared correctly; the frontend started and served a real `200` response at `http://localhost:3000` (confirmed via `curl`) even while the server half failed on the missing Redis connection with its own clearly-prefixed error; a single `taskkill /T /F` on the top-level process cleanly terminated the entire multi-process tree (`npm` → `concurrently` → `npm run dev:server`/`dev:web` → `tsx`/`next` → their own children) with no orphaned processes left behind, confirmed via `wmic process` before/after.
- Full 3-stage typecheck, eslint (`apps/web`), and `next build` all pass (see below).

**Not possible to run live, and honestly documented as such**: this sandboxed environment has no Redis installed, no Docker, and no WSL available (confirmed: `docker --version`, `wsl.exe --list`, and `redis-server --version` all fail with "not found"/"not installed"). The full happy-path manual smoke test described in the Step 7C brief — creating a real room, joining from a second browser context, seeing the player appear live on the TV, disconnect/reconnect restoring the same player, the host starting the match, and the post-lobby placeholder appearing — could **not** be executed end-to-end live in this session, since it genuinely requires a reachable Redis and a real browser. Every PIECE of that flow that doesn't require live Redis was already verified automatically above (shared-manager wiring, the Redis-unavailable failure path, the frontend serving real pages, clean multi-process shutdown) or was already proven by the EXISTING, unchanged, still-passing WebSocket/HTTP integration test suite (Steps 4/7A/7B) that this bootstrap composes without modifying. **Remaining manual step for the founder**: follow LOCAL_DEVELOPMENT.md §4 (start Redis) and §8 (the exact 5-step host+phone smoke test) once running on a machine with Redis/Docker available.

## Tests passing

**365 tests passing, 1 skipped** (up from 357 passing/1 skipped at the end of Step 7B) — 366 total across 61 files (up from 358 across 59). The skip is the same pre-existing optional Redis integration test from Step 3. Every pre-Step-7C test is unchanged and still passing.

```
npm run typecheck                 # 3-stage chain (shared-types / server / web), zero errors, strict mode
npm test                          # vitest run — 61 files, 366 tests (365 passed, 1 skipped)
npm --prefix apps/web run lint    # eslint — 0 errors, 1 pre-existing-pattern warning (QrCode.tsx's <img>, unrelated to this step)
npm --prefix apps/web run build   # next build — succeeds, all 7 routes compile (5 static, 1 dynamic, 1 not-found)
```

## Architecture contradiction found

**None.** ARCHITECTURE.md §7.1's single-process, no-distributed-lock MVP concurrency model (Redis used purely for persistence/recovery, one `RoomActorManager` per process) is exactly what `createJackomRuntime` wires into a real, runnable entry point — nothing about local dev tooling required reversing or correcting anything in the architecture document.

## Deferred / out of scope for Step 7C

Role reveal UI, gameplay UI, real mini-games, voting/results UI, Seen Jeem, multi-game registry, PostgreSQL, Prisma, AWS, authentication accounts, Stripe, purchases, production deployment, new game rules, and any Redis schema change — none of this was touched, per the requested scope. Also explicitly deferred: a real production `Dockerfile`/deployment story (`docker-compose.dev.yml` is Redis-only, development-only, and says so in its own header comment) and a `.logs/`-writing mechanism (the folder is created and reserved, but nothing yet writes to it — stdout is still where all current dev output goes).

## Exact next development step

**Development Step 8 — Role reveal and the first real gameplay-phase screens**, unchanged from the recommendation at the end of Step 7B — Step 7C added no new gameplay scope, only the tooling to run everything that already exists. Step 8 would build the `ROLE_ASSIGNMENT`/`ROLE_REVEAL` UI on top of the now-live, now-locally-runnable `TvScreenState`/`PlayerScreenState` boundary and `PrivatePlayerPayload` delivery.

## Step 7C completion

- **Combined local server bootstrap** (one shared `RoomActorManager`, one `PhaseTimerService`, HTTP API + WebSocket gateway together): complete.
- **One-command development startup** (`npm run dev`, plus `dev:web`/`dev:server`/`dev:server:debug`/`dev:check`/`dev:redis`/`dev:redis:stop`): complete.
- **Redis local development** (existing `REDIS_URL` approach supported; optional `docker-compose.dev.yml` added; clear failure on unreachable Redis, never a silent in-memory fallback): complete.
- **D:-drive cache/tmp redirection** (`.tmp`/`.npm-cache`/`.logs`, gitignored, wired into both dev child processes): complete.
- **`.env.example` files** for both apps, reusing every existing environment-variable name: complete.
- **VS Code integration** (`tasks.json` with 6 tasks, `launch.json` attach config, `.gitignore` updated to commit them without exposing personal settings): complete.
- **Hot reload** (frontend unchanged; server via full, clean `tsx watch` process restarts — structurally impossible to duplicate listeners/timer services): complete.
- **Local URLs/ports** (preserved from prior steps' documented HTTP-vs-WS separation; sanitized startup banner; typed port-conflict detection): complete.
- **Development health check** (`GET /health`, minimal safe response): complete.
- **Browser auto-opening**: not implemented (optional per the brief) — the documented URL (`http://localhost:3000`) is provided instead.
- **Tests**: complete — 365 passing + 1 correctly-skipped (pre-existing, unrelated to this step), covering every automatable requirement in the Step 7C brief.
- **Verification**: full test suite, full 3-stage typecheck, eslint, and `next build` all pass; the dev runner itself was manually started/stopped multiple times in this session (see "Smoke-test result").
- **Manual end-to-end smoke test**: partially completed live (frontend reachability, Redis-failure path, clean multi-process shutdown); the Redis-dependent host+player browser flow could not be run live in this sandboxed environment (no Redis/Docker/WSL available) and is documented as the founder's remaining manual step.

---

# Step 8A — Jackom Visual Identity and Product UX Redesign

## Repository state before starting

Confirmed clean working tree on `master`, `59cbb97` (Step 7C) as `HEAD`, 365 tests passing/1 skipped, matching the brief's stated verified state exactly.

## Scope

Visual identity + product UX only, on top of the existing, unchanged Steps 1–7C functionality: every FSM/RoomActor/Redis/WebSocket-protocol/session-storage behavior is untouched. Full details (palette, motifs, TV/mobile/motion/a11y rules) are in the new **`DESIGN_SYSTEM.md`** — this section covers what changed and how it was verified.

## Visual identity direction

Dark-first, bold, editorial-poster energy for an Arabic party-game platform — electric lime as the primary/electric accent, vivid purple as the secondary accent, cyan as the supporting "in progress/tech" accent, thick outlines + hard offset shadows used sparingly (one focal element per screen), a small original SVG/CSS graphic-motif library instead of any reference art or stock imagery. See `DESIGN_SYSTEM.md`'s "Brand personality" section for the full "must not feel like" checklist this was designed against (no corporate dashboard, no cybersecurity terminal, no Jackbox clone, no reference-art copy).

## Color and typography system

Full palette table and rationale in `DESIGN_SYSTEM.md`. Summary: existing token *names* in `app/globals.css`'s `@theme` block were re-valued (not renamed), so every pre-existing component picked up the new identity without a rename sweep — `brand`→lime, `action`→purple, plus new `cyan`/`ink-on-accent`/hard-shadow tokens. Typography adds **Baloo Bhaijaan 2** (`--font-display`, headings only) and **JetBrains Mono** (`--font-mono`, room codes + a couple of small tech-flavored labels) via `next/font/google`, alongside the unchanged Cairo body font.

## New visual primitives

- **Graphics motif library** (`apps/web/components/graphics/`): `NoiseOverlay`, `PixelGrid`, `GlitchFrame`, `StickerLabel`, `GraphicBurst`, `ComicArrow`, `DecorativeSpark`, `ConnectionPulse`, `HeroIllustration` — all inline SVG/CSS, no image assets, all decorative pieces `aria-hidden`.
- **`SiteNav`** (`components/nav/SiteNav.tsx`): desktop link row + a single accessible mobile disclosure (never a mega-menu), embedding a compact real `CreateRoomButton` as its always-available CTA.
- **`GameCard`** and **`IllustratedEmptyState`** (`components/ui/`): the cover-art-style game unit and the honest "not built yet" placeholder used on `/games`/`/account`.
- `CreateRoomButton` gained optional `size`/`fullWidth` props (default unchanged) so the same real API-calling component can be embedded compactly in the nav.

## Routes redesigned

`/` (full hero/how-it-works/game-preview/final-CTA rebuild), `/games`, `/account`, `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` (inline styles updated to the new hex palette — it can't load Tailwind, since it renders when the root layout itself has failed). **`/join` and `/join/[roomCode]` deliberately do NOT get `SiteNav`** — a deviation from the initial plan, made after noticing the live `PlayerLobby` renders inside that same route once joined; the brief's own "no unnecessary navigation" instruction for the join flow, plus keeping the post-join experience a focused personal controller rather than a chrome-heavy page, argued against it.

## TV lobby changes

`TvScreenLayout` gained a decorative `PixelGrid`/`NoiseOverlay` background layer (kept low-opacity, never reducing roster/room-code contrast). `TvLobby`'s room code now sits inside a `GlitchFrame` (the one dominant focal element), player roster cards use `Panel variant="hard"`, and each player's connection badge gained a `ConnectionPulse` alongside its existing non-color-only status text.

## Player lobby changes

`PlayerLobby` now uses `Panel variant="hard"`, shows a `PlayerAvatar` for the joined player, and states the brief's required copy verbatim ("تم انضمامك، الآن انتظر المضيف") alongside the existing room-code/status text — `join-room-form.tsx`'s name-entry step also explains "جوالك سيصبح أداة التحكم في اللعبة" per the brief. `PostLobbyPlaceholder` gained a `PixelGrid` backdrop and a `LoadingIndicator`. None of these changes touch `usePlayerRealtime`/`useHostRealtime`, session storage, or the FSM-driven phase logic.

## Motion approach

CSS-only — two new keyframes (`pulse-ring`, `float-slow`) in `globals.css`, no animation library added. `ConnectionPulse`'s ring uses `motion-safe:animate-[...]` in addition to the pre-existing global `prefers-reduced-motion` block, so it simply doesn't render motion at all (not just a near-zero duration) under reduced motion.

## Accessibility approach

`StatusBadge` now renders a small shape marker (dot/triangle/×) per tone in addition to color, so "status is never color-only" holds even without `ConnectionPulse`, which is always supplementary. All new decorative graphics are `aria-hidden`. Focus-visible/selection styling continues to use the primary accent token (now lime), and `ink-on-accent` was added specifically so text on the bright lime button/badges keeps real contrast rather than reusing the default off-white `ink`.

## Performance considerations

Zero new image assets or animation libraries — the entire motif library is inline SVG/CSS. `next build` output is unchanged in route shape (still 7 routes, same static/dynamic split).

## Tests added

`apps/web/test/ui/graphics.test.tsx` (decorative components stay `aria-hidden`/non-interactive), `apps/web/test/nav.test.tsx` (SiteNav's links/CTA have accessible names, mobile toggle is keyboard-operable with correct `aria-expanded`/`aria-controls`), `apps/web/test/ui/game-card.test.tsx`. Existing tests were updated only where the redesign's own copy changes required it: `routes.test.tsx`'s home-page test now checks the new hero headline and uses `getAllByRole` (the nav's own always-available "أنشئ غرفة"/"انضم إلى غرفة" now legitimately duplicates those accessible names on `/`); `player-lobby.test.tsx` was updated for the two lines of new copy in `PlayerLobby`; `layout.test.tsx`'s `next/font/google` mock was extended to cover the two new font imports. No test's *intent* changed — only literal copy/queries that the visual redesign itself changed.

## Deferred gameplay work

Unchanged from Step 7C's own list, still entirely out of scope: role reveal/corruption/voting/elimination/results/rematch gameplay UI, Seen Jeem, multi-game registry, PostgreSQL, Prisma, AWS, authentication accounts, Stripe/purchases, production analytics, final logo/character art, large 3D scenes.

## Verification

```
npm run typecheck                 # 3-stage chain, zero errors, strict mode
npm test                          # vitest run — 64 files, 387 tests (386 passed, 1 skipped)
npm --prefix apps/web run lint    # eslint — 0 errors, 1 pre-existing-pattern warning (QrCode.tsx's <img>, unrelated to this step)
npm --prefix apps/web run build   # next build — succeeds, all 7 routes compile
```

## Recommended next step

**Development Step 8B — Role reveal and the first real gameplay-phase screens**, unchanged in substance from the Step 7B/7C recommendation — 8A added no new gameplay scope, only the visual identity and product UX everything else now sits inside. Step 8B would build the `ROLE_ASSIGNMENT`/`ROLE_REVEAL` UI on top of the now-restyled `TvScreenLayout`/`PlayerScreenLayout` boundary and `PrivatePlayerPayload` delivery, reusing the new `GlitchFrame`/`StickerLabel`/`ConnectionPulse` primitives rather than introducing a second visual language.

## Step 8A completion

- **Visual identity, palette, typography**: complete — see `DESIGN_SYSTEM.md`.
- **Graphics motif library, SiteNav, GameCard, IllustratedEmptyState**: complete.
- **Home/games/account/error/not-found/global-error redesign**: complete.
- **TV lobby, player lobby, post-lobby placeholder, join flow polish**: complete.
- **Motion, accessibility, performance**: complete, per `DESIGN_SYSTEM.md`'s rules.
- **Functional preservation**: complete — no FSM/RoomActor/Redis/WebSocket-auth/session-storage change; all Step 7A/7B API calls unchanged.
- **Tests**: complete — 386 passing + 1 correctly-skipped (pre-existing).
- **Verification**: full test suite, full 3-stage typecheck, eslint, and `next build` all pass.
- **Final logo/character art**: intentionally not implemented — only a temporary SVG/CSS wordmark sticker in `SiteNav`, per scope.
- Role reveal, gameplay UI, real mini-games, multi-game registry, authentication, payments, PostgreSQL, Prisma, AWS deployment, and Redis schema changes were intentionally **not** started, per the requested scope.

---

# Production Minigame 1 — Rate It

`RATE_IT` is now the only registered regular minigame and replaces the generic regular-game
placeholder in the live FSM path. It accepts one locked finite numeric value in the inclusive
0–100 range (decimals preserved), completes when every participant submits or the phase timer
expires, and records unanswered participants explicitly as `no_answer` rather than inventing a
score. Exact player/value associations are preserved in `RoundRecord.resultSummary`.

Prompt assignment is isolated in `minigames/rate-it-content.ts`: the module receives only finished
per-player assignments and does not decide why a player received a variant. The current legacy
round-wide corruption flag temporarily swaps role-based variants at that boundary, leaving one
clean replacement point for the future target-based Hack resolver. The fixture is intentionally
small and is not a content library.

The `MiniGameModule` projection methods now receive `{ revealResults }`, computed only by the safe
view builders from the authoritative FSM phase. Before `RESULTS_REVEAL`, TV sees counts only and
each participant sees only their own prompt/submission; during reveal, exact results appear to all
recipients simultaneously. Reconnection naturally rebuilds the same owner-specific current view.

Verification after implementation:

```text
npm run typecheck   # zero errors
npm test            # 66 files, 424 tests: 423 passed, 1 Redis-dependent test skipped
```

The newer target-based Hack lifecycle, Admin participant selection/fairness, production prompt
content, gameplay UI, and the remaining two minigames remain intentionally out of scope.

---

# Production Minigame 2 — Complete It

`COMPLETE_IT` is registered alongside `RATE_IT` as the second production regular minigame. It
accepts one locked `SUBMIT_TEXT` action per participant, trims leading/trailing whitespace,
preserves internal wording and all Unicode text, and enforces an 80-code-point maximum. Empty,
whitespace-only, non-string, oversized, malformed, duplicate, wrong-action, and post-completion
submissions are rejected server-side.

The module completes when all participants submit or resolves through the existing phase timeout.
Missing submissions become explicit `no_answer` results; submitted answers remain attached to the
correct player and are never scored, ranked, rewritten, interpreted, or rendered by the backend.
TV sees only progress before `RESULTS_REVEAL`; each player sees only their own assigned prompt and
locked answer. All safe answers reveal simultaneously in the existing result phase.

Rate It and Complete It now share only the small `prompt-assignment.ts` boundary that maps a prompt
pair to finished participant assignments. Legacy corruption compatibility remains isolated there,
ready to be replaced later without changing either minigame module.

Temporary values: one English fixture pair, 80 Unicode code points, and a 45-second module-owned
duration. No CMS, UI, new Hack lifecycle, or third minigame was added.

Verification:

```text
npm run typecheck   # zero errors
npm test            # 67 files, 448 tests: 447 passed, 1 Redis-dependent test skipped
```

---

# Production Minigame 3 — Predict Them

`PREDICT_THEM` is registered alongside `RATE_IT` and `COMPLETE_IT`. The server deterministically
separates the round participants into a selected group and an audience group with no overlap. The
current temporary selection chooses three selected players where the lobby permits, always leaving
at least one audience member.

The module owns two bounded internal steps while the global Hacker FSM remains in
`MINIGAME_PLAY`: `AUDIENCE_VOTE` and `PREDICTION`. Audience players submit locked A/B votes first;
selected players then submit locked A/B predictions. Each step has its own 20-second server-owned
timer. Completing or timing out the audience step refreshes the global phase id and timer through
the existing FSM/RoomActor path, so stale first-step actions are rejected normally. The second
timeout resolves the module with explicit missing statuses and cannot softlock.

Majority resolution is a pure deterministic function over audience votes only. Missing votes are
excluded, ties (including zero votes) return explicit `TIE`, and individual audience votes are
never included in the public result. Reveal contains only aggregate A/B/no-vote counts and the
selected players' predictions/no-prediction statuses.

Before reveal, TV receives progress counts without choices; audience players receive the audience
question and only their own vote state; selected players receive their own role-sensitive prompt
only during prediction and never receive vote counts or majority. Reconnection rebuilds these same
owner-specific projections from persisted module state.

The only shared contract extension is optional internal-step support on `MiniGameModule`:
`getInternalStep`, `handleTimeout`, and state-aware `getDurationMs`. Single-step modules omit these
hooks and retain their previous behavior unchanged.

Verification:

```text
npm run typecheck   # zero errors
npm test            # 68 files, 474 tests: 473 passed, 1 Redis-dependent test skipped
```

Temporary decisions: 20 seconds per internal step, explicit `TIE`, one English fixture, and three
selected players where possible. No UI, Admin-selection redesign, target-based Hack migration, or
additional minigame beyond Predict Them was added in that pass.

---

# Production Minigame 4 — Draw It

`DRAW_IT` is registered as the fourth production regular minigame. The round setup selects three
eligible players by default (bounded to the approved 2–4 range) through injected randomness and
replaces the active round's participant set with that selected subset, so the existing FSM rejects
non-selected submissions before the module is reached.

The final-only drawing contract is compact JSON vector data: `strokes[]`, each containing normalized
`points[{x,y}]` where both coordinates are finite numbers in the inclusive 0–1 range. Empty
`strokes: []` is an accepted, locked blank canvas and remains structurally distinct from a timed-out
player's `no_answer`. No point streaming, binary upload, rasterization, or asset storage was added.

Hard module limits are 32 strokes, 256 points per stroke, and 2,048 points total, in addition to the
gateway's existing message-size limit. Strict Zod schemas reject extra authority/metadata fields,
malformed nesting, strings/non-finite coordinates, out-of-range values, and oversized collections
before module state changes.

During drawing, TV receives only participant ids and submission counts; each selected player sees
only their own prompt and lock/blank status; spectators see waiting information. Stroke data and
prompt variants remain absent from all non-owner/public projections until `RESULTS_REVEAL`, when all
submitted drawings and explicit missing entries appear together. Reconnection restores the prompt
and final lock from JSON-persisted state; an unsent local canvas is intentionally not restored.

Temporary values: 30 seconds, three selected players where possible, one English fixture, and the
limits above. No shared `MiniGameModule` change was required beyond the internal-step support already
introduced for Predict Them.

Verification:

```text
npm run typecheck   # zero errors
npm test            # 69 files, 505 tests: 504 passed, 1 Redis-dependent test skipped
```

Later design audit note: Draw It currently selects 2–3 participants although its approved range is
2–4. This pass intentionally did not change Draw It.

---

# Production Minigame 5 — Describe It

`DESCRIBE_IT` is registered as the fifth production regular minigame. Round setup selects up to five
eligible players (requiring at least three), assigns each one a private hidden word through the shared
prompt-assignment boundary, and creates a server-owned speaking order using injected deterministic
randomness. The current English fixture pair is `Airport` / `Train Station`.

The module owns `THINK → SPEAKING → COMPLETED` while the global FSM stays in `MINIGAME_PLAY`.
Preparation lasts 9 seconds and each speaking turn lasts 12 seconds. Players submit only the strict
empty `FINISH_SPEAKING` action; no clue text or audio is collected. A finish or timeout records one
bounded result and advances exactly one position. The internal-step key includes the speaker index,
which makes the existing FSM refresh its phase id and server deadline on every turn; an expired old
timer or stale action therefore cannot advance a later speaker.

Disconnecting does not alter speaking state. The player's current or future turn retains its normal
deadline, reconnect restores the persisted order/current speaker/turn status and their own hidden
word, and timeout prevents softlock. Module state is bounded JSON composed only of arrays, records,
strings, and numbers.

During active play TV and spectators see safe order/progress/current-speaker information but neither
word. A selected player sees only their completed assignment, never the alternate word, role, or
corruption information. At `RESULTS_REVEAL`, all audiences receive only the two possible words;
player-to-word and player-to-role mappings are never exposed.

No shared `MiniGameModule` change was required. Describe It reuses the optional internal-step,
state-dependent duration, and timeout hooks introduced for Predict Them.

Verification:

```text
npm run typecheck   # zero errors
focused tests       # 5 minigame files, 115 passed
npm test            # 70 files, 518 tests: 517 passed, 1 Redis-dependent test skipped
```

No recording, streaming, transcription, speech recognition, clue validation, scoring, UI, final
Arabic word library, or Defend It implementation was added.

---

# Production Minigame 6 — Defend It

`DEFEND_IT` completes the six-game production normal-minigame registry. Round setup selects up to
four eligible players (minimum two), assigns private statements through the existing prompt boundary,
and uses injected deterministic randomness for both speaking order and a precomputed non-speaker
follow-up asker for every turn. The temporary strategy is isolated as `RANDOM_ELIGIBLE_PLAYER` so a
future Admin/fairness policy can replace it without changing module flow.

The module keeps the global FSM in `MINIGAME_PLAY` while running `PREP → DEFENCE →
FOLLOW_UP_QUESTION → FOLLOW_UP_RESPONSE`, repeating the three verbal stages for each speaker and
then completing. Durations are 10, 15, 8, and 10 seconds respectively. Strict empty finish actions
advance each stage early; otherwise server-owned timeouts advance automatically. The internal step
key combines stage and speaker index, refreshing `phaseId` and deadline after every transition so an
old action/timer cannot skip a stage, skip a speaker, or complete twice.

Disconnects deliberately leave state unchanged in defence, question, and response. Reconnecting
players recover their private statement plus safe persisted order, current speaker/asker, active
stage, and owner flags. Normal timeouts prevent a disconnected participant from softlocking play.

Before reveal, TV and spectators see only safe stage/progress/speaker/asker data, while each selected
player sees only their own statement. After completion, all audiences receive the two possible
statements as a neutral array with no Crew/Hacker labels and no player assignment or role mapping.
No spoken content, audio, transcription, evaluation, suspicion score, or unbounded history is stored.

No shared `MiniGameModule` change was required; the existing internal-step, duration, timeout, view,
RoomActor, persistence, and stale-phase facilities were sufficient.

Verification:

```text
npm run typecheck   # zero errors
focused tests       # 6 minigame files, 131 passed
npm test            # 71 files, 534 tests: 533 passed, 1 Redis-dependent test skipped
```

The normal minigame backend set is now 6/6. The next technical phase is gameplay UI and an end-to-end
playable loop, followed later by the dedicated backend audit/hardening pass; neither was started here.

---

# Special Game — Bomb Protocol

The generic special-game placeholder is replaced in the live registry by `BOMB_PROTOCOL`. The
existing one-per-match scheduler now selects 3 participants for 4–5-player rooms, 4 for 6–7, and 5
for 8–10. Injected randomness chooses exactly one temporary Operator, assigns all remaining selected
players as Analysts, generates the bounded puzzle, and distributes private clues once at special-game
start. Social-deduction Crew/Hacker roles remain unrelated and are never exposed.

Bomb Protocol uses one uninterrupted 90-second `SPECIAL_GAME_PLAY` phase across three internal
modules: `SYMBOLS → WIRES → CODE_SEQUENCE`. Correct Operator actions advance progress; incorrect
valid actions add one strike while preserving module progress. Three strikes resolve immediate
failure. Module transitions intentionally do not transition the global FSM, so they retain the
original `phaseId`, `phaseStartedAt`, and deadline rather than restarting the overall countdown.

Puzzle generation uses deterministic templates plus injected shuffling/selection: four ordered
symbols, a four-wire board with a valid target, and a four-digit bounded code. Required position,
wire, and code clues are distributed round-robin across Analysts. State stores only bounded JSON and
is never regenerated on reconnect or persistence restoration.

Operator and TV projections contain the safe current board, module progress, Operator identity, and
strikes, never solution fields or Analyst clues. Each Analyst receives only their own current-module
fragments. Spectators receive progress only. Socket-bound authorization permits only the Operator to
press symbols, cut wires, or submit the code; strict Zod payloads reject wrong-module, malformed, and
unknown-board actions.

Success flows through the existing Special Game result integration and activates Firewall for the
next eligible normal round. Timeout or three strikes records failure; the existing result handler
applies the configured 180-second penalty exactly once when MatchClock is in countdown mode, or logs
the outcome without gameplay subtraction while its current default mode is `disabled`. Because the
default clock has no active countdown, no additional pause/resume policy was introduced.

No shared module interface change was needed. The only infrastructure integration changes replace
the placeholder lookup, generate config before `start`, identify the module as `BOMB_PROTOCOL`, and
make the default participant rule use the approved scaling.

Verification:

```text
npm run typecheck   # zero errors
focused tests       # Bomb + legacy special + six normal minigames: 153 passed
npm test            # 72 files, 551 tests: 550 passed, 1 Redis-dependent test skipped
```

The Hacker gameplay backend now contains all 6/6 normal minigames plus Bomb Protocol. Frontend
gameplay screens, end-to-end playable-loop validation, and the later backend audit/hardening pass
remain the next phases and were not started here.

---

# Hacker Frontend Gameplay Foundation

The post-lobby static placeholder is replaced by structurally separate TV and Player gameplay roots.
`TvGameplayRoot` accepts only `TvView`; `PlayerGameplayRoot` accepts `PlayerView` plus the owning
connection's `PrivatePlayerPayload`. Both reuse the existing host/player realtime hooks and session
reconnect flows, then dispatch through a surface-specific phase router and a seven-id minigame router.
No combined TV/private frontend state type was introduced.

All Hacker phases now have stable shared-shell routing, including safe fallbacks for unsupported
phase/game data. The normal six IDs and `BOMB_PROTOCOL` route to controlled TV/phone placeholders;
their full controls and result art remain intentionally unimplemented. Components are keyed by the
authoritative `phaseId` (and Player internal step where present), preventing stale local controllers
from surviving server transitions.

Reusable pieces include TV/mobile gameplay layouts, a local-display-only deadline countdown with
normal/warning/urgent/expired states, Player-only private prompt cards, participant/connection
status, waiting, spectator, submission states, reveal shell, loading/fallback screens, and a gameplay
error boundary. The mobile layout preserves safe-area padding and thumb-reachable footer support;
the TV layout uses the existing long-distance typography and 16:9-friendly width. The app-level
Arabic `dir="rtl"` remains authoritative and numeric countdowns use tabular monospace presentation.

Reconnect banners retain the latest server view during temporary loss and provide a safe retry state.
When a fresh projection arrives it replaces the old phase screen; the frontend does not infer a
transition or optimistically mark gameplay completion. Unsent game-specific drafts remain local to
future controllers and were not globalized.

Verification:

```text
gameplay foundation tests   # 27 passed
npm test                    # 73 files, 590 tests: 589 passed, 1 Redis-dependent test skipped
npm --prefix apps/web run typecheck  # zero errors
npm --prefix apps/web run lint       # zero errors; one pre-existing QR <img> warning
npm --prefix apps/web run build      # production build succeeds, 9 routes generated
git diff --check                     # clean (line-ending warnings only)
```

No backend/shared contract changed. Full Rate It, other minigame, Bomb board, voting, and final-art UI
were not added in that foundation step. It was ready for the first real gameplay controller: Rate It.

---

# Hacker Frontend Minigame 1 — Rate It

Rate It now has a complete phone and shared-TV flow on top of the gameplay foundation. The Player
surface shows only its private prompt, starts at 50 without treating that default as an answer, and
requires an actual 0–100 integer slider interaction before enabling submission. It sends the generic
`SUBMIT_RATING` action with `{ value }`, prevents duplicate sends while pending, and waits for the
authoritative PlayerView before displaying the locked state.

The TV active screen shows only safe public progress, participant totals, and player names. It never
renders prompt text or rating values before reveal. The reveal places exact submitted values on one
LTR numeric 0–100 scale, uses deterministic vertical lanes for nearby markers, and lists no-answer
players separately rather than inventing a value. Player reveal shows only that player's submitted
value, or an explicit no-answer state.

The generic player realtime hook now creates a unique action id and monotonic sequence, binds the
action to the current authoritative phase id, exposes pending/error state, and maps server rejection
to a safe display error. Reconnect restores server-owned submission state; local drafts reset when
the authoritative phase changes. Spectators receive no interactive control or private prompt.

Verification:

```text
Rate It frontend tests                 # 13 passed
focused frontend/realtime tests        # 54 passed
npm test                              # 74 files, 607 passed, 1 Redis-dependent test skipped
npm --prefix apps/web run typecheck   # zero errors
npm --prefix apps/web run lint        # zero errors; one pre-existing QR <img> warning
npm --prefix apps/web run build       # production build succeeds, 9 routes generated
```

No backend or shared contract changed for this frontend implementation. The Rate It playable flow is
complete and the frontend foundation is ready for Complete It.

---

# Core Logic Phase 1 — Admin System, Targeted Hacks, Real Match Clock, Redis Reliability

Status: **complete.** Preceded by a full adversarial audit (`FUNCTIONAL_GAME_AUDIT.md`) and a
founder-approved rules contract (`GAMEPLAY_RULES_V1.md`), both at the repo root. Full details,
including the FSM before/after diff, the state-model diff, the timer-architecture design, and the
complete hack truth table, are in `CORE_LOGIC_PHASE1_REPORT.md` — this entry is the short summary
the rest of this file's convention expects.

**What changed:** the Admin mechanic (rotating, shuffled, server-validated minigame + participant
selection) is now real, replacing fully-automatic random selection. The Hacker mechanic was replaced
end-to-end: the old round-wide `player:submitCorruptionChoice` boolean is gone, replaced by a
targeted, budgeted `player:submitHack` (2 charges/match, one target, one accepted action/round). The
match clock is now a real, server-authoritative, deadline-based 15-minute countdown — starts when
GAME_INTRO exits, pauses for the special game, applies the exact 180s failure penalty, and ends the
match immediately (Hacker win) at zero — implemented as a second scheduler service
(`MatchClockService`) fully independent from the existing `PhaseTimerService`, so neither cancels the
other's timer. The audit's two P0 infra findings were also fixed: the production Redis client now has
a long-lived `'error'` listener (no more whole-process crash on a connection blip), and
`RoomActorManager.evictIdle()` is now wired into a periodic sweep in `bootstrap.ts`.

**Deliberately not touched this phase** (see `CORE_LOGIC_PHASE1_REPORT.md` §8 for the full list): the
RATE_IT → RANK_IT migration, Bomb Protocol's internal gameplay (still no Hacker-sabotage mechanic —
known, unchanged), any frontend controls (Admin selection, hack targeting, and voting still have zero
UI — this was a server/business-logic-only phase), and horizontal-scaling/distributed-locking
concerns (still explicitly out of scope, restated in `GAMEPLAY_RULES_V1.md` §10).

Verification:

```text
npm test                              # 77 files (76 passed, 1 skipped), 657 tests (656 passed, 1 skipped)
npm run typecheck                     # shared-types + server + web, zero errors
npm --prefix apps/web run build       # production build succeeds, 10 routes generated
git status / git diff                 # confined to server/shared-types logic + the minimal web
                                       # type-contract fixes needed to keep the frontend compiling
                                       # (wire-schemas.ts + 4 test fixtures); /quiz untouched
```

52 new tests were added across 4 new files (`admin-selection.test.ts`, `hack-window.test.ts`,
`match-clock.test.ts`, `timers/match-clock-service.test.ts`); `corruption.test.ts` was deleted —
it asserted the now-rejected round-wide corruption model and was fully superseded by
`hack-window.test.ts`, not preserved for its own sake.

# Core Logic Phase 1.1 — Verification & Hardening

Status: **complete (YES, with one explicitly-scoped exception).** Full details — the hack-secrecy
privacy fix, the null-`moduleState` crash fix, false-positive test elimination, the match
clock/Admin/hack truth tables, private-state security matrix, room-recovery evidence, and the
honest Redis-unavailable-in-this-sandbox caveat — are in `CORE_LOGIC_PHASE1_1_HARDENING_REPORT.md`.

**What changed:** hack targets became genuinely secret (not merely reveal-policy-gated) —
`LastRoundResultSummary` lost its `hackedPlayerIds` field entirely, and DESCRIBE_IT/DEFEND_IT's
reveal payloads stopped labeling which variant belonged to which role. A real production crash was
found and fixed (view builders called during the hack window before `moduleState` existed). The
`RoomActorManager.hooksList` multi-registrant fan-out and idle-eviction-preserves-Redis-state
guarantees were proven directly, not just inferred. The dead `MiniGameContext.corrupted` field
(written, never read) was removed. Real Redis integration remained unverifiable in this sandbox
(Docker Desktop not running); every other persistence-dependent scenario was verified against
`InMemoryKeyValueStore` through the real repository/actor layer instead.

675 tests passed / 1 skipped (Redis) at the end of this phase; typecheck and the web build were
both clean.

# Core Logic Phase 2A — Final Accusation System ("Push the Button")

Status: **complete.** Full details — the FSM before/after diff, the state model, the exact
strict-majority voting formula, the win-resolution truth table, timer/Admin/Firewall interaction,
security/reconnect/rehydration evidence, and the test-change classification — are in
`CORE_LOGIC_PHASE2A_ACCUSATION_REPORT.md`.

**What changed:** the Crew's final accusation path is now fully functional, server-authoritative,
and testable. Any eligible player may push the button from `DISCUSSION` or `MINIGAME_SELECT`
(Crew and Hackers alike, indistinguishably); the initiator alone selects exactly `hackerCount`
suspects (the count is public, the identities never are); the room enters two new states,
`ACCUSATION_SELECT` and `ACCUSATION_VOTE` (deliberately not reusing the pre-existing `VOTING`
state, which is a separate, older per-cycle elimination-vote mechanic left completely untouched —
see `GAMEPLAY_RULES_V1.md` §12 for why the two coexist rather than compete); every eligible player
then votes APPROVE/REJECT with a frozen voter snapshot and strict majority (a tie always rejects);
an approved accusation is compared against the real Hacker set **only server-side** — exactly
right ends the match as a Crew win, anything else (missing Hacker, extra Crew, or a substituted
Crew player even at the correct count) ends it as a Hacker win, no second attempt. The match clock
is never paused for an accusation. A rejected accusation returns to `MINIGAME_SELECT` — preserving
the exact interrupted Admin turn if it began there, or proceeding into the next round's fresh Admin
rotation if it began from `DISCUSSION` — and starts a configurable cooldown; a cancelled (timed-out)
accusation does not.

**Deliberately not touched this phase** (see `CORE_LOGIC_PHASE2A_ACCUSATION_REPORT.md` for the
full list): RANK_IT, any redesign of the existing per-cycle elimination vote, Bomb Protocol's
internal gameplay, and any frontend gameplay controls — the accusation UI is a placeholder
fallback panel, same treatment every other server-authoritative phase already gets until its own
frontend phase.

Verification:

```text
npm test                              # 79 files (all passed), 729 tests (all passed)
npm run typecheck                     # shared-types + server + web, zero errors
npm --prefix apps/web run build       # production build succeeds, 10 routes generated
git status / git diff                 # confined to server/shared-types logic + the minimal web
                                       # type-contract fixes needed to keep the frontend compiling
                                       # (wire-schemas.ts, phase-label tables, and pre-existing
                                       # fixtures); /quiz untouched
```

53 new tests were added in one new file, `accusation.test.ts`, covering availability, suspect
selection, voting (including every explicit threshold example from the spec), resolution,
concurrency, match-timer interaction, Admin interaction, Firewall interaction, reconnect, crafted
adversarial actions, and actor/persistence rehydration.

# Final Gameplay Closure — Hacker Game Gameplay & Functional Implementation

Status: **complete.** Full details — the exact legacy-voting removal diff, RANK_IT's design and
test coverage, the Bomb Protocol sabotage-design audit, the FINAL_RESULTS role-reveal security
verification, all real-browser Playwright evidence, and the two real bugs found and fixed along the
way — are in `FINAL_GAMEPLAY_CLOSURE_REPORT.md`.

**What changed:**

- **Legacy elimination voting retired** (locked product decision): `FINAL_DISCUSSION`/`VOTING`/`ELIMINATION_RESULT` removed from `GameState` entirely (not merely made unreachable); `currentVote`/`voteHistory`/`TieBreakRule`/`maxCycles` removed from `RoomState`/`RoomConfig`; `apps/server/src/voting/tally.ts` and `apps/server/src/fsm/win-condition.ts` deleted; the frontend's `VotingPanel`/`TvVotingPanel` deleted. Push the Button (Core Logic Phase 2A) is now the sole way a match resolves early. `MatchRulesConfig.roundsPerCycle` now solely gates the special game's scheduling. New test file `legacy-voting-retired.test.ts` proves the mechanic is unreachable under real play, including a `@ts-expect-error` compile-time proof that the old `GameState` values no longer type-check.
- **RANK_IT replaces RATE_IT** as the sixth normal minigame (final approved set: DRAW_IT, RANK_IT, COMPLETE_IT, PREDICT_THEM, DEFEND_IT, DESCRIBE_IT). Four shared cards, per-role ranking instruction via the same `assignPromptPair` boundary every other minigame's prompt already uses (no game-specific hack logic), per-player independently randomized initial card order (`deps.rng`, computed by the FSM caller), honest `no_answer` on timeout (never fabricates a submitted order). RATE_IT fully deleted — module, content, tests, frontend components, all registry/participant-limit/title-map entries.
- **Bomb Protocol's sabotage design verified and closed** — a real audit (not a redesign) confirmed sabotage is already fully emergent through the existing Operator/Analyst action model: `validateAction`/`handleAction` check only "are you the assigned Operator," never role; a Hacker-Analyst's `buildPlayerView` output is byte-identical to a Crew-Analyst's for the same clue slot. Zero Hacker-only code exists or was needed. Confirmed live via real Playwright: participant scaling (5p→3, 7p→4, 8p→10p→5), success→Firewall, the very next hack window bypassed entirely, failure→exactly −180 000 ms.
- **FINAL_RESULTS role reveal** confirmed impossible before the match ends and public (TV + every player, the full roster) the instant it resolves, reverting to hidden after a real rematch — new server test `views.test.ts` #26, confirmed visually via real-browser screenshots.
- **A real, previously-undetected bug found and fixed by the real-browser validation pass**: `handleRematchLobby`'s `host:startGame` transitioned to plain `LOBBY` instead of `ROLE_ASSIGNMENT`, silently requiring a second, identically-labeled click before a rematch actually started. No unit test had ever driven a rematch through the real `host:startGame` event (only through the unrelated `host:restartMatch` shortcut). Fixed in `transitions.ts`; covered by `room-lifecycle.test.ts` #24 and reconfirmed live in the 6-player golden-match browser run.
- **Real-browser Playwright validation** (`e2e/`, plain Playwright scripts, isolated browser contexts per participant + a separate TV context, headless Chromium installed to a D:-drive path to work around this machine's near-zero C:-drive free space): a 4-player full match to a winner; a 6-player "golden match" playing RANK_IT + three other distinct minigames, a real Bomb Protocol solve (Analyst clues relayed to real Operator clicks) resulting in Firewall activation and a verified next-round hack-window bypass, a manual Push-the-Button → suspect selection → group vote → FINAL_RESULTS → one-click rematch; a 10-player scale run confirming exactly 3 Hackers, the real RANK_IT 5-participant cap, Bomb Protocol selecting exactly 5, and the accusation UI requiring exactly 3 suspects; a dedicated reconnect pass (real page reloads, same session) across Admin selection/Hacker target-select/RANK_IT/DRAW_IT/Bomb Operator/Bomb Analyst/accusation voting; a dedicated timeout pass proving five consecutive phases left with zero client action (Admin selection, hack window, instructions, a full un-answered MINIGAME_PLAY, discussion) never soft-lock and the match remains fully completable afterward. Evidence screenshots under `final-gameplay-evidence/`.

**Deliberately not touched this phase** (explicitly out of scope per the closure directive):
PostgreSQL, Prisma, user accounts, authentication, payments, ownership, final pixel-art/animation
polish, marketing pages, `/quiz`. The HTTP API's per-IP rate limiter was left untouched (its default
10 requests/60s is legitimate anti-abuse infrastructure the real-browser test scripts had to pace
around, not a gameplay concern).

Verification:

```text
npm test                              # 79 files (all passed), 777 tests (all passed)
npm run typecheck                     # shared-types + server + web, zero errors
npm --prefix apps/web run build       # production build succeeds, 9 routes generated
git status / git diff                 # confined to gameplay/FSM/frontend logic + this phase's new
                                       # e2e/ Playwright scripts and evidence screenshots;
                                       # PostgreSQL/auth/payments/marketing/quiz untouched
```

**HACKER GAME — GAMEPLAY & FUNCTIONAL IMPLEMENTATION CLOSED.**

# Permanent Business Backend Foundation

Status: **complete.** Full details — the schema, the Prisma-driver-adapter bug found and fixed, the
exact auth/session/ownership/room-authorization implementations, the Redis/Postgres boundary proof,
the real-Postgres test matrix, real-browser E2E evidence, and the itemized security review — are in
`PERMANENT_BACKEND_FOUNDATION_REPORT.md`.

**What changed:** PostgreSQL + Prisma (the new `prisma-client` generator with an explicit
`@prisma/adapter-pg` driver adapter) were added as a second, completely separate data layer
alongside the existing Redis-backed realtime architecture — never merged, never coupled. Four
tables: `User` (permanent host/purchaser account — email/password-hash/displayName), `Game`
(platform-level, only `hackers` seeded), `GameOwnership` (User↔Game many-to-many with a
database-level `@@unique([userId, gameId])` constraint), and `Session` (login session — HMAC-hashed
bearer token in an `HttpOnly`/`SameSite=Lax` cookie, deliberately named to avoid colliding with the
pre-existing Redis `HostSessionRecord`/`PlayerSessionRecord` reconnect-token concept). Full
register/login/logout/`GET /me` flow with bcrypt hashing and anti-enumeration login (unknown
account and wrong password return the identical error). `POST /api/rooms` now requires
authentication and verified, active game ownership *before* any Redis room is created —
`RoomActor`/the FSM remain entirely unaware of Prisma; the only value crossing the boundary is a
bare `hostUserId` string stored once on room creation. The pre-existing guest `/join` flow was left
completely untouched and is regression-tested end-to-end (including a real-browser Playwright run)
to prove Players still need no account. `GET /games/owned` powers a minimal `/games` frontend that
only shows a functional "أنشئ غرفة" action for games the authenticated User actually owns; the
marketing-wide nav/hero Create Room button — found by the E2E run to be a redundant,
ownership-unaware duplicate of that same action — was repurposed into a plain navigation link to
`/games`, the one real authorized surface. A dev-only `db:grant-ownership` CLI script is the sole
sanctioned way to grant ownership without Stripe (which is not implemented).

**Deliberately not touched this phase** (explicitly out of scope): Stripe/payments/checkout,
password reset, email verification, account management (change password/email), match history,
the other three roadmap games, final visual/pixel-art polish, and all gameplay logic — the FSM,
minigames, Bomb Protocol, and accusation system are byte-for-byte unchanged except for the single
`hostUserId` parameter threaded through `createRoom`.

Verification:

```text
npm test                              # 82 files (all passed), 820 tests (all passed)
npm run typecheck                     # shared-types + server + web, zero errors
npm --prefix apps/web run build       # production build succeeds, 11 routes generated
git status / git diff                 # confined to the new db/ layer, the auth/ownership HTTP
                                       # routes, the minimal auth/account/games frontend, and the
                                       # single hostUserId parameter threaded through room creation;
                                       # gameplay FSM/minigames/views otherwise untouched, /quiz
                                       # untouched, no Stripe code anywhere
```

**JACKOM PERMANENT BUSINESS BACKEND FOUNDATION CLOSED.**
