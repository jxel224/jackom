import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import { Panel } from '../../../../ui/Panel';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { asObject } from '../../view-data';
import { BombProtocolHeader, readPublicState } from './BombProtocolShared';

const WIRE_COLOR_CLASS: Record<string, string> = {
  red: 'bg-red-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400', green: 'bg-green-500', black: 'bg-neutral-800', white: 'bg-neutral-100 border-neutral-400',
};

export function TvBombProtocol({ view, players }: { view: JsonValue; players: PublicPlayerSummary[] }) {
  const state = readPublicState(view);
  const data = asObject(view);
  if (!state || !data) return null;
  const names = new Map(players.map((player) => [player.playerId, player.name]));
  const board = asObject(data.board ?? null);

  let boardView: React.ReactNode = null;
  if (state.status === 'ACTIVE' && board) {
    if (state.currentModule === 'SYMBOLS') {
      const symbols = Array.isArray(board.symbols) ? board.symbols.filter((item): item is string => typeof item === 'string') : [];
      const pressedCount = typeof board.pressedCount === 'number' ? board.pressedCount : 0;
      boardView = (
        <div className="flex flex-col items-center gap-3" data-bomb-protocol-module="symbols">
          <div className="flex gap-3">{symbols.map((symbolId) => <span key={symbolId} className="rounded-xl border border-border bg-surface-1 px-6 py-4 text-2xl font-bold">{symbolId}</span>)}</div>
          <p className="text-tv-sm text-ink-muted">تم الضغط: {pressedCount}/4</p>
        </div>
      );
    } else if (state.currentModule === 'WIRES') {
      const wires = Array.isArray(board.wires) ? board.wires : [];
      boardView = (
        <div className="flex justify-center gap-4" data-bomb-protocol-module="wires">
          {wires.flatMap((entry) => {
            const wire = asObject(entry);
            if (!wire || typeof wire.wireId !== 'string' || typeof wire.color !== 'string' || typeof wire.position !== 'number') return [];
            return [
              <div key={wire.wireId} className="flex flex-col items-center gap-1">
                <span aria-hidden="true" className={['h-24 w-6 rounded-full border', WIRE_COLOR_CLASS[wire.color] ?? 'bg-neutral-400'].join(' ')} />
                <span className="text-sm font-bold">#{wire.position}</span>
              </div>,
            ];
          })}
        </div>
      );
    } else if (state.currentModule === 'CODE_SEQUENCE') {
      const slots = typeof board.slots === 'number' ? board.slots : 4;
      boardView = (
        <div className="flex justify-center gap-3" dir="ltr" data-bomb-protocol-module="code">
          {Array.from({ length: slots }, (_, index) => <span key={index} className="flex h-16 w-12 items-center justify-center rounded-xl border border-border bg-surface-1 font-mono text-3xl font-bold">?</span>)}
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-6" data-minigame-id="BOMB_PROTOCOL" data-surface="tv" data-bomb-protocol-tv="active">
      <h2 className="text-tv-lg font-bold">Bomb Protocol</h2>
      <BombProtocolHeader state={state} />
      {state.operatorId ? <StatusBadge tone="neutral">المسؤول عن التفكيك: {names.get(state.operatorId) ?? state.operatorId}</StatusBadge> : null}
      {boardView ? <Panel variant="hard">{boardView}</Panel> : null}
      {state.analystIds.length > 0 ? (
        <p className="text-tv-sm text-ink-muted">المحللون: {state.analystIds.map((id) => names.get(id) ?? id).join('، ')}</p>
      ) : null}
    </div>
  );
}
