# Core Logic Phase 1.1 — Verification & Hardening Report

Scope: this phase did **not** add features. It adversarially re-reviewed Core Logic Phase 1 (Admin system, targeted/budgeted Hacker system, match clock, Redis reliability, idle eviction) as if written by another engineer, fixed one real production bug and one real privacy leak found in the process, removed false-positive test patterns, and added targeted regression coverage where the existing coverage was structurally insufficient rather than merely thin.

Out of scope, not touched: RANK_IT, any new voting rules, Push the Button redesign, Bomb sabotage mechanics, frontend gameplay controls/visual design, `/quiz` (confirmed in §12).

---

## 1. Verdict: **YES, with one explicitly-scoped exception**

Core Logic Phase 1 is genuinely trustworthy for the guarantees this phase was asked to verify, **except** real-Redis integration, which could not be exercised in this sandbox (Docker Desktop engine not running, no dockerd process reachable — see §4) and remains verified only against `InMemoryKeyValueStore`, a faithful but non-Redis implementation of the same `KeyValueStore` interface.

This is not a blanket YES. Concretely:
- The hack-secrecy defect found in §2 would have shipped undetected under the Phase 1 test suite as it stood at the start of this phase — it was only caught because this phase's instructions specifically demanded testing every phase transition, not just the ones existing tests happened to exercise.
- A real production crash (null `moduleState` in view builders during the hack window) was also found and fixed as a direct side effect of that same rigor — it means Phase 1's "verified" claim from the prior report was optimistic on at least one load-bearing path.
- Everything else asked for in the 13-part spec (match clock adversarial review, Admin adversarial review, hack truth table, room lifecycle multi-hook review, idle eviction, terminology audit, player-count consistency) is now backed by tests that exercise the real FSM/actor/persistence path, not shortcuts, and all pass.

Given that combination — real bugs found and fixed, but the deepest integration layer (actual Redis) unverified — **YES** is the honest verdict for "is Phase 1 correct as tested," with the Redis caveat carried forward explicitly rather than absorbed into a clean YES.

---

## 2. Hack Reveal Policy — corrected to fully secret (Part 1)

**Finding:** the Phase 1 implementation still had a reveal-policy-gated leak, not full secrecy as required:
- `LastRoundResultSummary` (the public "last round's outcome" projection) carried an optional `hackedPlayerIds` field that got populated once `corruptionRevealPolicy` said clients "may" see it — visible to **everyone**, including TV and Crew, not just the Hacker who acted.
- `DESCRIBE_IT`/`DEFEND_IT`'s reveal payloads returned `{crewWord, hackerWord}` / `[crewVariant, hackerVariant]` — labeled by variant, which combined with a player's own submission trivially deanonymized who got hacked.

