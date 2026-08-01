import { DecorativeSpark } from './DecorativeSpark';

export interface HeroIllustrationProps {
  className?: string;
}

/**
 * An original, abstract "one screen + several phones" composition for the homepage hero —
 * geometric shapes and connecting lines, not character art or a skeuomorphic device render (final
 * illustration/character art is explicitly out of scope for this step). Purely decorative.
 */
export function HeroIllustration({ className = '' }: HeroIllustrationProps) {
  return (
    <div aria-hidden="true" className={['relative', className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 320 220" width="100%" height="100%" fill="none">
        {/* the shared TV/screen */}
        <rect x="70" y="16" width="180" height="112" rx="14" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="3" />
        <rect x="86" y="32" width="148" height="80" rx="8" fill="var(--color-surface-1)" />
        <circle cx="120" cy="72" r="10" fill="var(--color-brand)" />
        <circle cx="160" cy="72" r="10" fill="var(--color-action)" />
        <circle cx="200" cy="72" r="10" fill="var(--color-cyan)" />
        <rect x="140" y="128" width="40" height="10" rx="3" fill="var(--color-ink)" />

        {/* connecting lines from the screen to each phone */}
        <path d="M96 140 C 70 160, 50 168, 40 190" stroke="var(--color-ink-muted)" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M160 140 L160 188" stroke="var(--color-ink-muted)" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
        <path d="M224 140 C 250 160, 270 168, 280 190" stroke="var(--color-ink-muted)" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />

        {/* three phones, at slightly different heights/rotations for controlled asymmetry */}
        <g transform="rotate(-8 40 200)">
          <rect x="24" y="176" width="32" height="52" rx="7" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="2.5" />
        </g>
        <g>
          <rect x="144" y="188" width="32" height="52" rx="7" fill="var(--color-surface-2)" stroke="var(--color-brand)" strokeWidth="2.5" />
        </g>
        <g transform="rotate(7 280 200)">
          <rect x="264" y="176" width="32" height="52" rx="7" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="2.5" />
        </g>
      </svg>

      <DecorativeSpark size={20} accent="brand" className="absolute -top-2 left-4" />
      <DecorativeSpark size={16} accent="cyan" className="absolute right-6 top-10" />
      <DecorativeSpark size={14} accent="action" className="absolute bottom-2 left-1/2" />
    </div>
  );
}
