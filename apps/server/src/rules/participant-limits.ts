/**
 * The single source of truth for every normal minigame's participant-count range
 * (GAMEPLAY_RULES_V1.md §5). Nothing outside this file hardcodes a minigame's min/max — the old
 * per-game magic numbers scattered through fsm/transitions.ts were removed when the Admin took
 * over participant selection from the automatic random-subset logic they used to feed.
 */
export interface ParticipantLimit {
  min: number;
  max: number;
}

export const MINIGAME_PARTICIPANT_LIMITS: Record<string, ParticipantLimit> = {
  DRAW_IT: { min: 2, max: 4 },
  COMPLETE_IT: { min: 2, max: 5 },
  /** Counts the *selected predictors* only — the rest of the eligible room becomes the audience automatically. */
  PREDICT_THEM: { min: 2, max: 4 },
  DEFEND_IT: { min: 2, max: 4 },
  DESCRIBE_IT: { min: 3, max: 5 },
  RANK_IT: { min: 2, max: 5 },
};

export function getParticipantLimit(minigameId: string): ParticipantLimit | null {
  return MINIGAME_PARTICIPANT_LIMITS[minigameId] ?? null;
}
