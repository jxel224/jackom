export type GraphicBurstAccent = 'brand' | 'action' | 'cyan';

export interface GraphicBurstProps {
  size?: number;
  accent?: GraphicBurstAccent;
  className?: string;
}

const ACCENT_VAR: Record<GraphicBurstAccent, string> = {
  brand: 'var(--color-brand)',
  action: 'var(--color-action)',
  cyan: 'var(--color-cyan)',
};

/**
 * An original comic-style "burst" outline (like a starburst behind a headline), inline SVG so it
 * costs nothing to ship and recolors via CSS variables. Purely decorative.
 */
export function GraphicBurst({ size = 220, accent = 'brand', className = '' }: GraphicBurstProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" width={size} height={size} className={className} fill="none">
      <path
        d="M100 4 L112 62 L156 22 L136 78 L196 68 L144 100 L196 132 L136 122 L156 178 L112 138 L100 196 L88 138 L44 178 L64 122 L4 132 L56 100 L4 68 L64 78 L44 22 L88 62 Z"
        stroke={ACCENT_VAR[accent]}
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
