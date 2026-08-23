'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../lib/shared';
import type { DisplayError, PlayerView } from '../../../lib/realtime/public-types';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { StatusBadge } from '../../ui/StatusBadge';

/**
 * ACCUSATION_SELECT (GAMEPLAY_RULES_V1.md accusation §7/§8). Only the initiator
 * (`view.accusation.isInitiator`) gets a real suspect-selection grid — every other player sees a
 * plain waiting state naming the initiator, exactly as the design brief specifies
 * ("[Name] يختار المشتبهين"). Requires exactly `requiredSuspectCount` selected before enabling
 * submit; the server is still the authority on every rule (exact count, eligibility, staleness).
 */
export function AccusationSelect({ view, actionPending, actionError, sendPlayerEvent }: {
  view: PlayerView;
  actionPending: boolean;
  actionError: DisplayError | null;
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const info = view.accusation;
  const [suspectIds, setSuspectIds] = useState<string[]>([]);
  if (!info) return null;

  const allPlayers = [view.self, ...view.others];
  const initiator = allPlayers.find((p) => p.playerId === info.initiatorId);

  if (!info.isInitiator || !info.eligibleSuspectIds) {
    return (
      <Panel variant="hard" className="flex flex-col items-center gap-3 text-center" data-accusation-select data-accusation-role="observer">
        <StatusBadge tone="danger">اتهام جارٍ</StatusBadge>
        <p className="font-bold">{initiator?.name ?? 'أحد اللاعبين'} يختار المشتبهين</p>
        <p className="text-sm text-ink-muted">عدد المطلوبين: {info.requiredSuspectCount}</p>
      </Panel>
    );
  }

  function toggle(id: string) {
    setSuspectIds((current) => {
      if (current.includes(id)) return current.filter((s) => s !== id);
      if (current.length >= info!.requiredSuspectCount) return current;
      return [...current, id];
    });
  }

  const validCount = suspectIds.length === info.requiredSuspectCount;

  function submit() {
    if (!validCount) return;
    sendPlayerEvent('player:submitAccusation', { suspectIds });
  }

  return (
    <Panel variant="hard" className="flex flex-col gap-4" data-accusation-select data-accusation-role="initiator">
      <h2 className="text-sm font-bold text-danger">
        اختر {info.requiredSuspectCount} من المشتبه بهم ({suspectIds.length}/{info.requiredSuspectCount})
      </h2>
      <ul className="flex flex-wrap gap-2" data-accusation-suspect-list>
        {info.eligibleSuspectIds.map((id) => {
          const player = allPlayers.find((p) => p.playerId === id);
          if (!player) return null;
          const selected = suspectIds.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={selected}
                className={[
                  'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm font-bold transition-colors',
                  selected ? 'border-danger bg-danger/15 text-danger' : 'border-border text-ink-muted',
                ].join(' ')}
              >
                <PlayerAvatar name={player.name} size="sm" />
                {player.name}
              </button>
            </li>
          );
        })}
      </ul>
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <Button type="button" variant="danger" fullWidth loading={actionPending} disabled={!validCount || actionPending} onClick={submit}>
        تأكيد الاتهام
      </Button>
    </Panel>
  );
}
