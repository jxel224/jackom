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

export function PlayerDefendIt({ view, actionPending, actionError, submitAction, players }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean; players: PublicPlayerSummary[];
}) {
  const data = asObject(view);
  if (!data) return null;
  const status = typeof data.status === 'string' ? data.status : null;
  const step = typeof data.step === 'string' ? data.step : null;
  const statement = asObject(data.statement ?? null);
  const currentSpeaker = typeof data.currentSpeaker === 'string' ? data.currentSpeaker : null;
  const currentAsker = typeof data.currentFollowUpAsker === 'string' ? data.currentFollowUpAsker : null;
  const isYourDefence = data.isYourDefence === true;
  const isFollowUpAsker = data.isFollowUpAsker === true;
  const isFollowUpResponder = data.isFollowUpResponder === true;

  if (status === 'REVEALED') {
    const statements = Array.isArray(data.statements) ? data.statements.filter((item): item is string => typeof item === 'string') : [];
    return (
      <div className="flex flex-col gap-4 text-center" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="reveal">
        <h2 className="text-2xl font-bold">دافع عنها</h2>
        <Panel className="flex flex-col gap-2">
          <p className="text-ink-muted">العبارتان</p>
          {statements.map((text) => <p key={text} className="text-lg font-bold">{text}</p>)}
        </Panel>
        <p className="text-ink-muted">شاهد التفاصيل الكاملة على الشاشة الرئيسية 👀</p>
      </div>
    );
  }

  const statementCard = typeof statement?.text === 'string'
    ? <PrivatePromptCard title="عبارتك">{statement.text}</PrivatePromptCard> : null;

  if (step === 'PREP') {
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="prep">
        <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
        {statementCard}
        <Panel className="text-center"><p>استعد للدفاع عن عبارتك بصوت عالٍ عند دورك.</p></Panel>
      </div>
    );
  }

  if (step === 'DEFENCE') {
    if (isYourDefence) {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="your-defence">
          <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
          {statementCard}
          <Panel className="text-center"><p className="text-lg font-bold">دورك الآن! دافع عن عبارتك بصوت عالٍ.</p></Panel>
          <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
          {actionError ? <ErrorMessage message={actionError.message} /> : null}
          <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('FINISH_DEFENCE', {})}>
            انتهيت من الدفاع
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="watching-defence">
        <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
        {statementCard}
        <Panel className="text-center"><p>{nameFor(players, currentSpeaker) ?? 'لاعب آخر'} يدافع الآن…</p></Panel>
      </div>
    );
  }

  if (step === 'FOLLOW_UP_QUESTION') {
    if (isFollowUpAsker) {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="your-question">
          <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
          <Panel className="text-center"><p className="text-lg font-bold">دورك! اطرح سؤال متابعة على {nameFor(players, currentSpeaker) ?? 'المدافع'}.</p></Panel>
          <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
          {actionError ? <ErrorMessage message={actionError.message} /> : null}
          <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('FINISH_FOLLOW_UP_QUESTION', {})}>
            انتهيت من السؤال
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="watching-question">
        <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
        <Panel className="text-center"><p>{nameFor(players, currentAsker) ?? 'لاعب آخر'} يطرح سؤالًا على {nameFor(players, currentSpeaker) ?? 'المدافع'}…</p></Panel>
      </div>
    );
  }

  if (step === 'FOLLOW_UP_RESPONSE') {
    if (isFollowUpResponder) {
      return (
        <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="your-response">
          <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
          <Panel className="text-center"><p className="text-lg font-bold">دورك للرد على السؤال.</p></Panel>
          <SubmissionStatus state={actionError ? 'ERROR' : actionPending ? 'SUBMITTING' : 'READY'} />
          {actionError ? <ErrorMessage message={actionError.message} /> : null}
          <Button type="button" fullWidth loading={actionPending} disabled={actionPending} onClick={() => submitAction('FINISH_FOLLOW_UP_RESPONSE', {})}>
            انتهيت من الرد
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="watching-response">
        <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
        <Panel className="text-center"><p>{nameFor(players, currentSpeaker) ?? 'المدافع'} يرد على السؤال…</p></Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="DEFEND_IT" data-surface="player" data-defend-it-player="completed">
      <h2 className="text-center text-2xl font-bold">دافع عنها</h2>
      <Panel className="text-center"><p>انتهت جميع الأدوار. بانتظار النتيجة…</p></Panel>
    </div>
  );
}
