import type { ReactNode } from 'react';

export type StickerLabelTone = 'brand' | 'action' | 'cyan' | 'ink';

export interface StickerLabelProps {
  children: ReactNode;
  tone?: StickerLabelTone;
  /** Slight rotation for the "stuck-on sticker" feel — set to `false` for a straight label (e.g. inside dense layouts). */
  tilt?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<StickerLabelTone, string> = {
  brand: 'bg-brand text-ink-on-accent',
  action: 'bg-action text-white',
  cyan: 'bg-cyan text-ink-on-accent',
  ink: 'bg-ink text-surface-0',
};

/**
 * A small rotated "sticker" badge — thick outline + hard shadow, used for playful tags like
 * "قريبًا"/"متاحة" on game/account cards. Purely presentational; callers still own the surrounding
 * accessible text (this never replaces a StatusBadge's live-region semantics).
 */
export function StickerLabel({ children, tone = 'brand', tilt = true, className = '' }: StickerLabelProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-lg border-2 border-ink px-2.5 py-1 text-xs font-extrabold shadow-hard-sm',
        tilt ? '-rotate-3' : '',
        TONE_CLASSES[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
