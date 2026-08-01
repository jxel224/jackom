# Jackom Design System

Written during **Development Step 8A** (visual identity + product UX). Covers brand personality, the color/typography system, the graphic motif library, and the rules that keep TV/mobile/motion/accessibility consistent as new screens get built. Source of truth for values lives in `apps/web/app/globals.css`'s `@theme` block — this document explains the *intent* behind those values, not a duplicate copy of them.

## Brand personality

"افتح الشاشة، اجمع أصحابك، وابدأ اللعب فورًا." Jackom is confident and playful, not technical — a modern Arabic party-game platform: bold, slightly chaotic in its decoration, premium but never corporate. It should never read as a banking app, a cybersecurity terminal, a generic AI landing page, a children's educational site, or a copy of Jackbox — see `IMPLEMENTATION_PROGRESS.md`'s Step 8A section for the full "must not feel like" list this was designed against.

Primary experience the whole visual system serves: host creates the room → room appears on TV → players join with phones → everyone plays together. Every screen's hierarchy should make that flow obvious before any copy explains it.

## Color system

Defined once as Tailwind v4 `@theme` tokens in `app/globals.css`; components consume them as ordinary utilities (`bg-brand`, `text-ink-muted`, etc.) — never hardcode a hex value in a component.

| Token | Value | Role |
|---|---|---|
| `surface-0` / `surface-1` / `surface-2` | `#0A0A14` / `#14121F` / `#1E1B2E` | page background → panel → raised/hover |
| `ink` / `ink-muted` / `ink-subtle` | `#F8F5EC` / `#A8A2C0` / `#726C8C` | primary / secondary / tertiary text |
| `brand` / `brand-strong` | `#C6FF3D` / `#A6E01C` | **primary/electric accent** — focus rings, glow, primary CTAs, eyebrow labels |
| `action` / `action-strong` | `#9D5CFF` / `#8340F0` | **secondary accent** — decorative emphasis, secondary stickers |
| `cyan` / `cyan-strong` | `#3CE7E1` / `#20BFB9` | **supporting accent** — "in progress/tech" status, connection pulses |
| `ink-on-accent` | `#0A0A14` | dark text for content sitting on a bright accent (e.g. the lime primary button) |
| `success` / `warning` / `danger` | `#4ADE80` / `#FFC93C` / `#F5304F` | status semantics — deliberately distinct from the decorative accents above so "connected"/"error" never blends into brand color |
| `border` / `border-strong` | `#2A263D` / `#3A3452` | hairline / emphasized borders |

**Rule: one dominant + one supporting accent per screen.** Don't use lime, purple, and cyan all competing for attention on the same view — e.g. the TV lobby leans lime (room code, primary action), the account page's placeholders lean purple (StickerLabel "قريبًا"), status/connection reads lean cyan/success/danger by semantic meaning, never by decoration.

## Typography

- **Cairo** (`--font-sans`, unchanged from Step 6) — body text, form controls, everyday UI.
- **Baloo Bhaijaan 2** (`--font-display`) — bold, rounded Arabic display font for large headings only (hero H1, every `SectionTitle`). Never used for body copy or controls.
- **JetBrains Mono** (`--font-mono`) — Latin-only, used narrowly for room codes (`RoomCodeDisplay`/`RoomCodeInput`) and the nav wordmark's sticker — a small deliberate dose of "tech/hacker" flavor, not a body font.

Room codes stay Latin, uppercase, `dir="ltr"`, large, and monospaced even inside the surrounding RTL interface — unchanged from Step 6/7B, just visually bolder now (thicker tile borders, hard shadow, lime text).

## Graphic motif library (`apps/web/components/graphics/`)

All presentational, `aria-hidden="true"` where decorative, inline SVG/CSS only (no image assets), and every animated one is either `motion-safe:` gated or covered by the existing global `prefers-reduced-motion` block in `globals.css`.

| Component | Use |
|---|---|
| `NoiseOverlay` | Full-bleed film-grain texture (`bg-grain`), very low opacity — TV/hero backgrounds only. |
| `PixelGrid` | Decorative dot-grid background layer, never behind body text directly. |
| `GlitchFrame` | Comic-panel thick border + hard offset shadow — reserve for the ONE focal element per screen (TV room code). |
| `StickerLabel` | Small rotated "sticker" badge (قريبًا/متاحة tags) — thick outline + hard shadow. |
| `GraphicBurst` | Starburst outline behind a headline — decorative only. |
| `ComicArrow` | Hand-drawn curved arrow connecting "how it works" steps. |
| `DecorativeSpark` | Small four-point sparkle, scattered loosely around hero art/empty states. |
| `ConnectionPulse` | Dot + expanding ring reinforcing connection liveness — always sits *next to* a `StatusBadge`, never replaces its accessible name/live region. |
| `HeroIllustration` | Original abstract "screen + phones" composition for the homepage hero — geometric, not character art. |

`.bg-pixel-grid` / `.bg-halftone` / `.bg-grain` utility classes and the `pulse-ring`/`float-slow` keyframes live in `globals.css`'s `@layer utilities`.

## TV rules

- Distance-legible: `text-tv-*` scale, generous spacing, one focal action.
- The room code + QR are the dominant visual element — never buried under decoration.
- Connection status must remain understandable from text alone (see a11y rules) even with `ConnectionPulse` alongside it.
- Decorative layers (`PixelGrid`, `NoiseOverlay`, the ambient glow) sit behind content at low opacity and must never reduce roster/room-code contrast.
- No site navigation on the TV screen — it's a display surface, not a browsing surface.

## Mobile-controller rules

- Portrait-first, safe-area-aware (`PlayerScreenLayout` already handles `env(safe-area-inset-*)`).
- Large touch targets (`--spacing-control` / `h-control`, 48px minimum).
- One obvious primary action at a time; sticky footer only when a control needs to stay in thumb reach.
- **The join flow (`/join`, `/join/[roomCode]`, and the live `PlayerLobby` it hands off to) intentionally has no `SiteNav`** — it's a focused, distraction-free flow from room-code entry through waiting-for-host, matching the brief's "no unnecessary navigation" requirement. `SiteNav` appears only on `/`, `/games`, and `/account`.
- "Offline" is not a separate invented state: a real network drop surfaces through the existing `disconnected`/`reconnecting`/`failed` `ConnectionState` values (see `lib/realtime/connection-status.ts`) — this UI restyles those, it does not add a new authoritative state.

## Motion rules

- CSS-first (keyframes in `globals.css`); no animation library was added.
- The global `@media (prefers-reduced-motion: reduce)` block already forces every animation/transition near-zero duration — new animated pieces (`ConnectionPulse`'s ring) additionally use `motion-safe:` so they simply don't animate at all under reduced motion, rather than relying solely on the blanket override.
- No expensive canvas/video backgrounds; no motion on functional controls (buttons only get a small, intentional press effect, never idle movement).

## Accessibility rules

- Status is never color-only: `StatusBadge` renders a small shape marker (dot/triangle/x) per tone in addition to color, and `ConnectionPulse` is always supplementary to a `StatusBadge`'s text + live region, never the sole carrier of state.
- Every decorative graphic is `aria-hidden="true"`.
- Focus-visible ring uses the primary lime accent (`--color-brand`) — kept from Step 6, still RTL-safe (outlines aren't directional).
- `ink-on-accent` exists specifically so text on the bright lime button/badges keeps real contrast instead of reusing the default off-white `ink`.
