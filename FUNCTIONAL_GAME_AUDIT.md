# Jackom — Functional Game Audit (Pre-Handoff)

**Date:** 2026-08-16
**Scope:** `D:\projects\jackom` working tree (committed history through `e5001f3` + all uncommitted changes present at audit time)
**Method:** Ground truth established directly (git, test run, typecheck, dependency grep) by the auditing session; six independent adversarial deep-dive passes performed in parallel over architecture/persistence, FSM/admin/role-balance, hack/Firewall/timer, security/leakage/phone-TV matrix, minigames/Bomb Protocol, and test-quality/functional-frontend/trust-boundaries. Every claim below is traced to a specific file/line. Nothing in this document was accepted from `IMPLEMENTATION_PROGRESS.md`/`ARCHITECTURE.md` without independent verification against the actual code.

---

## 1. Executive Summary

### Can we hand the game to the visual developer today?

# **NO.**

The backend engineering (FSM race-safety, session/reconnect handling, server-side trust boundaries, Redis persistence) is genuinely strong and mostly handoff-ready. But the product this codebase implements is **not the product described in the founder's current spec**, and a visual designer cannot safely start today for a much simpler reason than any spec disagreement: **a match cannot be completed through the running application.** Only one of six minigames (RATE_IT) has any player-facing controls; the Hacker has no UI to submit a corruption choice; there is no voting UI at all; and a completed match becomes permanently stuck on a blank "Final Result" screen because nothing in the frontend ever sends the event needed to leave `FINAL_RESULTS`. Layered on top of that: the "Admin" role central to the founder's design (a rotating player who picks the minigame and participants) does not exist anywhere in the code — selection is fully automatic and random; the "2 targeted hacks per match" mechanic is actually an unlimited, untargeted, per-round boolean toggle; the 15-minute match clock and its -3‑minute special-game penalty are dead code in production; Bomb Protocol has zero Hacker-sabotage mechanic despite that being its stated design purpose; and the implemented `RATE_IT` minigame is a different game from the currently-specified `RANK_IT`. A designer handed this repo today would either have to invent gameplay behavior to fill these gaps themselves (exactly what this audit was commissioned to prevent) or build visuals for a flow that cannot be played to completion.

None of this means the work is wasted — the realtime/persistence/security substrate is closer to production-grade than most MVPs reach, and fixing the P0 list below is materially cheaper than a rewrite. But "functionally complete, visually unfinished" is not where this repository is right now.

---

## 2. Ground Truth

Established directly by this audit session, not taken from any document:

```
git status --porcelain | wc -l           → 61 changed paths (29 modified + untracked new files)
git diff --stat HEAD                      → 29 files changed, 825 insertions(+), 207 deletions(-) (tracked files only;
                                             ~25 additional untracked files/dirs not counted here, incl. all 6 new
                                             minigames' source+test files and the gameplay frontend)
git log --oneline -9                      → e5001f3 (HEAD) ... bc1afbc — 9 commits, linear history, no merges

npm test        → 73 test files, 607 tests passed, 1 skipped (optional Redis-integration test, correctly self-skips
                   when no Redis is reachable), 0 failed. Fresh run, not reused from documentation.
npm run typecheck → tsc -p packages/shared-types (strict) + tsc -p apps/server (strict) + apps/web tsc --noEmit,
                     zero errors across all three.

Dependencies (root package.json): ioredis, ws, zod (production). No Prisma, no Postgres, no pg, no ORM, no auth
library anywhere in the repo (grepped apps/**/package.json and apps/server/src — zero matches).
RANK_IT / rankIt / rank-it / rank_it: zero matches anywhere in source (grepped whole repo).
RATE_IT: 17 files (backend module+content+registry+FSM wiring, 7 backend test files, 3 frontend components,
          2 frontend test files).
```

**Test count is real and passing, but is not sufficient evidence of correctness** — see §15 and §16. "Tests pass" and "the game can be played" are proven, in this audit, to be two different claims.

**Working tree is safely checkpointable.** No secrets, no destructive state, no half-written files were found in the diff; `.dev-temp/` (untracked) contains only local dev tool caches (`chrome-cors/`, `node-compile-cache/`) and is not source.

---

## 3. Architecture Reality

**One Node.js process owns everything.** `apps/server/src/main.ts` is the sole entrypoint — no cluster, no worker pool. It builds exactly one `RoomActorManager`, one `PhaseTimerService`, and hands the *same* manager instance (by object reference, `bootstrap.ts:156-159`) to both the HTTP API server and the WebSocket gateway. The FSM (`fsm/transitions.ts`) is pure, in-process functions — not a separate service, not a queue/broker.

```
Browser (TV)  ──HTTP──▶ HttpApiServer (create/join room)  ──┐
Browser (TV)  ──WS────▶ GatewayServer  /host/{roomCode}     ├──▶ RoomActorManager (in-process Map<roomId, RoomActor>)
Browser(s) (player) ──WS──▶ GatewayServer /play/{roomCode}  ┘         │
                                                                        │  one serialized async queue per room
                                                              RoomActor │  → pure handleEvent() FSM → persist()
                                                                        │
                                                              PhaseTimerService (setTimeout per room, re-enters
                                                                        │  the same dispatch() path on expiry)
                                                                        ▼
                                                                     Redis
                                                        room:{id}, room:{id}:private, roomCode:{code},
                                                        session:{token}, hostSession:{token}  (~6h TTL each,
                                                        refreshed via 4+ sequential non-transactional calls)
```

