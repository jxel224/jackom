import type { ReactNode } from 'react';
import { StickerLabel } from '../graphics/StickerLabel';

export interface IllustratedEmptyStateProps {
  title: string;
  description: string;
  /** Honest "not built yet" tag — e.g. "قريبًا". Omit for a state that isn't about future functionality. */
  futureLabel?: string;
  icon?: ReactNode;
  className?: string;
}

/**
 * A small illustrated placeholder card for shells with no real functionality yet (account page
 * sections). Never simulates data — always honestly labeled when `futureLabel` is set.
 */
export function IllustratedEmptyState({ title, description, futureLabel, icon, className = '' }: IllustratedEmptyStateProps) {
  return (
    <div className={['flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface-1 p-6 text-center', className].filter(Boolean).join(' ')}>
      {icon ? (
        <div aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-border-strong bg-surface-2 text-ink-muted">
          {icon}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-extrabold text-ink">{title}</h3>
        {futureLabel ? <StickerLabel tone="action">{futureLabel}</StickerLabel> : null}
      </div>
      <p className="text-sm text-ink-muted">{description}</p>
    </div>
  );
}
