import type { ReactNode } from 'react';
import { LoadingIndicator } from '../../ui/LoadingIndicator';
import { Panel } from '../../ui/Panel';
import { StatusBadge } from '../../ui/StatusBadge';

export function GameplayLoading({ label = 'جاري مزامنة حالة اللعبة…' }: { label?: string }) {
  return <Panel className="flex min-h-48 items-center justify-center"><LoadingIndicator size="lg" label={label} /></Panel>;
}

export function WaitingForOthers({ children = 'تم تثبيت إجابتك. بانتظار بقية اللاعبين…' }: { children?: ReactNode }) {
  return <Panel className="flex flex-col items-center gap-3 text-center"><StatusBadge tone="success">تم الإرسال</StatusBadge><p>{children}</p></Panel>;
}

export function SpectatorState({ title = 'أنت مشاهد في هذه الجولة', participantIds = [] }: { title?: string; participantIds?: string[] }) {
  return (
    <Panel className="flex flex-col items-center gap-3 text-center" data-spectator-state>
      <StatusBadge tone="info">مشاهدة</StatusBadge><h2 className="text-xl font-bold">{title}</h2>
      <p className="text-ink-muted">شاهد وناقش مع المجموعة.</p>
      {participantIds.length > 0 ? <p className="text-sm text-ink-subtle">المشاركون: {participantIds.length}</p> : null}
    </Panel>
  );
}

export type SubmissionVisualState = 'READY' | 'SUBMITTING' | 'LOCKED' | 'TIMEOUT' | 'ERROR';
const SUBMISSION_COPY: Record<SubmissionVisualState, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }> = {
  READY: { label: 'جاهز للإرسال', tone: 'neutral' }, SUBMITTING: { label: 'جاري الإرسال…', tone: 'info' },
  LOCKED: { label: 'تم تثبيت الإجابة', tone: 'success' }, TIMEOUT: { label: 'انتهى الوقت', tone: 'warning' },
  ERROR: { label: 'تعذر إرسال الإجابة', tone: 'danger' },
};
export function SubmissionStatus({ state }: { state: SubmissionVisualState }) {
  const item = SUBMISSION_COPY[state];
  return <StatusBadge tone={item.tone} live>{item.label}</StatusBadge>;
}

export function RevealLayout({ title = 'النتيجة', children }: { title?: string; children: ReactNode }) {
  return <Panel as="section" variant="hard" className="flex w-full flex-col items-center gap-5 text-center"><h2 className="text-tv-lg font-bold">{title}</h2>{children}</Panel>;
}

export function GameplayFallback({ kind = 'state' }: { kind?: 'phase' | 'minigame' | 'state' }) {
  const text = kind === 'phase' ? 'مرحلة غير مدعومة' : kind === 'minigame' ? 'لعبة غير مدعومة' : 'تعذر عرض حالة اللعبة';
  return <Panel role="alert" className="text-center"><h2 className="text-xl font-bold">{text}</h2><p className="mt-2 text-ink-muted">انتظر تحديث الحالة من الخادم.</p></Panel>;
}
