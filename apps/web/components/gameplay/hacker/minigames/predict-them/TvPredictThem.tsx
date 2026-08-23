import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { RevealLayout } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

const CHOICE_LABEL: Record<string, string> = { A: 'أ', B: 'ب', TIE: 'تعادل' };

export function PredictThemReveal({ view, players }: { view: JsonValue; players: PublicPlayerSummary[] }) {
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const data = asObject(view);
  const audienceResult = asObject(data?.audienceResult ?? null);
  const aVotes = typeof audienceResult?.aVotes === 'number' ? audienceResult.aVotes : 0;
  const bVotes = typeof audienceResult?.bVotes === 'number' ? audienceResult.bVotes : 0;
  const noVotes = typeof audienceResult?.noVotes === 'number' ? audienceResult.noVotes : 0;
  const majority = typeof audienceResult?.majority === 'string' ? audienceResult.majority : null;
  const totalVotes = aVotes + bVotes || 1;
  const predictions = Array.isArray(data?.predictions) ? data.predictions : [];

  return (
    <RevealLayout title="نتائج توقّعهم">
      <div className="flex w-full max-w-xl flex-col gap-2" data-predict-them-audience-bar>
        <p className="text-tv-sm font-bold">رأي الجمهور: <span className="text-brand">{majority ? CHOICE_LABEL[majority] ?? majority : '—'}</span></p>
        <div className="flex h-8 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="flex items-center justify-center bg-brand font-mono text-sm font-bold" style={{ width: `${(aVotes / totalVotes) * 100}%` }}>{aVotes}</div>
          <div className="flex items-center justify-center bg-surface-3 font-mono text-sm font-bold" style={{ width: `${(bVotes / totalVotes) * 100}%` }}>{bVotes}</div>
        </div>
        {noVotes > 0 ? <p className="text-sm text-ink-subtle">{noVotes} بدون تصويت</p> : null}
      </div>
      <ul className="grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2" data-predict-them-predictions>
        {predictions.flatMap((entry) => {
          const item = asObject(entry);
          if (!item || typeof item.playerId !== 'string' || typeof item.status !== 'string') return [];
          const choice = typeof item.choice === 'string' ? item.choice : null;
          const correct = choice !== null && majority !== null && choice === majority;
          return [
            <li key={item.playerId} className="rounded-2xl border border-border bg-surface-1 p-4 text-center">
              <p className="text-lg font-bold">{names.get(item.playerId) ?? item.playerId}</p>
              <p className={['mt-1 font-bold', choice ? (correct ? 'text-success' : 'text-danger') : 'text-ink-subtle'].join(' ')}>
                {choice ? `${CHOICE_LABEL[choice] ?? choice} ${correct ? '✅' : '❌'}` : 'لم يتوقع'}
              </p>
            </li>,
          ];
        })}
      </ul>
    </RevealLayout>
  );
}

export function TvPredictThem({ view, players, reveal }: { view: JsonValue; players: PublicPlayerSummary[]; reveal: boolean }) {
  if (reveal) return <PredictThemReveal view={view} players={players} />;
  const data = asObject(view);
  const status = typeof data?.status === 'string' ? data.status : 'AUDIENCE_VOTE';
  const submitted = typeof data?.submittedCount === 'number' ? data.submittedCount : 0;
  const total = typeof data?.total === 'number' ? data.total : players.filter((player) => player.alive).length;
  const label = status === 'PREDICTION' ? 'يتوقع اللاعبون المختارون رأي الجمهور…' : 'يصوّت الجمهور…';
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="PREDICT_THEM" data-surface="tv" data-predict-them-tv="active">
      <h2 className="text-tv-lg font-bold">توقّعهم</h2>
      <p className="text-tv-base">{label}</p>
      <p className="text-tv-base">أرسل <strong className="text-brand">{submitted}</strong> من {total}</p>
      <div className="h-4 w-full max-w-2xl overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={submitted}>
        <div className="h-full bg-brand transition-[width]" style={{ width: `${total > 0 ? (submitted / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
