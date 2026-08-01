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
  info: 'bg-cyan/15 text-cyan',
};

// A shape per tone, not just a color, so the status reads even without color vision — a filled
// dot for neutral/info/success, a triangle for warning, an "x" mark for danger.
const TONE_MARKERS: Record<StatusBadgeTone, ReactNode> = {
  neutral: (
    <svg aria-hidden="true" viewBox="0 0 8 8" width={8} height={8}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg aria-hidden="true" viewBox="0 0 8 8" width={8} height={8}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  ),
  success: (
    <svg aria-hidden="true" viewBox="0 0 8 8" width={8} height={8}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg aria-hidden="true" viewBox="0 0 8 8" width={8} height={8}>
      <path d="M4 0 L8 8 L0 8 Z" fill="currentColor" />
    </svg>
  ),
  danger: (
    <svg aria-hidden="true" viewBox="0 0 8 8" width={8} height={8} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 1 L7 7 M7 1 L1 7" />
    </svg>
  ),
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
      {TONE_MARKERS[tone]}
      {children}
    </span>
  );
}
