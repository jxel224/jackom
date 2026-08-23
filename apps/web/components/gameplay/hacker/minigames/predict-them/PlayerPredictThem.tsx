'use client';

import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { Panel } from '../../../../ui/Panel';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { SubmissionStatus, WaitingForOthers } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

const CHOICE_LABEL: Record<string, string> = { A: 'الخيار أ', B: 'الخيار ب', TIE: 'تعادل' };

function ChoiceButtons({ optionA, optionB, disabled, onChoose }: { optionA: string; optionB: string; disabled: boolean; onChoose: (choice: 'A' | 'B') => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Button type="button" fullWidth disabled={disabled} onClick={() => onChoose('A')}>{optionA}</Button>
      <Button type="button" fullWidth variant="secondary" disabled={disabled} onClick={() => onChoose('B')}>{optionB}</Button>
    </div>
  );
}

export function PlayerPredictThem({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const data = asObject(view);
  if (!data) return null;
  const status = typeof data.status === 'string' ? data.status : null;
  const group = typeof data.group === 'string' ? data.group : null;
  const step = typeof data.step === 'string' ? data.step : null;
  const options = asObject(data.options ?? null);
  const submission = asObject(data.submission ?? null);
  const submitted = submission?.status === 'submitted' && typeof submission.choice === 'string';
  const submittedChoice = submitted ? (submission!.choice as string) : null;

  if (status === 'REVEALED') {
    const audienceResult = asObject(data.audienceResult ?? null);
    const majority = typeof audienceResult?.majority === 'string' ? audienceResult.majority : null;
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="reveal">
        <h2 className="text-2xl font-bold">توقّعهم</h2>
        <Panel className="flex flex-col items-center gap-2">
          <p className="text-ink-muted">رأي الجمهور</p>
          <p className="text-2xl font-bold text-brand">{majority ? CHOICE_LABEL[majority] ?? majority : '—'}</p>
        </Panel>
        {submitted ? <p className="text-lg">توقعك: <strong className="font-bold text-brand">{CHOICE_LABEL[submittedChoice as string] ?? submittedChoice}</strong></p> : <p className="text-lg font-bold">لم ترسل توقعًا</p>}
        <p className="text-ink-muted">شاهد التفاصيل الكاملة على الشاشة الرئيسية 👀</p>
      </div>
    );
  }

  if (group === 'AUDIENCE') {
    if (step !== 'AUDIENCE_VOTE') {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="audience-waiting">
          <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
          <WaitingForOthers>تم تسجيل تصويتك. بانتظار توقعات اللاعبين المختارين…</WaitingForOthers>
        </div>
      );
    }
    if (submitted) {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="audience-locked">
          <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
          <p className="text-center text-lg">اخترت: <strong className="font-bold text-brand">{CHOICE_LABEL[submittedChoice as string] ?? submittedChoice}</strong></p>
          <SubmissionStatus state="LOCKED" />
          <WaitingForOthers />
        </div>
      );
    }
    const question = typeof data.question === 'string' ? data.question : null;
    return (
      <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="audience-active">
        <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
        {question ? <PrivatePromptCard title="صوّت الآن">{question}</PrivatePromptCard> : null}
        {options && typeof options.A === 'string' && typeof options.B === 'string' ? (
          <ChoiceButtons optionA={options.A} optionB={options.B} disabled={actionPending} onChoose={(choice) => submitAction('SUBMIT_AUDIENCE_VOTE', { choice })} />
        ) : null}
        <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
        {actionError ? <ErrorMessage message={actionError.message} /> : null}
      </div>
    );
  }

  // group === 'SELECTED'
  if (step === 'AUDIENCE_VOTE') {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="selected-waiting">
        <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
        <Panel className="text-center"><p>بانتظار انتهاء تصويت الجمهور…</p></Panel>
      </div>
    );
  }
  if (submitted) {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="selected-locked">
        <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
        <p className="text-center text-lg">توقعك: <strong className="font-bold text-brand">{CHOICE_LABEL[submittedChoice as string] ?? submittedChoice}</strong></p>
        <SubmissionStatus state="LOCKED" />
        <WaitingForOthers />
      </div>
    );
  }
  const prompt = asObject(data.prompt ?? null);
  return (
    <div className="flex flex-col gap-4" data-minigame-id="PREDICT_THEM" data-surface="player" data-predict-them-player="selected-active">
      <h2 className="text-center text-2xl font-bold">توقّعهم</h2>
      {typeof prompt?.text === 'string' ? <PrivatePromptCard title="بماذا توقعت أن يصوّت الجمهور؟">{prompt.text}</PrivatePromptCard> : null}
      {options && typeof options.A === 'string' && typeof options.B === 'string' ? (
        <ChoiceButtons optionA={options.A} optionB={options.B} disabled={actionPending} onChoose={(choice) => submitAction('SUBMIT_PREDICTION', { choice })} />
      ) : null}
      <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
    </div>
  );
}
