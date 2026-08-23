import type { JsonValue, PublicPlayerSummary } from '../../../lib/shared';
import { GameplayFallback, SpectatorState } from '../shared/GameplayStates';
import { GAME_TITLES, stringArrayField, stringField } from './view-data';
import type { DisplayError } from '../../../lib/realtime/public-types';
import { PlayerRankIt } from './minigames/rank-it/PlayerRankIt';
import { PlayerCompleteIt } from './minigames/complete-it/PlayerCompleteIt';
import { PlayerPredictThem } from './minigames/predict-them/PlayerPredictThem';
import { PlayerDefendIt } from './minigames/defend-it/PlayerDefendIt';
import { PlayerDescribeIt } from './minigames/describe-it/PlayerDescribeIt';
import { PlayerDrawIt } from './minigames/draw-it/PlayerDrawIt';
import { PlayerBombProtocol } from './minigames/bomb-protocol/PlayerBombProtocol';

function isGameplayId(value: string | null): value is keyof typeof GAME_TITLES { return value !== null && value in GAME_TITLES; }

export function PlayerMinigameRouter({ view, isParticipant, actionPending = false, actionError = null, submitAction = () => false, players = [] }: {
  view: JsonValue; isParticipant: boolean; actionPending?: boolean; actionError?: DisplayError | null;
  submitAction?: (actionType: string, data: JsonValue) => boolean; players?: PublicPlayerSummary[];
}) {
  const id = stringField(view, 'kind');
  if (!isGameplayId(id)) return <GameplayFallback kind="minigame" />;
  const participants = stringArrayField(view, 'participantIds');
  if (!isParticipant || stringField(view, 'status') === 'SPECTATING') return <SpectatorState participantIds={participants} />;
  if (id === 'RANK_IT') return <PlayerRankIt view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  if (id === 'COMPLETE_IT') return <PlayerCompleteIt view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  if (id === 'PREDICT_THEM') return <PlayerPredictThem view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  if (id === 'DEFEND_IT') return <PlayerDefendIt view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} players={players} />;
  if (id === 'DESCRIBE_IT') return <PlayerDescribeIt view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} players={players} />;
  if (id === 'DRAW_IT') return <PlayerDrawIt view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  if (id === 'BOMB_PROTOCOL') return <PlayerBombProtocol view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  return <GameplayFallback kind="minigame" />;
}