No message broker, no load balancer, no second service anywhere. Concurrency safety for a single room is entirely a per-room in-process promise chain (`RoomActor`'s `this.queue`) — there is **no distributed lock**; `ARCHITECTURE.md` §7.1 explicitly documents "exactly one process, exactly one queue per room" as the MVP's whole concurrency story, and the code matches that claim exactly (confirmed: no partial/accidental locking anywhere). Running two server instances against the same Redis would silently corrupt room state via last-writer-wins races — an accurately-documented, zero-enforcement architectural constraint, not a bug, but one the founder should have stated back to them in plain terms before ever considering horizontal scaling.

**What exists only in planning docs, not in code:** any notion of a persistent database beyond Redis (no Prisma/Postgres anywhere, confirmed by dependency grep); user accounts/auth-as-identity (only ephemeral, TTL-bound host/player sessions exist); match history/analytics/moderation beyond a room's own TTL window; the "Admin" player role (§7); target-based hacking (§7); a live 15-minute match clock (§8/§11).

---

## 4. P0 Blockers — must fix before handoff

1. **A completed match cannot leave `FINAL_RESULTS`.** The state requires `host:advance` (or `player:requestRematch`) to progress to `REMATCH_LOBBY`; no component in `apps/web` ever sends either event (grep-confirmed zero matches). The winner (`TvView.winner`) is also never rendered anywhere in the frontend. **Every match that reaches its natural end is permanently stuck on a blank "Final Result" screen with no winner shown and no way to rematch.** *(Evidence: functional-frontend audit; `durations.ts:14-21` confirms FINAL_RESULTS has no server timer either, so nothing can force it forward automatically.)*
2. **No voting UI exists anywhere.** `PlayerView.canVote` is computed server-side and delivered but never consumed; zero references to `submitVote`/a candidate list/a vote button in `apps/web`. The core accusation mechanic is currently unreachable by a real player — every vote silently resolves as a no-op/skip via timer expiry. *(Evidence: functional-frontend audit.)*
3. **No UI exists for a Hacker to submit a corruption choice.** `HACKER_CORRUPTION` renders only a generic phase-name label on both TV and phone; `player:submitCorruptionChoice` is never sent from `apps/web` (grep-confirmed). The other core mechanic of the game is also currently unreachable by a real player. *(Evidence: security/phone-TV-matrix audit and functional-frontend audit, independently confirmed by both.)*
4. **Five of six regular minigames, plus the special game, have no player or TV controls.** `PlayerMinigameRouter.tsx:40` / `TvMinigameRouter.tsx:24` render the literal placeholder string *"واجهة التحكم التفصيلية ستُضاف في خطوتها المخصصة"* ("detailed control UI will be added in its own step") for COMPLETE_IT, PREDICT_THEM, DRAW_IT, DESCRIBE_IT, DEFEND_IT, and BOMB_PROTOCOL. Only RATE_IT is playable end-to-end. A round in any of these can only ever resolve via server timeout, never a real player action.
5. **The host has zero in-game controls.** `useHostRealtime.ts` exposes only `startGame()`. Every `host:skip*`/`host:forceEnd*`/`host:endDiscussionEarly`/`host:endVoteEarly`/`host:advance`/`host:restartMatch`/`host:closeRoom` event exists server-side but is never sent from any web component. The TV screen currently cannot be used to move the match along at all beyond the initial start.
6. **`DESCRIBE_IT` and `DEFEND_IT` ignore `corruptionRevealPolicy` entirely.** Both modules' `publicReveal()` unconditionally return the crew *and* hacker prompt variants together at `RESULTS_REVEAL` (`describe-it.ts:60-62,133-151`; `defend-it.ts:110-112,200-221`), gated only on phase, never on the room's configured policy. Under the documented, supported `'never'` policy, a corrupted player (and anyone comparing notes) can trivially deduce corruption occurred — the one thing `'never'` is supposed to permanently withhold. Untested by the existing suite (`corruption.test.ts` only ever exercises RATE_IT).
7. **Production Redis client has no `'error'` listener.** `bootstrap.ts:65`'s long-lived `Redis` client is never given `.on('error', ...)`; Node throws an unlistened `'error'` event as an uncaught exception, and there is no `process.on('uncaughtException')` handler in `main.ts`. **The realistic outcome of any brief Redis connectivity blip (restart, network hiccup, container redeploy) is the entire server process crashing**, taking every active room down with it — despite `room-actor.ts`'s careful per-command try/catch machinery, which never gets a chance to run because the crash happens at the connection-event level, not the command level. One-line fix, high real-world likelihood.
8. **DESIGN DECISION REQUIRED — the "Admin" role does not exist.** No admin selection/rotation, no admin-facing event, no admin-gated state anywhere in the code (`RoomState`, `PlayerPublic`, and `InboundEvent` all confirmed to have zero admin-related fields). Minigame choice is `randomChoice` over all registered games every round (`registries.ts:46`); participant choice is `randomSubset` with per-game hardcoded magic-number bounds not sourced from any config field. If "a rotating player picks the minigame and participants" is core to the pitched loop, this is not a small gap — it is a missing pillar, and both the code and `IMPLEMENTATION_PROGRESS.md` already know it (`IMPLEMENTATION_PROGRESS.md:1343-1344`).
9. **DESIGN DECISION REQUIRED — the implemented hack mechanic does not match the spec.** `PlayerSubmitCorruptionChoiceEvent` is `{phaseId, playerId, corrupt: boolean}` — no target field exists anywhere in the type, the FSM, or `RoomPrivateState`. Resolution is "any one Hacker voting true corrupts the *entire round* for *everyone*" (`registries.ts:55-58`, OR-aggregated), not a per-target swap. **There is no charge/budget counter anywhere in the codebase** — a Hacker can attempt to corrupt every single round of the match, not just twice. This is a faithful implementation of `ARCHITECTURE.md`'s own (equally target-less) spec, but it does not implement the founder's "hack a specific Crew player, 2 charges" design intent at all.
10. **CONFLICT — Bomb Protocol has zero Hacker-sabotage mechanic.** Role (Crew/Hacker) is never read anywhere in `bomb-protocol.ts`/`bomb-protocol-content.ts`; `MiniGameContext.corrupted` is hardcoded `false` by contract for the special game. It is, exactly as designed-against, "everyone cooperates, no adversarial element" — directly contradicting the stated requirement that the special game "create[s] opportunity for Hacker sabotage."
11. **DESIGN DECISION REQUIRED — the match clock (15-minute target) and the Bomb Protocol failure's -3-minute penalty are both dead in production.** `initMatchClock()` unconditionally returns `mode: 'disabled'` (`match-clock.ts:8-16`); `RoomConfig` has no field to ever request `'countdown'` mode; nothing anywhere ticks `matchClock.durationMs` against elapsed real time; the penalty-application branch (`transitions.ts:654-657`) is reachable only in tests that manually forge `mode: 'countdown'` onto the room object. There is also no code anywhere that ends a match because a clock hit zero — actual match length is governed by `maxCycles` (default 10 rounds), not time.
12. **DESIGN DECISION REQUIRED — `RATE_IT` (implemented) and `RANK_IT` (currently specified) are unrelated games, not a naming difference.** RATE_IT is a private 0–100 numeric slider; the spec's RANK_IT is a shared 4-card drag-to-order comparison game. Migrating means throwing away the only fully-built playable frontend in the app (`apps/web/components/gameplay/hacker/minigames/rate-it/`, 158 lines) and writing new backend validation/resolution logic and new content — only the registry slot and FSM phase routing are reusable. See §7 for the full migration-cost table.

## 5. P1 Important Problems — should be fixed before handoff

- **`RoomActorManager.evictIdle()` is dead code in production** — defined and unit-tested but never called from `main.ts`/`bootstrap.ts`. Idle in-memory room actors accumulate for the process's entire lifetime; unbounded memory growth on any long-running deployment (low severity for a short-lived demo/dev process, real for anything longer-running).
- **`seq: 0` permanently soft-locks a player out of a minigame round.** `handleMinigamePlay` rejects `event.seq &lt;= lastSeq` where `lastSeq` defaults to `0` (`transitions.ts:525-527`) — a client sequencing its first action as `0` is rejected forever, and since rejection never advances `lastSeq`, *every subsequent action from that player for the rest of the round* is also rejected. The "seq starts at 1" contract is enforced only by convention across tests and the (not-yet-built) frontend action-submission code, never documented in `events.ts`, never validated server-side.
- **`corruptionRevealPolicy: 'on_instructions'` is currently a no-op**, behaviorally identical to `'on_results'` — the flag it sets (`room.currentRound.corruptionRevealed`) is only ever read from *completed* round history, never surfaced live during `MINIGAME_INSTRUCTIONS`/`MINIGAME_PLAY`. Same subsystem as the P0 #6 bug; worth fixing in the same pass.
- **Bomb Protocol's single Operator is a hard single point of failure.** `handleDisconnect` is a pure no-op (`bomb-protocol.ts:143`); only the Operator can submit any action; an Operator disconnect mid-round stalls all progress until the flat 90-second timer expires and auto-resolves as FAILURE, burning the special-game opportunity and applying the (currently inert) 3-minute penalty. No test exercises this path. Every other minigame degrades gracefully per-turn; this one doesn't.
- **Participant-count wiring diverges from spec on 3 of 6 games, two have no upper bound at all.** DRAW_IT is hard-capped at 3 (spec 2-4 — 4 is mathematically unreachable in `Math.max(2, Math.min(3,4,count))`, `transitions.ts:224`); PREDICT_THEM's selected group is hard-capped at 3 (spec 2-4, `transitions.ts:213`); COMPLETE_IT and RATE_IT have **no upper participant bound whatsoever**, running with the full eligible pool (up to `maxPlayers=12` by default config) instead of the spec's 2-5.
- **Every minigame's content bank is a single hardcoded fixture pair**, explicitly self-documented in `IMPLEMENTATION_PROGRESS.md` as temporary — not remotely enough content for real playtesting, independent of the frontend gap.
- **`player:corruptionAck`/`blockedByFirewall` is typed and documented but never sent by the gateway** — a Hacker currently gets no signal distinguishing "my vote is pending" from "the Firewall silently ate it."
- **`firewallActive` is never rendered anywhere in the frontend** (present on `TvView`, absent from `PlayerView` entirely, and unread by any component even where it does exist) — not exploitable, but a real display gap.
- **`handleRematchLobby` and `handleFinalResults`'s `player:requestRematch` accept-path have zero test coverage** — the only "rematch" test bypasses both via the `host:restartMatch` shortcut. Combined with P0 #1, the entire rematch subsystem is both untested and non-functional end-to-end.
- **Race-condition test coverage is weak.** The one existing concurrency test fires the *same* idempotent event twice from the same sender — no test proves the actor's serialized queue produces the *correct* game-logic outcome (not just "doesn't crash") when two different players' actions genuinely race (e.g., last voter resolving a tally, `timer:expired` racing a legitimate late submission).
- **`gateway/security.test.ts`'s name overstates its coverage** — it only tests the pre-existing generic leak scenario (LOBBY→ROLE_REVEAL). Real per-minigame secret-leak assertions do exist for all 6 new games, but are scattered across each minigame's own test file — functionally fine, but a reviewer checking "is there a security suite for the new games" by filename alone would wrongly conclude no.

## 6. P2 Improvements — can happen alongside visual work

- Redis key TTLs (`room:{id}`, `roomCode:{code}`, session keys) are refreshed via 4+ sequential non-transactional calls per mutation, not atomically — negligible in practice against a 6-hour TTL, but `ARCHITECTURE.md`'s "(TTL matches room)" phrasing is not literally true at the millisecond level. Documentation-precision fix only.
- Hacker-count formula (`round(playerCount × 0.25)`, clamped `[1,3,playerCount]`) never produces 0 or ≥half-crew across 4-10 players (playable), but is explicitly the only registered rule and self-labeled a placeholder — treat the whole balance model as unverified game design, not a finished feature.
- Production RNG is `Math.random()`, not a CSPRNG — low real-world severity for a party game (server internals aren't client-observable) but worth noting if any future feature exposes server randomness to adversarial inspection.
- `ROOM_CREATED` state is fully dead code (never assigned; `createRoom()` returns a room already in `LOBBY`) — harmless, but cleanup-worthy.
- `defend-it`'s "group Q&A" is actually a single random follow-up asker per speaker, narrower than the spec's open group questioning — minor mechanic gap, not blocking.
- `predict-them`'s tie handling is correctly detected (`resolveMajority` returns `'TIE'`) but has zero gameplay consequence — no scoring/correctness logic exists anywhere in any minigame yet, so this is consistent with the rest of the codebase's scope, not a unique bug.

---

## 7. Spec vs Code Conflicts

| Topic | Founder spec | Actual code | Verdict |
|---|---|---|---|
| 6th normal minigame | `RANK_IT` — 4 shared cards, drag-to-order, 2-5 players, ~20s | `RATE_IT` — private 0-100 slider, single value, no shared items | **CONFLICT.** Not a naming difference — unrelated mechanics. See migration table below. |
| Admin role | Rotating player picks minigame + participants each round | No such role exists; both are fully automatic/random server-side (`randomChoice`/`randomSubset`) | **MISSING** entirely |
| Hack mechanic | Targeted: Hacker picks a specific Crew player to affect; 2 charges per match | Untargeted, unlimited: any Hacker's `true` vote flips the *whole round* for everyone; no charge counter exists | **CONFLICT / MISSING** the targeting and budget both |
| "Push the Button" accusation | Player-initiated accusation trigger | No such event exists; voting is scheduler-driven (after N rounds) or host-forced only | **MISSING** |
| Special game participant scaling | 3-5 by lobby size | Confirmed exactly matching: ≤5 players→3, ≤7→4, else→5 (`bomb-protocol-content.ts:23-24`, tested) | **PASS** |
| Special game failure penalty | Exactly -3 minutes | `failPenaltyMs: 180_000` correctly wired in the resolution branch, but that branch is unreachable because `matchClock.mode` never becomes `'countdown'` in production | **PARTIAL** — correct value, dead code path |
| Firewall (success → next round un-hackable) | Server-enforced protection | Confirmed correctly implemented: synchronously bypasses `HACKER_CORRUPTION` before any client input can land, set only on real Bomb Protocol success, consumed exactly once, cleared on match reset, no leakage across rounds/votes | **PASS** — this one genuinely matches spec |
| Special game Hacker sabotage | "creates opportunity for Hacker sabotage" | Role is never consulted anywhere in Bomb Protocol; purely cooperative | **CONFLICT** |
| Match length | ~15 minutes, timer-driven | No running clock exists; length is governed by `maxCycles` (default 10 rounds) | **CONFLICT / MISSING** |
| `corruptionRevealPolicy` (`'never'`/`'on_instructions'`/`'on_results'`) | Configurable secrecy contract, documented on the type itself | RATE_IT/COMPLETE_IT/PREDICT_THEM/DRAW_IT correctly respect it; DESCRIBE_IT and DEFEND_IT ignore it entirely and always reveal both variants | **CONFLICT** (code violates its own documented contract) |

**RATE_IT → RANK_IT migration cost, if the founder chooses to keep the RANK_IT spec:**

| Component | Cost |
|---|---|
| `minigames/rate-it.ts`, `rate-it-content.ts` | Throwaway — full rewrite (validation shape, action shape, resolution) |
| `minigames/prompt-assignment.ts` | Partially reusable (crew/hacker variant-swap *pattern* transfers; the data shape doesn't) |
| `minigames/registry.ts`, `rules/registries.ts` selection-rule entry | Trivial rename |
| `fsm/transitions.ts` per-game `proceedToInstructions` branch | Moderate rewrite — new branch for a shared card-set instead of a per-player prompt split |
| `apps/web/components/gameplay/hacker/minigames/rate-it/*` (RateSlider, PlayerRateIt, TvRateIt — 158 lines, the ONE working frontend) | 100% throwaway |
| `PlayerMinigameRouter.tsx`/`TvMinigameRouter.tsx` routing shell | Trivial — swap one `if` branch |
| All RATE_IT test files (backend + frontend) | Throwaway — slider-specific assertions |
| **New work required, not present anywhere today** | Drag-to-order UI, shared 4-card TV/phone rendering, permutation-validation schema, ranking-comparison resolution logic, corrupted-variant strategy for a card set, new content bank |

---

## 8. Full Gameplay State Machine — Actual vs Intended

**Actual `GameState` values (20, from `packages/shared-types/src/enums.ts`):** `ROOM_CREATED` (dead — never assigned), `LOBBY`, `ROLE_ASSIGNMENT` (instant, unobservable), `ROLE_REVEAL`, `GAME_INTRO`, `MINIGAME_SELECT` (instant, unobservable), `HACKER_CORRUPTION`, `MINIGAME_INSTRUCTIONS`, `MINIGAME_PLAY`, `RESULTS_REVEAL`, `DISCUSSION`, `SPECIAL_GAME_INTRO`, `SPECIAL_GAME_PLAY`, `SPECIAL_GAME_RESULT`, `FINAL_DISCUSSION`, `VOTING`, `ELIMINATION_RESULT`, `FINAL_RESULTS`, `REMATCH_LOBBY`, `ABANDONED`.

| Transition | Verdict | Evidence |
|---|---|---|
| LOBBY → role assignment/reveal | PASS | `handleLobby` `transitions.ts:440-450` → `performRoleAssignment` `:115-139` |
| Admin/headquarters phase, admin picks minigame | **MISSING** | No such state/event exists; `GAME_INTRO` is a passive splash only |
| Participant selection (by admin) | **MISSING/CONFLICT** | Algorithmic (`randomSubset`), not player-driven |
| Hack window (targeted, 2/match) | **FAIL** | Round-wide boolean, unlimited, untargeted (`registries.ts:55-58`) |
| Private prompt distribution | PASS | `proceedToInstructions` `:196-260` |
| Player action → lock → results | PASS | `handleMinigamePlay` `:512-570`, phase/seq/dedup gated |
| Discussion → next round | PASS | `resolveAfterRoundOrSpecial` `:287-301` |
| Special-game auto-trigger → participants → instructions → play → success/fail → Firewall/-3min → return | PARTIAL | Everything wired except the -3min penalty (dead, matchClock disabled) |
| Accusation: push button → discussion → suspects → vote → resolution | **PARTIAL/FAIL** | Voting itself is solid (tie-break rules, bounded revote); no player-triggered accusation, no suspect sub-state |
| Continue or end | PASS | `handleEliminationResult` `:708-727` → `checkWinCondition`/`maxCycles` |

**Race/robustness verdicts (independently traced, not assumed):**
- Serialized per-room queue + double staleness check (pre-dispatch snapshot check *and* `isStalePhase` inside the same dispatch) → **PASS**, genuinely defended, not merely claimed.
- Duplicate timer scheduling → **PASS**, `schedule()` always cancels first, one-timer-per-room model.
- Special game vs. voting collision → **PASS**, structurally impossible (single `phase.state` field, one FSM).
- Every submission path (reveal ack, corruption choice, minigame action, vote, rematch request) is phase-gated server-side, none rely on client good behavior → **PASS**, except the `seq:0` softlock noted in §5.
- Timer hitting zero mid-transition → moot in current production config (no live match clock exists to hit zero); **MISSING** as a real feature, not exercised as a race because the mechanism it would race against doesn't run.

---

## 9. Phone ↔ TV Matrix

Legend: ✅ functional & correctly scoped · ⚠ placeholder/incomplete (not a security issue) · ❌ dead end, no control exists.

| Phase | TV | Participant/Hacker phone | Spectator phone |
|---|---|---|---|
| LOBBY | Roster, room code, QR | ✅ Join/ready | same |
| ROLE_REVEAL | Generic label (correctly never learns roles) | ✅ role text shown, **no acknowledge button** — `player:acknowledgeReveal` never sent | N/A (everyone has a role pre-elimination) |
| HACKER_CORRUPTION | Generic label only | ❌ **dead end** — no control to submit `player:submitCorruptionChoice` exists on either role's phone | Generic label |
| MINIGAME_PLAY — RATE_IT | ✅ live progress | ✅ full slider control | ✅ spectator state |
| MINIGAME_PLAY — other 5 + BOMB_PROTOCOL | ⚠ placeholder text only | ⚠ own private prompt/instructions **displayed correctly**, but **zero input controls** — round can only resolve via timeout | ✅ spectator state |
| RESULTS_REVEAL | ✅ RATE_IT only; ⚠ others show raw placeholder | ✅ RATE_IT only | ✅ |
| VOTING | ✅ progress counter shown | ❌ **no voting UI anywhere** — `canVote` computed, never consumed | N/A (ineligible if eliminated) |
| FINAL_RESULTS | Generic label, winner **never rendered** | Generic label, no rematch button | same |

Full phase-by-phase detail (SPECIAL_GAME_INTRO/PLAY/RESULT, FINAL_DISCUSSION, ELIMINATION_RESULT, REMATCH_LOBBY) is in the raw audit transcripts; all of them route through the same generic label-only panel with no phase-specific interaction beyond what's captured above. **Net finding: a player currently has no way to take the two most important actions in the game (hack, vote) from either device, and the host has no way to move the game forward beyond clicking "start."**

---

## 10. Minigame Audit

| Game | Backend | Participant count vs spec | Content bank | Frontend (phone/TV) | Notable |
|---|---|---|---|---|---|
| RATE_IT (occupies the "6th game" slot; ≠ spec'd RANK_IT) | Solid — validation, timeout, reveal-together all correct | No upper bound (spec N/A, since it's the wrong game) | 1 fixture pair | **✅ FUNCTIONAL** — only fully playable game | See §7 conflict |
| DRAW_IT | Solid — stroke/point caps, all-together reveal | **CONFLICT** — hard-capped at 3, spec's 4 unreachable (`transitions.ts:224`) | 1 fixture pair | ⚠ Placeholder | Timer (30s) matches spec exactly |
| COMPLETE_IT | Solid — text validation, timeout | **CONFLICT** — no upper bound at all (spec 2-5) | 1 fixture pair | ⚠ Placeholder | No defend→challenge phase exists (spec wants reveal→defend→challenge); flat reveal only |
| PREDICT_THEM | Solid — two-step audience/prediction flow, tie correctly detected | **CONFLICT** — hard-capped at 3, spec's 4 unreachable | 1 fixture pair | ⚠ Placeholder | Tie has zero gameplay consequence (no scoring exists anywhere yet, consistent gap) |
| DEFEND_IT | Solid — 4-stage speaker cycle, bounded timeout recovery | **PASS** — correctly reaches spec's 2-4 range | 1 fixture pair | ⚠ Placeholder | "Group Q&A" is actually one random follow-up asker, narrower than spec |
| DESCRIBE_IT | Solid — turn-based clue-giving, bounded timeout | **PASS** — correctly reaches spec's 3-5 range | 1 fixture pair | ⚠ Placeholder | **Ignores `corruptionRevealPolicy` — P0 #6** |

All six games share solid FSM-level protections (server-side validation, dedup/stale-action rejection, Firewall integration, no-op-safe disconnect handling) and were independently verified leak-free at the payload level (participant vs. spectator vs. TV) — with the DESCRIBE_IT/DEFEND_IT reveal-policy exception above. **The backend logic layer for all six games is genuinely close to done.** The frontend layer is not: five of six render literal "coming later" placeholder text.

---

## 11. Bomb Protocol Audit (Detailed)

- **Roles:** one `operatorId` (random, role-blind — Crew/Hacker status never consulted), remaining participants `analystIds`.
- **Scaling:** confirmed exactly matching spec — ≤5 players→3 participants, ≤7→4, else→5, tested precisely.
- **Info split:** genuinely fragmented — Operator sees the board (symbols/wires/code slots) but never the solution; analysts get round-robin clue fragments for the *current* module only; with 2+ analysts no single analyst holds a full solution. Verified server-side (`buildPlayerView`), not merely by convention.
- **Puzzle sequence:** SYMBOLS → WIRES → CODE_SEQUENCE, strictly sequential, wrong-module actions rejected.
- **Timer:** flat 90 seconds for the entire puzzle — no per-stage timers.
- **Strikes:** `maxStrikes=3`, precisely triggers FAILURE at the 3rd strike.
- **Success/failure handoff:** correctly sets `firewallActive=true` on success (consumed exactly once, next `HACKER_CORRUPTION`); correctly computes the -3min value on failure — but that computation is unreachable in production (§5/§7, matchClock disabled).
- **Hacker sabotage: CONFIRMED ABSENT.** No action, no false-clue mechanic, nothing lets a Hacker among the participants mislead teammates. Direct conflict with stated design intent.
- **Resilience: FAIL for the Operator.** `handleDisconnect` is a pure no-op; only the Operator can act at all; an Operator disconnect stalls the entire round until the flat 90s timer burns out and the round auto-fails, unlike every other game's graceful per-turn degradation. Untested.
- **Solo-solve resistance:** genuinely good — server-side per-player payload scoping means one legitimate client cannot see another's clues or the solution; the puzzle structurally requires cross-player communication (assuming one human per client, same threat model as any social game).
- **Spectator leakage:** none found — spectator view excludes solutions/fragments entirely.
- **Frontend:** placeholder only — no Operator/Analyst-specific controls exist; falls into the same generic router fallback as the other unfinished minigames.

**Verdict: PARTIAL.** Functions as a genuine cooperative info-sharing puzzle with solid server-side compartmentalization; does **not** function as an adversarial social challenge (no sabotage), and has a structural resilience weakness (single point of failure) the rest of the codebase's degrade-gracefully pattern avoided.

---

## 12. Database / Persistence Audit

| Concern | Verdict | Notes |
|---|---|---|
| Live room state (phase, players, roles, votes, timers) | **IMPLEMENTED** | Redis, two JSON docs per room, Zod-validated on every load — corrupted/malformed data never reaches the FSM untyped |
| User accounts / persistent auth | **NOT NEEDED BEFORE HANDOFF (confirmed absent)** | Zero traces anywhere; only ephemeral, TTL-bound sessions exist — correct scope for a party-game demo |
| Match history / analytics / moderation / reports | **NOT IMPLEMENTED (by design)** | Lives inside `RoomState`, dies with the room's TTL; `ARCHITECTURE.md` explicitly flags this as a later Postgres concern, out of scope now |
| Purchases / entitlements | **NOT NEEDED BEFORE HANDOFF** | Zero traces, correct scope call |
| Redis TTL strategy | **PARTIAL** | Correct in spirit (6h TTL, refreshed on every mutation), not atomic (4+ sequential calls) — negligible risk in practice, documentation-precision gap only |
| Crash/restart recovery, timer resume | **PASS** | Correctly computes *remaining* time from persisted `phaseStartedAt+durationMs`, never resets to full duration |
| TV/player reload | **PASS** | Both correctly rebuild full current-phase state; `privateInfoSent` flag is per-socket, cannot leak stale state across a reload |
| Redis connectivity blip | **FAIL** | No `'error'` listener on the production client → whole-process crash on any blip (P0 #7) |
| Idle-room memory (`evictIdle`) | **Real gap, low severity for a demo** | Never called in production; unbounded actor accumulation over a long-running process |
| Multi-instance safety | **Confirmed hard constraint, zero enforcement, accurately documented** | No distributed lock; two instances on one Redis would silently corrupt state via last-writer-wins |

---

## 13. Security & Secret-State Audit

**Structural finding: the core view/gateway architecture genuinely prevents most leak classes by construction, not merely by convention.** `TvView`'s TypeScript type has no field capable of holding a role, prompt secret, or individual vote — it is structurally impossible, independently re-verified by reading the type and every builder, not by trusting existing tests. Session tokens are sent exactly once (join/reconnect ack) and never rebroadcast. Reconnect/session-switch client-state hygiene is solid — `usePlayerRealtime.ts`'s effect is keyed on session identity and unconditionally clears all secret-bearing state on any session/room change.

**Leakage matrix results:** PASS on all 8 tested categories (TV role leakage, premature prompt reveal, cross-player prompt leakage, Crew inspecting Hacker state — N/A, no such state exists — spectator leakage, frontend-holds-everything-and-hides-with-CSS, reconnect leaking a prior occupant's state, residual React state across room switches).

**The one real bug (already listed as P0 #6): DESCRIBE_IT and DEFEND_IT bypass `corruptionRevealPolicy` entirely**, always revealing both prompt variants at `RESULTS_REVEAL` regardless of configured policy — letting a corrupted player deduce their status even under `'never'`. This is untested by the existing suite and was found only by independently re-deriving each module's reveal logic rather than trusting `corruption.test.ts`'s claims (which only ever exercises RATE_IT).

**Related, lower severity: `corruptionRevealPolicy: 'on_instructions'` is a no-op** — behaviorally identical to `'on_results'` today, because nothing surfaces the reveal flag live during the round, only from completed history.

**Trust-boundary audit (§ below is the full table): no failures found.** Every value a client could plausibly try to forge — phase, role, prompt variant, vote outcome, winner, sender identity — is either computed entirely server-side from data the client never touches, or explicitly re-validated before any mutation. Notably, no wire schema anywhere declares a `playerId` field, so identity spoofing isn't merely checked for, it's structurally impossible to attempt. This is an unusually well-hardened layer for this stage of a project.

| Value | Server-validated? | Verdict |
|---|---|---|
| Phase / timer / deadline | Yes, computed server-side only | PASS |
| Prompt assignment / Hacker identity | Yes, derived from server-only `RoomPrivateState` | PASS |
| Firewall state | Yes, set only by server-side special-game resolution | PASS |
| Submitted answers | Yes, `.strict()` Zod schema per action type, validated before mutation | PASS |
| Speaking order | Yes, server-computed shuffle | PASS |
| Vote/accusation result, winner | Yes, `tally()`/`checkWinCondition()` run entirely server-side | PASS |
| Sender identity (`playerId`) | Yes — injected from the authenticated socket; no wire schema even has a `playerId` field to spoof | PASS |
| Admin assignment / hack targets | N/A — features don't exist (see §7) | N/A |

---

## 14. Multiplayer / Disconnect Audit

- **Process-level:** single point of failure by design (§3), with one severe operational bug (P0 #7, Redis error-listener crash) undermining the otherwise-careful per-command error handling.
- **Room-actor level:** partial-persistence failures roll back cleanly, never advance in-memory state past what's durable, never crash the process (`room-actor.ts`) — genuinely solid.
- **Player disconnect during a minigame round:** handled gracefully — the round simply proceeds without that player's action, resolved by timeout; every module's `handleDisconnect` is either a safe no-op or explicitly advances turn order (DEFEND_IT, DESCRIBE_IT).
- **Player disconnect during `HACKER_CORRUPTION`:** safe no-op — absent votes are treated as "did not corrupt," no hang.
- **Bomb Protocol Operator disconnect:** the one real weak point — see §11, stalls the whole round for up to 90 seconds and burns the special-game opportunity, untested.
- **Reconnect (TV and player):** both correctly rebuild full current-phase state, private info correctly re-delivered every time (harmless over-delivery, never under-delivery). Genuinely solid, independently verified.
- **Two server instances on one Redis:** would silently corrupt state (§3, §12) — architectural constraint, not a bug, but must be stated plainly to whoever manages deployment.
- **Stale/idle rooms:** timer-correctness angle is fine (lazy recovery on next touch is a legitimate MVP trade-off); memory angle is a real, low-severity gap (`evictIdle` never runs).

---

## 15. Missing Tests (Prioritized)

1. **P0** — No test exercises Bomb Protocol Operator disconnect mid-round (the one confirmed resilience failure in the whole minigame set).
2. **P0** — No test exercises `corruptionRevealPolicy: 'never'`/`'on_instructions'` against DESCRIBE_IT or DEFEND_IT specifically (would have caught the P0 #6 bug immediately).
3. **P1** — `handleRematchLobby` (REMATCH_LOBBY→LOBBY) has zero test coverage; the only "rematch" test bypasses it entirely via the `host:restartMatch` shortcut.
4. **P1** — `handleFinalResults`'s `player:requestRematch` accept-path is never tested while actually in `FINAL_RESULTS` (the only reference to that event tests identity-spoofing rejection from `LOBBY`, not the real accept path).
5. **P1** — No genuine concurrent-race test exists (two *different* players' actions racing to prove correct — not merely non-crashing — resolution); e.g. last voter resolving a tally concurrently with `timer:expired`.
6. **P1** — `draw-it.test.ts` has zero disconnect/reconnect assertions despite `DrawItModule.handleDisconnect` existing.
7. **P2** — Frontend tests (`gameplay-foundation.test.tsx`) only assert a `[data-minigame-id]` container renders — they cannot and do not distinguish a real control from the "coming later" placeholder text, which is exactly the false-confidence pattern this audit was asked to catch. Any new frontend test suite for the 5 remaining minigames should assert on real interactive elements, not container presence.
8. **P2** — `FINAL_DISCUSSION`'s `host:endDiscussionEarly` path (vs. timer expiry) is never exercised.

---

## 16. Handoff Readiness Scores

Scored on evidence gathered above; not inflated.

| Area | Score | Evidence |
|---|---|---|
| Backend (FSM engine, gateway, timers) | **60%** | Race-safety, phase-gating, and server-authority are excellent; but core design pillars (Admin, targeted hacks, live match clock) are absent, not merely rough |
| Database / persistence | **65%** | Well-scoped for a demo, Zod-validated, correct restart/recovery — undermined by the process-crash bug (P0 #7) and dead eviction path |
| Business logic (role balance, corruption, voting, win condition) | **40%** | Individually sound rules, but two of the three headline mechanics (Admin, targeted hacks) don't exist and the match-length mechanic (timer) is inert |
| Realtime networking (WebSocket gateway, auth, security) | **85%** | Genuinely strong — trust boundaries all pass, reconnect/session hygiene solid, this is close to production-grade |
| Match FSM / workflow | **55%** | The implemented states transition safely and race-free; but 2 of the 3 major flow additions the spec describes (admin turn, accusation trigger) were never built |
| Normal minigames | **35%** | Backend logic for all 6 is solid; but the "6th game" is the wrong game, 3 of 6 have participant-count mismatches vs spec, and content is one fixture pair each |
| Special game (Bomb Protocol) | **40%** | Co-op puzzle mechanics and info-compartmentalization are genuinely good; zero sabotage mechanic (its core stated purpose) and a real single-point-of-failure |
| TV ↔ phone flow | **15%** | Only 1 of 6+1 games has any controls; no voting UI; no hack UI; no host controls beyond start; match cannot reach a visible end state |
| Reconnection / recovery | **65%** | Reload/reconnect logic itself is excellent; dragged down by the process-crash risk and unbounded idle-actor memory |
| Functional frontend (can a match be played end to end?) | **20%** | Lobby, join, RATE_IT, and reconnect UX work; everything past that — hacking, voting, 5 minigames, special game, match end — cannot be operated by a real player today |
| Automated test confidence | **55%** | 607 real, mostly well-targeted tests; but coverage gaps (rematch subsystem, real races, reveal-policy per new game) mean "tests pass" currently overstates functional readiness |

---

## 17. Exact Fix Order

The shortest logical path from current state to **functionally complete / design-ready**:

1. **Decide the four open design questions first** (§18 "must decide before coding") — Admin role, hack targeting/budget, match clock, RATE_IT vs RANK_IT. Every item below depends on at least one of these answers; building frontend controls for the wrong mechanic is wasted work.
2. **Fix the Redis `'error'` listener** (P0 #7) — one line, eliminates the single highest-likelihood production crash. No dependency on any design decision.
3. **Fix `DESCRIBE_IT`/`DEFEND_IT` `corruptionRevealPolicy` bypass** (P0 #6) — self-contained bug fix in two files, add the missing test case. No design dependency.
4. **Build the missing core interaction UI**, in this order because each unblocks testing the next: (a) Hacker corruption-choice control, (b) voting UI, (c) `FINAL_RESULTS`/rematch flow (winner display + advance/rematch button) — this is what turns "can't complete a match" into "can complete a match," even before any minigame beyond RATE_IT is built.
5. **Build real frontend controls for the remaining 5 minigames + Bomb Protocol**, one at a time, reusing the RATE_IT pattern (backend is already solid for all of them) — order by whichever the founder wants demoable first.
6. **Add minimal host controls** (skip/force-end/advance) so a demo isn't entirely at the mercy of phase timers.
7. **Implement (or explicitly descope) the Admin role and targeted-hack mechanic**, per the §18 decision — this is the largest single scope item and should not start until the design decision is final.
8. **Implement (or explicitly descope) the live match clock and its -3min penalty**, per the §18 decision.
9. **Add Bomb Protocol Hacker-sabotage mechanic and Operator-disconnect resilience**, once the hack-targeting design is settled (they likely share a code path).
10. **Backfill the P1 test gaps** (§15 #1-6) alongside each corresponding fix above, not as a separate pass.
11. **Fix P2 items opportunistically** during the above — none are blocking.

Only after step 5 (at minimum) is a full match genuinely playable start-to-finish, which is the actual prerequisite for a visual designer to work without inventing gameplay behavior.

---

## 18. Questions for Founder

### Must decide before coding

1. **Is the "Admin" role (rotating player picks minigame + participants) still core to the design, or has the game moved to fully-automatic selection?** This is the single largest scope decision in this audit — it affects the FSM, the config schema, and every minigame's participant-selection code.
2. **What is the real hack mechanic?** Targeted-at-a-specific-Crew-player with a 2-per-match budget (as described in this audit's brief), or the currently-implemented untargeted per-round toggle? These require materially different data models (`RoomPrivateState`, event shapes) — pick one before any hack-UI work starts.
3. **RATE_IT or RANK_IT?** If RANK_IT, treat it as new-game development (see §7 migration table), not a rename — this changes effort estimates for "finish the 6 minigames."
4. **Is the 15-minute live match clock still desired, and if so, should Bomb Protocol failure's -3min penalty actually apply?** Currently both are inert; enabling them requires adding a `RoomConfig` field and a real ticking mechanism that doesn't exist today.
5. **Should Bomb Protocol include a Hacker-sabotage mechanic, or is "pure cooperative puzzle" now the intended design?** As built, it's the latter — confirm this is acceptable before investing more Bomb Protocol content work in the current (non-adversarial) shape.

### Can decide later

- Exact hacker-count-per-lobby-size formula tuning (current placeholder is playable, just not final-feeling).
- Whether `evictIdle()` needs to be wired up before handoff (only matters for long-running deployments, not a demo).
- Content-bank size/variety per minigame (structurally ready to expand once the frontend exists to display it).
- Whether `player:corruptionAck`/Firewall-blocked UX feedback is worth building now or post-handoff polish.
- Multi-instance/horizontal-scaling concerns — explicitly out of scope for this stage per `ARCHITECTURE.md` itself.

---

## Final Review Note

Per the audit brief's own standard, this pass was checked against: did it trust tests too much (no — the two most important findings, the reveal-policy bug and the "tests pass but nothing is playable" gap, were found specifically by *not* trusting test/doc claims and re-deriving behavior from the actual view-builder and frontend router code); did it trace the runtime path rather than the intended one (yes — every P0 item cites the specific file/line where behavior either happens or conspicuously doesn't); did it distinguish "implemented" from "usable" (yes — this is the central finding of the whole report: the backend is considerably more complete than the frontend, and the gap between them is exactly what would have blocked a visual designer silently); did it inspect both 4-player and 10-player edges (yes, §8/role-balance table); did it find where every important rule is actually enforced (yes, §13 trust-boundary table, all server-side, no exceptions found).
