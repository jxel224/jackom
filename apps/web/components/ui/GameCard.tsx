import type { ReactNode } from 'react';
import Link from 'next/link';
import { StickerLabel, type StickerLabelTone } from '../graphics/StickerLabel';
import { buttonClassName } from './button-styles';

export interface GameCardProps {
  title: string;
  description: string;
  /** Short facts row — genre, player count, duration, etc. Only pass what's actually known; never invent numbers. */
  facts?: string[];
  statusLabel: string;
  statusTone?: StickerLabelTone;
  href?: string;
  ctaLabel?: string;
  /** Cover-art visual — an illustration/graphic component, not a photo. Optional so a "coming soon" card can omit it honestly. */
  art?: ReactNode;
  className?: string;
}

/**
 * A game's cover-art-style card — the primary visual product unit on `/games` and the homepage's
 * game preview. Deliberately not a generic dashboard row: big title, one status sticker, an
 * optional CTA, and room for an illustrated `art` slot.
 */
export function GameCard({ title, description, facts = [], statusLabel, statusTone = 'brand', href, ctaLabel, art, className = '' }: GameCardProps) {
  return (
    <article className={['flex flex-col gap-5 overflow-hidden rounded-3xl border-[3px] border-ink bg-surface-1 p-6 shadow-hard sm:flex-row sm:items-center', className].filter(Boolean).join(' ')}>
      {art ? <div className="flex shrink-0 items-center justify-center">{art}</div> : null}

      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-display text-2xl font-extrabold text-ink">{title}</h3>
          <StickerLabel tone={statusTone}>{statusLabel}</StickerLabel>
        </div>
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
      </div>

      {href && ctaLabel ? (
        <Link href={href} className={buttonClassName({ size: 'lg' })}>
          {ctaLabel}
        </Link>
      ) : null}
    </article>
  );
}
