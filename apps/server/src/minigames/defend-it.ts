import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';
import { DEFEND_IT_FOLLOW_UP_STRATEGY } from './defend-it-selection.js';

export const DEFEND_IT_PREP_DURATION_MS = 10_000;
export const DEFEND_IT_DEFENCE_DURATION_MS = 15_000;
export const DEFEND_IT_FOLLOW_UP_QUESTION_DURATION_MS = 8_000;
export const DEFEND_IT_FOLLOW_UP_RESPONSE_DURATION_MS = 10_000;

export type DefendItStep = 'PREP' | 'DEFENCE' | 'FOLLOW_UP_QUESTION' | 'FOLLOW_UP_RESPONSE' | 'COMPLETED';
export type DefendItStageResult = 'FINISHED' | 'TIMEOUT';

const AssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z.object({
  speakerOrder: z.array(z.string().min(1)).min(2).max(4),
  statementAssignments: z.record(z.string(), AssignmentSchema),
  statements: z.tuple([z.string().min(1), z.string().min(1)]),
  followUpStrategy: z.literal(DEFEND_IT_FOLLOW_UP_STRATEGY),
  followUpAskerIds: z.record(z.string(), z.string().min(1)),
}).strict();
const EmptyActionSchema = z.object({}).strict();

export interface DefendItTurnResult extends Record<string, JsonValue> {
  askerId: string;
  defence: DefendItStageResult;
  followUpQuestion: DefendItStageResult | 'PENDING';
  followUpResponse: DefendItStageResult | 'PENDING';
}

export interface DefendItState extends Record<string, JsonValue> {
  kind: 'DEFEND_IT';
  participantIds: string[];
  statementAssignments: Record<string, { contentId: string; prompt: string }>;
  statements: [string, string];
  speakerOrder: string[];
  currentSpeakerIndex: number;
  step: DefendItStep;
  followUpStrategy: typeof DEFEND_IT_FOLLOW_UP_STRATEGY;
  followUpAskerIds: Record<string, string>;
  turnResults: Record<string, DefendItTurnResult>;
}

function speaker(state: DefendItState): string | null {
  return state.step === 'PREP' || state.step === 'COMPLETED'
    ? null
    : (state.speakerOrder[state.currentSpeakerIndex] ?? null);
}

function asker(state: DefendItState): string | null {
  const speakerId = speaker(state);
  return speakerId && (state.step === 'FOLLOW_UP_QUESTION' || state.step === 'FOLLOW_UP_RESPONSE')
    ? (state.followUpAskerIds[speakerId] ?? null)
    : null;
}

function finishDefence(state: DefendItState, result: DefendItStageResult): DefendItState {
  const speakerId = speaker(state);
  if (state.step !== 'DEFENCE' || !speakerId || state.turnResults[speakerId]) return state;
  return {
    ...state,
    step: 'FOLLOW_UP_QUESTION',
    turnResults: {
      ...state.turnResults,
      [speakerId]: {
        askerId: state.followUpAskerIds[speakerId]!,
        defence: result,
        followUpQuestion: 'PENDING',
        followUpResponse: 'PENDING',
      },
    },
  };
}

function finishQuestion(state: DefendItState, result: DefendItStageResult): DefendItState {
  const speakerId = speaker(state);
  const turn = speakerId ? state.turnResults[speakerId] : undefined;
  if (state.step !== 'FOLLOW_UP_QUESTION' || !speakerId || !turn || turn.followUpQuestion !== 'PENDING') return state;
  return {
    ...state,
    step: 'FOLLOW_UP_RESPONSE',
    turnResults: { ...state.turnResults, [speakerId]: { ...turn, followUpQuestion: result } },
  };
}