**Fix:**
- `LastRoundResultSummary` now has exactly `{minigameId, success}` — no field capable of holding a hack target exists on the type, so this is enforced by the type system, not by view-builder discipline (`view-utils.ts`'s `lastRoundResultFor()`).
- `DESCRIBE_IT`/`DEFEND_IT` reveal shape changed to an unlabeled, deterministically-sorted `{words: [string, string]}` / `{statements: [string, string]}` — the content is public, but which variant belongs to which role is not.
- Internal server state (`RoundRecord.hackedPlayerIds`, `hackedPlayerIdsRevealed`) is **retained**, not deleted — per the instruction, the fix is at the projection boundary. `GAMEPLAY_RULES_V1.md` §7/§11 were corrected to state this precisely (the original §11 text still described the old reveal-policy-gated behavior; it undersold the actual guarantee).

**Verified by** (both the pure-FSM level and, per Part 7, the full actor+persistence+real-view-builder level):
| Scenario | Where |
|---|---|
| TV never sees a hack target — before, during, or after `RESULTS_REVEAL`/`DISCUSSION` | `hack-window.test.ts` secrecy block; `hack-secrecy-integration.test.ts` |
| Crew never sees Hacker-only state, including the hacked Crew player about themselves | both, same files |
| Hacker A sees their own accepted target, never Hacker B's | both, same files |
| Reconnect mid/post-round doesn't leak anything extra | `hack-window.test.ts` |
| Serialization sweep: exact quoted target-ID values absent from disallowed payloads (not naive substring checks — see §3) | both |
| The hack's actual gameplay effect (different prompt text for the hacked player) is observable as content, never accompanied by a field explaining why | `hack-secrecy-integration.test.ts` |

---

## 3. False-Green / Test-Change Review (Part 2 + Part 12)

**Anti-pattern found and eliminated:** `hack-window.test.ts` (as it stood in Phase C) used `if (hackerCount < 2) return;`-style early exits for scenarios requiring specific role composition (Hacker-targets-Hacker, two Hackers colliding on a target, etc.). Because Hacker count is **formula-determined by player count, not random** (4–5p→1, 6–9p→2, 10p→3 — `roleBalanceRegistry['placeholder-linear']`), these guards were latent, not load-bearing for most seeds — but a test that can silently skip its own primary assertion is a bug regardless of how often it actually skips. All were replaced with deterministic fixture construction: explicit `adminSelectMinigame(...)` calls built from `hackerIdsOf()`/`crewIdsOf()`, using `driveToAdminSelection()` (a new helper that stops at MINIGAME_SELECT without a randomized participant pick) instead of the older `driveToFirstCorruptionPhase()` (kept, but now doc-commented as "uses RANDOM participant selection — only safe when composition doesn't matter").

**Anti-pattern I introduced and then caught in my own new tests:** `expect(JSON.stringify(view)).not.toContain(targetB)` — unsafe because a player ID legitimately appears in public rosters and can be a substring of another test's longer sequential ID (`"id-5"` inside `"id-53"`). Fixed by asserting on actual structure (`hackerInfo.eligibleTargetIds === []`, `canHackNow === false`) instead of string search. A second instance of the same pattern was found and fixed in a synchronous test that awaited nothing (`void manager.createRoom(...).then(...)` inside a non-async `it()` — the assertions inside `.then()` would have run after Vitest already considered the test passed). Rewritten as a properly-awaited async test.

**Test-change classification for this phase** (categories per the task spec):

| File | Classification | Why |
|---|---|---|
| `hack-window.test.ts` (secrecy describe block) | New regression coverage | Nothing tested view-builder output during the hack window before this phase. |
| `hack-window.test.ts` (mechanics describe block) | Test fixture hardened | Same assertions, but every composition-dependent scenario now uses a guaranteed fixture instead of a possibly-skipped one. |
| `describe-it.test.ts`, `defend-it.test.ts` | Old test updated because the GAME RULE changed | The reveal shape itself changed (§2); the old expected value was correct for the old behavior and had to change to match the new one. |
| `admin-selection.test.ts` | New regression coverage | Added reconnect → `buildPlayerView()` check (`isAdmin`/`adminSelection` correctness), which nothing previously exercised — the existing reconnect test only checked FSM state, not the private view. |
| `match-clock.test.ts` | New regression coverage | Added the duplicated-`matchClock:expired`-can't-end-twice case; nothing tested a second stale expiry arriving for an already-resolved match. |
| `timers/match-clock-service.test.ts` | New regression coverage | Added: multi-phase coexistence (Admin selection → hack window → play → discussion, deadline never moves), pause-cancels-schedule, and both-services-shutdown-independently. None of these were previously exercised with two real services sharing one manager. |
| `hack-secrecy-integration.test.ts` | New regression coverage (new file) | Part 7's explicit requirement: an integration-level test through the real `RoomActor`/persistence/view-builders, not bare `handleEvent()`. |
| `actors/room-actor-manager.test.ts` | New regression coverage | Added: direct proof that `hooksList` fans out to multiple registrants without clobbering (mock hooks), and a full mid-match idle-eviction-and-resume scenario (Admin/hacks/phase/matchClock all intact) — the pre-existing `evictIdle` test only checked which actor got evicted, not what a real match's state does across that boundary. |
| `bomb-protocol.test.ts`, `complete-it.test.ts`, `defend-it.test.ts`, `describe-it.test.ts`, `draw-it.test.ts`, `predict-them.test.ts`, `rate-it.test.ts` | Test fixture hardened (mechanical) | Part 10 removed the dead `MiniGameContext.corrupted`/`MiniGameInstructions.corrupted` fields (written by the FSM, never read by any module or view — confirmed by grep); these fixtures had to drop the now-nonexistent field to typecheck. No behavior changed. |

---

## 4. Redis Integration (Part 3) — attempted, environment-blocked

Confirmed, not assumed: `docker ps` fails (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`), no `Docker Desktop.exe` process, no `com.docker.service` Windows service, and `wsl -l -v` shows only the minimal `docker-desktop` init VM with no `dockerd` running inside it. Re-checked at the start of Part 13 (not just relying on an earlier finding) — same result.

**Consequence:** `apps/server/test/persistence/redis-integration.test.ts` remains skipped (1 test, by design — it self-skips when Redis is unreachable, which is the correct default CI behavior, not a bug). Real Redis semantics (actual network round-trips, actual command failure modes, actual TTL expiry) were **not** exercised this phase.

**Mitigation, not a substitute:** every persistence-dependent scenario in this phase (room/private-state save+load, actor eviction+reload, timer recovery from a persisted deadline, paused-clock-stays-paused after reload, Redis error-event handling) is tested against `InMemoryKeyValueStore` — a from-scratch implementation of the exact same `KeyValueStore` interface the real `ioredis`-backed store implements, used through the same repository classes production code uses. This proves the application-level contract is correct; it does not prove the real Redis client/network layer behaves as assumed.

**Redis error-handling (`bootstrap.ts`'s `attachRedisErrorHandler`)** was verified without a live connection: a synthetic `'error'` event on the runtime client does not crash the process and logs only a sanitized `errorKind`, never the raw error message (`dev/bootstrap.test.ts`).

**This is the one gap the verdict in §1 explicitly carries forward.**

---

## 5. Match Clock — adversarial verification (Part 4)

| Scenario | Verified | Where |
|---|---|---|
| Clock does NOT run during LOBBY/ROLE_ASSIGNMENT/ROLE_REVEAL/GAME_INTRO | Yes — `initMatchClock()` returns `status: 'pending'`; `startMatchClock()` is called exactly once, from `handleGameIntro`'s exit | `match-clock.test.ts`, `match-clock-service.test.ts` ("freshly created room has no schedule entry") |
| Clock DOES run through Admin selection, hack window, instructions, play, results, discussion, voting | Yes — single deadline never changes across all of these | `match-clock-service.test.ts` ("coexist through several different phase timers in a row") |
| Clock pauses ONLY for the active special challenge | Yes — pause fires from `beginSpecialGame`, and cancels the scheduler entry so no stale pre-pause expiry can fire | `match-clock-service.test.ts` ("pausing... cancels its scheduled deadline") |
| Failure subtracts exactly 180,000ms | Yes — `applyPenalty()`, unit + FSM level | `match-clock.test.ts` |
| ≤0 after penalty ends the match immediately as a Hacker win | Yes | `match-clock.test.ts`, `match-clock-service.test.ts` ("overdue... resolves immediately as a Hacker win") |
| Recovery computes REMAINING time correctly (not a fresh 15:00) | Yes — byte-identical `deadlineAt` recovered, scheduler entry rebuilt from it, not from `now()` | `match-clock-service.test.ts` ("recovers the REMAINING time...") |
| PhaseTimerService + MatchClockService coexist without either cancelling the other | Yes, directly — two independent `FakeTimerScheduler` instances, proven never to share an entry, proven the phase timer firing doesn't touch the clock's schedule and vice versa | `match-clock-service.test.ts` (two dedicated tests) |
| Stale `clockId` ignored | Yes | `match-clock.test.ts` |
| Pause invalidates previous expiry / resume mints a new `clockId` | Yes | `match-clock.test.ts`, `match-clock-service.test.ts` |
| Duplicated expiry cannot end the match twice | Yes (added this phase) | `match-clock.test.ts` |
| Both services' `shutdown()` clear their own schedule independently | Yes (added this phase) | `match-clock-service.test.ts` |

---

## 6. Admin System — adversarial verification (Part 5)

| Scenario | Verified | Where |
|---|---|---|
| Admin assigned the moment investigation gameplay begins | Yes | `admin-selection.test.ts` |
| 4-player full rotation before repeat, then reshuffle | Yes | `admin-selection.test.ts` |
| 10-player full rotation before repeat, then reshuffle | Yes | `admin-selection.test.ts` |
| Self-selection allowed by default; rejected when `adminMaySelectSelf: false` | Yes | `admin-selection.test.ts` |
| Non-Admin cannot submit, even via a hand-crafted event object bypassing any client helper | Yes — `sendPlayer` with a raw `{type:'player:adminSelectMinigame', ...}` payload, not the convenience wrapper | `admin-selection.test.ts` ("NOT_ADMIN") |
| Invalid participant sets rejected server-side: unknown minigame id (including the special-game id), out-of-range count, duplicate ids, non-existent/ineligible player id | Yes, each as a distinct case | `admin-selection.test.ts` |
| PREDICT_THEM audience-non-empty edge case, including the exact boundary (every eligible player selected → rejected; one fewer → accepted) | Yes | `admin-selection.test.ts` |
| Admin disconnect doesn't corrupt the queue; a disconnected Admin still gets their turn in a later cycle | Yes | `admin-selection.test.ts` |
| Admin reconnect keeps control and can still select | Yes | `admin-selection.test.ts` |
| Admin reconnect restores the correct PRIVATE VIEW (`isAdmin`, `adminSelection` populated; a non-Admin's view never has it) | Yes (added this phase — the pre-existing reconnect test only checked FSM/connection state, never called `buildPlayerView()`) | `admin-selection.test.ts` |
| Timeout fallback produces a valid minigame + participant count without changing Admin rules permanently | Yes — same Admin retains identity, no permanent rule change side effect | `admin-selection.test.ts` |
| Admin + queue survive a rehydration round-trip | Yes (structuredClone/JSON round-trip stand-in) and, at the actor+persistence level, as part of the Part 9 idle-eviction scenario (§9) | `admin-selection.test.ts`, `room-actor-manager.test.ts` |

---

## 7. Hack System — truth table (Part 6)

| Scenario | Setup | Outcome | Charges consumed | Verified |
|---|---|---|---|---|
| A. Hacker → Crew | 1 Hacker, Crew participant | Accepted; target's assignment flips | 1 (attacker) | ✓ |
| B. Hacker → self | Hacker targets themself as a participant | Accepted; receives Crew-variant prompt | 1 | ✓ |
| C. Hacker A → Hacker B | Both participants | Accepted; B receives Crew-variant prompt | 1 (A only) | ✓ |
| D. Two Hackers → different Crew targets | Both participants | Both accepted independently | 1 each | ✓ |
| E. Two Hackers → same Crew target | Same round | First accepted; second rejected `TARGET_ALREADY_HACKED` | 1 (first only) — second consumes **zero** | ✓ |
| F. Firewall active | Raw crafted hack message sent regardless of frontend state | Rejected `FIREWALL_ACTIVE` server-side, unconditionally | 0 | ✓ |
| G. Hacker reconnects after spending one hack | — | `hacksRemaining === 1`, not reset to 2 | — (no change) | ✓ |
| (additional) One accepted action per Hacker per round | Multiple attempts by the same Hacker in one window | Only the first counts; further attempts rejected `ALREADY_HACKED_THIS_ROUND`, no extra charge consumed | 1 total | ✓ |

All eight rows are exercised with **guaranteed** role/target composition (not probabilistic), per the false-positive fix in §3.

---

## 8. Private-State Security (Part 7)

Verified via the real `buildTvView`/`buildPlayerView` functions, fed real `RoomActor`-produced state reloaded from persistence (`hack-secrecy-integration.test.ts`), not mocked DTOs:

| Viewer | May receive | Must never receive |
|---|---|---|
| **TV** | Admin id/name, phase, selected minigame + participants, Firewall status, match clock (status/deadline/remaining), public round/vote progress | Any role, any `hacksRemaining`, who hacked whom, hack targets (ever — before/during/after any phase), private prompt variants |
| **Crew (any, including a hacked target)** | Their own prompt/minigame content, public roster, match clock, vote state | `hackerInfo` (always `null`), any signal that they were hacked, other players' roles |
| **Hacker (own view)** | `hacksRemaining`, `canHackNow`, `eligibleTargetIds`, their own last hack outcome, their own accepted target | Another Hacker's `hacksRemaining`, target, or action history |
| **Admin (own view, only during `MINIGAME_SELECT`)** | `isAdmin`, `availableMinigameIds`, `participantLimits`, `eligiblePlayerIds` | Nothing beyond what any player of their role would see otherwise |

Enforced at two levels: the type system (`LastRoundResultSummary` has no field that can hold a hack target — §2) and explicit view-builder assertions (`hackedPlayerIds`/`hackerActionsUsed`/raw `role`/the literal string `HACKER` are all asserted absent from every non-Hacker-A payload's serialized JSON, using exact-match assertions per the substring-collision fix in §3, not naive `.not.toContain(playerId)`).

**Real bug found and fixed here:** `buildTvView`/`buildPlayerView` crashed (`TypeError: Cannot read properties of null`) whenever called while `room.currentRound` exists but `moduleState` is still `null` — i.e. during the hack window itself, before `module.start()` runs. Undetected by every prior Phase 1 test because none called a view builder at that exact moment. Fixed by guarding the `currentMinigame`/`minigameView` computation on `moduleState !== null` in both files.

---

## 9. Room Recovery (Parts 8–9)

What survives an actor eviction (explicit `evict()` or idle-triggered `evictIdle()`) followed by the room being requested again:

- **Redis-equivalent persisted state is never touched by eviction** — `evictIdle()`/`evict()` only remove the in-process `RoomActor` object from the manager's map; verified by loading directly from the repos immediately after eviction, before any recreation (`room-actor-manager.test.ts`).
- **On next request:** Admin id + full rotation queue, `hacksRemaining` per Hacker, current phase (including mid-hack-window `HACKER_CORRUPTION`), `currentRound.hackedPlayerIds`, and the match clock (status/deadline/clockId, byte-identical) all reload correctly — proven with a real mid-match scenario driven through `RoomActor.dispatch()`, evicted via `evictIdle(0)` (not just `evict()`), and reloaded via a brand-new actor instance (`room-actor-manager.test.ts`).
- **The match genuinely continues afterward** — the same test drives one more `timer:expired` post-recovery and confirms the phase advances correctly (`HACKER_CORRUPTION` → `MINIGAME_INSTRUCTIONS`).
- **Both lifecycle-hook registrants (`PhaseTimerService`, `MatchClockService`) fire on every mutation/creation/eviction, independently** — proven directly with mock hook registrants (not just inferred from each service's own tests passing in isolation) to close the exact "second registrant silently clobbers the first" risk class the `hooksList` redesign was built to prevent.
- **`shutdown()` on both services clears only its own schedule**, proven with both real services sharing one manager (`match-clock-service.test.ts`).
- A **stale/duplicate timer callback** for either the phase timer or the match clock cannot double-apply a transition (pre-existing coverage, re-confirmed still passing: `phase-timer-service.test.ts` #7/#8, `match-clock.test.ts`'s duplicate-expiry case from §5).

---

## 10. Remaining Risks (critical, carried forward honestly)

1. **Real Redis is unverified this phase** (§4) — the single largest gap. `InMemoryKeyValueStore` cannot exercise real network partitions, real command-level failure modes, or real TTL expiry timing. Recommend running the existing (already-written, currently self-skipping) `redis-integration.test.ts` for real the next time Docker Desktop is available, before any production deployment.
2. **Single-process ownership assumption is unchanged and unenforced** (`GAMEPLAY_RULES_V1.md` §10) — running two server processes against the same Redis without sticky routing/distributed coordination is not prevented by anything in this codebase. Out of scope for this phase, but worth flagging again since it's a deployment-time footgun, not a code-review-time one.
3. **Hacker sabotage mechanics in Bomb Protocol remain a known, explicitly out-of-scope gap** (unchanged from the Phase 1 report) — not touched this phase, per the explicit STOP condition.
4. **The class of bug found in §8 (crash on a state combination no test happened to exercise) is a standing risk pattern, not a one-off** — the fix addressed the one instance found; there is no exhaustive proof no other `moduleState`-adjacent null-access exists elsewhere in the view/module boundary. Worth a dedicated sweep in a future phase, not attempted here to stay within scope.

Nothing found this phase rises to "must block a handoff," conditional on the Redis gap in item 1 being accepted knowingly rather than silently.

---

## 11. Test Results

- **Full suite:** `npm test` (vitest, server + web) — **675 passed, 1 skipped, 0 failed**, across 77 passed test files + 1 skipped file (`persistence/redis-integration.test.ts`, self-skips without a reachable Redis — see §4).
- **Typecheck:** `npm run typecheck` — clean across all three packages (`packages/shared-types`, `apps/server`, `apps/web`).
- **Web build:** `npm run build:web` (`next build`) — compiled successfully, all 9 routes generated (5 static, 2 dynamic, `/_not-found`, `/`).
- **Server build:** no separate build step exists (runs via `tsx`/`tsx watch`); `typecheck` above is the equivalent verification for the server package.
- **Redis-enabled run:** not achieved this phase — environment-blocked, documented in §4, not silently skipped from the report.

---

## 12. Git Diff Review — `/quiz` confirmed untouched

`apps/web/app/quiz/`, `apps/web/components/quiz/`, `apps/web/lib/quiz/`, and `apps/web/test/quiz-engine.test.ts` all show as pre-existing untracked (`??`) content in `git status` — never staged, never modified by any command run in this phase or Phase C. No file under any `quiz` path was opened, read, or written during this work. The only `apps/web/lib/` changes this phase's git diff shows are `realtime/usePlayerRealtime.ts` and `realtime/wire-schemas.ts` (general realtime wire-contract fields — `matchClock`/`hackerInfo`/`adminSelection`/`isAdmin`/`adminId` — added in Phase C for type-contract compatibility, unrelated to quiz).
