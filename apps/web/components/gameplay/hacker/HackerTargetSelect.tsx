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
 * The Hacker's real targeted-hack control (GAMEPLAY_RULES_V1.md §7). Rendered only for this
 * player's own socket when `view.hackerInfo !== null` — Crew never receives `hackerInfo` at all,
 * so this component structurally cannot render for them. Stays visually inside the same shell as
 * every other phase (no separate "hacker mode" chrome) — secrecy comes from the server never
 * sending Crew this data, not from the client hiding a shared screen.
 */
export function HackerTargetSelect({ view, actionPending, actionError, sendPlayerEvent }: {
  view: PlayerView;
  actionPending: boolean;
  actionError: DisplayError | null;
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const info = view.hackerInfo;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [justHacked, setJustHacked] = useState(false);

  if (!info) return null;

  const allPlayers = [view.self, ...view.others];

  function submit() {
    if (!targetId) return;
    const sent = sendPlayerEvent('player:submitHack', { targetPlayerId: targetId });
    if (sent) {
      setJustHacked(true);
      setConfirming(false);
    }
  }

  if (!info.canHackNow) {
    return (
      <Panel variant="hard" className="flex flex-col items-center gap-3 text-center" data-hacker-select data-hacker-state="unavailable">
        <StatusBadge tone="info">هاكر</StatusBadge>
        <p className="text-ink-muted">{justHacked ? 'تم الاختراق.' : 'لا يمكنك الاختراق الآن.'}</p>
        <p className="text-sm text-ink-subtle">الاختراقات المتبقية: {info.hacksRemaining}</p>
      </Panel>
    );
  }

  return (
    <Panel variant="hard" className="flex flex-col gap-4" data-hacker-select data-hacker-state="active">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-danger">أنت هاكر — اختراق سري</h2>
        <StatusBadge tone="warning">متبقٍ {info.hacksRemaining}</StatusBadge>
      </div>

      {!confirming ? (
        <>
          <p className="text-ink-muted">اختر هدفًا</p>
          <ul className="flex flex-wrap gap-2" data-hacker-target-list>
            {info.eligibleTargetIds.map((id) => {
              const player = allPlayers.find((p) => p.playerId === id);
              if (!player) return null;
              const selected = targetId === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(id)}
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
          <Button type="button" variant="danger" fullWidth disabled={!targetId} onClick={() => setConfirming(true)}>
            اختراق
          </Button>
        </>
      ) : (
        <>
          <p className="text-center font-semibold">
            تأكيد اختراق {allPlayers.find((p) => p.playerId === targetId)?.name}؟
          </p>
          {actionError ? <ErrorMessage message={actionError.message} /> : null}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" fullWidth disabled={actionPending} onClick={() => setConfirming(false)}>
              إلغاء
            </Button>
            <Button type="button" variant="danger" fullWidth loading={actionPending} onClick={submit}>
              تأكيد
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
