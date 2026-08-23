'use client';

import type { JsonValue } from '../../../lib/shared';
import type { PlayerView } from '../../../lib/realtime/public-types';
import { Panel } from '../../ui/Panel';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { StatusBadge } from '../../ui/StatusBadge';

/**
 * FINAL_RESULTS, player side (locked product decision: roles ARE revealed here — see
 * `packages/shared-types/src/views.ts`'s `FinalRoleReveal`). Shows this player's own win/loss,
 * their own true role, and the full roster's roles. There is deliberately no rematch button here —
 * advancing out of FINAL_RESULTS is a HOST-only action (`host:advance`, TV side), matching the FSM
 * exactly; a player-side `player:requestRematch` exists server-side but the FSM never reads it to
 * auto-advance, so a phone-side "rematch" button would be a false affordance. Players wait for the
 * host to continue, same as every other host-paced phase in this game.
 */
export function FinalResultsPanel({ view }: { view: PlayerView; sendPlayerEvent?: (type: string, extra?: Record<string, JsonValue>) => boolean }) {
  const reveal = view.finalReveal;
  const allPlayers = [view.self, ...view.others];
  const selfRole = reveal?.find((r) => r.playerId === view.playerId)?.role ?? null;
  const won = view.winner !== null && selfRole !== null && ((view.winner === 'crew' && selfRole === 'CREW') || (view.winner === 'hackers' && selfRole === 'HACKER'));

  return (
    <Panel variant="hard" className="flex flex-col gap-4 text-center" data-final-results>
      <StatusBadge tone={view.winner === 'crew' ? 'success' : 'danger'} live>
        {view.winner === 'crew' ? 'فاز الطاقم' : 'فاز الهاكرز'}
      </StatusBadge>
      {selfRole ? (
        <p className="text-2xl font-extrabold">{won ? 'أنت فزت! 🎉' : 'أنت خسرت'}</p>
      ) : null}
      {selfRole ? (
        <p className="text-ink-muted">
          دورك كان: <strong className="text-ink">{selfRole === 'HACKER' ? 'هاكر' : 'طاقم'}</strong>
        </p>
      ) : null}

      <div className="flex flex-col gap-2" data-final-reveal-list>
        <h3 className="text-sm font-bold text-brand">الأدوار النهائية</h3>
        <ul className="flex flex-wrap justify-center gap-2">
          {allPlayers.map((player) => {
            const role = reveal?.find((r) => r.playerId === player.playerId)?.role;
            return (
              <li key={player.playerId} className="flex items-center gap-2 rounded-2xl border-2 border-border px-3 py-2 text-sm font-bold">
                <PlayerAvatar name={player.name} size="sm" />
                {player.name}
                {role ? <StatusBadge tone={role === 'HACKER' ? 'danger' : 'success'}>{role === 'HACKER' ? 'هاكر' : 'طاقم'}</StatusBadge> : null}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-sm text-ink-subtle">بانتظار المضيف لبدء جولة جديدة…</p>
    </Panel>
  );
}
