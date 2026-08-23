import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { Panel } from '../../../../ui/Panel';
import { RevealLayout } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

interface Card { id: string; text: string }
interface RankingResult { playerId: string; status: string; order?: string[] }

function cardsFrom(view: JsonValue): Card[] {
  const data = asObject(view);
  if (!Array.isArray(data?.cards)) return [];
  return data.cards.flatMap((c) => {
    const obj = asObject(c);
    return obj && typeof obj.id === 'string' && typeof obj.text === 'string' ? [{ id: obj.id, text: obj.text }] : [];
  });
}

function resultsFrom(view: JsonValue): RankingResult[] {
  const data = asObject(view);
  if (!Array.isArray(data?.results)) return [];
  return data.results.flatMap((entry) => {
    const item = asObject(entry);
    if (!item || typeof item.playerId !== 'string' || typeof item.status !== 'string') return [];
    const order = Array.isArray(item.order) ? item.order.filter((id): id is string => typeof id === 'string') : undefined;
    return [{ playerId: item.playerId, status: item.status, ...(order ? { order } : {}) }];
  });
}

export function RankItReveal({ view, players }: { view: JsonValue; players: PublicPlayerSummary[] }) {
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const cards = cardsFrom(view);
  const cardText = new Map(cards.map((c) => [c.id, c.text]));
  const results = resultsFrom(view);
  const submitted = results.filter((r): r is RankingResult & { order: string[] } => r.status === 'submitted' && Array.isArray(r.order));
  const missing = results.filter((r) => r.status !== 'submitted');

  return (
    <RevealLayout title="نتائج رتّبها">
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-rank-it-results>
        {submitted.map((result) => (
          <Panel key={result.playerId} className="flex flex-col gap-2">
            <p className="text-lg font-bold text-brand">{names.get(result.playerId) ?? result.playerId}</p>
            <ol className="flex flex-col gap-1 text-start text-tv-sm">
              {result.order.map((cardId, index) => <li key={cardId}>{index + 1}. {cardText.get(cardId) ?? cardId}</li>)}
            </ol>
          </Panel>
        ))}
      </div>
      {missing.length > 0 ? <Panel className="w-full"><h3 className="font-bold">لم يرسلوا ترتيبًا</h3><p className="mt-2 text-ink-muted">{missing.map((item) => names.get(item.playerId) ?? item.playerId).join('، ')}</p></Panel> : null}
    </RevealLayout>
  );
}

export function TvRankIt({ view, players, reveal }: { view: JsonValue; players: PublicPlayerSummary[]; reveal: boolean }) {
  if (reveal) return <RankItReveal view={view} players={players} />;
  const data = asObject(view);
  const submitted = typeof data?.submittedCount === 'number' ? data.submittedCount : 0;
  const total = typeof data?.participantCount === 'number' ? data.participantCount : players.filter((player) => player.alive).length;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="RANK_IT" data-surface="tv" data-rank-it-tv="active">
      <h2 className="text-tv-lg font-bold">رتّبها</h2>
      <p className="text-tv-base">أرسل <strong className="text-brand">{submitted}</strong> من {total}</p>
      <div className="h-4 w-full max-w-2xl overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={submitted}>
        <div className="h-full bg-brand transition-[width]" style={{ width: `${total > 0 ? (submitted / total) * 100 : 0}%` }} />
      </div>
      <ul className="flex flex-wrap justify-center gap-2 text-lg text-ink-muted">{players.filter((player) => player.alive).map((player) => <li key={player.playerId}>{player.name}</li>)}</ul>
    </div>
  );
}
