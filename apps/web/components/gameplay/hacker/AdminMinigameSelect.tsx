'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../lib/shared';
import type { DisplayError, PlayerView } from '../../../lib/realtime/public-types';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { ErrorMessage } from '../../ui/ErrorMessage';
import { PlayerAvatar } from '../../ui/PlayerAvatar';
import { GAME_TITLES } from './view-data';

/**
 * The current Admin's real minigame + participant selection control (GAMEPLAY_RULES_V1.md §4/§5).
 * Rendered only when `view.isAdmin && view.adminSelection !== null` (i.e. during MINIGAME_SELECT).
 * Every rule enforced here (participant min/max, eligibility) is advisory — `player:adminSelectMinigame`
 * is still authoritatively validated server-side; this only prevents an obviously-invalid submit.
 */
export function AdminMinigameSelect({ view, actionPending, actionError, sendPlayerEvent }: {
  view: PlayerView;
  actionPending: boolean;
  actionError: DisplayError | null;
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const selection = view.adminSelection;
  const [minigameId, setMinigameId] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);

  if (!selection) return null;

  const limit = minigameId ? selection.participantLimits[minigameId] : undefined;
  const allPlayers = [view.self, ...view.others];

  function chooseMinigame(id: string) {
    setMinigameId(id);
    setParticipantIds([]);
  }

  function toggleParticipant(id: string) {
    setParticipantIds((current) => {
      if (current.includes(id)) return current.filter((p) => p !== id);
      if (limit && current.length >= limit.max) return current;
      return [...current, id];
    });
  }

  const validCount = limit ? participantIds.length >= limit.min && participantIds.length <= limit.max : false;

  function submit() {
    if (!minigameId || !validCount) return;
    sendPlayerEvent('player:adminSelectMinigame', { minigameId, participantIds });
  }

  return (
    <Panel variant="hard" className="flex flex-col gap-4" data-admin-select>
      <h2 className="text-sm font-bold text-brand">أنت المسؤول عن هذه الجولة</h2>

      {!minigameId ? (
        <div className="flex flex-col gap-3" data-admin-step="choose-game">
          <p className="text-ink-muted">اختر اللعبة</p>
          <div className="grid grid-cols-2 gap-2">
            {selection.availableMinigameIds.map((id) => (
              <Button key={id} type="button" variant="secondary" onClick={() => chooseMinigame(id)}>
                {GAME_TITLES[id as keyof typeof GAME_TITLES] ?? id}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3" data-admin-step="choose-participants">
          <div className="flex items-center justify-between gap-2">
            <p className="text-ink-muted">
              اختر المشاركين ({participantIds.length}/{limit?.max ?? '؟'}) — الحد الأدنى {limit?.min ?? '؟'}
            </p>
            <Button type="button" variant="secondary" onClick={() => setMinigameId(null)}>
              تغيير اللعبة
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2" data-admin-participant-list>
            {selection.eligiblePlayerIds.map((id) => {
              const player = allPlayers.find((p) => p.playerId === id);
              if (!player) return null;
              const selected = participantIds.includes(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => toggleParticipant(id)}
                    aria-pressed={selected}
                    className={[
                      'flex items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm font-bold transition-colors',
                      selected ? 'border-brand bg-brand/15 text-brand' : 'border-border text-ink-muted',
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
          <Button type="button" fullWidth loading={actionPending} disabled={!validCount || actionPending} onClick={submit}>
            تأكيد الاختيار
          </Button>
        </div>
      )}
    </Panel>
  );
}
