'use client';

import type { JsonValue } from '../../../lib/shared';
import type { DisplayError, PlayerView } from '../../../lib/realtime/public-types';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { StatusBadge } from '../../ui/StatusBadge';

/**
 * ACCUSATION_VOTE (GAMEPLAY_RULES_V1.md accusation §10/§11). Every eligible voter gets the same
 * APPROVE/REJECT control; once `view.accusation.hasVoted` the control locks — individual votes are
 * never shown to anyone, including the voter's own choice after submission (only that a vote was
 * recorded), matching the server's own secrecy guarantee.
 */
export function AccusationVote({ view, actionPending, actionError, sendPlayerEvent }: {
  view: PlayerView;
  actionPending: boolean;
  actionError: DisplayError | null;
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const info = view.accusation;
  if (!info) return null;

  const allPlayers = [view.self, ...view.others];
  const suspectNames = (info.suspectIds ?? []).map((id) => allPlayers.find((p) => p.playerId === id)?.name ?? id);

  if (info.hasVoted) {
    return (
      <Panel variant="hard" className="flex flex-col items-center gap-3 text-center" data-accusation-vote data-accusation-vote-state="locked">
        <StatusBadge tone="success">تم تسجيل صوتك</StatusBadge>
        <p className="text-ink-muted">بانتظار بقية الأصوات ({info.votedCount ?? 0}/{info.totalEligible ?? 0})</p>
      </Panel>
    );
  }

  function vote(choice: 'APPROVE' | 'REJECT') {
    sendPlayerEvent('player:submitAccusationVote', { vote: choice });
  }

  return (
    <Panel variant="hard" className="flex flex-col gap-4" data-accusation-vote data-accusation-vote-state="active">
      <h2 className="text-sm font-bold text-danger">التصويت على الاتهام</h2>
      <div className="flex flex-wrap justify-center gap-2">
        {suspectNames.map((name) => (
          <span key={name} className="flex items-center gap-2 rounded-2xl border-2 border-danger/40 px-3 py-2 text-sm font-bold">
            <PlayerAvatar name={name} size="sm" />
            {name}
          </span>
        ))}
      </div>
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <div className="flex gap-2">
        <Button type="button" variant="danger" fullWidth loading={actionPending} onClick={() => vote('REJECT')}>
          رفض الاتهام
        </Button>
        <Button type="button" variant="primary" fullWidth loading={actionPending} onClick={() => vote('APPROVE')}>
          تأكيد الاتهام
        </Button>
      </div>
    </Panel>
  );
}
