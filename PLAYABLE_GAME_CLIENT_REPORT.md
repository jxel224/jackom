# Jackom — Playable Game Client Report

Scope: turn the finished server (FSM + WebSocket gateway + all six normal minigames + Bomb Protocol) into a real, fully playable TV + phone experience — no phase-timeout reliance for any action a real player is supposed to take.

## 1. Verdict

**Conditional YES — every phase now has a real, working player-facing control, and a critical server bug that was silently blocking three of them has been found, fixed, and regression-tested.**

A real 6-player match, driven entirely through actual browser UI clicks (Playwright, isolated `browser.newContext()` per player), was played from room creation through two full minigame rounds, Bomb Protocol, and into the legacy elimination vote. It surfaced a genuine, previously-unknown server bug (§2) that silently rejected three specific real player actions (Admin's minigame selection, the Bomb Protocol Operator's board actions, and vote submission) even though the UI showed the player as fully entitled to act — each of those three phases was falling back to its phase-timeout instead of accepting the real submission, which is exactly the failure mode this whole phase exists to eliminate.

That bug is now fixed (one line, in the WebSocket connection-kind parser) and covered by a new regression test that fails without the fix and passes with it. Post-fix, a full match was replayed end-to-end over the real gateway protocol (identical event/payload contracts to what the UI sends, though driven by a script rather than literal DOM clicks) and reached `FINAL_RESULTS` with the correct winner and a correct full role reveal — passing through real Admin selection, real Hacker action, two real minigame rounds, a real Bomb Protocol solve (all three modules, using only the Analysts' actual private clues), a real legacy elimination vote, a real Push-the-Button accusation with the exact correct suspect set, and a real accusation vote. See §6 for the full breakdown.

What is **not** yet re-confirmed with fresh literal browser clicks after the fix: the tail end of the original Playwright run (Bomb Protocol operator action → voting → accusation → final results) — the session running it hit a platform usage limit mid-run before it could restart with the fix in place. Given the fix's mechanism is proven to restore exactly the three previously-broken actions (via the regression test) and a full raw-protocol replay reached `FINAL_RESULTS` cleanly, this is a low-risk gap, but it is honestly still a gap: recommend one more full real-browser confirmation pass as a fast follow-up before calling this unconditionally done.

## 2. Critical Bug Found & Fixed

**Symptom:** A real Admin, confirmed by both the TV's and their own phone's UI to be the current Admin, submits a real minigame selection — server rejects it `NOT_ADMIN`. Same class of failure hit the Bomb Protocol Operator (`NOT_PARTICIPANT`) and every vote in the legacy elimination-vote phase (silently never resolving).

**Root cause:** `apps/server/src/gateway/gateway-server.ts`'s `verifyClient` parses the WebSocket URL path (`/host/{roomCode}` or `/play/{roomCode}`) and force-cast the raw captured segment directly into `ConnectionKind` (`'host' | 'player'`) via `as ConnectionKind`. The URL segment is literally `'play'`, not `'player'` — the cast let that mismatch through the type system silently. Every later `meta.kind === 'player'` check (crucially, `dispatchFsmEvent`'s injection of `playerId` onto the outgoing FSM event) therefore evaluated **false** for every real player connection. `event.playerId` was `undefined` for any FSM handler reading it directly — `handleMinigameSelect`'s `event.playerId !== room.adminId` check, `handleVoting`'s `isEligibleVoter(room, event.playerId)`, and the Bomb Protocol module's operator/participant checks all read `event.playerId` this way. Handlers that instead used the separately-and-correctly-populated `sender.playerId` (e.g. hack submission, ordinary minigame action submission) were unaffected — which is exactly why some player actions worked in testing and others didn't.

Existing unit/FSM tests never caught this because they construct `InboundEvent` objects directly, bypassing the gateway's URL-to-identity translation entirely. The one existing gateway-level test file testing this connection path only verified `view:player` delivery on reconnect, never a full player-owned FSM event dispatch.

**Fix** (`apps/server/src/gateway/gateway-server.ts`): normalize the URL segment explicitly (`match[1] === 'host' ? 'host' : 'player'`) instead of force-casting it.

