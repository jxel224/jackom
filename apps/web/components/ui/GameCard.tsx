import type { ReactNode } from 'react';
import Link from 'next/link';
import { StickerLabel, type StickerLabelTone } from '../graphics/StickerLabel';
import { buttonClassName } from './button-styles';
import { Button } from './Button';

export interface GameCardProps {
  title: string;
  description: string;
  /** Short facts row — genre, player count, duration, etc. Only pass what's actually known; never invent numbers. */
  facts?: string[];
  statusLabel: string;
  statusTone?: StickerLabelTone;
  href?: string;
  ctaLabel?: string;
  /** Permanent Business Backend: an action CTA (e.g. "Create Room", which must call the real authorized API) instead of a plain navigation link. Takes precedence over `href` when both are given. */
  onCtaClick?: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  /** Cover-art visual — an illustration/graphic component, not a photo. Optional so a "coming soon" card can omit it honestly. */
  art?: ReactNode;
  className?: string;
}

/**
 * A game's cover-art-style card — the primary visual product unit on `/games` and the homepage's
 * game preview. Deliberately not a generic dashboard row: a textured art panel with an overlapping
 * status sticker, a big display-font title, and an optional CTA — built to read as game cover art,
 * not a catalog list item.
 */
export function GameCard({
  title,
  description,
  facts = [],
  statusLabel,
  statusTone = 'brand',
  href,
  ctaLabel,
  onCtaClick,
  ctaLoading = false,
  ctaDisabled = false,
  art,
  className = '',
}: GameCardProps) {
  return (
    <article className={['relative flex flex-col gap-6 overflow-visible rounded-3xl border-[3px] border-ink bg-surface-1 p-6 shadow-hard sm:flex-row sm:items-stretch sm:gap-8 sm:p-8', className].filter(Boolean).join(' ')}>
      {art ? (
        <div className="relative flex shrink-0 items-center justify-center self-center sm:self-stretch">
          <div className="pointer-events-none absolute inset-0 -z-10 rotate-3 rounded-3xl border-2 border-border-strong bg-halftone" />
          <div className="flex items-center justify-center rounded-3xl border-2 border-ink bg-surface-2 p-3 shadow-hard-sm">{art}</div>
          <StickerLabel tone={statusTone} className="absolute -top-4 -right-4">
            {statusLabel}
          </StickerLabel>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col justify-center gap-3">
        <h3 className="font-display text-3xl font-extrabold leading-tight text-ink sm:text-4xl">{title}</h3>
        <p className="text-ink-muted">{description}</p>
        {facts.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-sm font-bold text-ink-subtle">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full border border-border-strong px-3 py-1">
                {fact}
              </li>
            ))}
          </ul>
        ) : null}
        {onCtaClick && ctaLabel ? (
          <Button type="button" size="lg" className="mt-2 self-start" onClick={onCtaClick} loading={ctaLoading} disabled={ctaDisabled} fullWidth={false}>
            {ctaLabel}
          </Button>
        ) : href && ctaLabel ? (
          <Link href={href} className={[buttonClassName({ size: 'lg' }), 'mt-2 self-start'].join(' ')}>
            {ctaLabel}
          </Link>
        ) : null}
      </div>

      {!art && statusLabel ? (
        <StickerLabel tone={statusTone} className="absolute -top-3 -right-3">
          {statusLabel}
        </StickerLabel>
      ) : null}
    </article>
  );
}
