/**
 * Centralized design-system constants that CANNOT live purely in CSS (JS-side timing, documented
 * scale values referenced by more than one component). The visual tokens themselves (colors, TV-safe
 * font sizes, radii, shadows, the "control" spacing size) are defined once in `app/globals.css`
 * under Tailwind's `@theme` block and consumed via ordinary Tailwind utility classes
 * (`bg-surface-1`, `text-tv-lg`, `shadow-glow`, `h-control`, etc.) — components should reach for
 * those utilities rather than hardcoding hex/px values inline.
 */

/** Motion durations, in ms. Mirrors Tailwind's built-in `duration-*` utilities — use `duration-150`
 * for micro-interactions (hover/press), `duration-200` for the default, `duration-300` for larger
 * transitions (modals, page-level reveals). Kept here too so non-Tailwind timing (e.g. an
 * aria-live announcement delay) can reference the same numbers instead of a magic number. */
export const MOTION_DURATION_MS = {
  fast: 150,
  base: 200,
  slow: 300,
} as const;

/** WCAG 2.5.5-friendly minimum touch target for phone controllers. Matches the `control` spacing
 * token in globals.css (`h-control`, `min-h-control`, `w-control`). */
export const MOBILE_MIN_TOUCH_TARGET_PX = 48;