function finishResponse(state: DefendItState, result: DefendItStageResult): DefendItState {
  const speakerId = speaker(state);
  const turn = speakerId ? state.turnResults[speakerId] : undefined;
  if (state.step !== 'FOLLOW_UP_RESPONSE' || !speakerId || !turn || turn.followUpResponse !== 'PENDING') return state;
  const nextIndex = state.currentSpeakerIndex + 1;
  return {
    ...state,
    step: nextIndex >= state.speakerOrder.length ? 'COMPLETED' : 'DEFENCE',
    currentSpeakerIndex: nextIndex,
    turnResults: { ...state.turnResults, [speakerId]: { ...turn, followUpResponse: result } },
  };
}

function publicProgress(state: DefendItState) {
  return {
    participantIds: state.participantIds,
    speakerOrder: state.speakerOrder,
    step: state.step,
    currentSpeaker: speaker(state),
    currentFollowUpAsker: asker(state),
    currentSpeakerIndex: state.currentSpeakerIndex,
    completedPlayerIds: state.speakerOrder.filter((id) => state.turnResults[id]?.followUpResponse !== 'PENDING' && state.turnResults[id]),
  };
}

/**
 * Internal only — feeds `resolve()`'s `resultSummary`, which is persisted to `RoundRecord` for
 * debugging/analytics/match-history but is NEVER read by any view builder (verified: only
 * `minigameId`/`success` from `RoundRecord` ever reach a client, via `lastRoundResultFor`).
 */
function internalReveal(state: DefendItState) {
  return { statements: state.statements };
}

/**
 * Client-facing reveal (Core Logic Phase 1.1 fix — hack targets must stay completely secret).
 * `state.statements` is a fixed `[crewVariant, hackerVariant]` tuple — exposing it in that order
 * would label which entry is the hacker variant just as directly as a named field would. Sorting is
 * a stable, deterministic, role-blind ordering — no rng available in a pure view function, none needed.
 */
function publicReveal(state: DefendItState): { statements: [string, string] } {
  return { statements: [...state.statements].sort() as [string, string] };
}

