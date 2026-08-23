# JACKOM — Final Gameplay Closure Report

Scope: this report covers **only** the Hacker game's final functional gameplay closure — retiring
legacy elimination voting, replacing RATE_IT with RANK_IT, verifying and closing Bomb Protocol's
sabotage design, confirming the FINAL_RESULTS role reveal, and real-browser (Playwright) validation
at 4/6/10 players plus reconnect and timeout passes. PostgreSQL, Prisma, user accounts,
authentication, payments, ownership, final pixel-art/animation polish, marketing pages, and `/quiz`
were explicitly out of scope and were not touched.

---

## 1. Final Verdict

**HACKER GAME — GAMEPLAY & FUNCTIONAL IMPLEMENTATION CLOSED.**

Every item in the Definition of Done holds:

| Requirement | Status |
|---|---|
| Legacy voting unreachable (type-level, not just unused) | ✅ |
| Push the Button is the sole final accusation path | ✅ |
| Six normal games exactly the approved six | ✅ |
| RANK_IT fully replaces RATE_IT, playable phone+TV, targeted hacks work | ✅ |
| Bomb Protocol playable 3/4/5, meaningful social sabotage, no fake button | ✅ |
| Bomb success → Firewall, failure → exactly −3:00 | ✅ |
| Final Results reveal roles publicly, impossible before | ✅ |
| 4p/6p/10p real browser scenarios pass | ✅ |
| Reconnect works with real controls | ✅ |
| No active placeholder | ✅ |
| Tests/typecheck/build pass | ✅ (777/777 tests, zero typecheck errors, production build succeeds) |

Two real, previously-undetected bugs were found by this phase's real-browser validation and fixed
(never worked around or skipped) — see §6 and §10.

---

## 2. Final Game Registry

Single source of truth: `apps/server/src/minigames/registry.ts`, `minigameRegistry`.

**Six normal minigames** (exactly): `RANK_IT`, `COMPLETE_IT`, `PREDICT_THEM`, `DRAW_IT`,
`DESCRIBE_IT`, `DEFEND_IT`. **One special game**: `BOMB_PROTOCOL` (looked up separately via
`getSpecialGameModule()`, never counted among the six, never selectable by the Admin).

`RATE_IT` is not registered anywhere — no import, no registry entry, no participant-limit entry, no
title-map entry, no frontend router branch, no content file, no test file. Every one of these was
verified individually (registry.ts, participant-limits.ts, view-data.ts's `GAME_TITLES`,
`PlayerMinigameRouter.tsx`/`TvMinigameRouter.tsx`) rather than assumed from a comment.

`Object.keys(minigameRegistry)` and `MINIGAME_PARTICIPANT_LIMITS`/`GAME_TITLES` are all built from
(or asserted against) this one registry — the Admin-selection UI's `availableMinigameIds`, the
selection-timeout fallback, and participant-count validation all trace back to the same source, so
there is no path by which a stray seventh game or a resurrected RATE_IT could appear in only one of
them without the others disagreeing.

---

## 3. Legacy Voting Removal

**Locked product decision, fully executed**: the old periodic elimination-vote flow
(`VOTING`/`ELIMINATION_RESULT`/`FINAL_DISCUSSION`, triggered every `roundsPerCycle` normal rounds)
is not part of the final game. The final social-deduction loop is exactly:

```
MINIGAME_SELECT → HACKER_CORRUPTION → MINIGAME_INSTRUCTIONS → MINIGAME_PLAY
  → RESULTS_REVEAL → DISCUSSION → (next Admin's MINIGAME_SELECT, or the special game)
```

with Push the Button (`ACCUSATION_SELECT`/`ACCUSATION_VOTE`) as the only way to end a match before
the clock runs out.

