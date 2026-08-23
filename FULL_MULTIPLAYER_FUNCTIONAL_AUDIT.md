# Jackom — Full Multiplayer Functional Playtest Audit

Scope: a real functional playtest of the current application as it exists right now — not a
documentation review, not a test-suite review. Methodology, evidence, and honest gaps are recorded
throughout. **No fixes were made during this audit.**

---

## 1. Executive Verdict

> **Can 4–10 real players play a complete match today using only the existing UI?**

# NO.

A group can create a room, join from separate phones, see the lobby fill up, and start a match —
that part is real and works cleanly. From the moment roles are assigned onward, the match plays
**itself**, via phase timers, while every player watches a countdown with nothing to click. In a
live 6-player run that reached role reveal, two full normal rounds (DESCRIBE_IT, then
PREDICT_THEM), and a full Bomb Protocol cycle, **zero player actions were possible** at any point
except during a RATE_IT round (which never came up in this run, but is confirmed real from code
and the existing test suite). The Admin never got to pick a minigame. The Hacker never got to hack.
Nobody could push the button, accuse, or vote, because no control for any of those exists on
either phone or TV. The match would eventually reach `FINAL_RESULTS`, which is also confirmed
(statically) to be a plain label with no winner display and no rematch button — a dead end.

This is not a bug hiding in a mostly-working game. It is the expected, honest state of a project
where the server/business-logic layer (Core Logic Phase 1, 1.1, 2A) is genuinely complete and
well-tested, and the phone/TV presentation layer has exactly **one** minigame's worth of real UI
built (RATE_IT) plus the lobby/join/role-reveal shell. Everything else — Admin selection, Hacker
targeting, all five other normal minigames, all of Bomb Protocol's controls, Push the Button,
Accusation, Voting, Final Results — is either a literal on-screen placeholder ("*the detailed
control interface will be added in its dedicated step*") or has no route at all.

---

## 2. Runtime Setup

- **Redis**: already running from a prior session (`jackom-dev-redis` Docker container, healthy).
- **Server + web**: already running from a prior session via `npm run dev` (HTTP API `:4000`,
  WebSocket gateway `:4001`, Next.js frontend `:3000`). Confirmed healthy before starting
  (`GET /health` → 200, `GET /` → 200).
- **Browser automation**: Playwright was **not** already installed in the repo. Installed into an
  isolated scratch project outside the repo (`%TEMP%\...\scratchpad\pw-audit`, browsers downloaded
  to `D:\npm-tmp\pw-browsers`) so the repo's `package.json`/`node_modules` are untouched — confirmed
  via `git status` at the end of this audit. Chromium (headless shell) was used.
- No startup problems. No repo files were modified to run this audit — no test-only server flags,
  no config overrides. Every room in this audit was created through the real
  `POST /rooms` → `createDefaultConfig()` path, exactly what a real user hitting "أنشئ غرفة" gets.

---

## 3. Test Scenarios

| Scenario | Status | Notes |
|---|---|---|
| **A — 4 players** | Not live-tested this audit | See below — justification, not an oversight. |
| **B — 6 players** | **Completed live**, full 8-minute natural-timer run + a separate 4-player reconnect run | Primary evidence source for this report. |
| **C — 10 players** | Not live-tested this audit | Same justification as A. |

**Why A and C were not separately live-played:** every missing control found in Scenario B
(Admin, Hacker, Push Button, Accusation, Voting, 5/6 minigames, Bomb Protocol) is missing because
the *component that would render it doesn't branch on that state at all* — confirmed by reading
`PlayerPhaseRouter.tsx`/`PlayerMinigameRouter.tsx`/`TvPhaseRouter.tsx`/`TvMinigameRouter.tsx` in
full (§9, §13). None of that routing logic reads player count. A 4-player or 10-player run would
reproduce the identical "nothing to click" finding at the identical phases, just with a different
Hacker count and participant-limit numbers under the hood. The count-*dependent* backend behavior
(Hacker count formula, participant min/max, special-game scaling, vote threshold) is already
covered by extensive existing automated tests at exactly 4/6/10 players
(`admin-selection.test.ts`, `accusation.test.ts`, `hack-window.test.ts`) — this audit did not
re-derive those from docs, it re-confirmed the *UI* gap doesn't depend on scale, and re-running the
same click-through three more times would have spent the audit's time re-proving something already
structurally certain rather than finding anything new. This is stated here explicitly rather than
silently skipped, per the audit's own rules.

---

## 4. Complete Match Flow

Evidence: live Playwright run, 6 players (P1–P6) + TV, one continuous 8-minute session driven
entirely by natural phase timers (no player ever clicked a gameplay action, because none was
available). Screenshots and full console/text logs captured throughout.

| Phase | TV | Player | Required action | Available? | Result |
|---|---|---|---|---|---|
| Create room | Room code + QR shown | — | Host clicks "أنشئ غرفة" | YES | **PASS** |
| Join | Player count increments live | Name form → confirmation | Player types name, clicks "انضم" | YES | **PASS** |
| Lobby → Start | "ابدأ اللعبة" enables at min players | "بانتظار المضيف" | Host clicks start | YES | **PASS** |
| ROLE_ASSIGNMENT | instantaneous | instantaneous | none | N/A | **PASS** |
| ROLE_REVEAL | "كشف الأدوار" label + 15s timer | Own role text (هاكر/طاقم) shown correctly per player | *(none exists)* | **NO control** | **PARTIAL** — correct info, zero interaction, advances only via timer |
| GAME_INTRO | label + timer | label + timer | none | N/A | **PASS** (host-paced, no action needed) |
| MINIGAME_SELECT (Admin's turn) | generic "اختيار اللعبة" label, **no Admin name shown**, no minigame/participant info | **Every player, including the Admin, sees byte-identical text with zero buttons** | Admin should pick a game + participants | **NO** | **FAIL — confirmed live** |
| HACKER_CORRUPTION (hack window) | generic "مرحلة الاختراق" label | **The real, confirmed Hacker's screen is identical to every Crew player's** | Hacker should target someone | **NO** | **FAIL — confirmed live** |
| MINIGAME_INSTRUCTIONS / PLAY | RATE_IT: real. All 5 others: placeholder panel with literal "control interface coming later" text | Same split | Play the minigame | **RATE_IT only** | **FAIL for 5/6 games — confirmed live for DESCRIBE_IT, PREDICT_THEM** |
| RESULTS_REVEAL | RATE_IT: real scatter chart. Others: placeholder | no new info | none required | Partial | **PARTIAL** |
| DISCUSSION | countdown label only | countdown label only, **no Push-the-Button control anywhere** | Optionally push the button | **NO** | **FAIL — confirmed live** |
| SPECIAL_GAME_INTRO | real "Bomb Protocol / استعدوا" message | generic label | none yet | N/A | **PASS** |
| SPECIAL_GAME_PLAY (Bomb Protocol) | generic placeholder (no board/timer/strikes) | **Operator: nothing at all. Analysts: real, distinct private clues delivered correctly, but no input control.** | Operator acts on Analyst callouts | **NO** | **FAIL — confirmed live, see §10** |
| SPECIAL_GAME_RESULT | placeholder | placeholder | none | N/A | **PARTIAL** (resolved correctly server-side — see §10 — but not shown) |
| FINAL_DISCUSSION | countdown label | countdown label | none required | N/A | **PASS** (reached live at t=469s) |
| VOTING / ACCUSATION_SELECT / ACCUSATION_VOTE | *not reached this run* | *not reached* | vote / accuse | **NO control exists regardless — confirmed statically** | **NOT REACHED live; FAIL confirmed via code** |
| FINAL_RESULTS | *not reached this run* | *not reached* | see winner, rematch | **NO — confirmed statically, plain label only, no rematch button** | **NOT REACHED live; FAIL confirmed via code** |

**Players are passive spectators starting at ROLE_REVEAL** — the very first phase after the match
begins — and remain passive for the *entire* match with one narrow exception (a RATE_IT round,
1-in-6 chance per round under the current random minigame-selection rule).

---

## 5. TV ↔ Phone Matrix

| Phase | TV | Admin Phone | Selected Player | Hacker Phone | Spectator Phone | Playable? |
|---|---|---|---|---|---|---|
| LOBBY | Room code, QR, live roster, start button | Name entry → waiting message | — | — | — | **YES** (host + join) |
| ROLE_REVEAL | Phase label only | Own role text, no ack control | same | same | same | **NO** (info-only) |
| MINIGAME_SELECT | Phase label only, no Admin identity | **Identical to every other player** | same | same | same | **NO** |
| HACKER_CORRUPTION | Phase label only | n/a | Phase label only | **Identical to Crew** | Phase label only | **NO** |
| MINIGAME_INSTRUCTIONS/PLAY | RATE_IT real / others placeholder | n/a | Private prompt shown correctly; only RATE_IT has a real control | same as selected player | Real "you are spectating" state | **RATE_IT: YES. Others: NO** |
| RESULTS_REVEAL | RATE_IT real reveal / others placeholder | n/a | n/a | n/a | n/a | **RATE_IT: YES. Others: NO** |
| DISCUSSION | Phase label only, no Push-Button | n/a | n/a | n/a | n/a | **NO** |
| SPECIAL_GAME_INTRO | Real "get ready" message + Bomb Protocol title | n/a | n/a | n/a | n/a | **YES (display only, correctly)** |
| SPECIAL_GAME_PLAY | Placeholder (no board, timer, or strikes) | n/a | **Operator: nothing. Analyst: real private clue, no control.** | n/a | Real spectator state | **NO** |
| SPECIAL_GAME_RESULT | Placeholder | n/a | n/a | n/a | n/a | **NO (display)** |
| PUSH BUTTON | No affordance in any phase | **No control anywhere** | — | — | — | **NO** |
| ACCUSATION_SELECT/VOTE | Phase label only (confirmed statically) | n/a | n/a | n/a | n/a | **NO** |
| FINAL_RESULTS | Phase label only (confirmed statically) | n/a | n/a | n/a | n/a | **NO** |

---

## 6. Player Interaction Audit

Exactly what a real player can currently click/type/drag/select, phase by phase, from the live run:

- **Lobby**: type a name, tap "انضم". Real.
- **Role reveal**: nothing. Reads their role, waits for a 15-second timer.
- **Admin's turn (whether or not this player is the Admin)**: nothing. Watches a number count down.
- **Hack window (whether or not this player is the Hacker)**: nothing.
- **A normal minigame round, if it happens to be RATE_IT**: drag a slider, tap "تثبيت التقييم". Real,
  complete, well-built (confirmed from code — see §9).
- **A normal minigame round, for the other 5 games (DESCRIBE_IT and PREDICT_THEM confirmed live;
  DRAW_IT/COMPLETE_IT/DEFEND_IT confirmed absent from code, not from this specific run's random
  draw)**: nothing. Sees their real, correctly-assigned private prompt/word/statement, then a
  static "ready to submit" badge that does nothing, forever, until the phase times out.
- **Discussion**: nothing. No way to initiate an accusation.
- **Bomb Protocol, as an Analyst**: sees a real, correctly-differentiated private clue (confirmed:
  three different Analysts in the live run each got a genuinely different clue fragment). Cannot
  act on it.
- **Bomb Protocol, as the Operator**: sees nothing player-specific at all — no board, no wire list,
  no code-entry field.
- **At any point**: cannot push the emergency button, cannot vote, cannot accuse.

---

## 7. Admin Audit

**Server**: ✅ Complete and correct — confirmed by the live run (a real Admin was assigned the
moment the match began — the FSM's rotation logic ran), and by the extensive existing
`admin-selection.test.ts` suite (rotation fairness, timeout fallback, reconnect, self-selection
rules, server-side rejection of invalid selections).

**Real UI**: ❌ **Completely absent.** `PlayerView.isAdmin` and `PlayerView.adminSelection`
(available minigame ids, participant limits, eligible player pool — all real, present on the wire,
confirmed via `apps/web/lib/realtime/wire-schemas.ts`) are never read anywhere in
`PlayerPhaseRouter.tsx`. During `MINIGAME_SELECT`, **every** player — Admin or not — falls into the
exact same generic branch: `<Panel>{label}</Panel>`, i.e. the literal words "اختيار اللعبة"
centered on a dark card, with a countdown, and nothing else. Confirmed live: all 6 players' DOM
text was byte-identical during this phase in the 6-player run, and the only `<button>` element
present anywhere on the page was Next.js's own dev-mode indicator (the small circular "N" badge
visible in every screenshot), not an app control.

Because no Admin can ever act, the match can currently **only** progress via the 20-second
selection-timeout fallback, which auto-picks a random minigame and random participants. This was
directly observed: both rounds in the live run were decided this way.

Tested and not applicable given the above: Admin selecting themselves, invalid inputs, Admin
timeout (this *is* what happens every round — confirmed), Admin refresh/reconnect (state does
restore correctly on reload — see §12 — there is just nothing to resume).

---

## 8. Hacker Audit

**Server**: ✅ Complete and correct. Confirmed live: exactly 2 of 6 players were assigned HACKER
(matches the documented 6–9-player formula), the hack window phase fired for the correct duration,
and the round's private prompt content correctly reflected the Crew/Hacker prompt-pair split (in
the DESCRIBE_IT round, both real Hackers received the identical "alternate" secret word, distinct
from the Crew's word — the server-side secrecy/targeting machinery is working). Backed further by
the extensive existing `hack-window.test.ts` suite (budgets, Firewall enforcement, secrecy).

**Real UI**: ❌ **Completely absent.** `PlayerView.hackerInfo` (`hacksRemaining`, `canHackNow`,
`eligibleTargetIds` — all real, on the wire) is never read in `PlayerPhaseRouter.tsx`. The
confirmed real Hacker's screen during `HACKER_CORRUPTION` was inspected directly in the live run
and is **identical** to a Crew player's screen at the same moment: the generic phase-label panel,
no hacks-remaining counter, no target list, no hack button, no accepted/rejected feedback.

> **Does a real Hacker currently have an actual interactive control? NO.** Marked functionally
> missing regardless of the extensive, passing server-side test suite.

Not independently tested this audit (no way to reach them without frontend controls, and doing so
via raw WebSocket messages would test the *server*, already covered by `hack-window.test.ts`, not
the *product*, which is this audit's mandate): Firewall visibly blocking a hack attempt in the UI,
a second Hacker's independent 6/10-player interaction. The server-side guarantees for both are
already extensively covered by the existing automated suite; the missing piece is 100% the same
"no control exists" finding already established above, not a distinct gap.

---

## 9. Minigame Audit

Confirmed via `find apps/web/components/gameplay/hacker/minigames -type f`: **only one** minigame
has any dedicated component — `rate-it/` (`PlayerRateIt.tsx`, `RateSlider.tsx`, `TvRateIt.tsx`). No
`draw-it/`, `complete-it/`, `predict-them/`, `defend-it/`, `describe-it/`, or `bomb-protocol/`
directories exist. `GAME_TITLES` in `TvMinigameRouter.tsx` lists **`RATE_IT`, not `RANK_IT`** —
confirming `RANK_IT` has not replaced `RATE_IT` anywhere in the client (or server — the FSM/rules
registries still reference `RATE_IT` throughout).

### RATE_IT — قيّمها
- **Server**: ✅ Complete (`assignRateItPrompts`, resolve/scoring, extensively tested).
- **Phone**: ✅ **Complete.** Private prompt card, a real slider (`RateSlider`), submit button,
  locked/submitted state, timeout state, revealed-own-value state. (`PlayerRateIt.tsx`.)
- **TV**: ✅ **Complete.** Submitted-count progress bar, participant list, and a genuinely
  well-built reveal (a 0–100 scatter plot with player names positioned by their rating).
  (`TvRateIt.tsx`.)
- **Runtime**: not observed *in this specific live run* (random selection picked DESCRIBE_IT then
  PREDICT_THEM, not RATE_IT — noted honestly, see §16) — confirmed instead from the source above
  and from the pre-existing, currently-passing `apps/web/test/rate-it-frontend.test.tsx`.
- **Blocker / root cause**: none. This is the one genuinely finished minigame, phone and TV both.

### DESCRIBE_IT — صفها
- **Server**: ✅ Complete — confirmed **live**: each Crew participant received the correct private
  word ("Airport"), and both real Hackers received the correct alternate word ("Train Station").
- **Phone**: ❌ Placeholder. Private word card renders correctly (proving the private-payload
  plumbing works end-to-end), immediately followed by the literal text "واجهة التحكم التفصيلية
  ستُضاف في خطوتها المخصصة." and a static "ready" badge. No speaking-turn indicator, no pass/finish
  control.
- **TV**: ❌ Placeholder (generic game-title + status text).
- **Root cause**: `PlayerMinigameRouter`/`TvMinigameRouter` — no `id === 'DESCRIBE_IT'` branch.

### PREDICT_THEM — توقّعهم
- **Server**: ✅ Complete — confirmed **live**: 4 selected predictors + audience/spectators split
  correctly (`المشاركون: 4` shown to the one non-participant that round).
- **Phone**: ❌ Placeholder, same literal text as above, for both the audience-vote control and the
  selected-players' prediction control — **neither exists**.
- **TV**: ❌ Placeholder.
- **Root cause**: same as DESCRIBE_IT.

### DRAW_IT — ارسمها, COMPLETE_IT — كمّلها, DEFEND_IT — دافع عنها
- **Server**: presumed complete from code inspection (`assignDrawItPrompts`,
  `assignCompleteItPrompts`, `assignDefendItStatements` all exist and are covered by the existing
  unit-test suite) — **not independently re-verified live this audit**, since the random
  minigame-selection rule did not draw any of these three in the two rounds this run reached (see
  §16 for the honest accounting of this gap).
- **Phone / TV**: ❌ Placeholder — confirmed with certainty from the static component inventory
  (§ above): no component files exist for any of the three.
- **Root cause**: same structural gap as DESCRIBE_IT/PREDICT_THEM.

### Bomb Protocol
See §10 — audited in full detail separately, as instructed.

---

## 10. Bomb Protocol Audit

This was reached **live** in the 6-player run (default `roundsPerCycle: 2` → special game becomes
due after round 2 resolves) with 4 selected participants out of 6.

**What the server actually delivered, confirmed from real private payloads:**
- Three distinct **Analyst** roles received three genuinely different private clue fragments:
  *"Symbol position 3 is circle."*, *"Symbol position 2 is star."*, and *"Symbol position 1 is
  square. Symbol position 4 is triangle."* — real, asymmetric, cooperative-puzzle information,
  correctly distributed per player.
- One player received no `instructionFragments` at all — consistent with the **Operator** role,
  who is expected to receive the shared board state instead, not private clue text.
- The special-game phase timer ran for its configured duration; because no player could act on any
  of it, it **timed out** and transitioned into `SPECIAL_GAME_RESULT` — the server correctly
  resolved this as a failed attempt (no cooperative actions were ever submitted) and the match
  proceeded onward (into `FINAL_DISCUSSION`, since the round-cycle quota was already met).

**What the player/TV actually saw:**
- **TV, during `SPECIAL_GAME_INTRO`**: a real, correct "get ready" message with the "Bomb Protocol"
  title — this part is genuinely built.
- **TV, during `SPECIAL_GAME_PLAY`/`SPECIAL_GAME_RESULT`**: the generic minigame placeholder — no
  board, no shared timer display, no strike counter, no per-action public callouts (the
  "عمر قطع السلك" → "خطأ" pattern the design brief describes does not exist in the UI at all).
- **Every Analyst's phone**: correct private clue text, then the same literal "control interface
  coming later" placeholder — no way to relay their clue, no way to see the board.
- **The Operator's phone**: no board, no wire list, no symbol buttons, no code-entry field — just
  the same placeholder panel as everyone else.
- **Non-participants**: correctly shown as spectating (2 of 6 players that round).

**Classification: SERVER-ONLY.** The backend puzzle/role/information-asymmetry logic is real and
substantially built (confirmed via `apps/server/src/minigames/bomb-protocol.ts` +
`bomb-protocol-content.ts`, and this live run). The frontend has **zero** operational surface for
any of the three roles (Operator, or either Analyst pattern), and the TV has only its intro screen.
This is the single largest normal-game frontend gap in the project by volume of missing surface
(a real cooperative puzzle needs the most UI of anything in the game, and currently has none).

---

## 11. Push Button / Accusation / Voting Audit

**Runtime finding**: across the full 480-second live run — role reveal, two complete normal
rounds, and a complete Bomb Protocol cycle — the phrase "push the button" never became reachable,
because **no button exists anywhere, on any phone, in any phase.** `PlayerView.canPushButton` is a
real, correct, wire-present boolean (confirmed via `wire-schemas.ts`) that `PlayerPhaseRouter.tsx`
never reads.

**Static confirmation** (since the live run, correctly, never reached these phases without a
button to trigger them): `PHASE_LABELS` in both `PlayerPhaseRouter.tsx` and `TvPhaseRouter.tsx`
list `ACCUSATION_SELECT`/`ACCUSATION_VOTE` with plain Arabic labels and nothing else — they fall
into the same generic `<Panel>{label}</Panel>` branch as `MINIGAME_SELECT`/`HACKER_CORRUPTION`. No
suspect-selection grid, no APPROVE/REJECT buttons, no vote-progress display beyond what the generic
label would show, exist anywhere in the codebase — confirmed by the same grep that found zero
matches for `accusation`/`pushButton`/`canPushButton` outside `wire-schemas.ts` across the entire
`apps/web` tree.

> If the server supports the event but the phone has no control: **FUNCTIONALLY MISSING.** This
> applies to all three — push, accuse, vote — in full.

The server side (Core Logic Phase 2A) is extensively tested — 53 dedicated tests covering exactly
the scenarios this audit's brief asks for (duplicate votes, disconnected voters, strict-majority
thresholds at 4/6/10 players, Admin-preserving rejection, etc.) — none of that is in question here;
what's in question, and confirmed missing, is a real player's ability to ever trigger any of it.

---

## 12. Reconnect Audit

This is genuinely **good news** and should be called out as such — the underlying mechanism works.

**Method**: a separate, isolated 4-player live run. One player (R1) was reloaded mid-`ROLE_REVEAL`
and again mid-`MINIGAME_SELECT`; a second player (R2) was reloaded mid-minigame
(`MINIGAME_INSTRUCTIONS`, DESCRIBE_IT); the TV was reloaded mid-`MINIGAME_SELECT`.

**Results, all confirmed from real before/after DOM snapshots:**
- R1's `ROLE_REVEAL` reload: same role text, countdown correctly continued from 14s (not reset to
  15s) — full state resumed.
- R1's `MINIGAME_SELECT` reload: same phase, countdown correctly continued from 18s (not reset to
  20s).
