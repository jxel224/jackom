'use client';

import { useState } from 'react';
import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { SubmissionStatus, WaitingForOthers } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

const MAX_CHARACTERS = 80;

export function PlayerCompleteIt({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const [draft, setDraft] = useState('');
  const data = asObject(view);
  if (!data) return null;
  const prompt = asObject(data.prompt ?? null);
  const submission = asObject(data.submission ?? null);
  const status = typeof data.status === 'string' ? data.status : 'ACTIVE';
  const submitted = submission?.status === 'submitted' && typeof submission.text === 'string';
  const submittedText = submitted ? (submission!.text as string) : null;
  const maxChars = typeof data.maxCharacters === 'number' ? data.maxCharacters : MAX_CHARACTERS;

  if (status === 'REVEALED') {
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="COMPLETE_IT" data-surface="player" data-complete-it-player="reveal">
        <h2 className="text-2xl font-bold">كمّلها</h2>
        <SubmissionStatus state={submitted ? 'LOCKED' : 'TIMEOUT'} />
        <section className="rounded-3xl border border-border bg-surface-1 p-6">
          {submitted ? <p className="text-xl">إجابتك: <strong className="font-bold text-brand">{submittedText}</strong></p> : <p className="text-xl font-bold">لم تُرسل إجابة</p>}
          <p className="mt-3 text-ink-muted">شاهد بقية الإجابات على الشاشة الرئيسية 👀</p>
        </section>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="COMPLETE_IT" data-surface="player" data-complete-it-player="locked">
        <h2 className="text-center text-2xl font-bold">كمّلها</h2>
        {typeof prompt?.text === 'string' ? <PrivatePromptCard title="أكمل هذه الجملة">{prompt.text}</PrivatePromptCard> : null}
        <p className="text-center text-lg">إجابتك: <strong className="font-bold text-brand">{submittedText}</strong></p>
        <SubmissionStatus state="LOCKED" />
        <WaitingForOthers />
      </div>
    );
  }

  const trimmed = draft.trim();
  const tooLong = [...draft].length > maxChars;

  return (
    <div className="flex flex-col gap-4" data-minigame-id="COMPLETE_IT" data-surface="player" data-complete-it-player="active">
      <h2 className="text-center text-2xl font-bold">كمّلها</h2>
      {typeof prompt?.text === 'string' ? <PrivatePromptCard title="أكمل هذه الجملة">{prompt.text}</PrivatePromptCard> : null}
      <section className="rounded-3xl border border-border bg-surface-1 p-5">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={maxChars + 20}
          rows={3}
          disabled={actionPending}
          placeholder="اكتب إجابتك هنا…"
          className="w-full resize-none rounded-2xl border border-border bg-surface-0 p-3 text-lg text-ink outline-none focus:border-brand"
          data-complete-it-textarea
        />
        <p className={['mt-1 text-end text-sm', tooLong ? 'text-danger font-bold' : 'text-ink-subtle'].join(' ')}>
          {[...draft].length}/{maxChars}
        </p>
      </section>
      <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
      {actionError ? <ErrorMessage message={actionError.message} /> : null}
      <Button
        type="button" fullWidth loading={actionPending} disabled={trimmed.length === 0 || tooLong || actionPending}
        onClick={() => submitAction('SUBMIT_TEXT', { text: trimmed })}
      >
        إرسال الإجابة
      </Button>
    </div>
  );
}
