export interface NoiseOverlayProps {
  className?: string;
}

/**
 * Full-bleed film-grain texture (CSS-only, `bg-grain` from `app/globals.css` — a tiny inline SVG
 * feTurbulence data URI, no image asset). Purely decorative: `aria-hidden`, `pointer-events-none`,
 * very low opacity so it reads as texture, not noise that fights with content contrast.
 */
export function NoiseOverlay({ className = '' }: NoiseOverlayProps) {
  return (
    <div
      aria-hidden="true"
      className={['pointer-events-none absolute inset-0 bg-grain opacity-[0.05] mix-blend-overlay', className].filter(Boolean).join(' ')}
    />
  );
}
