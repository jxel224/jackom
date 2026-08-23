export type QuizStatus = 'setup' | 'active' | 'paused' | 'completed';
export type QuestionState = 'available' | 'active' | 'completed';
export type QuestionType = 'text' | 'image' | 'audio' | 'video';
export type PowerUpId = 'double-answer' | 'score-attack' | 'pass-trap';
export type ScoreEventType = 'correct' | 'steal' | 'powerup' | 'penalty' | 'manual_adjustment';

export interface QuizCategory { id: string; name: string; description: string; icon: string }
export interface QuizQuestion { id: string; categoryId: string; type: QuestionType; questionText: string; answer: string; explanation?: string; points: number; mediaUrl?: string }
export interface QuizTeam { id: 'team-1' | 'team-2'; name: string; color: string; score: number; powerUps: Record<PowerUpId, number> }
export interface QuizQuestionResult { questionId: string; state: QuestionState; selectedBy: QuizTeam['id']; awardedTo?: QuizTeam['id']; outcome?: 'correct' | 'wrong' | 'steal' | 'no-points'; powerUp?: PowerUpId }
export interface ScoreEvent { id: string; gameId: string; questionId?: string; teamId: QuizTeam['id']; points: number; eventType: ScoreEventType; timestamp: string }
export interface QuizConfig { categoryCount: number; questionsPerCategory: number; pointValues: number[]; activeSeconds: number; stealSeconds: number; scoreAttackMultiplier: number; trapPenalty: number }
export interface QuizSession {
  version: 1; id: string; status: QuizStatus; createdAt: string; updatedAt: string;
  teams: [QuizTeam, QuizTeam]; selectedCategoryIds: string[]; questions: QuizQuestion[];
  results: Record<string, QuizQuestionResult>; scoreEvents: ScoreEvent[]; currentTeamId: QuizTeam['id'];
  currentQuestionId?: string; questionPhase?: 'answering' | 'steal' | 'revealed'; activePowerUp?: PowerUpId;
  gameStartedAt?: string; gameCompletedAt?: string; config: QuizConfig;
}

