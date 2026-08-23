'use client';

import type { JsonValue, PublicPlayerSummary } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { Button } from '../../../../ui/Button';
import { ErrorMessage } from '../../../../ui/ErrorMessage';
import { Panel } from '../../../../ui/Panel';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { SubmissionStatus } from '../../../shared/GameplayStates';
import { asObject } from '../../view-data';

function nameFor(players: PublicPlayerSummary[], playerId: string | null): string | null {
  if (!playerId) return null;
  return players.find((player) => player.playerId === playerId)?.name ?? null;
}

export function PlayerDescribeIt({ view, actionPending, actionError, submitAction, players }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean; players: PublicPlayerSummary[];
}) {
  const data = asObject(view);
  if (!data) return null;
  const status = typeof data.status === 'string' ? data.status : null;
  const step = typeof data.step === 'string' ? data.step : null;
  const hiddenWord = asObject(data.hiddenWord ?? null);
  const currentSpeaker = typeof data.currentSpeaker === 'string' ? data.currentSpeaker : null;
  const isYourTurn = data.isYourTurn === true;

  if (status === 'REVEALED') {
    const words = Array.isArray(data.words) ? data.words.filter((item): item is string => typeof item === 'string') : [];
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="DESCRIBE_IT" data-surface="player" data-describe-it-player="reveal">
        <h2 className="text-2xl font-bold">صفها</h2>
        <Panel className="flex flex-col gap-2">
          <p className="text-ink-muted">الكلمتان</p>
          {words.map((text) => <p key={text} className="text-lg font-bold">{text}</p>)}
        </Panel>
        <p className="text-ink-muted">شاهد التفاصيل الكاملة على الشاشة الرئيسية 👀</p>
      </div>
    );
  }

  const wordCard = typeof hiddenWord?.text === 'string'
    ? <PrivatePromptCard title="كلمتك">{hiddenWord.text}</PrivatePromptCard> : null;

  if (step === 'THINK') {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DESCRIBE_IT" data-surface="player" data-describe-it-player="think">
        <h2 className="text-center text-2xl font-bold">صفها</h2>
        {wordCard}
        <Panel className="text-center"><p>فكّر في كيفية وصف كلمتك بصوت عالٍ دون ذكرها مباشرة.</p></Panel>
      </div>
    );
  }

  if (step === 'SPEAKING') {
    if (isYourTurn) {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="DESCRIBE_IT" data-surface="player" data-describe-it-player="your-turn">
          <h2 className="text-center text-2xl font-bold">صفها</h2>
          {wordCard}
          <Panel className="text-center"><p className="text-lg font-bold">دورك الآن! صف كلمتك بصوت عالٍ.</p></Panel>
          <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
          {actionError ? <ErrorMessage message={actionError.message} /> : null}
          <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('FINISH_SPEAKING', {})}>
            انتهيت من الوصف
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DESCRIBE_IT" data-surface="player" data-describe-it-player="watching">
        <h2 className="text-center text-2xl font-bold">صفها</h2>
        {wordCard}
        <Panel className="text-center"><p>{nameFor(players, currentSpeaker) ?? 'لاعب آخر'} يصف كلمته الآن…</p></Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="DESCRIBE_IT" data-surface="player" data-describe-it-player="completed">
      <h2 className="text-center text-2xl font-bold">صفها</h2>
      <Panel className="text-center"><p>انتهت جميع الأدوار. بانتظار النتيجة…</p></Panel>
    </div>
  );
}
