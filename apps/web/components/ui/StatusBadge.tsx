import type { ReactNode } from 'react';

export type StatusBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusBadgeProps {
  children: ReactNode;
  tone?: StatusBadgeTone;
  /** Set for statuses that change on their own (e.g. connection status) so assistive tech announces updates. */
  live?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<StatusBadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-brand/15 text-brand',
};

/** A small pill for short status text (connection state, round number, etc.) — not interactive, so it renders as a `<span>`. */
export function StatusBadge({ children, tone = 'neutral', live = false, className = '' }: StatusBadgeProps) {
  return (
    <span
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      className={['inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold', TONE_CLASSES[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
