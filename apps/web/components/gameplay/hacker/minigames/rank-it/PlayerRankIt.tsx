'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { SubmissionStatus, WaitingForOthers } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

interface Card { id: string; text: string }

function cardTexts(cards: Card[]): Map<string, string> {
  return new Map(cards.map((c) => [c.id, c.text]));
}

/**
 * Tap-to-reorder (not drag-and-drop) — a deliberate, explicitly-sanctioned fallback: works
 * identically on touch and mouse with no pointer-gesture code, and is exactly as functionally
 * correct as drag would be. Move-up/move-down buttons swap adjacent positions.
 */
function RankingList({ order, names, disabled, onMove }: { order: string[]; names: Map<string, string>; disabled: boolean; onMove: (index: number, direction: -1 | 1) => void }) {
  return (
    <ol className="flex flex-col gap-2" data-rank-it-list>
      {order.map((cardId, index) => (
        <li key={cardId} className="flex items-center gap-3 rounded-2xl border border-border bg-surface-1 p-3" data-rank-it-position={index + 1}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-brand font-mono text-lg font-extrabold text-white">
            {index + 1}
          </span>
          <span className="flex-1 text-base font-bold">{names.get(cardId) ?? cardId}</span>
          <div className="flex flex-col gap-1">
            <button
              type="button" disabled={disabled || index === 0} onClick={() => onMove(index, -1)} aria-label="نقل لأعلى"
              className="rounded-lg border border-border px-2 py-0.5 text-sm font-bold disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button" disabled={disabled || index === order.length - 1} onClick={() => onMove(index, 1)} aria-label="نقل لأسفل"
              className="rounded-lg border border-border px-2 py-0.5 text-sm font-bold disabled:opacity-30"
            >
              ▼
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PlayerRankIt({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const data = asObject(view);
  const cards = (Array.isArray(data?.cards) ? data.cards : []).flatMap((c) => {
    const obj = asObject(c);
    return obj && typeof obj.id === 'string' && typeof obj.text === 'string' ? [{ id: obj.id, text: obj.text }] : [];
  });
  const initialOrder = Array.isArray(data?.initialOrder) ? data.initialOrder.filter((id): id is string => typeof id === 'string') : cards.map((c) => c.id);
  const [order, setOrder] = useState<string[]>(initialOrder);
  if (!data) return null;

  const names = cardTexts(cards);
  const prompt = asObject(data.prompt ?? null);
  const submission = asObject(data.submission ?? null);
  const status = typeof data.status === 'string' ? data.status : 'ACTIVE';
  const submitted = submission?.status === 'submitted' && Array.isArray(submission.order);
  const submittedOrder = submitted ? (submission!.order as string[]) : null;

  if (status === 'REVEALED') {
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="RANK_IT" data-surface="player" data-rank-it-player="reveal">
        <h2 className="text-2xl font-bold">رتّبها</h2>
        <SubmissionStatus state={submitted ? 'LOCKED' : 'TIMEOUT'} />
        {submitted && submittedOrder ? (
          <ol className="flex flex-col gap-1 text-start">
            {submittedOrder.map((id, index) => <li key={id}>{index + 1}. {names.get(id) ?? id}</li>)}
          </ol>
        ) : <p className="text-xl font-bold">لم ترسل ترتيبًا</p>}
        <p className="text-ink-muted">شاهد بقية الترتيبات على الشاشة الرئيسية 👀</p>
      </div>
    );
  }

  if (submitted && submittedOrder) {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="RANK_IT" data-surface="player" data-rank-it-player="locked">
        <h2 className="text-center text-2xl font-bold">رتّبها</h2>
        {typeof prompt?.text === 'string' ? <PrivatePromptCard title="التعليمة">{prompt.text}</PrivatePromptCard> : null}
        <RankingList order={submittedOrder} names={names} disabled onMove={() => {}} />
        <SubmissionStatus state="LOCKED" />
        <WaitingForOthers />
      </div>
    );
  }

  function move(index: number, direction: -1 | 1) {
    setOrder((current) => {
      const next = [...current];
      const swapWith = index + direction;
      if (swapWith < 0 || swapWith >= next.length) return current;
      [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="RANK_IT" data-surface="player" data-rank-it-player="active">
      <h2 className="text-center text-2xl font-bold">رتّبها</h2>
      {typeof prompt?.text === 'string' ? <PrivatePromptCard title="التعليمة">{prompt.text}</PrivatePromptCard> : null}
      <RankingList order={order} names={names} disabled={actionPending} onMove={move} />
      <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <Button type="button" fullWidth loading={actionPending} disabled={actionPending || order.length !== 4} onClick={() => submitAction('SUBMIT_RANKING', { order })}>
        تثبيت الترتيب
      </Button>
    </div>
  );
}
