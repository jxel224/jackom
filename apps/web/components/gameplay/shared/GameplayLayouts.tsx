import type { ReactNode } from 'react';
import { PlayerScreenLayout } from '../../layouts/PlayerScreenLayout';
import { TvScreenLayout } from '../../layouts/TvScreenLayout';
import { Countdown } from './Countdown';

export function TvGameplayLayout({ title, phaseLabel, deadlineAt, children, footer }: { title: string; phaseLabel: string; deadlineAt: number | null; children: ReactNode; footer?: ReactNode }) {
  return <TvScreenLayout eyebrow={phaseLabel}><header className="flex w-full items-center justify-between gap-6"><h1 className="text-tv-lg font-bold">{title}</h1><Countdown deadlineAt={deadlineAt} className="text-tv-base" /></header><div className="w-full">{children}</div>{footer ? <footer className="text-tv-sm text-ink-muted">{footer}</footer> : null}</TvScreenLayout>;
}

export function PlayerGameplayLayout({ title, phaseLabel, deadlineAt, children, footer }: { title: string; phaseLabel: string; deadlineAt: number | null; children: ReactNode; footer?: ReactNode }) {
  return <PlayerScreenLayout header={<div className="flex items-center justify-between gap-3"><div><p className="text-xs text-ink-muted">{phaseLabel}</p><h1 className="font-bold">{title}</h1></div><Countdown deadlineAt={deadlineAt} /></div>} footer={footer}><div className="mx-auto flex w-full max-w-xl flex-col gap-4">{children}</div></PlayerScreenLayout>;
}
