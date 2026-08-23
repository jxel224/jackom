# Core Logic Phase 1 — Implementation Report

Scope: bring the server/business-logic layer in line with `GAMEPLAY_RULES_V1.md`. No frontend design work was done; only the shared/wire type contracts needed to keep the frontend compiling (see §8). `/quiz` was not touched.

---

## 1. What was changed

- **Admin system** — a real, server-owned mechanic. A shuffled per-cycle rotation queue assigns one Admin per round; the Admin submits one combined `player:adminSelectMinigame` action (minigame + participants), fully server-validated; a timeout fallback auto-selects on the Admin's behalf so the match never stalls.
- **Targeted, budgeted Hacker system** — replaces the old round-wide `player:submitCorruptionChoice` boolean entirely. Each Hacker gets `hacksRemaining: 2`, spent one at a time against a specific participant in the upcoming round; only that player's prompt flips.
- **Real match clock** — deadline-based, starts when investigation gameplay begins (GAME_INTRO exit), pauses for the special game, applies the exact 180s failure penalty, ends the match immediately (Hacker win) at zero, and recovers correctly across a restart via a second, fully independent scheduler (`MatchClockService`).
- **Redis reliability fix** — the production runtime client now has a long-lived `'error'` listener (`attachRedisErrorHandler`), eliminating the crash-on-any-connection-blip failure mode the audit found.
- **Idle actor eviction wired up** — `RoomActorManager.evictIdle()` (existed, unused) now runs on a configurable interval in production.
- **`RoomActorManager.setLifecycleHooks`** changed from a single replaced slot to an accumulating list, so `PhaseTimerService` and the new `MatchClockService` can both register independently without one clobbering the other.
- **Central participant-limit table** (`rules/participant-limits.ts`) replaces the per-game magic-number `randomSubset` narrowing that used to live inline in `transitions.ts`.
- **`minPlayers`/`maxPlayers` defaults** corrected to 4/10 (previously 5/12 — confirmed a real drift from spec, not merely a placeholder).
- **Role-balance formula: verified, not changed.** `round(playerCount × 0.25)` clamped `[1,3]` already produces exactly the approved 4–5→1 / 6–9→2 / 10→3 mapping — see the table in §7 of `GAMEPLAY_RULES_V1.md`. No code change was made here, per the instruction to report rather than silently alter it.

## 2. Old behaviour removed

