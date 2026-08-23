import type { JsonValue } from '../../../lib/shared';
import type { DisplayError, TvView } from '../../../lib/realtime/public-types';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { StatusBadge } from '../../ui/StatusBadge';

/**
 * TV's FINAL_RESULTS screen: winner, every player's true role (locked product decision — roles
 * ARE public here), and the host-only control that actually advances the match
 * (`host:advance` -> REMATCH_LOBBY; the FSM has no player-driven auto-advance out of this phase).
 */
export function TvFinalResults({ view, startPending, startError, sendHostEvent }: {
  view: TvView;
  startPending: boolean;
  startError: DisplayError | null;
  sendHostEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  return (
    <Panel variant="hard" className="flex flex-col items-center gap-5 text-center" data-tv-final-results>
      <StatusBadge tone={view.winner === 'crew' ? 'success' : 'danger'} live>
        {view.winner === 'crew' ? 'فاز الطاقم' : 'فاز الهاكرز'}
      </StatusBadge>
      <ul className="flex flex-wrap justify-center gap-3">
        {view.players.map((player) => {
          const role = view.finalReveal?.find((r) => r.playerId === player.playerId)?.role;
          return (
            <li key={player.playerId} className="flex items-center gap-2 rounded-2xl border-2 border-border px-4 py-2 text-tv-sm font-bold">
              <PlayerAvatar name={player.name} size="md" />
              {player.name}
              {role ? <StatusBadge tone={role === 'HACKER' ? 'danger' : 'success'}>{role === 'HACKER' ? 'هاكر' : 'طاقم'}</StatusBadge> : null}
            </li>
          );
        })}
      </ul>
      {startError ? <ErrorMessage message={startError.message} /> : null}
      <Button type="button" size="tv" loading={startPending} onClick={() => sendHostEvent('host:advance')}>
        متابعة
      </Button>
    </Panel>
  );
}
