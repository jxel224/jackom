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
  | 'ACCUSATION_SELECT'
  | 'ACCUSATION_VOTE'
  | 'SPECIAL_GAME_INTRO'
  | 'SPECIAL_GAME_PLAY'
  | 'SPECIAL_GAME_RESULT'
  | 'FINAL_RESULTS'
  | 'REMATCH_LOBBY'
  | 'ABANDONED';

export type Role = 'CREW' | 'HACKER';

export type ConnectionStatus = 'connected' | 'disconnected' | 'afk';

export type Winner = 'crew' | 'hackers' | null;

/** A player's choice on a locked final accusation — see GAMEPLAY_RULES_V1.md's accusation system section. */
export type AccusationVoteChoice = 'APPROVE' | 'REJECT';

export type CorruptionRevealPolicy = 'on_results' | 'on_instructions' | 'never';

export type SpecialGameInsertionPoint = 'between_rounds' | 'end_of_cycle' | 'fixed_point';

/**
 * `pending` — investigation gameplay hasn't started yet (lobby/role assignment/reveal/intro).
 * `running` — counting down toward `deadlineAt`.
 * `paused` — special game is active; `remainingMs` is authoritative until resumed.
 * `stopped` — match is over (won by a resolved accusation or by the clock reaching zero); terminal.
 */
export type MatchClockStatus = 'pending' | 'running' | 'paused' | 'stopped';
