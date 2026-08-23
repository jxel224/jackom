import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { Panel } from '../../../../ui/Panel';
import { RevealLayout } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';
import { StaticDrawingPreview, type DrawStroke } from './DrawingCanvas';

interface DrawingResult { playerId: string; status: string; strokes: DrawStroke[] }

function isPoint(value: unknown): value is { x: number; y: number } {
  const object = value as { x?: unknown; y?: unknown } | null;
  return typeof object?.x === 'number' && typeof object?.y === 'number';
}

function drawingsFrom(view: JsonValue): DrawingResult[] {
  const data = asObject(view);
  if (!Array.isArray(data?.drawings)) return [];
  return data.drawings.flatMap((entry) => {
    const item = asObject(entry);
    if (!item || typeof item.playerId !== 'string' || typeof item.status !== 'string') return [];
    const rawStrokes = Array.isArray(item.strokes) ? item.strokes : [];
    const strokes: DrawStroke[] = rawStrokes.flatMap((stroke) => {
      const strokeObject = asObject(stroke);
      const points = Array.isArray(strokeObject?.points) ? strokeObject.points.filter(isPoint) : [];
      return points.length > 0 ? [{ points }] : [];
    });
    return [{ playerId: item.playerId, status: item.status, strokes }];
  });
}

export function DrawItReveal({ view, players }: { view: JsonValue; players: PublicPlayerSummary[] }) {
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const drawings = drawingsFrom(view);
  return (
    <RevealLayout title="نتائج ارسمها">
      <ul className="grid w-full max-w-4xl grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4" data-draw-it-results>
        {drawings.map((drawing) => (
          <li key={drawing.playerId} className="flex flex-col items-center gap-2">
            {drawing.status === 'submitted'
              ? <StaticDrawingPreview strokes={drawing.strokes} />
              : <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed border-border text-ink-subtle">لا إجابة</div>}
            <span className="truncate text-sm font-bold">{names.get(drawing.playerId) ?? drawing.playerId}</span>
          </li>
        ))}
      </ul>
    </RevealLayout>
  );
}

export function TvDrawIt({ view, players, reveal }: { view: JsonValue; players: PublicPlayerSummary[]; reveal: boolean }) {
  if (reveal) return <DrawItReveal view={view} players={players} />;
  const data = asObject(view);
  const submitted = typeof data?.submittedCount === 'number' ? data.submittedCount : 0;
  const total = typeof data?.participantCount === 'number' ? data.participantCount : players.filter((player) => player.alive).length;
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="DRAW_IT" data-surface="tv" data-draw-it-tv="active">
      <h2 className="text-tv-lg font-bold">ارسمها</h2>
      <Panel className="text-tv-sm">يرسم اللاعبون على هواتفهم الآن 🎨</Panel>
      <p className="text-tv-base">أرسل <strong className="text-brand">{submitted}</strong> من {total}</p>
      <div className="h-4 w-full max-w-2xl overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={submitted}>
        <div className="h-full bg-brand transition-[width]" style={{ width: `${total > 0 ? (submitted / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}
