export type ConnectionPulseTone = 'success' | 'warning' | 'danger' | 'cyan' | 'neutral';

export interface ConnectionPulseProps {
  tone?: ConnectionPulseTone;
  /** Only actively-connecting/connected states get the expanding ring — a failed/idle state is a plain still dot. */
  animated?: boolean;
  className?: string;
}

const DOT_CLASSES: Record<ConnectionPulseTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  cyan: 'bg-cyan',
  neutral: 'bg-ink-subtle',
};

/**
 * A small dot + expanding ring, a purely visual reinforcement of connection liveness sitting next
 * to a `StatusBadge` (which already carries the accessible name/live region) — never the sole
 * carrier of status information, so this is always `aria-hidden`.
 */
export function ConnectionPulse({ tone = 'neutral', animated = false, className = '' }: ConnectionPulseProps) {
  return (
    <span aria-hidden="true" className={['relative inline-flex h-2.5 w-2.5', className].filter(Boolean).join(' ')}>
      {animated ? <span className={['absolute inset-0 rounded-full motion-safe:animate-[pulse-ring_1.8s_ease-out_infinite]', DOT_CLASSES[tone]].join(' ')} /> : null}
      <span className={['relative inline-block h-2.5 w-2.5 rounded-full', DOT_CLASSES[tone]].join(' ')} />
    </span>
  );
}
