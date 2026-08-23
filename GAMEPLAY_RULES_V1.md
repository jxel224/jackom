# Jackom Gameplay Rules — v1 (Authoritative Business-Logic Contract)

Status: **Authoritative — updated through Final Gameplay Closure.** Where this document conflicts with `ARCHITECTURE.md`, `IMPLEMENTATION_PROGRESS.md`, or existing code/tests, this document wins — see `CORE_LOGIC_PHASE1_REPORT.md` for the original Core Logic Phase 1 changes and `FINAL_GAMEPLAY_CLOSURE_REPORT.md` for the retirement of the legacy elimination vote, RANK_IT replacing RATE_IT, the Bomb Protocol sabotage-design verification, the FINAL_RESULTS role-reveal contract, and the rematch fix.

The server is the sole source of truth for every rule below. The TV and player phones are views/controllers only. No rule here is ever enforced client-side only.

---

## 1. Match

- Supported players: **4–10** (`RoomConfig.rules.minPlayers = 4`, `maxPlayers = 10`).
- Main match clock: **15 minutes** (`RoomConfig.rules.matchClockTotalMs = 900_000`), server-authoritative, deadline-based (§6).
- When the clock reaches zero and the Crew has not already won: **Hackers win immediately.**

## 2. Match clock timing

- The clock does **not** run during: `LOBBY`, `ROLE_ASSIGNMENT`, `ROLE_REVEAL`, `GAME_INTRO`.
- The clock **starts** the moment investigation gameplay begins — i.e. the instant `GAME_INTRO` exits into the first `MINIGAME_SELECT` (Admin-selection) phase.
- The clock **runs** during: Admin/minigame selection, participant selection (bundled into the same admin-selection action, §4), the Hacker decision window, normal minigame play, results reveal, discussion, the special-game intro/result housekeeping phases, and the final accusation flow (§12).
- The clock **pauses** for exactly one thing: while the special mid-game challenge (Bomb Protocol) is actively being played (from the moment it begins through its result resolution).
  - Special game **success** → clock resumes with its remaining time unchanged.
  - Special game **failure** → subtract exactly `180_000 ms` (`RoomConfig.specialGame.failPenaltyMs`), then resume. If the subtraction leaves remaining time `<= 0`, the match ends immediately as a Hacker win — the clock does not resume running and does not floor at any non-zero minimum.
- On server restart (Redis surviving), the clock recovers from its persisted deadline — never resets to 15:00.

## 3. Role balance (unchanged from existing implementation — verified, not redesigned)

Formula: `hackerCount = clamp(round(playerCount * 0.25), min=1, max=3, playerCount)`.

| Players | Hackers |
|---|---|
| 4 | 1 |
| 5 | 1 |
| 6 | 2 |
| 7 | 2 |
| 8 | 2 |
| 9 | 2 |
| 10 | 3 |

This already matches the approved 4–5→1 / 6–9→2 / 10→3 mapping exactly — **no formula change was made.** Role assignment remains random, server-side (`Deps.rng`, never `Math.random()` directly), persists through reconnect (never re-rolled), and duplicate roles are structurally impossible (drawn without replacement from the player set).

## 4. Admin system

- Every normal round has exactly one Admin: a player who (in one combined server-validated action) chooses the normal minigame **and** its participants.
- The Admin has no access to hidden roles and cannot decide Hacker behavior.
- **Rotation:** eligible players (alive, minigame-eligible per `eliminatedPlayerPolicy`) are shuffled into a queue at the start of investigation gameplay. Each round pops the next player off the queue as Admin. When the queue empties, it is reshuffled from the current eligible pool — no Admin repeats until every eligible player has had a turn in the current cycle.
- Rotation state (`RoomState.adminId`, `RoomState.adminQueue`) is persisted in Redis with the rest of `RoomState` — it survives reconnect and server restart with no special-cased recovery code.
- **Self-selection:** for v1, the Admin *may* select themselves as a minigame participant. This is isolated behind `RoomConfig.rules.adminMaySelectSelf` (default `true`) so it can be flipped later without touching the FSM.
- **Disconnect:** if the Admin is disconnected but reconnects before the selection phase's timeout, they keep control (their session/identity, not their socket, is what's authoritative). If they fail to act before the timeout, the server automatically falls back to an internal auto-selection rule (§5) — the match is never blocked. A temporary disconnect never removes a player from future Admin rotation.
- Selection timeout: `RoomConfig.timers.adminSelectionTimeoutMs` (default `20_000`).

