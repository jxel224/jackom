# Headquarters Asset Manifest — V1

Status of every visual asset the Headquarters scene (`apps/web/components/gameplay/hacker/headquarters/`)
needs, per `HEADQUARTERS_HERO_PRODUCTION_SPEC_V1` and this phase's `apps/web/lib/gameplay/headquarters-layout.ts`.

**Every row below marked "CSS/SVG placeholder" is real, working, committed-to-the-repo code — not
a stub or a TODO — implemented at the exact locked geometry/position from the production spec, with
a clearly isolated component boundary (one file per object) so a final pixel-art asset can be
dropped in later without touching layout, state-wiring, or any other component.** This is the
"asset boundary" §5/§21 of the implementation task asked for, not a placeholder-and-forget.

| Asset | Purpose | Logical position (spec) | State variants | Layer | Reusable? | Available now? | Current form |
|---|---|---|---|---|---|---|---|
| `central-unit-casing` | Bronze structural body, asymmetric silhouette | Rear-middle, locked box | static | L1 | 1× only | CSS/SVG placeholder | `CentralUnit.tsx` |
| `central-unit-main-screen` | Dominant display, offset left-of-center | Inside unit box | normal / discussion (dim) / firewallActive | L1 | 1× only | CSS/SVG placeholder | `CentralUnit.tsx` → `CentralScreenReadout` |
| `central-unit-secondary-screens` | Two smaller support readouts | Inside unit box, lower-right shelf | dormant only (this phase) | L1 | 1× only | CSS/SVG placeholder | `CentralUnit.tsx` |
| `central-unit-indicator-cluster` | System-health pips (NOT the Firewall lock indicator) | Inside unit box | static (teal-active) | L1 | 1× only | CSS/SVG placeholder | `CentralUnit.tsx` |
| `firewall-arm-left` / `firewall-arm-right` | Locking arms integrated into the Unit's frame | Attached to unit sides | folded / locked | L1 | 1× each | CSS/SVG placeholder, 2-state | `CentralUnit.tsx` → `FirewallArms` |
| `timer-module` | Remote bronze/teal readout, tethered to the Unit | Locked top-center UX slot | normal / urgent (<60s) | L1 | 1× only | CSS/SVG placeholder | `MatchTimerDisplay.tsx` |
| `decision-console-base` | Waist-height bronze pedestal | Locked lower-center box | static | L1 | 1× only | CSS/SVG placeholder | `EmergencyDecisionConsole.tsx` |
| `decision-console-cover` | Protective cover | Console box | closed only (open/press = future motion work, §23) | L1 | 1× only | **Not implemented — dormant-closed only** | `EmergencyDecisionConsole.tsx` |
| `decision-console-lamp` | Dormant/active indicator | Console box | dormant / active | L1 | 1× only | CSS/SVG placeholder | `EmergencyDecisionConsole.tsx` |
| `protocol-door` | Restricted doorway, chamfered bronze frame | Locked back-right box | closed / special-event-lit | L1 | 1× only | CSS/SVG placeholder; only `active=false` is wired to real state | `ProtocolDoor.tsx` |
| `spine-trunk` | Vertical bronze conduit, Console↔Unit | Center lane (no station sits on it) | dormant / pulse (unused yet) | L1 | 1× only | CSS/SVG placeholder | `SpineLayer.tsx` |
| `spine-rib` | Per-station branch off the trunk | Trunk → each active seat | n/a | L1 | ×N active seats | CSS/SVG placeholder, generated per player count | `SpineLayer.tsx` |
| `station-front` | Front-row desk + cable stub + lamp | 6 fixed front anchors | idle / admin (gold lamp) | L4 | ×6 max | CSS/SVG placeholder | `PlayerStation.tsx` (`row="front"`) |
| `station-back` | Back-row desk, reduced scale/detail | 4 fixed back anchors | idle / admin | L2 | ×4 max | CSS/SVG placeholder | `PlayerStation.tsx` (`row="back"`) |
| `character-placeholder` | Seated avatar | On each active station | idle only (IDLE/WORK/LOOK/NERVOUS/SHOCK/CELEBRATE/FAILURE **not implemented**) | L2/L4 | ×N active seats | **Placeholder only** — a colored circle with the player's first letter | `PlayerStation.tsx` |
| `environment-props-cluster` | Corkboard/shelf, back-left | Fixed decorative zone | static | L0 | 1× | CSS/SVG placeholder, deliberately sparse (one cluster, not two) | `EnvironmentProps.tsx` |
| Arabic nameplate | Player name + connection dot + Admin mark | Beneath each station | connected / afk / disconnected × admin/non-admin | UI overlay | ×N | **Real** — crisp HTML/Almarai text, not pixel-rendered | `PlayerStation.tsx` |
| Match-clock numerals | "MM:SS" | Inside timer module | normal / urgent | UI overlay | 1× | **Real** — crisp VT323 text, not pixel-rendered | `MatchTimerDisplay.tsx` |

## What "CSS/SVG placeholder" honestly means

These are hand-built vector shapes matching the locked geometry, material palette (bronze/teal/gold/
ember tokens), and asymmetric-silhouette rule — not final pixel art, not a generic swap-in, and not
a filtered photo/vector-pretending-to-be-pixel-art. They prove the architecture and composition are
correct and let the scene ship functional today. Swapping in real pixel-art sprites later is a
per-component asset swap, not a re-architecture — see each component's `data-hq-asset="…"` attribute,
which marks the exact swap boundary.

## Explicitly not started this phase (by scope, not oversight)

- Character animation states (IDLE/WORK/LOOK/NERVOUS/SHOCK/CELEBRATE/FAILURE) — architecture slot
  exists (one component per station), no state machine wired yet.
- Decision Console open-cover / press sequence, Firewall arm swing animation, Spine pulse — motion
  work is explicitly phase 2 (§23 of the implementation brief).
- Protocol Room interior — door object only, per scope.
- Sound.
