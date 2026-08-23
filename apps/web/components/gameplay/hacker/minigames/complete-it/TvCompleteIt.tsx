import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { Panel } from '../../../../ui/Panel';
import { RevealLayout } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

interface CompleteItResult { playerId: string; status: string; text?: string }

function resultsFrom(view: JsonValue): CompleteItResult[] {
  const data = asObject(view);
  if (!Array.isArray(data?.results)) return [];
  return data.results.flatMap((entry) => {
    const item = asObject(entry);
    return item && typeof item.playerId === 'string' && typeof item.status === 'string' &&
      (item.text === undefined || typeof item.text === 'string')
      ? [{ playerId: item.playerId, status: item.status, ...(typeof item.text === 'string' ? { text: item.text } : {}) }]
      : [];
  });
}

export function CompleteItReveal({ view, players }: { view: JsonValue; players: PublicPlayerSummary[] }) {
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const results = resultsFrom(view);
  const submitted = results.filter((result): result is CompleteItResult & { text: string } => result.status === 'submitted' && typeof result.text === 'string');
  const missing = results.filter((result) => result.status !== 'submitted');
  return (
    <RevealLayout title="نتائج كمّلها">
      <ul className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2" data-complete-it-results>
        {submitted.map((result) => (
          <li key={result.playerId} className="rounded-2xl border border-border bg-surface-1 p-4">
            <p className="text-lg font-bold text-brand">{names.get(result.playerId) ?? result.playerId}</p>
            <p className="mt-1 text-tv-sm">{result.text}</p>
          </li>
        ))}
      </ul>
      {missing.length > 0 ? <Panel className="w-full"><h3 className="font-bold">لم يرسلوا إجابة</h3><p className="mt-2 text-ink-muted">{missing.map((item) => names.get(item.playerId) ?? item.playerId).join('، ')}</p></Panel> : null}
    </RevealLayout>
  );
}

export function TvCompleteIt({ view, players, reveal }: { view: JsonValue; players: PublicPlayerSummary[]; reveal: boolean }) {
  if (reveal) return <CompleteItReveal view={view} players={players} />;
  const data = asObject(view);
  const submitted = typeof data?.submittedCount === 'number' ? data.submittedCount : 0;
  const total = typeof data?.participantCount === 'number' ? data.participantCount : players.filter((player) => player.alive).length;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="COMPLETE_IT" data-surface="tv" data-complete-it-tv="active">
      <h2 className="text-tv-lg font-bold">كمّلها</h2>
      <p className="text-tv-base">أرسل <strong className="text-brand">{submitted}</strong> من {total}</p>
      <div className="h-4 w-full max-w-2xl overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={submitted}>
        <div className="h-full bg-brand transition-[width]" style={{ width: `${total > 0 ? (submitted / total) * 100 : 0}%` }} />
      </div>
      <ul className="flex flex-wrap justify-center gap-2 text-lg text-ink-muted">{players.filter((player) => player.alive).map((player) => <li key={player.playerId}>{player.name}</li>)}</ul>
    </div>
  );
}