## 5. Minigame + participant selection

- One event, `player:adminSelectMinigame { minigameId, participantIds }`, submitted only by the current Admin during the (now real, waiting, timed) `MINIGAME_SELECT` phase.
- Server validates, in order: sender is the current Admin → `phaseId` is current → `minigameId` is a real, enabled, *normal* minigame id (never the special game id, never disabled/unknown) → `participantIds` has no duplicates → every id is a real, eligible player → participant count is within that minigame's central limit (§5a) → (Predict Them only) at least one eligible player remains outside the selection to serve as audience.
- On timeout (Admin never acts): the server auto-selects a minigame + a valid participant set via the same registries used before this phase existed (`minigameSelectionRegistry`/random eligible subset), so the round always proceeds.
- **Central participant-limit table** (`apps/server/src/rules/participant-limits.ts` — the *only* place these numbers live; nothing in `transitions.ts` hardcodes a minigame's participant range):

  | Minigame | Min | Max | Note |
  |---|---|---|---|
  | DRAW_IT | 2 | 4 | |
  | COMPLETE_IT | 2 | 5 | |
  | PREDICT_THEM | 2 | 4 | counts the *selected predictors*; the rest of the eligible room becomes the audience automatically |
  | DEFEND_IT | 2 | 4 | |
  | DESCRIBE_IT | 3 | 5 | |
  | RANK_IT | 2 | 5 | |

This is the final, approved set of six normal minigames (`apps/server/src/minigames/registry.ts`) — RATE_IT, the pre-closure placeholder RANK_IT replaced, is no longer registered anywhere and cannot be selected. RANK_IT: every selected participant receives the same four cards; the ranking *instruction* differs only by role (Crew vs. Hacker variant, via the same `assignPromptPair` boundary every other minigame's prompt/instruction already goes through — no Rank-It-specific hack logic exists). Ranking is subjective — there is no "correct" order and no scoring based on correctness. Each participant's starting card order is independently randomized (via `deps.rng`, computed by the FSM caller before `module.start()` — minigame modules have no RNG access of their own) so that a player who times out without submitting is never shown the same default order as everyone else. A timed-out player is recorded honestly as `no_answer` — the architecture has no continuously-synced draft state for any minigame, so RANK_IT never invents a plausible-looking order the player didn't actually choose.

## 6. Match clock architecture (engineering note, not a gameplay rule)

`RoomState.matchClock` is a deadline-based document, not a client-decremented number:

```ts
interface MatchClock {
  status: 'pending' | 'running' | 'paused' | 'stopped';
  clockId: string;          // regenerated every time the clock (re)starts running — staleness guard for expiry callbacks, same role phaseId plays for phase timers
  startedAt: number | null; // first time investigation gameplay began
  deadlineAt: number | null; // authoritative epoch ms while running; null otherwise
  remainingMs: number;      // authoritative "time left" while paused/pending/stopped; the value resume math is based on
  totalPenaltyMs: number;   // cumulative special-game failure penalty, for audit/display
}
```

A second, independent scheduling service (`MatchClockService`) — its own `TimerScheduler` instance, its own per-room map — runs alongside the existing `PhaseTimerService` without either cancelling the other's timers (details in `CORE_LOGIC_PHASE1_REPORT.md` §5). Clients receive the deadline/status, never a ticking "14:59, 14:58…" stream; they animate locally, the server alone decides expiry.

## 7. Hacker system — targeted, budgeted (replaces the old round-wide corruption model entirely)

- Each Hacker has **exactly 2 hacks per match** (`RoomPrivateState.hacksRemaining[playerId]`, private, server-only, reset only on rematch).
- **Window:** after the Admin's selection is accepted (participants locked) and before private prompts/instructions are distributed — the existing `HACKER_CORRUPTION` phase, repurposed (see naming note below).
- **Target rule:** a Hacker may target only a player who is a participant in the upcoming round — Crew, another Hacker, or themself if they're participating. Targeting flips *only that player's* prompt assignment for the round (Crew target → gets the Hacker-variant prompt; Hacker target → gets the Crew-variant prompt). Nobody else's prompt is affected.
- **One accepted action per Hacker per round:** a Hacker may attempt multiple targets in the same window, but the moment one is *accepted*, further attempts that round are rejected (`ALREADY_HACKED_THIS_ROUND`) — rejected attempts never count against this limit or consume a charge.
- **Multiple Hackers, same round:** any number of Hackers may each hack a different target in the same round, independently.
- **Target collision:** first accepted hack on a given target locks it for the round; a second Hacker (or the same one) attempting the same target is rejected (`TARGET_ALREADY_HACKED`) and consumes nothing. `RoomActor`'s existing per-room serialized queue is what makes "first accepted" deterministic — no new locking primitive was added.
- **Firewall:** unchanged in spirit from the existing implementation (this was already one of the audit's strongest-rated pieces) — success in Bomb Protocol sets `firewallActive = true`; the very next `HACKER_CORRUPTION` phase is bypassed server-side before any client action can be accepted, and is also rejected defensively (`FIREWALL_ACTIVE`) if somehow reached; no charge is ever consumed while protected; consumption happens exactly once, on the one round it protects; it is not touched by voting, discussion, Admin selection, reconnect, or a cancelled/invalid selection — only by (a) being consumed by the next round's hack window, or (b) a match reset/rematch clearing it.

### Naming note (deliberate, documented, not an oversight)

The `GameState` value `HACKER_CORRUPTION` and the config field `corruptionWindowMs` keep their existing names even though the mechanic they represent has changed completely (round-wide boolean → targeted budgeted hacks). Renaming them would touch the state enum, every Zod schema, ~15 test files, and the (placeholder) frontend phase-label routers for zero functional benefit — a pure mechanical rename with real regression risk and no behavior change. This is recorded here as an intentional "smallest clean change" trade-off, not a gap.

**Extended in Core Logic Phase 1.1:** the same reasoning applies to `MatchRulesConfig.corruptionRevealPolicy` (type `CorruptionRevealPolicy`) and `RoundRecord`/`CurrentRoundState.hackedPlayerIdsRevealed`. Since Phase 1.1 §7 (hack targets are now completely secret — see §11 below), these no longer gate anything client-visible; they persist purely as an internal timing marker (when the server internally considers a round's hack outcome "settled," for future debugging/analytics/match-history use), never read by any view builder. `RoundRecord.hackedPlayerIds` itself is retained for the same internal-only reason. All three were deliberately kept rather than deleted, per the same "smallest clean change" logic — the alternative (deleting genuinely useful internal state) is a strictly worse trade for a config-field rename with no client-visible effect.

## 8. Special game (Bomb Protocol) — sabotage design verified and closed (Final Gameplay Closure)

- Participant scaling: lobby 4–5→3, 6–7→4, 8–10→5 (`bomb-protocol-scaling` rule, unchanged, verified via real 5p/7p/8p/10p browser and unit coverage). A random subset of the eligible pool is chosen — nothing guarantees a Hacker is included, by design.
- One player is randomly assigned Operator (acts on the board — presses symbols, cuts wires, submits the code); the rest are Analysts (each privately holds a true fragment of the solution for the current module and must relay it verbally). Assignment is uniformly random regardless of role — a Hacker is exactly as likely to land Operator or Analyst as anyone else.
- **Sabotage is emergent through the same cooperative structure every player uses — there is no Hacker-only action, button, or field anywhere in Bomb Protocol.** Verified directly: `validateAction`/`handleAction` check only "are you the assigned Operator," never role; a Hacker-Analyst receives byte-identical `buildPlayerView` output to a Crew-Analyst holding the same clue slot (`bomb-protocol.test.ts`, final-closure test). A Hacker who lands Analyst can only mislead the group by relaying something other than the true clue they were truthfully given — the server never models or reveals a "lie," it only ever hands out true information. A Hacker who lands Operator can only sabotage by choosing a wrong (but otherwise completely ordinary) symbol/wire/code entry — indistinguishable, server-side and TV-side, from an honest teammate's mistake. This was verified to already hold with **zero code changes required** — the existing action/view model made a separate "sabotage power" both unnecessary and impossible to add without breaking the "TV never reveals who's lying" guarantee.
- **Success** → activates the Firewall (§7). Verified live: the very next `HACKER_CORRUPTION` window is bypassed entirely (never rendered to any client) — the round goes straight from Admin selection to `MINIGAME_INSTRUCTIONS`.
- **Failure** → subtracts exactly `180_000 ms` from the match clock, then resumes gameplay unless that leaves the clock at or below zero, in which case the match ends immediately as a Hacker win (§1/§2).
- **TV** shows: selected Operator/Analyst names, current module ("الرموز"/"الأسلاك"/"الرمز السري"), strikes (0–3), per-module progress, and the public board state (visible symbols, wire colors/positions, code slot count) — **never** the solution, any Analyst's private clue text, or any player's role. **A Hacker's identity is never inferable from anything Bomb Protocol sends** — same guarantee as every other minigame.

## 9. Redis / process stability

- The production `Redis` client now has a long-lived `'error'` listener — a connection-level error is logged and swallowed, never left to reach Node's default "throw on unlistened `'error'` event" behavior that previously crashed the whole process on any Redis blip.
- Command-level failures are unchanged: still surfaced as typed `RepositoryError`s, still never silently treated as success.
- `RoomActorManager.evictIdle()` (existed, unused) is now wired into the production runtime on a configurable interval, `unref()`'d so it never blocks process shutdown. Evicting an idle in-memory actor never deletes its Redis-persisted state — touching the room again later rehydrates it exactly as before.

## 10. Single-server architecture (unchanged constraint, restated)

This codebase still assumes exactly one Node process owns every room actor for its lifetime. **Do not run multiple Jackom server processes against the same Redis without sticky ownership / distributed coordination** — none exists yet, and none was added in this phase. Horizontal scaling is an explicitly separate, later concern.

## 11. Private view contracts

- **TV** may know: current Admin id/name, current phase, selected minigame, selected participant ids, Firewall status, match clock state (status/deadline/remaining), public round/vote progress. **TV must never receive:** hidden roles, any Hacker's `hacksRemaining`, who submitted a hack, or which player was targeted, at any point — before, during, or after the round, including once `RESULTS_REVEAL`/`DISCUSSION` makes the round's *outcome* (success/failure) public. Corrected in Core Logic Phase 1.1: hack targets are **completely secret in v1**, not merely reveal-policy-gated as an earlier draft of this document stated — `LastRoundResultSummary` carries only `{minigameId, success}`, with no field capable of holding a hack target, enforced by the type system rather than by view-builder discipline.
- **A Hacker's own private view** may include: `hacksRemaining`, whether a hack action is currently available (i.e. the room is in the hack window, they haven't already acted this round, and Firewall isn't active), the eligible target id list for the current window, and their own last hack attempt's accepted/rejected outcome (delivered via the normal `error:actionRejected` response to their own submission — no separate ack message type was introduced, since one already exists and covers this exactly). A Hacker may know their own accepted target, but never another Hacker's.
- **Crew players never receive Hacker-only state**, including if they themselves were the target of a hack — a hacked Crew player sees only their (altered) prompt content, never a signal that they were hacked.
- **The Admin's own private view** may include: `isAdmin`, the list of currently available (enabled, normal) minigame ids, the participant min/max for each, and the eligible-player pool.
- **Accusation voting (Core Logic Phase 2A)**: TV and every PlayerView may know the accusation's public shape (`initiatorId`, `requiredSuspectCount`, the locked `suspectIds` once voting begins, and aggregate `votedCount`/`totalEligible`). **Nobody** — TV, Crew, or a Hacker — ever receives another player's individual APPROVE/REJECT choice; a player's own view exposes only their own `hasVoted` status. The initiator's role is never exposed by pushing the button — Crew and Hackers are both allowed to initiate, indistinguishably from the server's payloads.
- **Role reveal is impossible before the match ends, and public (TV + every player) the instant it does.** `finalReveal` (`FinalRoleReveal[]`, every player's real role) is gated purely on `room.winner !== null` — never on `phase.state === 'FINAL_RESULTS'` alone — so it also stays visible through `REMATCH_LOBBY`, and reverts to `null` again the instant a real rematch resets `winner` back to `null`. Verified directly (`views.test.ts` #26, Final Gameplay Closure): `finalReveal` is `null` for both TV and every player at every checkpoint before the match ends, even when the view builder is handed real `priv` access; once resolved, both TV and every individual player receive the *complete* roster's roles (not merely their own); after a rematch resets the match, it is `null` again. Confirmed visually via real-browser evidence (`final-gameplay-evidence/final-results-*.png`) across the 4p/6p/10p scenarios.

## 12. Final accusation system ("Push the Button") — Core Logic Phase 2A

The Crew's formal, match-ending bet: nominate the complete Hacker set and put it to a vote. High-stakes and final by design — an approved-but-wrong accusation ends the match as a Hacker win outright, with no second attempt.

- **Public Hacker count**: `RoomState.hackerCount` is set once at role assignment (never at accusation time) and is public from that moment on — the identities remain private, only the count is exposed, via `TvView.hackerCount`/`PlayerView.hackerCount`.
- **Who may push the button**: any eligible player (per the same `getEligibleVoters` population the old elimination vote already used) — Crew and Hackers alike, indistinguishably. The initiator may nominate themselves.
- **When**: only from `DISCUSSION` or `MINIGAME_SELECT` — never during the hack window, a minigame, the special game, an already-active accusation, or after the match has ended. This policy is centralized in one constant (`apps/server/src/rules/accusation.ts`'s `ACCUSATION_ALLOWED_STATES`), imported by both the FSM handler and the player-view builder's advisory `canPushButton` flag, rather than duplicated per state handler.
- **Cooldown**: a rejected accusation starts a configurable cooldown (`MatchRulesConfig.accusationCooldownMs`, default 20s) during which `player:pushButton` is rejected `ACCUSATION_ON_COOLDOWN`. A cancelled-by-timeout accusation (the initiator never locked in a suspect set) does **not** trigger a cooldown — the team already lost only the match time that naturally elapsed, no additional penalty.
- **States**: two `GameState` values, `ACCUSATION_SELECT` and `ACCUSATION_VOTE` — deliberately not reused from the old, now-retired per-cycle elimination vote's `VOTING`/`ELIMINATION_RESULT` states, which were a completely different, older mechanic before their removal (see "The old per-cycle elimination vote is retired" below).
- **Suspect selection**: only the initiator may submit, and only during `ACCUSATION_SELECT`. Must be exactly `hackerCount` ids, no duplicates, each an eligible player. A selection-timeout (`accusationSelectionTimeoutMs`, default 20s) cancels the accusation outright and returns to gameplay — see the Admin-interaction bullet below for exactly where "return" lands.
- **Voting**: on lock-in, `eligibleVoterIds` is snapshotted from `getEligibleVoters(room)` and frozen for the whole vote — never recalculated from live connection state, so a player can't manipulate the majority threshold by disconnecting, and a disconnected voter's already-cast vote (or lack of one) is unaffected by reconnecting. One vote per player (`currentPhaseSubmissions`-backed dedup, the same mechanism role-reveal acks and rematch requests already use); a duplicate/replayed vote is rejected `DUPLICATE_ACTION` and never double-counts. **Strict majority**: approved only if `APPROVE votes > totalEligible / 2`; a tie always rejects. A vote-timeout (`accusationVotingTimeoutMs`, default 20s) resolves with whatever was cast — uncast votes count as neither approve nor reject, i.e. effectively non-approval.
- **Resolution — approved**: compared against the real Hacker set **only server-side**, never sent to any client for resolution. Exactly right (same ids, same count) → Crew wins immediately. Anything else — a missing Hacker, an extra Crew player, or a Crew player substituted for a real Hacker even at the correct count — → Hackers win immediately. Both outcomes stop the match clock and transition straight to `FINAL_RESULTS`.
- **Resolution — rejected**: nobody is eliminated, no roles are revealed, the match continues, the cooldown above starts, and play returns to normal investigation gameplay (see Admin interaction).
- **Match clock**: never paused for an accusation, at any point — it is the one part of gameplay explicitly designed to keep draining match time while the team deliberates. If the match clock's deadline is reached while `ACCUSATION_SELECT` or `ACCUSATION_VOTE` is active, the existing cross-cutting `matchClock:expired` handler (unchanged in shape) ends the match as a Hacker win and abandons the in-flight accusation (`currentAccusation` is nulled there too, alongside `currentRound`/`currentSpecialRound`); any accusation message that arrives after that is rejected the same way any other post-match message already is (`STALE_PHASE`/`INVALID_EVENT_FOR_STATE`).
- **Admin interaction — where a rejected/cancelled accusation returns to**: always `MINIGAME_SELECT`, but exactly how depends on where it interrupted:
  - Pushed from `MINIGAME_SELECT` → the SAME Admin turn resumes exactly where it left off: no Admin reassignment, no queue reshuffle, no auto-selected minigame. Implemented by a new `setPhase()` helper (the raw phase-mutation half of what `transition()` already did) called directly instead of `transition()`, which would otherwise re-run `assignNextAdmin()` via `autoAdvance()`.
  - Pushed from `DISCUSSION` → the round was already fully resolved before the accusation began, so play proceeds normally into the *next* round's `MINIGAME_SELECT`, fresh Admin rotation included — exactly as if `DISCUSSION`'s own timer/host-advance had fired directly, just delayed by the accusation detour.
- **Firewall**: completely unaffected by the accusation system in either direction — never consumed, disabled, or activated by it. A Firewall earned before a rejected accusation survives untouched.
- **Reconnect/rehydration**: initiator ownership never transfers on disconnect — if they don't return before the selection timeout, the accusation is simply cancelled, same as never submitting. A voter's cast vote is unaffected by a later disconnect/reconnect (still can't vote twice); a voter who hadn't voted yet can still vote after reconnecting, since eligibility was snapshotted by id, not by live connection state. `currentAccusation`/`accusationCooldownUntil` are ordinary `RoomState` fields, persisted and rehydrated through the same actor/repository path as everything else — no new persistence system was introduced.
- **The old per-cycle elimination vote is retired (Final Gameplay Closure, locked product decision)**: `FINAL_DISCUSSION`/`VOTING`/`ELIMINATION_RESULT` are no longer valid `GameState` values (removed from the enum, not merely unreachable), and `currentVote`/`voteHistory`/`TieBreakRule`/`maxCycles` no longer exist on `RoomState`/`RoomConfig` at all. Push the Button (this section) is now the **sole** way a match resolves before the clock runs out — there is no automatic periodic elimination vote of any kind. `MatchRulesConfig.roundsPerCycle` now serves exactly one purpose: gating when the special game (Bomb Protocol) becomes eligible to trigger (§8) — it no longer gates a voting cadence, because there is no voting cadence. `apps/server/test/legacy-voting-retired.test.ts` proves this holds under real play: normal rounds loop back to `MINIGAME_SELECT` indefinitely regardless of `roundsPerCycle`, `ELIMINATION_RESULT`/`VOTING`/`FINAL_DISCUSSION` are unreachable at the type level (`@ts-expect-error` on any attempt to construct one), the special game still triggers on its own independent schedule, and the match clock and Firewall are both provably unaffected by the removal.

## 13. Rematch (bug found and fixed by Final Gameplay Closure's real-browser validation)

- `host:advance` from `FINAL_RESULTS` (TV's "متابعة" button, the only real control there) moves the room to `REMATCH_LOBBY`, where every player's real role becomes public (§11) and stays that way through this phase.
- `host:startGame` from `REMATCH_LOBBY` (the TV lobby's "ابدأ جولة جديدة" button — visually and functionally the same control as `LOBBY`'s "ابدأ اللعبة", same event) now resets match-scoped state (`cycle`/`roundInCycle`/`firewallActive`/`specialGameUsed`/`winner`/history/roles all cleared) **and starts the new match immediately**, in the one click a host actually takes — `ROLE_ASSIGNMENT` → `ROLE_REVEAL` for a genuinely fresh match, same player-count validation `LOBBY`'s own `host:startGame` already applies.
- **This was a real bug until Final Gameplay Closure's real-browser Playwright pass caught it**: `handleRematchLobby` previously transitioned `host:startGame` to plain `LOBBY` instead of `ROLE_ASSIGNMENT` — functionally correct (nothing crashed, nothing leaked) but silently required a *second*, identically-labeled "ابدأ اللعبة" click before anything actually started, since the button's own label flips back the moment `phase.state` becomes `LOBBY`. No unit test had ever caught this because none drove a real rematch through the actual `host:startGame` event — only through `host:restartMatch`, a separate, broader "reset to LOBBY from almost any state" shortcut that was never meant to model the player-facing rematch button. Fixed in `apps/server/src/fsm/transitions.ts`; covered by `room-lifecycle.test.ts` #24 (drives the exact real event sequence: `host:advance` → `host:startGame`, asserts `ROLE_REVEAL` reached in one step) and confirmed live in the 6-player golden-match browser scenario.
