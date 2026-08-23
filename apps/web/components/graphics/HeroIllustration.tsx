import { DecorativeSpark } from './DecorativeSpark';

export interface HeroIllustrationProps {
  className?: string;
}

/**
 * An original, abstract "one shared screen + several phones" poster illustration for the homepage
 * hero — geometric shapes, halftone texture, and a comic burst, not character art or a
 * skeuomorphic device render. Meant to read as a big, bold graphic, not a small supporting icon —
 * scale it large and let it overlap surrounding text/decoration. Purely decorative (`aria-hidden`).
 */
export function HeroIllustration({ className = '' }: HeroIllustrationProps) {
  return (
    <div aria-hidden="true" className={['relative', className].filter(Boolean).join(' ')}>
      <svg viewBox="0 0 380 320" width="100%" height="100%" fill="none">
        <defs>
          <pattern id="hero-halftone" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.6" fill="var(--color-action)" opacity="0.35" />
          </pattern>
        </defs>

        {/* halftone texture cluster, behind everything */}
        <circle cx="120" cy="120" r="150" fill="url(#hero-halftone)" />

        {/* big comic burst behind the TV for poster impact */}
        <path
          d="M190 18 L204 76 L256 40 L232 96 L300 88 L244 122 L300 156 L232 148 L256 204 L204 168 L190 226 L176 168 L124 204 L148 148 L80 156 L136 122 L80 88 L148 96 L124 40 L176 76 Z"
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="3"
          opacity="0.6"
        />

        {/* the shared TV/screen — bigger bezel, a small "roster" of player tiles on-screen */}
        <g transform="rotate(-2 190 110)">
          <rect x="60" y="24" width="260" height="160" rx="18" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="4" />
          <rect x="80" y="44" width="220" height="112" rx="10" fill="var(--color-surface-1)" />
          {/* aerial/signal mark, top corner — a small tech flourish */}
          <path d="M280 30 L292 12 M296 32 L312 18" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" />

          {/* on-screen player roster — a small grid of tiles, not literal faces */}
          <rect x="98" y="60" width="36" height="36" rx="8" fill="var(--color-brand)" />
          <rect x="146" y="60" width="36" height="36" rx="8" fill="var(--color-action)" />
          <rect x="194" y="60" width="36" height="36" rx="8" fill="var(--color-cyan)" />
          <rect x="242" y="60" width="36" height="36" rx="8" fill="var(--color-surface-2)" stroke="var(--color-ink-muted)" strokeWidth="2" />
          <rect x="98" y="104" width="80" height="12" rx="4" fill="var(--color-ink-muted)" opacity="0.6" />
          <rect x="188" y="104" width="56" height="12" rx="4" fill="var(--color-ink-muted)" opacity="0.4" />

          <rect x="180" y="192" width="60" height="14" rx="5" fill="var(--color-ink)" />
        </g>

        {/* lightning-bolt connectors from the screen down to each phone, one per accent */}
        <path d="M120 210 L104 234 L118 236 L92 268" stroke="var(--color-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M198 214 L188 240 L204 242 L192 274" stroke="var(--color-action)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M272 210 L288 234 L274 236 L300 268" stroke="var(--color-cyan)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

        {/* three phones, deliberately asymmetric in size/rotation/height */}
        <g transform="rotate(-11 78 280)">
          <rect x="52" y="248" width="52" height="82" rx="11" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="3" />
          <rect x="62" y="260" width="32" height="46" rx="4" fill="var(--color-brand)" opacity="0.3" />
          <circle cx="78" cy="316" r="4" fill="var(--color-ink-muted)" />
        </g>
        <g transform="rotate(3 190 292)">
          <rect x="162" y="256" width="58" height="92" rx="12" fill="var(--color-surface-2)" stroke="var(--color-brand)" strokeWidth="3.5" />
          <rect x="173" y="269" width="36" height="52" rx="5" fill="var(--color-action)" opacity="0.35" />
          <circle cx="191" cy="336" r="14" fill="none" stroke="var(--color-brand)" strokeWidth="2.5" opacity="0.6" />
          <circle cx="191" cy="336" r="5" fill="var(--color-brand)" />
        </g>
        <g transform="rotate(10 306 278)">
          <rect x="280" y="246" width="52" height="82" rx="11" fill="var(--color-surface-2)" stroke="var(--color-ink)" strokeWidth="3" />
          <rect x="290" y="258" width="32" height="46" rx="4" fill="var(--color-cyan)" opacity="0.3" />
          <path d="M298 288 L305 296 L318 280" stroke="var(--color-cyan)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      </svg>

      <DecorativeSpark size={26} accent="brand" className="absolute -top-3 -left-2" />
      <DecorativeSpark size={18} accent="cyan" className="absolute right-2 top-6" />
      <DecorativeSpark size={16} accent="action" className="absolute bottom-6 left-1/3" />
      <DecorativeSpark size={14} accent="ink" className="absolute -right-3 bottom-16" />
    </div>
  );
}
