'use client';

import { useEffect, useState } from 'react';
import type { MatchClock } from '../shared';

/**
 * Live "MM:SS" reading of the real, server-authoritative match clock (`TvView.matchClock`) —
 * deadline-based per GAMEPLAY_RULES_V1.md §6, never a client-owned countdown. This hook only
 * *displays* `remainingMs`/`deadlineAt`; it never computes match-clock business logic itself.
 */
export function useMatchClock(matchClock: MatchClock, now: () => number = Date.now) {
  const [tick, setTick] = useState(() => now());

  useEffect(() => {
    if (matchClock.status !== 'running' || matchClock.deadlineAt === null) return;
    const id = window.setInterval(() => setTick(now()), 500);
    return () => window.clearInterval(id);
  }, [matchClock.status, matchClock.deadlineAt, now]);

  const remainingMs =
    matchClock.status === 'running' && matchClock.deadlineAt !== null
      ? Math.max(0, matchClock.deadlineAt - tick)
      : Math.max(0, matchClock.remainingMs);

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');

  return { label: `${mm}:${ss}`, remainingMs, isRunning: matchClock.status === 'running' };
}
