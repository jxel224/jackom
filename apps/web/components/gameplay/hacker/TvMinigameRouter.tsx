import type { JsonValue, PublicPlayerSummary } from '../../../lib/shared';
import { GameplayFallback } from '../shared/GameplayStates';
import { isGameplayId } from './view-data';
import { TvRankIt } from './minigames/rank-it/TvRankIt';
import { TvCompleteIt } from './minigames/complete-it/TvCompleteIt';
import { TvPredictThem } from './minigames/predict-them/TvPredictThem';
import { TvDefendIt } from './minigames/defend-it/TvDefendIt';
import { TvDescribeIt } from './minigames/describe-it/TvDescribeIt';
import { TvDrawIt } from './minigames/draw-it/TvDrawIt';
import { TvBombProtocol } from './minigames/bomb-protocol/TvBombProtocol';

export function TvMinigameRouter({ minigameId, view, reveal = false, players = [] }: { minigameId: string; view: JsonValue; reveal?: boolean; players?: PublicPlayerSummary[] }) {
  if (!isGameplayId(minigameId)) return <GameplayFallback kind="minigame" />;
  if (minigameId === 'RANK_IT') return <TvRankIt view={view} players={players} reveal={reveal} />;
  if (minigameId === 'COMPLETE_IT') return <TvCompleteIt view={view} players={players} reveal={reveal} />;
  if (minigameId === 'PREDICT_THEM') return <TvPredictThem view={view} players={players} reveal={reveal} />;
  if (minigameId === 'DEFEND_IT') return <TvDefendIt view={view} players={players} reveal={reveal} />;
  if (minigameId === 'DESCRIBE_IT') return <TvDescribeIt view={view} players={players} reveal={reveal} />;
  if (minigameId === 'DRAW_IT') return <TvDrawIt view={view} players={players} reveal={reveal} />;
  if (minigameId === 'BOMB_PROTOCOL') return <TvBombProtocol view={view} players={players} />;
  return <GameplayFallback kind="minigame" />;
}
