import type { ReactNode } from 'react';
import { DecorativeSpark, GraphicBurst, NoiseOverlay, PixelGrid } from '../graphics';

export interface TvScreenLayoutProps {
  children: ReactNode;
  /** Small label above the main content, e.g. the game/brand name. */
  eyebrow?: ReactNode;
}

/**
 * Layout for the shared host/TV screen: centered, large text (`text-tv-*` tokens), generous
 * spacing so it reads from across a room, and minimal interactive surface — the TV mostly
 * *displays* state (room code, roster, current phase) rather than taking input. The decorative
 * pixel-grid/noise/glow layers sit behind everything and never reduce room-code/roster contrast.
 */
export function TvScreenLayout({ children, eyebrow }: TvScreenLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface-0 px-10 py-12 text-center">
      <PixelGrid className="opacity-60" />
      <NoiseOverlay />
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 inset-x-0 mx-auto h-[36rem] w-[36rem] rounded-full bg-brand/20 blur-3xl" />
      <GraphicBurst size={220} accent="action" className="pointer-events-none absolute -left-16 top-10 hidden opacity-30 lg:block" />
      <DecorativeSpark size={20} accent="cyan" className="absolute right-10 top-8 hidden sm:block" />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-8">
        {eyebrow ? <p className="font-display text-tv-sm font-bold text-ink-muted">{eyebrow}</p> : null}
        {children}
      </div>
    </div>
  );
}
