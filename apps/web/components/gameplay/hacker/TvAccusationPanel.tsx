import type { PublicPlayerSummary } from '../../../lib/shared';
import type { TvView } from '../../../lib/realtime/public-types';
import { Panel } from '../../ui/Panel';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { StatusBadge } from '../../ui/StatusBadge';

/**
 * TV's public accusation view (ACCUSATION_SELECT/ACCUSATION_VOTE) — initiator identity, required
 * suspect count, the locked suspect lineup once chosen, and aggregate vote progress. Never
 * individual votes, never anyone's role (GAMEPLAY_RULES_V1.md accusation §33).
 */
export function TvAccusationPanel({ view }: { view: TvView }) {
  const acc = view.accusation;
  if (!acc) return null;
  const initiator = view.players.find((p) => p.playerId === acc.initiatorId);
  const suspects = (acc.suspectIds ?? []).map((id: string) => view.players.find((p: PublicPlayerSummary) => p.playerId === id));

  return (
    <Panel variant="hard" className="flex flex-col items-center gap-4 text-center" data-tv-accusation>
      <StatusBadge tone="danger" live>اتهام نهائي</StatusBadge>
      <p className="text-tv-base font-bold">{initiator?.name ?? '؟'} يبدأ الاتهام</p>
      {acc.suspectIds === null ? (
        <p className="text-tv-sm text-ink-muted">يختار {acc.requiredSuspectCount} من المشتبه بهم…</p>
      ) : (
        <>
          <div className="flex flex-wrap justify-center gap-3">
            {suspects.map((player) => player ? (
              <span key={player.playerId} className="flex items-center gap-2 rounded-2xl border-2 border-danger/50 px-4 py-2 text-tv-sm font-bold">
                <PlayerAvatar name={player.name} size="md" />
                {player.name}
              </span>
            ) : null)}
          </div>
          <p className="text-tv-sm text-ink-muted">
            صوّت {acc.votedCount ?? 0} من {acc.totalEligible ?? 0}
          </p>
        </>
      )}
    </Panel>
  );
}
