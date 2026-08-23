import type { ReactNode } from 'react';
import type { DisplayError, PlayerView, PrivatePlayerPayload } from '../../../lib/realtime/public-types';
import type { JsonValue } from '../../../lib/shared';
import { Panel } from '../../ui/Panel';
import { GameplayFallback } from '../shared/GameplayStates';
import { PlayerGameplayLayout } from '../shared/GameplayLayouts';
import { PlayerMinigameRouter } from './PlayerMinigameRouter';
import { AdminMinigameSelect } from './AdminMinigameSelect';
import { HackerTargetSelect } from './HackerTargetSelect';
import { PushButtonControl } from './PushButtonControl';
import { AccusationSelect } from './AccusationSelect';
import { AccusationVote } from './AccusationVote';
import { FinalResultsPanel } from './FinalResultsPanel';

const PHASE_LABELS: Record<string, string> = {
  ROLE_ASSIGNMENT: 'توزيع الأدوار', ROLE_REVEAL: 'دورك', GAME_INTRO: 'بداية المباراة', MINIGAME_SELECT: 'اختيار اللعبة',
  HACKER_CORRUPTION: 'مرحلة الاختراق', MINIGAME_INSTRUCTIONS: 'تعليمات اللعبة', MINIGAME_PLAY: 'جولة اللعب', RESULTS_REVEAL: 'كشف النتائج',
  DISCUSSION: 'النقاش', ACCUSATION_SELECT: 'اختيار المتهمين', ACCUSATION_VOTE: 'التصويت على الاتهام',
  SPECIAL_GAME_INTRO: 'اللعبة الخاصة', SPECIAL_GAME_PLAY: 'اللعبة الخاصة', SPECIAL_GAME_RESULT: 'نتيجة اللعبة الخاصة',
  FINAL_RESULTS: 'النتيجة النهائية',
  REMATCH_LOBBY: 'إعادة اللعب', ABANDONED: 'انتهت الغرفة',
};
function deadline(view: PlayerView) { return view.phase.durationMs === null ? null : view.phase.phaseStartedAt + view.phase.durationMs; }

/** Non-Admin players' waiting state during MINIGAME_SELECT — names the current Admin, per the design brief. */
function WaitingForAdmin({ view }: { view: PlayerView }) {
  const admin = [view.self, ...view.others].find((p) => p.playerId === view.adminId);
  return (
    <Panel className="flex flex-col items-center gap-2 text-center">
      <p className="text-ink-muted">{admin ? `${admin.name} يختار اللعبة` : 'الأدمن يختار اللعبة'}</p>
    </Panel>
  );
}

export function PlayerPhaseRouter({ view, privateInfo, actionPending = false, actionError = null, submitAction = () => false, sendPlayerEvent = () => false }: {
  view: PlayerView; privateInfo: PrivatePlayerPayload | null; actionPending?: boolean; actionError?: DisplayError | null;
  submitAction?: (actionType: string, data: JsonValue) => boolean;
  sendPlayerEvent?: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const phase = view.phase.state;
  const label = PHASE_LABELS[phase];
  if (!label) return <GameplayFallback kind="phase" />;
  const gamePhase = phase === 'MINIGAME_INSTRUCTIONS' || phase === 'MINIGAME_PLAY' || phase === 'RESULTS_REVEAL' || phase === 'SPECIAL_GAME_PLAY' || phase === 'SPECIAL_GAME_RESULT';

  let body: ReactNode;
  if (gamePhase) {
    body = view.minigameView !== null
      ? <PlayerMinigameRouter key={`${view.phase.phaseId}:${String((view.minigameView as Record<string, unknown>)?.step ?? '')}`} view={view.minigameView} isParticipant={view.isParticipantThisRound} actionPending={actionPending} actionError={actionError} submitAction={submitAction} players={[view.self, ...view.others]} />
      : <GameplayFallback />;
  } else if (phase === 'ROLE_REVEAL') {
    body = <Panel variant="hard" className="text-center"><p className="text-ink-muted">دورك السري</p><p className="mt-3 text-3xl font-bold">{privateInfo?.role === 'HACKER' ? 'هاكر' : privateInfo?.role === 'CREW' ? 'طاقم' : 'بانتظار الدور…'}</p></Panel>;
  } else if (phase === 'MINIGAME_SELECT') {
    body = view.isAdmin && view.adminSelection
      ? <AdminMinigameSelect view={view} actionPending={actionPending} actionError={actionError} sendPlayerEvent={sendPlayerEvent} />
      : <WaitingForAdmin view={view} />;
  } else if (phase === 'HACKER_CORRUPTION') {
    body = view.hackerInfo
      ? <HackerTargetSelect view={view} actionPending={actionPending} actionError={actionError} sendPlayerEvent={sendPlayerEvent} />
      : <Panel className="flex min-h-48 items-center justify-center text-xl font-bold" data-phase-family="match">{label}</Panel>;
  } else if (phase === 'ACCUSATION_SELECT') {
    body = <AccusationSelect view={view} actionPending={actionPending} actionError={actionError} sendPlayerEvent={sendPlayerEvent} />;
  } else if (phase === 'ACCUSATION_VOTE') {
    body = <AccusationVote view={view} actionPending={actionPending} actionError={actionError} sendPlayerEvent={sendPlayerEvent} />;
  } else if (phase === 'FINAL_RESULTS') {
    body = <FinalResultsPanel view={view} />;
  } else {
    body = <Panel className="flex min-h-48 items-center justify-center text-xl font-bold" data-phase-family="match">{label}</Panel>;
  }

  return (
    <PlayerGameplayLayout title="الهاكرز" phaseLabel={label} deadlineAt={deadline(view)}>
      {body}
      {view.canPushButton ? <PushButtonControl actionPending={actionPending} actionError={actionError} sendPlayerEvent={sendPlayerEvent} /> : null}
    </PlayerGameplayLayout>
  );
}
