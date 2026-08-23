import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { RevealLayout } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

const STEP_LABEL: Record<string, string> = {
  DEFENCE: 'الدفاع', FOLLOW_UP_QUESTION: 'سؤال المتابعة', FOLLOW_UP_RESPONSE: 'الرد على السؤال', COMPLETED: 'اكتملت الجولة',
};

export function DefendItReveal({ view }: { view: JsonValue }) {
  const data = asObject(view);
  const statements = Array.isArray(data?.statements) ? data.statements.filter((item): item is string => typeof item === 'string') : [];
  return (
    <RevealLayout title="نتائج دافع عنها">
      <div className="flex flex-col gap-3">
        {statements.map((text) => <p key={text} className="rounded-2xl border border-border bg-surface-1 p-4 text-lg font-bold">{text}</p>)}
      </div>
    </RevealLayout>
  );
}

export function TvDefendIt({ view, players, reveal }: { view: JsonValue; players: PublicPlayerSummary[]; reveal: boolean }) {
  if (reveal) return <DefendItReveal view={view} />;
  const data = asObject(view);
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const step = typeof data?.step === 'string' ? data.step : 'DEFENCE';
  const speakerOrder = Array.isArray(data?.speakerOrder) ? data.speakerOrder.filter((item): item is string => typeof item === 'string') : [];
  const currentSpeaker = typeof data?.currentSpeaker === 'string' ? data.currentSpeaker : null;
  const currentAsker = typeof data?.currentFollowUpAsker === 'string' ? data.currentFollowUpAsker : null;
  const completed = Array.isArray(data?.completedPlayerIds) ? data.completedPlayerIds.filter((item): item is string => typeof item === 'string') : [];

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="DEFEND_IT" data-surface="tv" data-defend-it-tv="active">
      <h2 className="text-tv-lg font-bold">دافع عنها</h2>
      <p className="text-tv-base">{STEP_LABEL[step] ?? step}</p>
      {currentSpeaker ? (
        <p className="text-tv-base">
          <strong className="text-brand">{names.get(currentSpeaker) ?? currentSpeaker}</strong> يدافع
          {currentAsker ? <> — يسأل <strong className="text-brand">{names.get(currentAsker) ?? currentAsker}</strong></> : null}
        </p>
      ) : null}
      <ol className="flex flex-wrap justify-center gap-3" data-defend-it-order>
        {speakerOrder.map((playerId, index) => {
          const isCurrent = playerId === currentSpeaker;
          const isDone = completed.includes(playerId);
          return (
            <li key={playerId} className={['rounded-full border px-4 py-2 text-lg font-bold', isCurrent ? 'border-brand bg-brand/10 text-brand' : isDone ? 'border-success text-success' : 'border-border text-ink-muted'].join(' ')}>
              {index + 1}. {names.get(playerId) ?? playerId}{isDone ? ' ✓' : ''}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
