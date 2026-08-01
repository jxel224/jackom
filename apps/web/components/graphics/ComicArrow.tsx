export interface ComicArrowProps {
  /** RTL-aware: 'forward' points toward reading-start (left in RTL), 'down' curves downward. */
  direction?: 'forward' | 'down';
  className?: string;
}

/**
 * A hand-drawn-style curved arrow, used to visually connect "how it works" steps. Inline SVG,
 * purely decorative.
 */
export function ComicArrow({ direction = 'forward', className = '' }: ComicArrowProps) {
  const d = direction === 'down' ? 'M20 6 C 10 30, 30 50, 18 74' : 'M6 40 C 30 20, 60 60, 94 34';
  const markerPath = direction === 'down' ? 'M10 66 L18 78 L26 66' : 'M84 22 L96 34 L84 46';

  return (
    <svg aria-hidden="true" viewBox={direction === 'down' ? '0 0 40 80' : '0 0 100 60'} width={direction === 'down' ? 40 : 100} height={direction === 'down' ? 80 : 60} className={className} fill="none">
      <path d={d} stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" />
      <path d={markerPath} stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