**What was removed, not just deprecated:**
- `GameState` no longer has `FINAL_DISCUSSION`/`VOTING`/`ELIMINATION_RESULT` as valid values — removed from the enum itself. `apps/server/test/legacy-voting-retired.test.ts` proves this at the type level with `@ts-expect-error` on any attempt to construct one.
- `RoomState.currentVote`/`voteHistory`, `MatchRulesConfig.tieBreakRule`/`maxCycles`, the `TieBreakRule` type, and `PlayerSubmitVoteEvent` are gone entirely — not present on any type, schema, or persisted document.
- `apps/server/src/voting/tally.ts` and `apps/server/src/fsm/win-condition.ts` deleted (the whole `voting/` directory removed).
- `handleFinalDiscussion`/`handleVoting`/`handleEliminationResult` and their switch cases removed from `transitions.ts`; `maybeResolveVoting`/`resolveVoting` deleted.
- Frontend: `VotingPanel.tsx`/`TvVotingPanel.tsx` deleted; their imports/branches removed from `PlayerPhaseRouter.tsx`/`TvPhaseRouter.tsx`.
- `TvView.votingProgress` and `PlayerView.canVote` removed from the view contracts and wire schemas.

**What was deliberately kept** (retain-for-reuse, not legacy-but-inactive): `getEligibleVoters`,
`isEligibleVoter`, and `EliminatedPlayerPolicy` — all still genuinely used by the accusation system,
which reuses the *pattern* (snapshot-then-freeze eligible voters, `currentPhaseSubmissions`-backed
duplicate-vote protection) the old mechanic pioneered, not its code. `host:endVoteEarly` was
initially removed, then restored on discovering `handleAccusationVote` also checks it — it is a
genuinely shared event name between the two (now one) mechanics, not a leftover.

**`roundsPerCycle` re-scoped, not removed**: it now solely gates when the special game becomes
eligible to trigger (`specialGameScheduleRegistry`'s `'placeholder-end-of-cycle-once'` rule,
`!room.specialGameUsed && room.roundInCycle >= roundsPerCycle`). It no longer gates any voting
cadence, because there is no voting cadence.

**Proof under real play** — `legacy-voting-retired.test.ts` (7 tests) plus real-browser confirmation
(every scenario in §7–§9 played multiple normal rounds past what would have been a legacy vote
trigger, with the match always looping back to `MINIGAME_SELECT` or the special game, never a vote):
- After more than `roundsPerCycle` normal rounds, play loops back to `MINIGAME_SELECT` — never diverts into voting.
- Push the Button remains the sole real-time way to end a match early, and works from every state it's allowed from.
- A correct accusation still resolves to `FINAL_RESULTS` with the right winner.
- The special game still triggers correctly, entirely independent of the retired mechanic.
- The match clock and Firewall are both unaffected by the removal.

---

## 4. Rank It

Final six normal games: DRAW_IT (ارسمها), **RANK_IT (رتّبها)**, COMPLETE_IT (كمّلها), PREDICT_THEM
(توقّعهم), DEFEND_IT (دافع عنها), DESCRIBE_IT (صفها).