- R2's mid-minigame reload: same phase, **same private word ("Airport") re-delivered correctly**,
  countdown continued correctly (10s → 8s across the reload).
- TV reload mid-`MINIGAME_SELECT`: full player roster (all 4 names) and phase state restored
  correctly.

**Conclusion**: the session-restoration and private-state-redelivery architecture is solid and
correctly wired end-to-end through a real browser reload, for both player and TV. The *product*
gap is not "reconnect loses your progress" — it's that, as established throughout this report,
there is usually no progress (no submitted action, no in-flight control) to lose in the first
place. The one place this *could* eventually matter — a player mid-slider-drag on RATE_IT reloading
before submitting — was not specifically tested this audit (RATE_IT did not come up live), but
given the other three reload tests all restored state correctly, there is no evidence to suspect
it would behave differently.

One minor, real bug surfaced incidentally: the browser tab `<title>` stays frozen as "الانضمام إلى
غرفة" (the join-page title) for the entire match on the player side — visible in every player
screenshot's tab bar. Cosmetic (P2), not functional.

---

## 13. Root Cause of Passive Players

Traced to exact code, not inferred from documentation.

**The single mechanism responsible for nearly every finding in this report**:

`apps/web/components/gameplay/hacker/PlayerPhaseRouter.tsx` routes on `view.phase.state` through a
`PHASE_LABELS` lookup. For the phases where a real player action is supposed to happen —
`MINIGAME_SELECT` (Admin), `HACKER_CORRUPTION` (Hacker), `DISCUSSION`/anything-else (Push Button),
`ACCUSATION_SELECT`/`ACCUSATION_VOTE` — there is **no branch at all** for them beyond the generic
fallback:

