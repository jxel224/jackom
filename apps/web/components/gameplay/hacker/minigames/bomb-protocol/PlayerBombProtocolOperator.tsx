'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { Panel } from '../../../../ui/Panel';
import { asObject } from '../../view-data';
import { BombProtocolHeader, readPublicState } from './BombProtocolShared';

const WIRE_COLOR_CLASS: Record<string, string> = {
  red: 'bg-red-500', blue: 'bg-blue-500', yellow: 'bg-yellow-400', green: 'bg-green-500', black: 'bg-neutral-800', white: 'bg-neutral-100 border-neutral-400',
};

export function PlayerBombProtocolOperator({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const [codeDraft, setCodeDraft] = useState<number[]>([0, 0, 0, 0]);
  const state = readPublicState(view);
  const data = asObject(view);
  if (!state || !data) return null;
  const board = asObject(data.board ?? null);
  const allowedAction = typeof data.allowedAction === 'string' ? data.allowedAction : null;

  if (state.status !== 'ACTIVE') {
    return (
      <div className="flex flex-col items-center gap-4" data-minigame-id="BOMB_PROTOCOL" data-surface="player" data-bomb-role="operator" data-bomb-status="resolved">
        <h2 className="text-2xl font-bold">Bomb Protocol</h2>
        <BombProtocolHeader state={state} />
      </div>
    );
  }

  let controls: React.ReactNode = null;
  if (allowedAction === 'PRESS_SYMBOL' && board) {
    const symbols = Array.isArray(board.symbols) ? board.symbols.filter((item): item is string => typeof item === 'string') : [];
    const pressedCount = typeof board.pressedCount === 'number' ? board.pressedCount : 0;
    controls = (
      <div className="flex flex-col gap-3" data-bomb-protocol-module="symbols">
        <p className="text-center text-ink-muted">اضغط الرموز بالترتيب الصحيح حسب تعليمات المحللين ({pressedCount}/4)</p>
        <div className="grid grid-cols-2 gap-3">
          {symbols.map((symbolId) => (
            <Button key={symbolId} type="button" variant="secondary" disabled={actionPending} onClick={() => submitAction('PRESS_SYMBOL', { symbolId })}>
              {symbolId}
            </Button>
          ))}
        </div>
      </div>
    );
  } else if (allowedAction === 'CUT_WIRE' && board) {
    const wires = Array.isArray(board.wires) ? board.wires : [];
    controls = (
      <div className="flex flex-col gap-3" data-bomb-protocol-module="wires">
        <p className="text-center text-ink-muted">اقطع السلك الصحيح حسب تعليمات المحللين</p>
        <div className="flex flex-col gap-2">
          {wires.flatMap((entry) => {
            const wire = asObject(entry);
            if (!wire || typeof wire.wireId !== 'string' || typeof wire.color !== 'string' || typeof wire.position !== 'number') return [];
            return [
              <Button key={wire.wireId} type="button" variant="secondary" disabled={actionPending} onClick={() => submitAction('CUT_WIRE', { wireId: wire.wireId })} className="flex items-center gap-3 justify-start">
                <span aria-hidden="true" className={['h-4 w-10 rounded-full border', WIRE_COLOR_CLASS[wire.color] ?? 'bg-neutral-400'].join(' ')} />
                <span>سلك #{wire.position} — {wire.color}</span>
              </Button>,
            ];
          })}
        </div>
      </div>
    );
  } else if (allowedAction === 'SUBMIT_CODE' && board) {
    const allowedValues = Array.isArray(board.allowedValues) ? board.allowedValues.filter((item): item is number => typeof item === 'number') : [];
    const max = allowedValues.length > 0 ? Math.max(...allowedValues) : 9;
    const min = allowedValues.length > 0 ? Math.min(...allowedValues) : 0;
    controls = (
      <div className="flex flex-col gap-3" data-bomb-protocol-module="code">
        <p className="text-center text-ink-muted">أدخل الرمز السري حسب تعليمات المحللين</p>
        <div className="flex justify-center gap-3" dir="ltr">
          {codeDraft.map((digit, slot) => (
            <div key={slot} className="flex flex-col items-center gap-1">
              <Button type="button" variant="ghost" size="lg" disabled={actionPending} onClick={() => setCodeDraft((current) => current.map((value, index) => index === slot ? Math.min(max, value + 1) : value))}>▲</Button>
              <span className="w-12 text-center font-mono text-3xl font-bold" data-bomb-code-slot={slot}>{digit}</span>
              <Button type="button" variant="ghost" size="lg" disabled={actionPending} onClick={() => setCodeDraft((current) => current.map((value, index) => index === slot ? Math.max(min, value - 1) : value))}>▼</Button>
            </div>
          ))}
        </div>
        <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('SUBMIT_CODE', { code: codeDraft })}>
          تأكيد الرمز
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="BOMB_PROTOCOL" data-surface="player" data-bomb-role="operator">
      <h2 className="text-center text-2xl font-bold">Bomb Protocol — أنت المسؤول عن التفكيك</h2>
      <BombProtocolHeader state={state} />
      <Panel>{controls}</Panel>
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
    </div>
  );
}