- `player:submitCorruptionChoice`, `RoomPrivateState.currentCorruptionChoices`, `CurrentRoundState.corrupted`/`corruptionRevealed`, `RoundRecord.corrupted`/`corruptionRevealed`, `LastRoundResultSummary.corrupted`, `corruptionAggregationRegistry`, `RoomConfig.corruption`, and the dead, never-sent `CorruptionAckMessage` type are all gone — replaced by `player:submitHack`, `RoomPrivateState.hacksRemaining`, `CurrentRoundState.hackedPlayerIds`/`hackerActionsUsed`/`hackedPlayerIdsRevealed`, `RoundRecord.hackedPlayerIds`/`hackedPlayerIdsRevealed`, `LastRoundResultSummary.hackedPlayerIds`. A rejected/accepted hack is communicated via the gateway's existing generic `error:actionRejected` response — no new ack message type was needed.
- `MINIGAME_SELECT`'s old instant/auto-advance behavior (`performMinigameSelect` picking a random minigame with the full eligible pool as participants, zero Admin involvement) is gone, replaced by the Admin-driven flow in §3.
- The old `MatchClock` shape (`mode: 'disabled'|'countdown'`, `durationMs`, `penaltyMs`, `pausedAt`) is gone, replaced by the deadline-based shape in §5. `MatchClockMode` was removed from `enums.ts`.
- The per-minigame inline participant-count narrowing in `proceedToInstructions` (DRAW_IT/DESCRIBE_IT/DEFEND_IT's `Math.max(min, Math.min(max, ...))` re-sampling) is gone — the Admin's validated selection is used directly.

## 3. FSM changes

**States: unchanged (still 20).** `MINIGAME_SELECT` and `HACKER_CORRUPTION` keep their names — see the naming note in `GAMEPLAY_RULES_V1.md` §7 for why renaming them was deliberately avoided (zero functional benefit, real regression risk across ~15 test files and every schema).

**Events:**
| Old | New |
|---|---|
| `player:submitCorruptionChoice { corrupt: boolean }` | `player:submitHack { targetPlayerId: string }` |
| *(none)* | `player:adminSelectMinigame { minigameId, participantIds }` |
| *(none)* | `matchClock:expired { clockId }` (system-only, like `timer:expired`) |

**`MINIGAME_SELECT` handler — before vs after:**
- *Before:* `autoAdvance()` called `performMinigameSelect()` synchronously (random minigame + full eligible pool as participants) and immediately transitioned to `HACKER_CORRUPTION` — the phase was never externally observable, `durationFor()` returned `null`.
- *After:* `autoAdvance()` only calls `assignNextAdmin()` (queue rotation) and returns — the phase now genuinely waits. `durationFor()` returns `t.adminSelectionTimeoutMs`. `handleMinigameSelect()` accepts `player:adminSelectMinigame` (full server validation, see §6) or `timer:expired` (calls `autoSelectMinigameAndParticipants()`, the timeout fallback).

**`HACKER_CORRUPTION` handler — before vs after:**
- *Before:* `player:submitCorruptionChoice` recorded a boolean per hacker into `RoomPrivateState.currentCorruptionChoices`; once every hacker had submitted (or on timeout), `corruptionAggregationRegistry['placeholder-any-corrupts']` OR'd them into one round-wide `currentRound.corrupted` boolean.
- *After:* `player:submitHack` validates and, if accepted, pushes the target onto `currentRound.hackedPlayerIds` and marks that hacker's one action used — no aggregation step exists. The phase never auto-advances early (no way to know "everyone's done" since a non-action is a legitimate pass); it only advances on `timer:expired`.

**New cross-cutting event handling** (alongside the existing `player:disconnected`/`host:closeRoom`/`host:restartMatch` bypass block in `handleEvent`): `matchClock:expired` is checked before the phase-state switch, since it can legitimately fire during many different phases. Guarded by `matchClock.status === 'running' && matchClock.clockId === event.clockId && winner === null` — anything else is `STALE_MATCH_CLOCK`, a harmless no-op.

**`handleEliminationResult`** now also calls `stopMatchClock()` whenever it sets a winner (either by win-condition or `maxCycles` fallback), so the clock never keeps ticking (or gets recovered as "running") past a match that already ended by elimination.

## 4. State model changes

**`RoomState`** gained `adminId: string | null`, `adminQueue: string[]`.
**`RoomPrivateState.currentCorruptionChoices`** → **`hacksRemaining: Record<string, number>`**.
**`CurrentRoundState`** gained `adminId`, `adminSelectedParticipantIds`, `hackedPlayerIds`, `hackerActionsUsed`; `corrupted`/`corruptionRevealed` → `hackedPlayerIds`/`hackedPlayerIdsRevealed`.
**`RoundRecord`** gained `adminId`; `corrupted`/`corruptionRevealed` → `hackedPlayerIds`/`hackedPlayerIdsRevealed`.
**`MatchClock`** fully redesigned — see §5.
**`TvView`** gained `adminId: string | null`.
**`PlayerView`** gained `isAdmin: boolean`, `adminSelection: AdminSelectionInfo | null`, `hackerInfo: HackerPlayerInfo | null`, `matchClock: MatchClock`.
**`RoomConfig.rules`** gained `matchClockTotalMs`, `adminMaySelectSelf`; `RoomConfig.timers` gained `adminSelectionTimeoutMs`; **`RoomConfig.corruption` removed**.

All of the above are reflected in `persistence/schemas.ts` (Zod) — every field added to a TypeScript type has a corresponding schema field; nothing is validated more loosely than the type promises.

## 5. Timer architecture — how the phase timer and match clock coexist

This needed a real design decision, not just a field rename, because `TimerScheduler` only ever tracks **one deadline per room** — scheduling a second one for the same room replaces the first. Reusing `PhaseTimerService`'s scheduler for the match clock would mean a phase transition's timer and the match deadline fight over the same slot, which `GAMEPLAY_RULES_V1.md` §6 explicitly rules out.

**The fix: two fully independent services, each with its own `TimerScheduler` instance.** `RealTimerScheduler`/`FakeTimerScheduler` each own a private `Map<roomId, Entry>` — two separate instances never see each other's entries. `MatchClockService` (new file, `timers/match-clock-service.ts`) is structurally a sibling of `PhaseTimerService`, not a variant of it: same `syncFromRoom`/`recoverRoom`/`handleExpiry`/callback-boundary shape, but keyed on `room.matchClock.status`/`deadlineAt`/`clockId` instead of `room.phase`.

Both services call `RoomActorManager.setLifecycleHooks()` in their own constructors. This is why `RoomActorManager.hooks` (a single object, silently replaceable) was changed to `hooksList` (an accumulating array) — with the old design, whichever service constructed second would have silently disabled the first's `onMutated`/`onActorCreated`/`onActorEvicted` wiring. `apps/server/test/timers/match-clock-service.test.ts` has a dedicated test proving a phase-timer firing never touches the match-clock scheduler's entry for the same room, and vice versa.

`bootstrap.ts` constructs both services with separate `RealTimerScheduler` instances (each via its own `createScheduler` factory closure) and wires both into `GatewayServer` (`timerService` and `matchClockService`), which calls `setOnRoomMutated` on each independently — both funnel into the exact same `broadcastRoom()` path, so a match-clock-driven mutation broadcasts identically to a phase-timer-driven one.

## 6. Hack resolution truth table

| Scenario | Result | Charge consumed? |
|---|---|---|
| Valid Crew target, Hacker has charges, hasn't acted this round | Accepted — target's prompt flips to the Hacker variant | Yes (1) |
| Valid Hacker target (another Hacker), same conditions | Accepted — that Hacker's prompt flips to the Crew variant | Yes (1) |
| Hacker targets themself while participating | Accepted (v1 allows it, same as Crew-target case) | Yes (1) |
| Non-Hacker sender | Rejected `NOT_HACKER` | No |
| `hacksRemaining === 0` | Rejected `NO_HACKS_REMAINING` | No |
| Hacker already has an accepted hack this round, tries again (any target) | Rejected `ALREADY_HACKED_THIS_ROUND` | No |
| Target not in the round's `participantIds` | Rejected `INVALID_TARGET` | No |
| Target already locked by an earlier accepted hack this round (same or different Hacker) | Rejected `TARGET_ALREADY_HACKED` | No |
| Firewall active | Rejected `FIREWALL_ACTIVE` (also structurally unreachable in the real flow — `autoAdvance()` bypasses the phase entirely before any client event can land) | No |
| Stale `phaseId` | Rejected `STALE_PHASE` (generic guard, same as every other event) | No |
| Exact duplicate/replayed accepted hack | Second attempt hits `ALREADY_HACKED_THIS_ROUND` | No (idempotent by construction — no separate actionId/dedup mechanism was needed) |
| Two Hackers, two different targets, same round | Both accepted independently | Yes, each (1 + 1) |
| `matchClock:expired`/timeout mid-window | No hack recorded for anyone who didn't act — round proceeds with `hackedPlayerIds` reflecting only accepted hacks | N/A |

`RoomActor`'s existing per-room serialized queue (unchanged) is what makes "first accepted hack wins the target" deterministic — no new locking primitive was added, per the instruction not to.

## 7. Tests added/changed

- **New files:** `admin-selection.test.ts` (18 tests), `hack-window.test.ts` (18 tests, replaces `corruption.test.ts`), `match-clock.test.ts` (11 tests), `timers/match-clock-service.test.ts` (5 tests) — 52 new tests across 4 new files.
- **Deleted:** `corruption.test.ts` (asserted the now-rejected round-wide corruption model; fully superseded by `hack-window.test.ts`, not preserved).
- **Modified for the migration:** `special-game.test.ts`, `bomb-protocol.test.ts`, `minigame-select.test.ts`, `minigame-play.test.ts`, `views.test.ts`, `dev/bootstrap.test.ts` (+2 Redis-error-handler tests), `timers/phase-timer-service.test.ts`, `helpers/room.ts` (+`adminSelectMinigame`/`submitHack` helpers, fixed `driveToFirstCorruptionPhase`), `helpers/timers.ts` (+`MatchClockService` wiring), `http/room-availability.test.ts` (4/10 default), `gateway/dispatch.test.ts` + `actors/room-actor.test.ts` (comment accuracy only), plus the 6 minigame test files (`rate-it`/`complete-it`/`predict-them`/`draw-it`/`describe-it`/`defend-it`.test.ts — mechanical `corrupted: boolean` → `hackedPlayerIds: Set` param updates, and the extra `MINIGAME_SELECT` step every FSM-driving test needed).
- **Web:** `wire-schemas.ts` (new fields added as `z.unknown()`, matching the file's existing "field must exist, value not yet rendered" convention) and 4 test fixture files updated to include the new required `TvView`/`PlayerView` fields — no behavior/rendering code was added.
- **Exact counts:** baseline (Step 0 of this phase) was 73 test files / 607 tests passing + 1 skipped. Final: **77 test files (76 passed + 1 skipped) / 657 tests (656 passed + 1 skipped)**.

## 8. Remaining known gaps

Not hidden, listed explicitly:

- **`RANK_IT` is still `RATE_IT`**, exactly as instructed — not touched this phase.
- **Bomb Protocol still has no Hacker-sabotage mechanic** and role is still never consulted inside it — unchanged, per the explicit "do not redesign the special game" instruction. It correctly participates in the new match-clock pause/resume and Firewall flow, but its internal gameplay is untouched.
- **`DESCRIBE_IT`/`DEFEND_IT` still bypass `corruptionRevealPolicy`** in their own `publicReveal()` (unconditionally show both prompt variants at `RESULTS_REVEAL` regardless of policy) — this pre-existing bug (found in the earlier audit) was deliberately left alone this phase to keep the migration's blast radius to exactly what §7/§11 of `GAMEPLAY_RULES_V1.md` required; it is orthogonal to the hack-targeting redesign itself.
- **No frontend controls exist** for any of: Admin selection, hack targeting, voting, or 5 of the 6 minigames — unchanged from before this phase, and explicitly out of scope here.
- **Admin eligibility uses the same pool as minigame-participant eligibility** (`getEligibleMinigamePlayers`) rather than a dedicated "Admin eligibility" concept — reasonable for v1, but worth a deliberate look if Admin eligibility should ever diverge (e.g. an eliminated player who can still be selected for minigames per config, but arguably shouldn't run the show).
- **`player:corruptionAck`-style explicit hack feedback was intentionally not reintroduced** — the gateway's existing `error:actionRejected` response already covers "was my hack accepted or rejected," so no new message type exists; a Hacker inferring "I have 1 charge left" happens via their own next `PlayerView.hackerInfo`, not a dedicated push.
- **Horizontal scaling remains explicitly unaddressed** (§10 of `GAMEPLAY_RULES_V1.md`) — no distributed lock was added for either timer service; both assume the same single-process ownership model the rest of the codebase already assumes.
- **`evictIdle()`'s interval/threshold are new, untuned defaults** (5 min sweep / 30 min idle) — reasonable placeholders, not a considered production value.

## 9. Next recommended phase (not implemented here)

Per the instruction to stop after this core phase: the natural next unit of work is real frontend controls for Admin selection and the hack window (the two mechanics that just became real server-side but still have zero UI), followed by voting UI, followed by the RANK_IT migration. Not started.