export const DefendItModule: MiniGameModule<DefendItState> = {
  id: 'DEFEND_IT',
  version: '1.0.0',

  start: (ctx) => {
    if (ctx.participantIds.length < 2 || ctx.participantIds.length > 4 || new Set(ctx.participantIds).size !== ctx.participantIds.length) {
      throw new Error('DEFEND_IT requires two to four unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const participants = new Set(ctx.participantIds);
    if (config.speakerOrder.length !== participants.size || new Set(config.speakerOrder).size !== participants.size || config.speakerOrder.some((id) => !participants.has(id))) {
      throw new Error('DEFEND_IT speaker order must contain every participant exactly once');
    }
    if (Object.keys(config.statementAssignments).length !== participants.size || ctx.participantIds.some((id) => !config.statementAssignments[id])) {
      throw new Error('DEFEND_IT requires exactly one statement assignment per participant');
    }
    if (
      Object.keys(config.followUpAskerIds).length !== participants.size ||
      ctx.participantIds.some((id) => !participants.has(config.followUpAskerIds[id] ?? '') || config.followUpAskerIds[id] === id)
    ) {
      throw new Error('DEFEND_IT requires one eligible non-speaker follow-up asker per participant');
    }
    return {
      kind: 'DEFEND_IT',
      participantIds: [...ctx.participantIds],
      statementAssignments: config.statementAssignments,
      statements: config.statements,
      speakerOrder: [...config.speakerOrder],
      currentSpeakerIndex: 0,
      step: 'PREP',
      followUpStrategy: config.followUpStrategy,
      followUpAskerIds: config.followUpAskerIds,
      turnResults: {},
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (state.step === 'COMPLETED') return { valid: false, reason: 'Defend It is already complete' };
    if (!state.participantIds.includes(playerId)) return { valid: false, reason: 'Player is not a Defend It participant' };
    if (!EmptyActionSchema.safeParse(action).success) return { valid: false, reason: 'Verbal finish payload must be empty' };
    if (actionType === 'FINISH_DEFENCE') {
      return state.step === 'DEFENCE' && speaker(state) === playerId
        ? { valid: true } : { valid: false, reason: 'Player is not the active defender' };
    }
    if (actionType === 'FINISH_FOLLOW_UP_QUESTION') {
      return state.step === 'FOLLOW_UP_QUESTION' && asker(state) === playerId
        ? { valid: true } : { valid: false, reason: 'Player is not the designated follow-up asker' };
    }
    if (actionType === 'FINISH_FOLLOW_UP_RESPONSE') {
      return state.step === 'FOLLOW_UP_RESPONSE' && speaker(state) === playerId
        ? { valid: true } : { valid: false, reason: 'Player is not the active follow-up responder' };
    }
    return { valid: false, reason: 'Unknown Defend It action' };
  },

  handleAction: (state, _playerId, action, actionType) => {
    EmptyActionSchema.parse(action);
    if (actionType === 'FINISH_DEFENCE') return finishDefence(state, 'FINISHED');
    if (actionType === 'FINISH_FOLLOW_UP_QUESTION') return finishQuestion(state, 'FINISHED');
    if (actionType === 'FINISH_FOLLOW_UP_RESPONSE') return finishResponse(state, 'FINISHED');
    return state;
  },

  isComplete: (state) => state.step === 'COMPLETED',
  getInternalStep: (state) => `${state.step}:${state.currentSpeakerIndex}`,
  handleTimeout: (state) => {
    if (state.step === 'PREP') return { ...state, step: 'DEFENCE' };
    if (state.step === 'DEFENCE') return finishDefence(state, 'TIMEOUT');
    if (state.step === 'FOLLOW_UP_QUESTION') return finishQuestion(state, 'TIMEOUT');
    if (state.step === 'FOLLOW_UP_RESPONSE') return finishResponse(state, 'TIMEOUT');
    return state;
  },
  resolve: (state, reason) => ({
    success: state.step === 'COMPLETED',
    scoreDeltas: {},
    resultSummary: { kind: 'DEFEND_IT', reason, ...internalReveal(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { spokenOnly: true, followUpStrategy: DEFEND_IT_FOLLOW_UP_STRATEGY } }),
  getDurationMs: (_ctx, state) => {
    if (!state || state.step === 'PREP') return DEFEND_IT_PREP_DURATION_MS;
    if (state.step === 'DEFENCE') return DEFEND_IT_DEFENCE_DURATION_MS;
    if (state.step === 'FOLLOW_UP_QUESTION') return DEFEND_IT_FOLLOW_UP_QUESTION_DURATION_MS;
    return DEFEND_IT_FOLLOW_UP_RESPONSE_DURATION_MS;
  },

  buildTvView: (state, view): JsonValue => view.revealResults
    ? { kind: 'DEFEND_IT', status: 'REVEALED', ...publicReveal(state) }
    : { kind: 'DEFEND_IT', ...publicProgress(state) },

  buildPlayerView: (state, playerId, _role, view): JsonValue => {
    if (view.revealResults) return { kind: 'DEFEND_IT', status: 'REVEALED', ...publicReveal(state) };
    const assignment = state.statementAssignments[playerId];
    return {
      kind: 'DEFEND_IT',
      ...publicProgress(state),
      statement: assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      isYourDefence: state.step === 'DEFENCE' && speaker(state) === playerId,
      isFollowUpAsker: state.step === 'FOLLOW_UP_QUESTION' && asker(state) === playerId,
      isFollowUpResponder: state.step === 'FOLLOW_UP_RESPONSE' && speaker(state) === playerId,
      turnStatus: state.turnResults[playerId]?.followUpResponse !== 'PENDING' && state.turnResults[playerId]
        ? 'COMPLETED' : (speaker(state) === playerId ? 'CURRENT' : 'UPCOMING'),
    };
  },

  buildSpectatorView: (state, view): JsonValue => view.revealResults
    ? { kind: 'DEFEND_IT', status: 'REVEALED', ...publicReveal(state) }
    : { kind: 'DEFEND_IT', status: 'SPECTATING', ...publicProgress(state) },
};
