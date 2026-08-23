import type { ReactNode } from 'react';
import type { JsonValue } from '../../../lib/shared';
import type { DisplayError, TvView } from '../../../lib/realtime/public-types';
import { Panel } from '../../ui/Panel';
import { StatusBadge } from '../../ui/StatusBadge';
import { GameplayFallback } from '../shared/GameplayStates';
import { TvGameplayLayout } from '../shared/GameplayLayouts';
import { ParticipantList } from '../shared/ParticipantList';
import { TvMinigameRouter } from './TvMinigameRouter';
import { TvAccusationPanel } from './TvAccusationPanel';
import { TvFinalResults } from './TvFinalResults';
import { HeadquartersScene } from './headquarters/HeadquartersScene';

/**
 * Phases with no minigame/special-game/accusation/final-results content of their own — i.e.
 * exactly the phases that used to fall through to the generic `{label}` fallback panel below.
 * These render the Headquarters scene (B+ visual implementation) instead of any prior treatment.
 * HACKER_CORRUPTION is deliberately included with NO special-casing anywhere in this file or in
 * HeadquartersScene: rendering it identically to every other HQ phase IS the secrecy guarantee
 * (Bible §08/§28 — the TV must show nothing during the hack window).
 */
const HEADQUARTERS_PHASES = new Set(['GAME_INTRO', 'ROLE_ASSIGNMENT', 'ROLE_REVEAL', 'MINIGAME_SELECT', 'HACKER_CORRUPTION', 'DISCUSSION']);

const PHASE_LABELS: Record<string, string> = {
  ROLE_ASSIGNMENT: 'توزيع الأدوار', ROLE_REVEAL: 'كشف الأدوار', GAME_INTRO: 'بداية المباراة',
  MINIGAME_SELECT: 'اختيار اللعبة', HACKER_CORRUPTION: 'مرحلة الاختراق', MINIGAME_INSTRUCTIONS: 'تعليمات اللعبة',
  MINIGAME_PLAY: 'جولة اللعب', RESULTS_REVEAL: 'كشف النتائج', DISCUSSION: 'النقاش',
  ACCUSATION_SELECT: 'اختيار المتهمين', ACCUSATION_VOTE: 'التصويت على الاتهام', SPECIAL_GAME_INTRO: 'اللعبة الخاصة',
  SPECIAL_GAME_PLAY: 'اللعبة الخاصة', SPECIAL_GAME_RESULT: 'نتيجة اللعبة الخاصة',
  FINAL_RESULTS: 'النتيجة النهائية', REMATCH_LOBBY: 'إعادة اللعب', ABANDONED: 'انتهت الغرفة',
};

function deadline(view: TvView) { return view.phase.durationMs === null ? null : view.phase.phaseStartedAt + view.phase.durationMs; }

/** Persistent, low-weight status strip — current Admin (if any) + Firewall state. Milestone 14/15: TV information completeness. */
function TvStatusStrip({ view }: { view: TvView }) {
  const admin = view.players.find((p) => p.playerId === view.adminId);
  if (!admin && !view.firewallActive) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {admin ? <StatusBadge tone="info">{admin.name} مسؤول الجولة</StatusBadge> : null}
      {view.firewallActive ? <StatusBadge tone="success">الجدار الناري مفعّل</StatusBadge> : null}
    </div>
  );
}

export function TvPhaseRouter({ view, startPending = false, startError = null, sendHostEvent = () => false }: {
  view: TvView;
  startPending?: boolean;
  startError?: DisplayError | null;
  sendHostEvent?: (type: string, extra?: Record<string, JsonValue>) => boolean;
}) {
  const phase = view.phase.state;
  const label = PHASE_LABELS[phase];
  if (!label) return <GameplayFallback kind="phase" />;

  if (HEADQUARTERS_PHASES.has(phase)) {
    return <HeadquartersScene view={view} phaseLabel={label} phaseDeadlineAt={deadline(view)} />;
  }

  const normal = view.currentMinigame;
  const special = view.currentSpecialGame;
  const isNormal = phase === 'MINIGAME_INSTRUCTIONS' || phase === 'MINIGAME_PLAY' || phase === 'RESULTS_REVEAL';
  const isSpecial = phase === 'SPECIAL_GAME_INTRO' || phase === 'SPECIAL_GAME_PLAY' || phase === 'SPECIAL_GAME_RESULT';

  let body: ReactNode;
  if (isNormal) {
    body = normal ? <TvMinigameRouter minigameId={normal.minigameId} view={normal.tvView} reveal={phase === 'RESULTS_REVEAL'} players={view.players} /> : <GameplayFallback />;
  } else if (isSpecial) {
    body = special
      ? <TvMinigameRouter minigameId="BOMB_PROTOCOL" view={special.tvView} reveal={phase === 'SPECIAL_GAME_RESULT'} players={view.players} />
      : phase === 'SPECIAL_GAME_INTRO' ? <Panel className="text-tv-base">استعدوا للعبة الخاصة</Panel> : <GameplayFallback />;
  } else if (phase === 'ACCUSATION_SELECT' || phase === 'ACCUSATION_VOTE') {
    body = <TvAccusationPanel view={view} />;
  } else if (phase === 'FINAL_RESULTS') {
    body = <TvFinalResults view={view} startPending={startPending} startError={startError} sendHostEvent={sendHostEvent} />;
  } else {
    body = <Panel className="flex min-h-64 items-center justify-center text-tv-base" data-phase-family="match">{label}</Panel>;
  }

  return (
    <TvGameplayLayout title={isSpecial ? 'Bomb Protocol' : 'الهاكرز'} phaseLabel={label} deadlineAt={deadline(view)} footer={<ParticipantList players={view.players} />}>
      <div className="flex flex-col gap-4">
        <TvStatusStrip view={view} />
        {body}
      </div>
    </TvGameplayLayout>
  );
}