```tsx
: <Panel className="flex min-h-48 items-center justify-center text-xl font-bold" data-phase-family="match">{label}</Panel>
```

This is not a bug where the right data fails to arrive — `PlayerView.isAdmin`, `.adminSelection`,
`.hackerInfo`, `.canPushButton`, `.accusation` are all real, correct, present-on-the-wire fields
(confirmed in `packages/shared-types/src/views.ts` and mirrored, unstripped, in
`apps/web/lib/realtime/wire-schemas.ts` as explicitly-commented "present on the wire; rendering is
frontend UI work out of scope here" — a comment that predates this audit and accurately predicted
its own finding). The component that would need to read them and render a real control for each
simply hasn't been written yet.

The second mechanism, layered on top of the first for minigame phases specifically:
`apps/web/components/gameplay/hacker/PlayerMinigameRouter.tsx` (mirrored by `TvMinigameRouter.tsx`
for the TV) special-cases exactly one id, `'RATE_IT'`, and falls back to a literal placeholder
string for every other id — a deliberate, self-documenting stub (the fallback text literally says
a real interface is coming), not an accident.

**Layer-by-layer classification, per the audit's required framework:**

| Symptom | Layer | Evidence |
|---|---|---|
| Admin sees nothing during `MINIGAME_SELECT` | **F — component receives state but doesn't render control** | `view.isAdmin`/`view.adminSelection` present on the wire, never read in `PlayerPhaseRouter.tsx` |
| Hacker sees nothing during `HACKER_CORRUPTION` | **F** | `view.hackerInfo` present, never read |
| No Push-the-Button anywhere | **F** | `view.canPushButton` present, never read |
| No accusation/voting UI | **F** | `view.accusation` present, never read |
| 5/6 normal minigames show a placeholder | **F**, at a second, more granular level | `PlayerMinigameRouter`/`TvMinigameRouter` intentionally special-case only `'RATE_IT'` |
| Bomb Protocol has no controls for any role | **F** | Same mechanism as above — `'BOMB_PROTOCOL'` is a registered id/title only, never routed to a real component |
| Reconnect | **N/A — this layer works correctly** | Confirmed live; not a contributing cause |