**Rule**: 2–5 players. Every selected participant receives the *same* four cards
(`apps/server/src/minigames/rank-it-content.ts`'s `RANK_IT_FIXTURE`). Crew and Hacker instruction
variants differ only in the ranking criterion — e.g. "rank from most embarrassing to least"
(Crew) vs. "rank from most funny to least" (Hacker) for the same four Arabic cards. Ranking is
subjective by design: there is no objectively correct order and no scoring based on correctness.

**Server implementation** (`apps/server/src/minigames/rank-it.ts`):
- Registry id `RANK_IT`, participant bounds 2–5 (`participant-limits.ts`).
- Four shared cards, delivered identically to every participant.
- Private instruction variant assigned via `assignPromptPair` (`prompt-assignment.ts`) — the exact same targeted-hack-aware boundary every other minigame's prompt already goes through. No Rank-It-specific hack logic exists; a targeted hack simply flips which variant (`crewVariant`/`hackerVariant`) a participant receives, same as every other game.
- Firewall-compatible for free — Bomb Protocol success bypasses the entire `HACKER_CORRUPTION` phase before any hack (targeted or otherwise) can be submitted, and RANK_IT never has any Firewall-specific code path.
- Server-owned timer (`RANK_IT_DURATION_MS = 45_000`), submission lock (one submission per player, further attempts rejected), stale/duplicate/non-participant protection via the same generic `handleMinigamePlay` seq/actionId guards every minigame shares.
- **Submission validation**: exactly 4 unique real card ids, or rejected — missing count, duplicate ids, and unknown ids are all distinct rejection paths, all tested. Non-participants, duplicate finalized submissions, and stale-phase submissions are all rejected server-side; the frontend's own validation is never trusted as authoritative.
- **Initial card order**: randomized independently per player via `deps.rng` (never `Math.random()`), computed by the FSM caller (`proceedToInstructions` in `transitions.ts`) before `module.start()` runs, since `MiniGameContext` intentionally has no RNG access of its own. Rationale (matches the spec exactly): a player who times out without answering must never be shown the same default order as everyone else, which would otherwise look like a plausible answer they never actually gave.
- **Timeout**: architecture decision, documented in code — this codebase has no continuously-synced draft state for *any* minigame (every module is "final submission only"), so a timed-out player is recorded honestly as `no_answer`, never defaulted to their (unintentional) initial display order. This is consistent with every other minigame, not a RANK_IT-specific compromise.
- **Hack behavior**: a hacked Crew participant receives the Hacker instruction variant; a hacked Hacker participant receives the Crew instruction variant; only the *instruction* changes, never the cards. Verified for both directions, and verified that Firewall blocks the hack (bypasses the whole window) exactly as it does for every other game.

**Frontend** (`apps/web/components/gameplay/hacker/minigames/rank-it/`):
- `PlayerRankIt.tsx`: private instruction shown via the same `PrivatePromptCard` every other minigame uses; four cards, tap-to-reorder (▲/▼ per row — a deliberate, explicitly-sanctioned non-drag fallback, functionally identical on touch and mouse, no pointer-gesture code); timer via the shared `Countdown`; submit locks the UI; submitted/locked and revealed states both render correctly.
- `TvRankIt.tsx`: progress view (submitted count / participant count) while active; reveal view shows every participant's name alongside their submitted order (or "no answer") side by side — never before the server marks the round revealed, never the private instruction, never who was hacked.
- Wired into `PlayerMinigameRouter.tsx`/`TvMinigameRouter.tsx`, `GAME_TITLES`.

**RATE_IT removal**: module, content file, test file, and all three frontend components
(`PlayerRateIt.tsx`/`TvRateIt.tsx`/`RateSlider.tsx`) deleted outright — not deprecated, not kept
behind a flag. Every reference across ~25 test files was swept and either renamed to RANK_IT
(`rate-it-only` → `rank-it-only`, `SUBMIT_RATING`/`{value}` → `SUBMIT_RANKING`/`{order: [...]}`) or
removed where the reference was RATE_IT-specific (deleted registry-order assertions' stale entries,
etc.).

**Test coverage** (`apps/server/test/rank-it.test.ts`, 25 tests; `apps/web/test/extended-minigames-frontend.test.tsx`'s RANK_IT block, 5 tests): participant bounds, shared cards, independently-randomized order, Crew/Hacker instruction assignment, hack swap both directions, Firewall blocking the hack, valid/duplicate/missing/unknown-card submission validation, non-participant/duplicate/stale-phase rejection, timeout-as-no-answer, reconnection projection (state restores byte-identical from JSON), TV reveal privacy, hacker-role secrecy in the reveal, a real FSM round-trip integration test (real Admin selection → real hack window → real submission → real reveal), plus real-browser confirmation (§7–§9: RANK_IT played correctly, with a real hack, in every scenario).

---

## 5. Bomb Protocol

**Not redesigned** — a targeted audit confirmed the existing action/view model already fully
satisfies the social-deduction sabotage requirement, with **zero production code changes needed**.

**Design confirmed emergent, not added:**
- One player is randomly assigned Operator (the only one who can act on the board); the rest are Analysts (each privately holds a true fragment of the current module's solution and must relay it verbally). Assignment is role-blind — a Hacker is exactly as likely to land Operator or Analyst as anyone else, confirmed by inspecting `createBombProtocolConfig`'s `randomChoice`.
- `validateAction`/`handleAction` in `bomb-protocol.ts` check only "are you the currently-assigned Operator" — never role. A new test (`bomb-protocol.test.ts`, "gives a Hacker Operator/Analyst exactly the same actions and information as a Crew one") proves `buildPlayerView`'s output for the *same* Analyst clue slot is byte-identical regardless of the `role` parameter passed in, and that the exact same `PRESS_SYMBOL`/`CUT_WIRE`/`SUBMIT_CODE` actions are available to a Hacker-Operator as a Crew-Operator.
- A Hacker-Analyst can only sabotage by relaying something other than the true clue they were truthfully given — the server has no field or action that models, records, or reveals a "lie." A Hacker-Operator can only sabotage by choosing a wrong (but otherwise completely ordinary) action — indistinguishable, both server-side and on TV, from an honest teammate's mistake.
- **No Hacker-only power exists anywhere in Bomb Protocol** — confirmed by reading every line of `bomb-protocol.ts`'s `validateAction`. Bomb Protocol does not go through the targeted-hack (`HACKER_CORRUPTION`) system at all — `beginSpecialGame` jumps straight from the special-game schedule check to `SPECIAL_GAME_INTRO`, bypassing the hack window entirely.

**Participant scaling** (unchanged, re-verified): lobby 4–5→3, 6–7→4, 8–10→5
(`bomb-protocol-scaling` rule). A random subset of the eligible pool is chosen — nothing guarantees
a Hacker is included, by design (confirmed live at 5p/7p/10p, and via `it.each` unit coverage).

**Success → Firewall, Failure → exactly −3:00** (`handleSpecialGameResult` in `transitions.ts`):
success sets `firewallActive = true` and resumes the match clock unchanged; failure subtracts
exactly `180_000 ms` (`RoomConfig.specialGame.failPenaltyMs`) and, if that leaves the clock at or
below zero, ends the match immediately as a Hacker win. Both paths verified by unit test
(`bomb-protocol.test.ts`) and live in the 6-player golden match (real Analyst-clue-relay solve →
SUCCESS → Firewall activated → **the very next `HACKER_CORRUPTION` window was verified to be
skipped entirely** — the round went straight from Admin selection to `MINIGAME_INSTRUCTIONS`,
proven by racing both phase labels and asserting the hack-window one never won).

**Timer pauses during play**: the main match clock is paused for the whole special-game sequence
(`beginSpecialGame`) and resumed or stopped only once the outcome is known
(`handleSpecialGameResult`) — verified live (`matchClock.status === 'paused'` mid-puzzle,
`'running'` again immediately after, with `totalPenaltyMs` incremented by exactly 180 000 on
failure in the unit test, and via the real browser scenarios' timer behavior).

**Info audit per participant count**: `analystIds.length === participantIds.length - 1` is enforced
by `start()`'s validation — every non-Operator participant gets exactly one clue slot; verified this
holds identically at 3, 4, and 5 participants.

**TV contract** (`TvBombProtocol.tsx`): shows Operator/Analyst names, current module label
(الرموز/الأسلاك/الرمز السري), strike indicator (0–3), per-module progress, and the public board
(visible symbols, wire colors/positions, code slot count) — confirmed via unit test and live
screenshot (`bomb-tv.png`) that it **never** shows the solution, any Analyst's private clue text,
"why wrong," or any player's role.

**Reconnect**: `handleDisconnect` is a no-op (state is untouched by disconnection), so board state,
clue text, strikes, module, and stage all survive a reconnect automatically — verified both by unit
test (JSON round-trip equality) and live (§10: a real page reload for both the Operator and an
Analyst mid-puzzle, both panels reappearing with identical board/clue state).

---

## 6. Full Match FSM

```
LOBBY → ROLE_ASSIGNMENT → ROLE_REVEAL → GAME_INTRO → MINIGAME_SELECT
  → HACKER_CORRUPTION → MINIGAME_INSTRUCTIONS → MINIGAME_PLAY → RESULTS_REVEAL
  → DISCUSSION → (loop to next MINIGAME_SELECT, OR SPECIAL_GAME_INTRO → SPECIAL_GAME_PLAY
     → SPECIAL_GAME_RESULT → MINIGAME_SELECT)
  → [ACCUSATION_SELECT → ACCUSATION_VOTE, reachable from DISCUSSION or MINIGAME_SELECT at any point]
  → FINAL_RESULTS → REMATCH_LOBBY → (host:startGame) → ROLE_ASSIGNMENT [new match]
```

No legacy voting states exist anywhere in this graph. `matchClock:expired` is a cross-cutting
handler independent of this graph — it can end the match as a Hacker win from any running-clock
phase, confirmed unaffected by every change in this phase.

**Bug found and fixed**: `REMATCH_LOBBY`'s `host:startGame` previously transitioned to plain
`LOBBY` instead of `ROLE_ASSIGNMENT` — functionally harmless (nothing crashed or leaked) but
silently required a **second**, identically-labeled click of "ابدأ جولة جديدة"/"ابدأ اللعبة" before
a rematch actually started, since the button's label flips the instant `phase.state` becomes
`LOBBY`. No existing unit test had ever caught this, because none of them drove a rematch through
the real `host:startGame` event — the only existing rematch test used `host:restartMatch`, a
separate, broader "reset to LOBBY from almost any state" shortcut never meant to model the
player-facing rematch button. **Found by this phase's real-browser Playwright pass** (the 6-player
golden match's rematch step timed out waiting for `ROLE_REVEAL`). Fixed in
`apps/server/src/fsm/transitions.ts`'s `handleRematchLobby`; covered by a new test,
`room-lifecycle.test.ts` #24, which drives the exact real event sequence
(`host:advance` → `host:startGame`) and asserts `ROLE_REVEAL` is reached in that one step; reran
live afterward and confirmed the single-click rematch now works end-to-end.

---

## 7. 4-Player Browser Result

**PASSED.** Real Chromium (Playwright), isolated browser context per player + a separate TV
context, real frontend, real WebSocket protocol throughout — no raw WebSocket used for this
scenario (`e2e/scenario-4p.mjs`).

Flow: room created → 4 players joined via the real `/join/[roomCode]` UI → role reveal (1 Hacker,
3 Crew, matching the role-balance formula) → Admin selection UI used to pick RANK_IT with 2
participants → a real targeted hack submitted and accepted → RANK_IT played to completion by real
submissions → results revealed → discussion → Push the Button → suspect selection with the real
Hacker set → group vote → **FINAL_RESULTS reached with a correct Crew win**, roles publicly
revealed on TV for all 4 players.

Evidence: `4p-lobby.png`, `4p-admin-selection.png`, `4p-hacker-target.png`, `rank-it-phone.png`,
`rank-it-tv-active.png`, `rank-it-tv-reveal.png`, `push-button-confirm.png`, `suspect-selection.png`,
`4p-vote.png`, `final-results-4p.png`.

---

## 8. 6-Player Golden Match

**PASSED — the primary, exhaustive scenario.** `e2e/scenario-6p.mjs`. No phase that required a
decision was ever timeout-rescued; every action was a real click/submission.

Step-by-step, all via real UI:
1. 6 players joined; role reveal — 2 Hackers, 4 Crew.
2. Round 1: **RANK_IT** with a real targeted hack submitted and accepted.
3. Round 2: **COMPLETE_IT** with real text submissions from every participant.
4. The special game triggered automatically (server schedule, not client-forced) after round 2 —
   **Bomb Protocol actually performed**: real Operator/Analyst role identification via the live UI,
   each Analyst's true private clue text read and relayed to real Operator clicks (symbols in
   order, the correct wire, the correct 4-digit code) — resolved **SUCCESS**, activating the
   Firewall. **The very next round's hack window was verified bypassed entirely** (raced against
   the instructions phase; the hack-window label never appeared).
5. Round 3: **PREDICT_THEM** — both the audience-vote wave and the selected-predictor wave
   completed by real submissions from all 6 players.
6. Round 4: **DRAW_IT** with a real canvas stroke and submission.
7. **Manual Push the Button** → suspect selection with the real 2-Hacker set → all eligible players
   cast a real APPROVE vote → **FINAL_RESULTS reached with a correct Crew win**.
8. **Rematch**: TV's "متابعة" → `REMATCH_LOBBY` (roles still visibly public) → **one click** of
   "ابدأ جولة جديدة" → a genuinely new match, confirmed by reaching `ROLE_REVEAL` again (this is the
   flow that surfaced and confirmed the fix in §6).

Evidence: `6p-lobby.png`, `admin-selection-rank_it.png`/`complete_it.png`/`predict_them.png`/`draw_it.png`,
`hacker-target-confirm.png`, `rank_it-tv-active.png`/`reveal.png`, `complete_it-tv-active.png`/`reveal.png`,
`bomb-operator.png`, `bomb-analyst.png`, `bomb-tv.png`, `firewall-active-bypass.png`,
`predict_them-tv-active.png`/`reveal.png`, `draw_it-tv-active.png`/`reveal.png`, `push-button-confirm.png`,
`suspect-selection.png`, `6p-vote.png`, `final-results-6p.png`, `6p-rematch-lobby.png`.

---

## 9. 10-Player Browser Result

**PASSED.** `e2e/scenario-10p.mjs`. Abbreviated per spec (the 6-player match already proved the
full end-to-end loop) but every step is still real browser interaction, not raw WebSocket.

- All 10 players joined and are visible in the real TV lobby.
- Role reveal: **exactly 3 Hackers** (role-balance formula's 10-player mapping), confirmed by
  reading each player's own real role-reveal screen.
- Admin-selection UI confirmed usable at 10 players.
- **RANK_IT's 2–5 participant cap enforced by the real UI**: clicking a 6th participant tile
  (admin + 5 others) is silently ignored by the client's own `toggleParticipant` logic — after 6
  clicks, exactly 5 remained selected (`aria-pressed="true"` count checked directly), and the
  confirm button was enabled at exactly 5. RANK_IT played to completion with those 5.
- A second, minimal round triggered the special game — **Bomb Protocol selected exactly 5
  participants** (the 8–10-player scaling rule), confirmed by counting real Operator+Analyst role
  assignments across all 10 player pages, then solved correctly via the same real Analyst-clue-relay
  method as §8.
- **Push the Button required exactly 3 suspects**: the real accusation panel text read
  "اختر 3 من المشتبه بهم (0/3)"; submitting with only 2 of the 3 real Hackers selected left the
  confirm button disabled; selecting the 3rd enabled it; submitted for real.
- **FINAL_RESULTS reached with a correct Crew win.**

Evidence: `10p-lobby.png`, `10p-rank-it-over-cap.png`, `10p-rank-it-at-cap.png`, `10p-gameplay.png`,
`10p-bomb-protocol.png`, `10p-suspect-selection-exact-three.png`, `10p-final-results.png`.

---

## 10. Reconnect

**PASSED.** `e2e/scenario-reconnect.mjs`. A real reconnect — the same browser tab/context reloaded
(`page.reload()`), preserving `sessionStorage` exactly as a real player's browser would after a
lost-and-regained connection, not a fresh join via a new context. Every phase named in the spec was
covered, each verified by confirming the correct real panel reappeared intact after the reload and
that the player could then complete the action normally:

- **Admin selection** — reloaded before picking anything; the selection panel reappeared intact.
- **Hacker target select** — reloaded before confirming a target; the hack was still available and completed normally afterward.
- **RANK_IT** — reloaded mid-round before submitting; cards/prompt/timer state reappeared intact.
- **DRAW_IT** — reloaded mid-round; canvas/round state reappeared intact.
- **Bomb Protocol Operator** — reloaded mid-puzzle; board/module/strikes reappeared intact.
- **Bomb Protocol Analyst** — reloaded mid-puzzle; the private clue text reappeared intact.
- **Accusation voting** — reloaded mid-`ACCUSATION_VOTE`; the vote panel reappeared intact and the reloaded player could still cast a real vote.

The match was still fully completable afterward, reaching a correct `FINAL_RESULTS` — no reconnect
point left any residual stuck or duplicated state.

A separate **timeout pass** (`e2e/scenario-timeout.mjs`) confirmed no soft locks under the opposite
condition — zero client action for an entire phase, five phases in a row (Admin selection window,
hack window, minigame instructions, a fully un-answered `MINIGAME_PLAY`, and the full 60-second
discussion timer) — each correctly auto-advanced via the server's own timers with no client action
at all, and the match remained fully completable afterward (pushed the button and reached a correct
`FINAL_RESULTS`). This also incidentally reconfirmed RANK_IT's (and, in that run, DESCRIBE_IT's)
"timeout = honest no_answer, never fabricated" design from §4 against a completely un-answered
round, not merely a partially-answered one.

---

## 11. Security / Secrets

No new leak surface was introduced by this phase; the existing security test suite
(`gateway/security.test.ts`, `views.test.ts`) continues to pass unchanged, and the following were
specifically re-verified for the new/changed pieces:

- **RANK_IT**: TV never receives a participant's private instruction or which variant (Crew/Hacker) they were assigned; a hacked player's altered instruction is observable only as a content difference, never accompanied by any field revealing *why* it differs.
- **Bomb Protocol**: TV never receives the solution, any Analyst's private clue text, or any player's role — re-verified this phase (§5) alongside the sabotage-design audit specifically because that audit required reasoning carefully about exactly what each role can see.
- **FINAL_RESULTS role reveal**: gated purely on `room.winner !== null`, never on `phase.state` alone — proven `null` for both TV and every player at every checkpoint before the match ends (even when the view builder has real private-state access), fully populated for both TV and every individual player once resolved, and `null` again after a real rematch (`views.test.ts` #26, new this phase).
- **Legacy voting removal**: no dangling private fields survive the removal — `RoomState.currentVote`/`voteHistory` are gone from the type entirely (not merely unpopulated), so there is no field left that *could* have leaked a vote.
- **Live confirmation**: across all five real-browser scenarios (§7–§10), the dev server's own logs were scanned for unexpected errors/exceptions after every run — none were found.

---

## 12. Test Results

```text
npm test                              # 79 files (all passed), 777 tests (all passed)
npm run typecheck                     # shared-types + server + web — zero errors
npm --prefix apps/web run build       # production build succeeds, 9 routes generated
```

Net new/changed test coverage this phase: `legacy-voting-retired.test.ts` (new, 7 tests),
`rank-it.test.ts` (new, 25 tests), `views.test.ts` #26 (new), `room-lifecycle.test.ts` #24 (new),
`bomb-protocol.test.ts` (+1, the role-blindness proof), plus the sweep of ~20 existing test files'
`RATE_IT`→`RANK_IT` references (renamed, not silently deleted — see §4) and the removal of
`voting.test.ts`/`win-conditions.test.ts` (fully superseded — they tested only the removed
mechanic) and `rate-it.test.ts`/`rate-it-frontend.test.tsx` (the module they tested no longer
exists).

---

## 13. Screenshots

All captured live during the runs in §7–§10, stored under `final-gameplay-evidence/` (42 files):
4-player Admin selection, Hacker target confirm, RANK_IT phone + TV (active and reveal), Push
Button confirmation, suspect selection, group vote, Final Results, for the 4-player run; the full
6-player golden-match set including Bomb Protocol Operator/Analyst/TV views and the Firewall
hack-window-bypass proof; the 10-player set including the RANK_IT over-cap/at-cap comparison and
the exact-3-suspect accusation panel. Every screenshot referenced by name in §7–§10 above is present
in that directory.

---

## 14. Remaining Gameplay Gaps

**NONE**, within this phase's scope (excluding PostgreSQL, authentication, payments, ownership, and
final visual/animation polish, which remain separate, later phases as directed).

One test-environment note, not a gameplay gap: the real-browser scripts had to pace player joins
around the HTTP API's existing per-IP rate limiter (10 requests/60s), since every simulated player
in this environment originates from the same `localhost` IP — a condition a real deployment (each
phone on its own IP) essentially never hits. The rate limiter itself was left untouched, as
explicitly out-of-scope "unrelated infrastructure."
