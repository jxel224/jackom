export type GameState =
  | 'ROOM_CREATED'
  | 'LOBBY'
  | 'ROLE_ASSIGNMENT'
  | 'ROLE_REVEAL'
  | 'GAME_INTRO'
  | 'MINIGAME_SELECT'
  | 'HACKER_CORRUPTION'
  | 'MINIGAME_INSTRUCTIONS'
  | 'MINIGAME_PLAY'
  | 'RESULTS_REVEAL'
  | 'DISCUSSION'
  | 'SPECIAL_GAME_INTRO'
  | 'SPECIAL_GAME_PLAY'
  | 'SPECIAL_GAME_RESULT'
  | 'FINAL_DISCUSSION'
  | 'VOTING'
  | 'ELIMINATION_RESULT'
  | 'FINAL_RESULTS'
  | 'REMATCH_LOBBY'
  | 'ABANDONED';

export type Role = 'CREW' | 'HACKER';

export type ConnectionStatus = 'connected' | 'disconnected' | 'afk';

export type Winner = 'crew' | 'hackers' | null;

export type TieBreakRule = 'no_elimination' | 'random' | 'revote';

export type CorruptionRevealPolicy = 'on_results' | 'on_instructions' | 'never';

export type SpecialGameInsertionPoint = 'between_rounds' | 'end_of_cycle' | 'fixed_point';

export type MatchClockMode = 'disabled' | 'countdown';

/** Reserved sentinel value for a vote that intentionally targets no one. */
export const SKIP_VOTE = 'skip' as const;
export type VoteTarget = string | typeof SKIP_VOTE;