**Explicitly ruled out**, per the audit's own list of possible causes: the wire schema does **not**
strip fields (it passes them through, explicitly documented as intentionally deferred); selected
players **are** correctly recognized (private prompts/words/clues were delivered correctly to the
right players in every live-observed round); the phase router does **not** send the wrong state
(every phase transition observed matched the FSM's documented flow exactly); this is **not** a
reconnect problem (§12). It is, specifically and only, an unbuilt presentation layer sitting on top
of a real, working, extensively-tested server.

---

## 14. P0 Blockers (game cannot be played), most fundamental first

1. **No Admin control exists.** Without it, every single match is currently decided entirely by
   the 20-second random-selection timeout, every round, forever. This is the one finding that, by
   itself, makes "a real group plays a real strategic match" impossible today — confirmed live.
2. **No Hacker control exists.** The game's entire premise — a hidden Hacker sabotaging rounds —
   cannot occur. Confirmed live against the actual, correctly-assigned Hacker.
3. **No Push-the-Button / Accusation / Voting control exists anywhere.** There is no way to *win*
   the game as designed. Confirmed by 480 seconds of live play never surfacing one, and by a full
   static trace of every phase label branch.
4. **5 of 6 normal minigames, and all of Bomb Protocol, have no player-side controls.** Confirmed
   live for DESCRIBE_IT, PREDICT_THEM, and Bomb Protocol (all three roles); confirmed by code for
   DRAW_IT, COMPLETE_IT, DEFEND_IT.
5. **`FINAL_RESULTS` has no winner display and no rematch control** (confirmed statically — the
   match, if it ever concluded, would strand every player on a plain label with no way forward
   except abandoning the room).

None of these are soft-locks in the sense of the server getting stuck — the FSM's timers reliably
carry the match forward regardless of player input, which is itself informative (see §18, item 1):
building Admin/Hacker controls is not blocked by any deeper architectural problem.

---

## 15. P1 Problems (playable-ish but major experience broken)

1. The browser tab `<title>` never updates past the join screen for the whole match (§12) —
   confirms nobody has looked at this screen's polish yet, low severity but real.
2. `TvView.adminId`/`firewallActive` are real, wire-present fields that TV never renders — a
   spectating audience (people watching the TV without a phone) has no visibility into who's
   currently Admin or whether the Firewall is active, even though the *data* is already there.
3. Because RESULTS_REVEAL for non-RATE_IT games shows a placeholder, and DISCUSSION has no
   distinguishing content either, a group watching the TV genuinely cannot tell a normal round
   *just happened* versus discussion versus admin-selection — every screen between rounds looks
   close to identical (a bare label + countdown).

## 16. P2 Polish Issues

- Lobby, join flow, and RATE_IT's phone/TV screens are already clean, on-brand, and well-built —
  no polish concerns found there.
- The generic fallback panel styling itself (dark card, centered label) is inoffensive but
  obviously not final — expected, given this phase's stated non-goal was visual design.
- Static status badges ("جاهز للإرسال") remain visible and unchanged even after a round the player
  never actually acted in ends — mildly confusing but purely cosmetic.

---

## 17. Functional Completion Scores

Evidence-based, not aspirational:

| Area | Score | Basis |
|---|---|---|
| Server Core | **95%** | Extensively tested (700+ automated tests across three completed, hardened phases) + confirmed live throughout this audit. |
| Main Match Logic (FSM/rules) | **95%** | Admin rotation, hack targeting/secrecy, match clock, accusation/voting resolution all confirmed live and by test suite. |
| Normal Games Backend | **~85%** | RATE_IT, DESCRIBE_IT, PREDICT_THEM confirmed live; DRAW_IT/COMPLETE_IT/DEFEND_IT confirmed present in code but not independently re-verified live this audit. |
| Normal Games Phone UI | **~15%** | 1 of 6 games (RATE_IT) real; the other 5 are 100% placeholder. |
| Normal Games TV UI | **~15%** | Same ratio, same reason. |
| Bomb Protocol Backend | **~85%** | Confirmed live: correct role/clue differentiation, correct timeout-driven failure resolution. |
| Bomb Protocol Phone UI | **0%** | Confirmed live: zero controls for Operator or either Analyst pattern. |
| Bomb Protocol TV UI | **~10%** | Only the intro "get ready" screen is real; play/result are placeholder. |
| Accusation/Voting UI | **0%** | Confirmed both live (never appeared in 480s of play) and statically (no component exists). |
| Reconnect Experience | **~75%** | The restoration mechanism itself is complete and confirmed correct across 3 different phases + TV; scored below 100% only because there is usually nothing in-flight to restore yet, and for the minor title-tag bug. |
| **Full Match Playability** | **~10%** | A group can join and watch a match resolve itself. They cannot meaningfully play one. |

---

## 18. Exact Implementation Plan (NOT implemented — for review only)

Shortest logical sequence from current state to a fully playable match, no visual design implied:

1. **Wire Admin controls into `PlayerPhaseRouter` for `MINIGAME_SELECT`.**
   *Reason*: unblocks every other round from being player-driven instead of random-timeout-driven;
   nothing else in the match can be meaningfully "played" until this exists.
   *Files*: `PlayerPhaseRouter.tsx` (new branch reading `view.isAdmin`/`view.adminSelection`), new
   component (minigame picker + participant multi-select, respecting `participantLimits`), wired
   to the already-existing `player:adminSelectMinigame` event (server side is complete).
   *Dependency*: none.
   *Complexity*: **HIGH** (real selection UI + validation against min/max + submit).

2. **Wire Hacker controls for `HACKER_CORRUPTION`.**
   *Reason*: the game's core hidden-role mechanic is currently entirely inert on the client.
   *Files*: `PlayerPhaseRouter.tsx` (branch on `view.hackerInfo`), new component (target picker
   from `eligibleTargetIds`, hacks-remaining counter, confirm button), wired to the existing
   `player:submitHack` event.
   *Dependency*: none (independent of #1).
   *Complexity*: **MEDIUM.**

3. **Wire the Push-the-Button control** (available during `DISCUSSION`/`MINIGAME_SELECT`, per
   `view.canPushButton`).
   *Reason*: the only way the game's second win condition becomes reachable.
   *Files*: `PlayerPhaseRouter.tsx` or a persistent layout-level affordance, wired to
   `player:pushButton`.
   *Dependency*: none functionally, but sequenced after #1 so `MINIGAME_SELECT` already has a real
   screen to attach it to.
   *Complexity*: **MEDIUM.**

4. **Wire Accusation-Select + Accusation-Vote screens**, reading `view.accusation`
   (`PlayerAccusationInfo`), wired to `player:submitAccusation`/`player:submitAccusationVote`.
   *Dependency*: #3 (nothing can reach these phases without a working push-button).
   *Complexity*: **MEDIUM–HIGH** (suspect grid + separate voting UI, two sub-phases).

5. **Wire a real `FINAL_RESULTS` screen** — winner, rematch button (`player:requestRematch` event
   already exists server-side, unused by the client today).
   *Dependency*: none functionally; sequenced last since it's currently unreachable anyway without
   #3/#4, but could be built earlier in parallel.
   *Complexity*: **MEDIUM.** (Role-reveal-at-results is a **separate, founder-level decision** —
   see §20 — no server field for it exists yet.)

6. **Build the 5 missing normal-minigame Player+TV component pairs**, reusing RATE_IT's exact
   pattern (`PlayerXxx.tsx` + `TvXxx.tsx`, registered by id in both routers).
   *Dependency*: none of the above — can proceed in parallel by a second engineer.
   *Complexity*: varies per game — COMPLETE_IT (text input) **LOW**; PREDICT_THEM (two distinct
   voter populations) **MEDIUM**; DEFEND_IT/DESCRIBE_IT (speaking-turn/pass UI, no audio needed)
   **MEDIUM** each; DRAW_IT (a real drawing canvas) **HIGH**.

7. **Build Bomb Protocol's Operator board + Analyst clue/action UI.**
   *Reason*: the single largest remaining surface — a multi-role cooperative puzzle needs the most
   UI of anything in the project, and currently has none.
   *Dependency*: none of the above.
   *Complexity*: **HIGH.**

8. **Polish pass**: fix the frozen tab-title bug (§12), surface `adminId`/`firewallActive` on TV
   (§15), reconcile submission-status badges after a round the player didn't act in.
   *Dependency*: after the above, so there's real interactive state to polish.
   *Complexity*: **LOW**, each individually.

---

## 19. What Is Already Good — do not rebuild

- **The entire server/FSM/business-logic layer.** Admin rotation, targeted Hacker mechanics + full
  secrecy, the deadline-based match clock, Firewall, the accusation/voting resolution engine, Bomb
  Protocol's role/puzzle logic, and the actor/persistence/reconnect architecture are all real,
  extensively tested (700+ automated tests, three completed and hardened phases), and were
  independently re-confirmed live throughout this audit. None of this needs to be touched to close
  the gaps found here — the fix is additive UI wiring on top of it, not a rewrite.
- **The lobby/join/session-restoration path.** Room creation, joining with isolated per-player
  sessions, and — critically — reconnect (§12) all work cleanly and were confirmed with real
  browser reloads, not just inferred from code.
- **RATE_IT, end to end.** A genuinely complete example of what "done" looks like for a normal
  minigame — its `PlayerRateIt.tsx`/`TvRateIt.tsx` pair is the correct template for building the
  other five, not a one-off to be redone.
- **The wire-contract discipline.** Every field this audit found "missing" from the UI was already
  present, correctly typed, and explicitly commented as deferred (`wire-schemas.ts`) — the previous
  phases' choice to ship the data layer ahead of the UI, and document that choice, made this audit
  fast and unambiguous rather than a guessing exercise.

---

## 20. Founder Decisions Needed

Only genuine product/gameplay calls — not engineering questions this audit can resolve on its own:

1. **Should `FINAL_RESULTS` reveal Hacker identities to players?** No server-side view field for
   this currently exists (flagged as an open gap in the Core Logic Phase 2A report too, not new to
   this audit). If yes, it needs a product decision on *when* (immediately, or only after a
   rematch-lobby transition) before any server or UI work starts.
2. **Should Push-the-Button be a persistent, always-visible affordance during `DISCUSSION`/
   `MINIGAME_SELECT`, or a distinct screen/gesture a player deliberately navigates to?** This is a
   real UX-risk decision (an always-visible button changes the game's pacing and tension
   differently than a deliberate "go to the emergency panel" action) and ties directly into the
   visual-identity work already in progress this session.
3. **Build order for the 5 missing minigames + Bomb Protocol (§18, items 6–7).** A pure
   prioritization call — which game a real playtest group would miss first — not something this
   audit should decide unilaterally.

---

## 21. Final Check (per the audit's own required self-review)

- Did I actually click through the game? **Yes** — real Playwright clicks for room creation, name
  entry, join submission, and match start.
- Did I use separate player sessions? **Yes** — 6 (then a separate 4) isolated browser contexts,
  confirmed via the live-incrementing player counter and distinct session state per reload test.
- Did I test selected players, not only spectators? **Yes** — DESCRIBE_IT, PREDICT_THEM, and Bomb
  Protocol all showed correctly-differentiated selected-vs-spectator content live.
- Did I test a Hacker? **Yes** — identified the two real Hackers from their own role-reveal text
  and inspected their hack-window screen directly.
- Did I test Admin? **Partially** — I did not tag which specific player held the Admin role by
  name this run, but since **all six** players showed byte-identical, button-free text during
  `MINIGAME_SELECT`, this is conclusive regardless of which one of them was actually Admin.
- Did I try every minigame? **No.** RATE_IT, DRAW_IT, COMPLETE_IT, and DEFEND_IT did not come up
  via the random selection rule within this run's two rounds. RATE_IT's completeness is confirmed
  from its full source + the pre-existing passing `rate-it-frontend.test.tsx`. DRAW_IT/COMPLETE_IT/
  DEFEND_IT's *absence* of any UI is confirmed with certainty from the static component inventory
  (no files exist), which is a stronger form of evidence than a live click for a *negative* finding
  — but their *server-side* correctness was not independently re-exercised live this audit.
- Did I test Bomb Protocol? **Yes**, live, full cycle including its timeout-driven resolution.
- Did I test Push Button? **No — could not.** No control exists to click; confirmed by its total
  absence across 480 seconds of live play and by a full static trace. This is the finding, not a
  gap in the audit.
- Did I test voting? **No — could not**, same reason (unreachable without a push-button).
- Did I reach a winner? **No.** The 8-minute live run reached `FINAL_DISCUSSION` but the process
  was stopped there by design (time-boxed); reaching `FINAL_RESULTS` would have required
  additionally waiting out the old elimination-vote timers. `FINAL_RESULTS`'s own completeness was
  confirmed statically instead (§4, §14) — it is a placeholder regardless of the path taken there.
- Did I refresh players? **Yes** — 3 player reloads across 3 different phases + 1 TV reload, all in
  a dedicated, isolated reconnect run.
- Did I distinguish server-complete from UI-complete? **Yes**, throughout — every section in this
  report separates the two explicitly.

---

*Screenshots referenced throughout this report are saved under `audit-evidence/` at the repo root
(not committed unless the founder chooses to `git add` them) and, in full, under the temporary
Playwright scratch directory used for this audit. No repository files were modified to conduct
this audit.*

# STOP — no fixes were implemented. Awaiting review of this report and the plan in §18.
