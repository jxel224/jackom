'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { SubmissionStatus, WaitingForOthers } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';
import { DrawingCanvas, type DrawStroke } from './DrawingCanvas';

const DEFAULT_MAX_STROKES = 32;
const DEFAULT_MAX_POINTS_PER_STROKE = 256;

export function PlayerDrawIt({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const data = asObject(view);
  if (!data) return null;
  const prompt = asObject(data.prompt ?? null);
  const submission = asObject(data.submission ?? null);
  const status = typeof data.status === 'string' ? data.status : 'ACTIVE';
  const submitted = submission?.status === 'submitted';
  const submittedBlank = submitted && submission?.blank === true;
  const limits = asObject(data.limits ?? null);
  const maxStrokes = typeof limits?.maxStrokes === 'number' ? limits.maxStrokes : DEFAULT_MAX_STROKES;
  const maxPointsPerStroke = typeof limits?.maxPointsPerStroke === 'number' ? limits.maxPointsPerStroke : DEFAULT_MAX_POINTS_PER_STROKE;

  if (status === 'REVEALED') {
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="DRAW_IT" data-surface="player" data-draw-it-player="reveal">
        <h2 className="text-2xl font-bold">ارسمها</h2>
        <SubmissionStatus state={submitted ? 'LOCKED' : 'TIMEOUT'} />
        <p className="text-ink-muted">شاهد كل الرسومات على الشاشة الرئيسية 👀</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DRAW_IT" data-surface="player" data-draw-it-player="locked">
        <h2 className="text-center text-2xl font-bold">ارسمها</h2>
        {typeof prompt?.text === 'string' ? <PrivatePromptCard title="ارسم هذه الكلمة">{prompt.text}</PrivatePromptCard> : null}
        <p className="text-center">{submittedBlank ? 'أُرسلت الرسمة فارغة.' : 'تم إرسال رسمتك.'}</p>
        <SubmissionStatus state="LOCKED" />
        <WaitingForOthers />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="DRAW_IT" data-surface="player" data-draw-it-player="active">
      <h2 className="text-center text-2xl font-bold">ارسمها</h2>
      {typeof prompt?.text === 'string' ? <PrivatePromptCard title="ارسم هذه الكلمة">{prompt.text}</PrivatePromptCard> : null}
      <DrawingCanvas
        strokes={strokes}
        disabled={actionPending || strokes.length >= maxStrokes}
        maxPointsPerStroke={maxPointsPerStroke}
        onStrokeComplete={(stroke) => setStrokes((current) => (current.length >= maxStrokes ? current : [...current, stroke]))}
      />
      <div className="flex gap-3">
        <Button type="button" variant="secondary" fullWidth disabled={strokes.length === 0 || actionPending} onClick={() => setStrokes((current) => current.slice(0, -1))}>
          تراجع
        </Button>
        <Button type="button" variant="ghost" fullWidth disabled={strokes.length === 0 || actionPending} onClick={() => setStrokes([])}>
          مسح الكل
        </Button>
      </div>
      <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('SUBMIT_DRAWING', { strokes })}>
        إرسال الرسمة
      </Button>
    </div>
  );
}
