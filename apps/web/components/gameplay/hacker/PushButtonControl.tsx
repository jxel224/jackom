'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../lib/shared';
import type { DisplayError } from '../../../lib/realtime/public-types';
import { Button } from '../../ui/Button';
import { Panel } from '../../ui/Panel';
import { ErrorMessage } from '../../ui/ErrorMessage';

/**
 * The emergency accusation trigger (GAMEPLAY_RULES_V1.md accusation §). Rendered as a persistent
 * affordance whenever `view.canPushButton === true` — any eligible player, Crew or Hacker alike,
 * may press it; the server alone decides whether the press is accepted (cooldown, stale phase, an
 * accusation already in flight). This component never assumes acceptance — the phase transitioning
 * to `ACCUSATION_SELECT` (visible in the next `view:player` push) is the only real confirmation.
 */
export function PushButtonControl({ actionPending, actionError, sendPlayerEvent }: {
  actionPending: boolean;
  actionError: DisplayError | null;
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  function confirm() {
    sendPlayerEvent('player:pushButton');
    setConfirming(false);
  }

  if (!confirming) {
    return (
      <Panel className="flex flex-col items-center gap-2 border-2 border-danger/40" data-push-button data-push-button-state="idle">
        {actionError ? <ErrorMessage message={actionError.message} /> : null}
        <Button type="button" variant="danger" fullWidth onClick={() => setConfirming(true)}>
          🚨 اتهام نهائي
        </Button>
      </Panel>
    );
  }

  return (
    <Panel variant="hard" className="flex flex-col gap-3 border-2 border-danger" data-push-button data-push-button-state="confirming">
      <p className="text-center font-bold">هل أنت متأكد أنك تريد بدء الاتهام؟</p>
      <p className="text-center text-sm text-ink-muted">سيتوقف التحقيق وتبدأ المجموعة باختيار المشتبهين.</p>
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" fullWidth disabled={actionPending} onClick={() => setConfirming(false)}>
          إلغاء
        </Button>
        <Button type="button" variant="danger" fullWidth loading={actionPending} onClick={confirm}>
          تأكيد
        </Button>
      </div>
    </Panel>
  );
}
