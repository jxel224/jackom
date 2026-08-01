import type { CSSProperties } from 'react';

export interface PixelGridProps {
  className?: string;
  /** CSS color for the dots — defaults to the current `ink` token at low opacity via `bg-pixel-grid`. */
  color?: string;
  /** Spacing between dots, in px. */
  size?: number;
}

/**
 * A decorative dot-grid texture (CSS `radial-gradient`, no image asset — see `.bg-pixel-grid` in
 * `app/globals.css`). Used as a background layer behind hero/TV content, never behind body text
 * directly. Purely decorative: `aria-hidden`, `pointer-events-none`.
 */
export function PixelGrid({ className = '', color, size }: PixelGridProps) {
  const style = {
    ...(color ? { '--pixel-grid-color': color } : {}),
    ...(size ? { '--pixel-grid-size': `${size}px` } : {}),
  } as CSSProperties;

  return <div aria-hidden="true" className={['pointer-events-none absolute inset-0 bg-pixel-grid', className].filter(Boolean).join(' ')} style={style} />;
}