**Verification:**
- Reproduced with a minimal raw-WebSocket script hitting the real gateway (near-zero latency between broadcast and submission, ruling out a timing/timeout race).
- Temporarily added a diagnostic to the rejection message, confirmed `event.playerId=undefined` while `room.adminId` was correct — pinpointed the exact mechanism.
- Fixed, reproduced again — real Admin submission now succeeds, phase transitions to `HACKER_CORRUPTION`.
- Added `apps/server/test/gateway/dispatch.test.ts` test 14 (a real `/play/{roomCode}` WebSocket connection driving `player:adminSelectMinigame` end-to-end) — confirmed it **fails** with the bug reverted and **passes** with the fix in place.
- Full `npm test` (788 tests, 81 files) and `npm run typecheck` both clean after the fix.
- A full raw-protocol match replay (§6) confirmed the fix also resolves the Bomb Protocol and voting symptoms, end-to-end through `FINAL_RESULTS`.

## 3. Controls Implemented

Every phase that requires a real player action now has one (`PlayerPhaseRouter.tsx` / `TvPhaseRouter.tsx`), backed by the exact existing server event contracts — no client-side reinvention of eligibility/limits/results:

| Phase | Player control | TV | Server event |
|---|---|---|---|
| MINIGAME_SELECT | `AdminMinigameSelect` — two-step (pick game → pick participants, enforcing min/max) | Admin name badge; waiting label for everyone else | `player:adminSelectMinigame` |
| HACKER_CORRUPTION | `HackerTargetSelect` — target grid + confirm step, only rendered when `hackerInfo` is present | — | `player:submitHack` |
| Any investigation phase | `PushButtonControl` — persistent when `canPushButton`, explicit confirm dialog | — | `player:pushButton` |
| ACCUSATION_SELECT | `AccusationSelect` — real grid for the initiator, naming panel for everyone else | `TvAccusationPanel` | `player:submitAccusation` |
| ACCUSATION_VOTE | `AccusationVote` — APPROVE/REJECT, locks on `hasVoted` | `TvAccusationPanel` (counts only) | `player:submitAccusationVote` |
| VOTING (legacy elimination vote) | `VotingPanel` — **new this phase**, target grid + skip, locks locally on send | `TvVotingPanel` — **new this phase** | `player:submitVote` |
| FINAL_RESULTS | `FinalResultsPanel` — win/loss, own role, full reveal (no rematch button — see below) | `TvFinalResults` — host-only "متابعة" advances | — |

**VOTING was not in the original 17-milestone list but is not optional**: with the default `roundsPerCycle: 2`, it fires every two rounds in every real match — it is not a rare edge case. Both `VotingPanel` and `TvVotingPanel` were built and wired in this phase once the audit surfaced the gap, then directly exercised (and found broken, then fixed) by the golden-path testing above.

**No rematch button on the phone deliberately**: `player:requestRematch` exists server-side but the FSM never reads it to auto-advance — only host-side `host:advance` (FINAL_RESULTS → REMATCH_LOBBY) and `host:startGame` (REMATCH_LOBBY → LOBBY, TV reuses the same lobby roster view) can actually restart a match. A phone-side rematch button would have been a false affordance.

## 4. Minigame Status

All seven server-registered minigames now have real Player + TV components (`apps/web/components/gameplay/hacker/minigames/<id>/`), routed by exact id in `PlayerMinigameRouter.tsx`/`TvMinigameRouter.tsx` with no generic placeholder remaining for any of them:

| Minigame | Player control | TV | Verified this phase |
|---|---|---|---|
| RATE_IT | Slider + submit (pre-existing reference implementation) | Progress bar + scatter reveal | Real UI (prior phase) |
| COMPLETE_IT | Text input (80-char cap) + submit | Progress bar + text reveal grid | Frontend tests |
| PREDICT_THEM | Audience A/B vote vs. selected-predictor A/B, branched by `group` | Audience-split bar + correctness reveal | **Real UI (Playwright)** |
| DEFEND_IT | Statement + FINISH at each of DEFENCE/FOLLOW_UP_QUESTION/FOLLOW_UP_RESPONSE, gated to the active player | Speaker order with live/complete markers | Frontend tests |
| DESCRIBE_IT | Hidden word + FINISH while speaking, gated to the active speaker | Speaker order with live/complete markers | Frontend tests |
| DRAW_IT | Real `<canvas>`, pointer-based strokes, undo/clear/submit | Progress bar; reveal renders every submitted drawing | **Real UI (Playwright)** |
| BOMB_PROTOCOL | See §5 | See §5 | **Real UI + real solve (raw protocol)** |

