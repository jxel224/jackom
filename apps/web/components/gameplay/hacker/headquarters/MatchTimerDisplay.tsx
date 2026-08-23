'use client';

import type { MatchClock } from '../../../../lib/shared';
import { useMatchClock } from '../../../../lib/gameplay/useMatchClock';
import { TIMER_BOX, boxStyle } from '../../../../lib/gameplay/headquarters-layout';

/**
 * Remote readout module — spec's "Merge Resolution": stays in the wireframe's locked top-center
 * UX slot, but is rendered as its own bronze/teal object tethered to the Central Unit by a short
 * conduit (rendered by SpineLayer), not fused into the Unit's body. Value comes from the real
 * server `TvView.matchClock` — no timer logic lives here.
 */
export function MatchTimerDisplay({ matchClock }: { matchClock: MatchClock }) {
  const { label, remainingMs } = useMatchClock(matchClock);
  const urgent = remainingMs <= 60_000 && matchClock.status === 'running';
  return (
    <div className="absolute" style={boxStyle(TIMER_BOX)} data-hq-asset="timer-module">
      <div
        className="flex h-full w-full items-center justify-center rounded-[6px] border-2"
        style={{
          background: 'var(--color-hq-bronze-dark)',
          borderColor: 'var(--color-hq-bronze-line)',
          boxShadow: 'var(--shadow-hq-m)',
        }}
      >
        <output
          aria-label="الوقت المتبقي للمباراة"
          data-countdown-state={urgent ? 'urgent' : 'normal'}
          className="tabular-nums tracking-wider"
          style={{
            fontFamily: 'var(--font-hq-mono)',
            fontSize: 'clamp(1.75rem, 3.4vw, 3rem)',
            color: urgent ? 'var(--color-hq-ember)' : 'var(--color-hq-teal-highlight)',
            direction: 'ltr',
          }}
        >
          {label}
        </output>
      </div>
    </div>
  );
}
