export interface HackerFigureProps {
  size?: number;
  className?: string;
}

/**
 * An original, abstract illustrated scene for the hacker game's cover art — a hooded silhouette at
 * a glowing terminal, built entirely from flat geometric shapes (no photographic/reference
 * artwork, no realistic anatomy). Meant to give the game card real cover-art presence instead of a
 * small supporting icon. Purely decorative (`aria-hidden`).
 */
export function HackerFigure({ size = 160, className = '' }: HackerFigureProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" width={size} height={size} className={className} fill="none">
      <defs>
        <pattern id="hacker-scan" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="3" fill="var(--color-cyan)" opacity="0.08" />
        </pattern>
      </defs>

      {/* backdrop panel + scanline texture */}
      <rect x="4" y="4" width="192" height="192" rx="20" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="3" />
      <rect x="4" y="4" width="192" height="192" rx="20" fill="url(#hacker-scan)" />

      {/* terminal window behind the figure */}
      <g transform="translate(108 34)">
        <rect width="70" height="52" rx="8" fill="var(--color-surface-1)" stroke="var(--color-brand)" strokeWidth="2.5" />
        <circle cx="10" cy="12" r="3" fill="var(--color-action)" />
        <rect x="8" y="24" width="46" height="5" rx="2" fill="var(--color-brand)" opacity="0.8" />
        <rect x="8" y="34" width="30" height="5" rx="2" fill="var(--color-cyan)" opacity="0.7" />
        <rect x="8" y="44" width="38" height="4" rx="2" fill="var(--color-ink-muted)" opacity="0.5" />
      </g>

      {/* hooded figure — shoulders + hood, entirely flat geometric shapes */}
      <path
        d="M40 176 C40 132 60 108 100 108 C140 108 160 132 160 176 Z"
        fill="var(--color-surface-0)"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
      />
      <path
        d="M68 112 C68 78 82 56 100 56 C118 56 132 78 132 112 C132 128 118 136 100 136 C82 136 68 128 68 112 Z"
        fill="var(--color-surface-0)"
        stroke="var(--color-ink)"
        strokeWidth="3.5"
      />
      {/* face shadow + glowing eyes for a hint of personality without literal anatomy */}
      <path d="M78 108 C78 92 87 80 100 80 C113 80 122 92 122 108 C122 120 112 126 100 126 C88 126 78 120 78 108 Z" fill="var(--color-surface-1)" />
      <circle cx="90" cy="106" r="4.5" fill="var(--color-brand)" />
      <circle cx="110" cy="106" r="4.5" fill="var(--color-brand)" />

      {/* a stray "corruption" spark near the hand */}
      <path d="M46 150 L54 140 L50 150 L58 150 L48 162 L52 152 Z" fill="var(--color-action)" />
    </svg>
  );
}
