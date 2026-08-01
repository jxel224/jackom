export type DecorativeSparkAccent = 'brand' | 'action' | 'cyan' | 'ink';

export interface DecorativeSparkProps {
  size?: number;
  accent?: DecorativeSparkAccent;
  className?: string;
}

const ACCENT_CLASSES: Record<DecorativeSparkAccent, string> = {
  brand: 'text-brand',
  action: 'text-action',
  cyan: 'text-cyan',
  ink: 'text-ink',
};

/**
 * A small four-point sparkle/star, scattered as loose decoration around hero art and empty
 * states. Inline SVG using `currentColor` so callers tint it via `ACCENT_CLASSES`/className.
 */
export function DecorativeSpark({ size = 24, accent = 'brand', className = '' }: DecorativeSparkProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} className={[ACCENT_CLASSES[accent], className].filter(Boolean).join(' ')} fill="currentColor">
      <path d="M12 0 L14.2 9.8 L24 12 L14.2 14.2 L12 24 L9.8 14.2 L0 12 L9.8 9.8 Z" />
    </svg>
  );
}