## 5. Bomb Protocol

Built as three files: `PlayerBombProtocolOperator.tsx` (real board — symbol grid, wire list with color swatches, a stepper-based 4-digit code entry, one control per module matching `allowedAction`), `PlayerBombProtocolAnalyst.tsx` (private clue fragments for the current module only, explicit "share this out loud" framing — the game's actual mechanic), and `TvBombProtocol.tsx` (public board mirror + strike pips + module label + Operator/Analyst names, never the solution).

Confirmed end-to-end via the raw-protocol full match (§6): a scripted "Analyst" read its own real `instructionFragments` for each module, and the "Operator" submitted the exact real solved answer for SYMBOLS (ordered `PRESS_SYMBOL`), WIRES (`CUT_WIRE` on the correct color+position), and CODE_SEQUENCE (`SUBMIT_CODE`) — the bomb defused for real (`{success:true}`), through the same event contracts the real UI uses. The original Playwright run also confirmed the Operator's and Analysts' real UI renders correctly (board, clue text) before hitting the now-fixed `NOT_PARTICIPANT` bug on submit.

## 6. Reconnect

Reconnect itself (`player:reconnect`/`host:reconnect`, session-token-based, never re-creates a player) was already built and audited in an earlier phase — untouched here. What's new this phase: every phase component is a stateless render of the current `PlayerView`/`TvView`, so **server-confirmed state always survives reconnect correctly** (e.g. `AccusationVote`'s `hasVoted`, `HackerTargetSelect`'s hack-used state). **Client-local-only state does not survive reconnect** — this is an intentional, pre-existing pattern (not something to "fix"), but worth being explicit about: an in-progress `DRAW_IT` canvas, a half-typed `COMPLETE_IT` answer, `VotingPanel`'s local "submitted" lock (no server `hasVoted` field exists for this legacy mechanic — see its code comment), and `PushButtonControl`/`HackerTargetSelect`'s confirm-dialog step are all local React state that resets on remount. None of this is a rule the server needs to know about — only the actual submission is a real action.

## 7. 4/6/10 Player Verification

**6 players — real browser UI (Playwright, the primary golden-path run).** Room created, all 6 joined in isolated contexts, role reveal, game intro, Admin's real UI flow, Hacker's real UI flow (hack accepted), two real minigame rounds played to completion (PREDICT_THEM, then DRAW_IT — both via genuine per-player UI interaction, not timeouts), Bomb Protocol intro + real Operator/Analyst board rendering, into the legacy elimination vote screen. This run is what surfaced the §2 bug (Admin selection and Bomb Protocol submissions rejected; the run had to fall back to timeouts at those three points). See `functional-evidence/` for 27 numbered screenshots.

**4 players — full raw-protocol match, post-fix (two runs).** Real HTTP join, real WebSocket connections, real event payloads identical to what the UI sends (not literal DOM clicks, but the exact same server contract). Both runs: real Admin rotation across 2 rounds, real RATE_IT submissions, real 10-second Hacker-corruption window, real Bomb Protocol solve (all 3 modules, using only the Analysts' real private clues — see §5), real legacy elimination vote (zero rejections), real Push-the-Button → correct-suspect-set accusation → real APPROVE votes → `FINAL_RESULTS` with the correct winner (`crew`) and a fully correct role reveal matching the actual assigned Hacker.

**10 players — could not be fully verified; verified at 9.** `HttpApiServer`'s per-IP HTTP rate limiter (`rateLimitMaxRequests: 10` per `rateLimitWindowMs: 60_000`, one shared bucket across room-create **and** player-join) makes it structurally impossible to create a room and join all 10 players from the same IP within 60 seconds — the 11th request (1 create + 10 joins) always gets `429 RATE_LIMITED`. This is a pre-existing, deliberate security control, not a bug introduced here (see §8 for the product-decision framing). Verified instead at 9 players: real 9-player roster delivered correctly to host and every player connection, real match start, real Admin identified and their real `player:adminSelectMinigame` submission accepted with zero rejections. This exercises the same roster/eligibility code paths a 10th player would; the only untested delta is the literal count at the configured ceiling.

## 8. Known Remaining Gaps

- **A fresh, full real-browser Playwright confirmation pass** through `FINAL_RESULTS` (post-fix) is recommended but not completed this session — see §1.
- **`VotingPanel` has no server-confirmed lock state**: relies on the phase remounting the component (keyed by `phase.phaseId`) to reset after a revote. Correct given the server's actual contract, but if a future revote reuses the same `phaseId` this would need revisiting (it currently always gets a new `phaseId` — confirmed in `transitions.ts`).
- **`ParticipantList`/`PlayerStatus`** gained a "مقصى" (eliminated) badge for `!player.alive` this phase — a minimal but real gap-fill for `ELIMINATION_RESULT`/post-vote legibility that wasn't in the original milestone list.
- **10-player join is rate-limited within the first 60 seconds of room creation** (see §7). Flagging as a product decision (raise the shared limit, split the bucket per-endpoint, or accept the friction as "spread your joins out a little") rather than changing a security-relevant value unilaterally in this phase — especially relevant for a party game where all 10 phones may share one NAT'd IP on the same venue WiFi.

## 9. RANK_IT Status

**Unchanged from the prior audit: not implemented server-side.** `apps/server/src/minigames/registry.ts` still only registers RATE_IT, COMPLETE_IT, PREDICT_THEM, DEFEND_IT, DESCRIBE_IT, DRAW_IT, and BOMB_PROTOCOL — no RANK_IT module exists. Per the explicit prior instruction, this remains the one documented, allowed exception to "every actually-supported game needs a real route" (Milestone 17) — there is nothing to route to. `GAME_TITLES`/`isGameplayId` in `view-data.ts` correctly has no RANK_IT entry, so it cannot be selected as a minigame at all; no client code references it.

## 10. Tests

- `npm run typecheck` — clean (shared-types, server, web).
- `npm test` (root `vitest run`, whole monorepo) — **788 tests passing, 81 files**, zero failures, zero skips beyond the pre-existing optional Redis integration test.
- `npm run build:web` — succeeds (Next.js production build, all 9 routes generated).
- New this phase: `apps/web/test/phase-controls-frontend.test.tsx` (14 tests — Admin, Hacker, PushButton, Accusation ×2, Voting, FinalResults), `apps/web/test/extended-minigames-frontend.test.tsx` (17 tests — COMPLETE_IT, PREDICT_THEM, DEFEND_IT, DESCRIBE_IT, DRAW_IT, Bomb Protocol Operator/Analyst/TV), plus `apps/server/test/gateway/dispatch.test.ts` test 14 (the regression test for §2, proven to fail without the fix).
- `git diff` scope check: `/quiz` and every visual-design file (`globals.css`, `page.tsx`, `HeroIllustration.tsx`, etc.) are untouched by this phase's work; server-side changes are limited to the gateway identity fix (§2) and the earlier, already-reviewed `adminId`/`winner`/`finalReveal` view-projection additions.

## Evidence

`functional-evidence/` (27 screenshots from the real-browser Playwright run, numbered in match order): room creation, all 6 players joined, role reveal (2 players), game intro, Admin selection UI (both rounds, including the pre-fix `NOT_ADMIN` rejection captured live), Hacker confirm dialog (both rounds), minigame play/results/discussion (both rounds — PREDICT_THEM then DRAW_IT), Bomb Protocol intro/Operator board/Analyst clues (including the pre-fix `NOT_PARTICIPANT` rejection captured live), final discussion, voting phase (TV + phone panel).

Raw-protocol match confirmation logs (not committed to the repo — session scratch output, reproducible via the steps in §2): two full 4-player runs after the fix, both reaching `FINAL_RESULTS` with the correct winner and full role reveal, plus one 9-player roster/admin-selection run (§7).
