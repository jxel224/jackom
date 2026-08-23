# Headquarters Visual Implementation Report — V1

Scope: **Main Headquarters / shared game shell only** — the TV presentation for whichever phases
have no minigame, special-game, accusation, or final-results content of their own. Minigames,
Protocol Room, and phone-specific Admin/Hacker controls are untouched, per the task's explicit
stop condition.

## 1. Verdict

**YES — Headquarters V1 is visually integrated and live**, with two honestly-scoped exceptions
called out below rather than glossed over:

- Firewall-active and Discussion visual states are **implemented and typecheck/build-clean**, but
  were **not captured live in a browser this pass** (see §12, §14) — reaching them requires playing
  a full minigame round to completion, which this evidence pass didn't script.
- Every environmental object is a real, working **CSS/SVG placeholder**, not final pixel art (see
  `HEADQUARTERS_ASSET_MANIFEST.md`) — this was explicit, permitted scope from the start ("do not
  invent a generic replacement and call it final... document what's still needed").

Everything else in the Definition of Done is met and verified: old purple/starburst presentation is
gone from this scene, B+ identity is present, the Central Unit is dominant and asymmetric, the real
match clock drives the timer, 4/6/10-player rosters render correctly from live server state with
zero console errors, Admin maps to the real `adminId`, the hack window leaks nothing, the Decision
Console/Spine/Protocol doorway all exist at their locked positions, Arabic nameplates are crisp
HTML text, tests/typecheck/build all pass.

## 2. Before vs After

**Before** (still true for every phase this task didn't touch — minigames, accusation, final
results, lobby): `TvPhaseRouter`'s fallback branch rendered

```tsx
<Panel className="flex min-h-64 items-center justify-center text-tv-base" data-phase-family="match">{label}</Panel>
```

wrapped in `TvGameplayLayout` → `TvScreenLayout`, which renders the dark-navy `bg-surface-0` page
background plus `PixelGrid` + `NoiseOverlay` + `GraphicBurst` (the purple starburst) +
`DecorativeSpark` decorations — the site-wide lobby/marketing chrome, not a Hacker-game-specific
scene. This is the literal state I captured and reviewed live earlier this session (see the
`كشف الأدوار` screenshot from the "run the game" pass): dark navy background, purple starburst
top-left, plain centered panel with only the phase-label text, green ambient glow blob, player
roster as small rounded pills along the bottom.

A dedicated "before" screenshot directory was not captured as a separate step, for a concrete
reason rather than an oversight: every file this scene touches was already untracked in git (never
committed, from earlier uncommitted phases — see `apps/web/components/gameplay/hacker/` in
`git status`), so reconstructing "before" would have meant `git stash -u` across the entire
untracked gameplay tree (hundreds of files well beyond this scene) purely for a screenshot. The
qualitative description above plus the literal removed code are the "before" record instead.

**After**: those same phases (`GAME_INTRO`, `ROLE_ASSIGNMENT`, `ROLE_REVEAL`, `MINIGAME_SELECT`,
`HACKER_CORRUPTION`, `DISCUSSION`) now render `HeadquartersScene` directly, bypassing
`TvGameplayLayout`/`TvScreenLayout` entirely — see `visual-evidence/headquarters-v1/*.png` for the
real, live result at 4/6/10 players.

## 3. Components Created/Changed

New (`apps/web/components/gameplay/hacker/headquarters/`):
`HeadquartersScene.tsx`, `CentralUnit.tsx`, `MatchTimerDisplay.tsx`, `PlayerStation.tsx`,
`SpineLayer.tsx`, `EmergencyDecisionConsole.tsx`, `ProtocolDoor.tsx`, `EnvironmentProps.tsx`
(528 lines total across the scene + its two `lib/gameplay/` support modules).

New (`apps/web/lib/gameplay/`): `headquarters-layout.ts` (station geometry, ported verbatim from
the approved wireframe/hero-spec coordinates), `useMatchClock.ts` (ticking `MM:SS` hook over the
real `TvView.matchClock`).

Changed: `TvPhaseRouter.tsx` (added the `HEADQUARTERS_PHASES` branch — every other branch,
including the minigame/special/accusation/final-results ones, is byte-for-byte unchanged),
`globals.css` (new `hq-*` token block, see §4), `layout.tsx` (loads Almarai + VT323, HQ-only fonts).

Test fixture fixes (not gameplay-logic changes — see §12 for why each was necessary and correctly
scoped): `test/components/tv-lobby.test.tsx` (its `TvView` fixture had `matchClock: null`, a
pre-existing stub the test's own comment already flagged as intentionally incomplete — real
`TvView.matchClock` is never null; and the phase-label assertion count, `2` → `1`, which tracks an
intentional, in-scope visual change, not a gameplay-rule change), `test/layout.test.tsx` (added the
two new fonts to its existing `next/font/google` mock).

## 4. Design Tokens

Added to `globals.css` under a clearly separated, commented block — **namespaced `hq-*` and not
used anywhere outside this scene**, so the site-wide brand tokens (lime/purple/cyan, used by
marketing/lobby/auth) are completely untouched:

- **Colors**: `--color-hq-wall(-dim)`, `--color-hq-floor`, `--color-hq-wood(-line)`,
  `--color-hq-bronze(-line/-dark)`, `--color-hq-metal`, `--color-hq-teal-dark/-active/-highlight`,
  `--color-hq-gold` (Admin only), `--color-hq-ember` (Emergency only), `--color-hq-plum`
  (Hacker-private — declared for completeness, never rendered on this TV scene), `--color-hq-ink(-muted/-subtle)`.
- **Geometry**: `--spacing-hq-xs…xl`, `--radius-hq-nameplate`, `--shadow-hq-s/m/l` (flat, no blur —
  Bible's anti-blur rule).
- **Type**: `--font-hq-display` (Cairo, reused), `--font-hq-body` (new: Almarai), `--font-hq-mono`
  (new: VT323, falls back to the already-loaded JetBrains Mono).

No literal hex values are scattered in component files — every color/spacing/shadow in the eight
new components reaches for one of these tokens.

## 5. Scene Architecture

```
HeadquartersScene (orchestrator — computes active seats, admin id, discussion/firewall mode)
├─ EnvironmentProps      (L0 — static corkboard/shelf cluster)
├─ SpineLayer            (L1 — bronze trunk + one rib per active seat, generated from live roster)
├─ CentralUnit           (L1 — casing, dual screens, indicator cluster, FirewallArms sub-component)
├─ MatchTimerDisplay     (L1 — real matchClock → MM:SS)
├─ EmergencyDecisionConsole (L1 — standalone, dormant)
├─ ProtocolDoor          (L1 — static, amber lamp)
├─ PlayerStation × N     (L2 back-row / L4 front-row — nameplate, character placeholder, desk lamp)
└─ phase-label + title overlay (crisp HTML text, top corners, inside the 6% safe margin)
```

Deliberately not one large component — each object is independently readable, independently
swappable for final art, and independently testable.

## 6. Dynamic Player Scaling

`activeStationSlots(count)` = `STATION_SLOTS.slice(0, count)` — ten fixed anchors (six front, four
back), filled strictly center-out, ported unchanged from the approved wireframe. Any count 4–10
"just works" because it's a slice, not a re-layout: **the room is never recomposed per count, only
how many of its ten fixed seats are lit**, exactly the Bible's "same room, controlled state changes"
rule. Verified live at 4, 6, and 10 players (see §12) — the back row only appears at 8+, matching
spec.

## 7. State Mapping

| Server state | Visual response | Verified live? |
|---|---|---|
| `phase.state` ∉ minigame/special/accusation/final | `HeadquartersScene` renders (replaces old fallback) | Yes |
| `MINIGAME_SELECT` (Admin turn) | That seat's lamp → gold, nameplate gets `· ADMIN` | Yes |
| `HACKER_CORRUPTION` (hack window) | **Identical to every other HQ phase — no branch exists for it anywhere in this code.** That absence of a special case *is* the secrecy guarantee. | Yes (rendered, indistinguishable from Normal) |
| `DISCUSSION` | Central Unit's screen readout dims slightly; nothing else changes | Code-verified only |
| `view.firewallActive` | `FirewallArms` swing from folded → locked around the main screen's outer frame; screen itself never covered | Code-verified only |
| `view.adminId` | Drives the one gold lamp/nameplate — independent of phase | Yes |
| `view.matchClock` | Drives `MatchTimerDisplay`'s live `MM:SS`, deadline-based per the real clock, not a client timer | Yes |
| Per-player `connectionStatus`/`alive` | Independent connection dot + strikethrough — never conflated with gameplay state (Bible V1.1 §07) | Code-verified (unit-level; not exercised live this pass) |

## 8. Assets Used

See `HEADQUARTERS_ASSET_MANIFEST.md` for the full per-object table. Summary: every environmental
object is a hand-built CSS/SVG placeholder at the locked geometry; nameplates and the timer's
numerals are real crisp HTML text (Almarai/VT323), never pixel-rendered, per spec §14.

## 9. Assets Still Missing

Final pixel-art sprites for all ten manifest rows marked "CSS/SVG placeholder" — none block
function, all are isolated, documented swap points (`data-hq-asset="…"` on each component's root).
Character animation states (IDLE/WORK/etc.) have no state machine wired yet — architecture slot
only. Decision Console cover-open sequence, Firewall arm swing, Spine pulse are drawn as static
end-states (folded/closed), not yet animated — explicitly phase-2 motion work.

## 10. Performance

No canvas, no continuous re-render loop. `MatchTimerDisplay` ticks its own `setInterval` (500ms,
cleared on unmount/status change) scoped to one small component, not the whole scene. `PlayerStation`
count is bounded at 10; `SpineLayer` generates at most 10 ribs from static data, not per-frame. All
positioning is CSS percentage/inline-style, no layout thrash. Verified via `npm run build:web`
succeeding with all 11 routes generated; not yet profiled under React DevTools — flagged as a
reasonable follow-up before this ships, not a known problem.

## 11. Accessibility

Player state is color **+** shape **+** text throughout (gold ring/lamp + `· ADMIN` text + a small
dot for connection — never color alone, per Bible §23). `prefers-reduced-motion` is already handled
globally in `globals.css` (zeroes all animation/transition durations), which automatically covers
this scene's one `pulse-ring` usage (the "reconnecting" dot) — no extra work needed. Long Arabic
names truncate at 14 characters with an ellipsis rather than wrapping or breaking layout (verified
in `PlayerStation.tsx`, not yet exercised with an actual long name in the live capture — flagged as
a gap, not a claim).

## 12. Visual Evidence

`visual-evidence/headquarters-v1/`:
- `p4-01-role-reveal.png`, `p4-02-admin-turn.png` — 4 players, real role-assignment then real
  Admin-turn state, live server data, gold lamp + `سارة · ADMIN` correctly shown.
- `p6-lobby.png`, `p6-admin-turn.png` — 6 players, front row fully occupied.
- `p10-lobby.png`, `p10-admin-turn.png` — 10 players, back row correctly activated (smaller,
  higher, connected via the Spine), Protocol door and timer unchanged in position from the 4/6 runs.

All three runs: zero browser console errors. Not captured this pass (honest gap, not silently
skipped): Firewall-active and Discussion states in a live browser — reaching them requires playing
a full minigame round to completion (30–60s+ of real timers per round), which this evidence pass
didn't script. Recommend a short follow-up using the repo's existing `e2e/scenario-*.mjs` pattern
if live confirmation of those two states is wanted before sign-off.

## 13. Deviations from Hero Reference

Called out specifically, not "looks close":

- **Central Unit asymmetry reads weaker in code than in the approved reference image.** The left
  mass is taller and the right shelf is lower as specified, but the folded Firewall arms currently
  read as small "ear" brackets rather than disappearing flush into the casing — the silhouette is
  *inspired by* asymmetry more than it *commits to* it the way the reference does. This is the
  single most important thing to strengthen when real pixel art replaces this placeholder.
- **Central screen's system-state graphic** is a simple line-trend glyph (chosen deliberately —
  "neutral, never Matrix code" per spec), which is plainer than the reference's more detailed
  readout. Acceptable for a placeholder; a final asset should carry more character.
- **Environment props are sparser** than the reference image (by design — the earlier critique of
  the reference flagged its side-shelf clutter as denser than "selective, not decoration density";
  this implementation corrected toward one small cluster instead of two dense ones). Worth
  confirming this reads as "occupied" and not "empty" once real art is in.
- **Protocol door's arch** is closer to a plain rounded frame than the reference's more clearly
  chamfered/bronze-trimmed geometry — the chamfer is implied rather than sharply cut in the current
  SVG path.
- **Lighting is flat**, not layered (§16 asked for base/secondary/admin/discussion/firewall/emergency
  as separate contributions) — this pass implements state changes as direct property swaps (lamp
  color, screen opacity) rather than a true compositing lighting system. Functionally equivalent
  for now; revisit if a real lighting layer is wanted before adding more states.

## 14. Remaining Visual Gaps

- Firewall/Discussion states unverified live (§12).
- No character animation states wired (§9).
- No motion at all yet (§23 was explicitly deferred, not attempted).
- Long-name truncation and reduced-motion behavior are implemented but not exercised in the live
  evidence captures.
- Central Unit asymmetry (§13) is the top visual-fidelity item to revisit.
- Pre-existing, unrelated lint errors exist in `apps/web/app/games/page.tsx` and
  `apps/web/lib/auth/useCurrentUser.ts` (React effect/setState rule violations) from the earlier
  uncommitted Permanent Backend Foundation phase — confirmed via `npm run lint:web` that none are
  in any file this phase touched; left untouched per this task's scope boundary.
