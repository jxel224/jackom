'use client';

import { useEffect, useMemo, useState } from 'react';

export type CountdownState = 'normal' | 'warning' | 'urgent' | 'expired';

export interface CountdownProps {
  deadlineAt: number | null;
  now?: () => number;
  className?: string;
}

export function countdownStateFor(remainingMs: number): CountdownState {
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= 5_000) return 'urgent';
  if (remainingMs <= 15_000) return 'warning';
  return 'normal';
}

export function Countdown({ deadlineAt, now = Date.now, className = '' }: CountdownProps) {
  const [currentTime, setCurrentTime] = useState(() => now());

  useEffect(() => {
    if (deadlineAt === null) return;
    const timer = window.setInterval(() => setCurrentTime(now()), 250);
    return () => window.clearInterval(timer);
  }, [deadlineAt, now]);

  const remainingMs = deadlineAt === null ? null : Math.max(0, deadlineAt - currentTime);
  const seconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const state = useMemo(() => remainingMs === null ? 'normal' : countdownStateFor(remainingMs), [remainingMs]);

  if (deadlineAt === null) return null;
  return (
    <output
      aria-label="الوقت المتبقي"
      data-countdown-state={state}
      className={[
        'font-mono text-2xl font-bold tabular-nums',
        state === 'urgent' || state === 'expired' ? 'text-danger' : state === 'warning' ? 'text-warning' : 'text-cyan',
        className,
      ].filter(Boolean).join(' ')}
    >
      {seconds}
    </output>
  );
}
