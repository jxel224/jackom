import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

export const PREDICT_THEM_AUDIENCE_DURATION_MS = 20_000;
export const PREDICT_THEM_PREDICTION_DURATION_MS = 20_000;

export type BinaryChoice = 'A' | 'B';
export type MajorityResult = BinaryChoice | 'TIE';
export type PredictThemStep = 'AUDIENCE_VOTE' | 'PREDICTION' | 'COMPLETED';

const PromptAssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z
  .object({
    selectedPlayerIds: z.array(z.string().min(1)).min(1).max(4),
    audienceQuestion: z.string().min(1),
    optionA: z.string().min(1),
    optionB: z.string().min(1),
    promptAssignments: z.record(z.string(), PromptAssignmentSchema),
  })
  .strict();
const ChoiceActionSchema = z.object({ choice: z.enum(['A', 'B']) }).strict();

export interface PredictThemState extends Record<string, JsonValue> {
  kind: 'PREDICT_THEM';
  selectedPlayerIds: string[];
  audiencePlayerIds: string[];
  step: PredictThemStep;
  audienceQuestion: string;
  optionA: string;
  optionB: string;
  promptAssignments: Record<string, { contentId: string; prompt: string }>;
  audienceVotes: Record<string, { status: 'submitted'; choice: BinaryChoice }>;
  predictions: Record<string, { status: 'submitted'; choice: BinaryChoice }>;
}

export function resolveMajority(aVotes: number, bVotes: number): MajorityResult {
  if (aVotes > bVotes) return 'A';
  if (bVotes > aVotes) return 'B';
  return 'TIE';
}

function audienceResult(state: PredictThemState) {
  const votes = Object.values(state.audienceVotes);
  const aVotes = votes.filter((vote) => vote.choice === 'A').length;
  const bVotes = votes.filter((vote) => vote.choice === 'B').length;
  return {
    aVotes,
    bVotes,
    noVotes: state.audiencePlayerIds.length - votes.length,
    majority: resolveMajority(aVotes, bVotes),
  };
}

function publicPredictions(state: PredictThemState): Array<{ playerId: string; status: string; choice?: BinaryChoice }> {
  return state.selectedPlayerIds.map((playerId) => {
    const prediction = state.predictions[playerId];
    return prediction
      ? { playerId, status: 'submitted', choice: prediction.choice }
      : { playerId, status: 'no_prediction' };
  });
}

function publicResult(state: PredictThemState) {
  return { audienceResult: audienceResult(state), predictions: publicPredictions(state) };
}

export const PredictThemModule: MiniGameModule<PredictThemState> = {
  id: 'PREDICT_THEM',
  version: '1.0.0',

  start: (ctx) => {
    if (ctx.participantIds.length < 2 || new Set(ctx.participantIds).size !== ctx.participantIds.length) {
      throw new Error('PREDICT_THEM requires at least two unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const selected = new Set(config.selectedPlayerIds);
    if (selected.size !== config.selectedPlayerIds.length || config.selectedPlayerIds.some((id) => !ctx.participantIds.includes(id))) {
      throw new Error('PREDICT_THEM selected players must be unique round participants');
    }
    const audiencePlayerIds = ctx.participantIds.filter((id) => !selected.has(id));
    if (audiencePlayerIds.length === 0) throw new Error('PREDICT_THEM requires at least one audience player');
    const assignedIds = Object.keys(config.promptAssignments);
    if (assignedIds.length !== selected.size || config.selectedPlayerIds.some((id) => !config.promptAssignments[id])) {
      throw new Error('PREDICT_THEM requires exactly one prompt assignment per selected player');
    }
    return {
      kind: 'PREDICT_THEM',
      selectedPlayerIds: [...config.selectedPlayerIds],
      audiencePlayerIds,
      step: 'AUDIENCE_VOTE',
      audienceQuestion: config.audienceQuestion,
      optionA: config.optionA,
      optionB: config.optionB,
      promptAssignments: config.promptAssignments,
      audienceVotes: {},
      predictions: {},
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (state.step === 'COMPLETED') return { valid: false, reason: 'Predict Them is already complete' };
    const parsed = ChoiceActionSchema.safeParse(action);
    if (!parsed.success) return { valid: false, reason: 'Choice must be A or B' };

    if (actionType === 'SUBMIT_AUDIENCE_VOTE') {
      if (state.step !== 'AUDIENCE_VOTE') return { valid: false, reason: 'Audience voting is closed' };
      if (!state.audiencePlayerIds.includes(playerId)) return { valid: false, reason: 'Player is not in the audience' };
      if (state.audienceVotes[playerId]) return { valid: false, reason: 'Audience vote is already locked' };
      return { valid: true };
    }
    if (actionType === 'SUBMIT_PREDICTION') {
      if (state.step !== 'PREDICTION') return { valid: false, reason: 'Prediction phase is not active' };
      if (!state.selectedPlayerIds.includes(playerId)) return { valid: false, reason: 'Player is not selected' };
      if (state.predictions[playerId]) return { valid: false, reason: 'Prediction is already locked' };
      return { valid: true };
    }
    return { valid: false, reason: 'Unknown Predict Them action' };
  },

  handleAction: (state, playerId, action, actionType) => {
    const { choice } = ChoiceActionSchema.parse(action);
    if (actionType === 'SUBMIT_AUDIENCE_VOTE') {
      const audienceVotes = { ...state.audienceVotes, [playerId]: { status: 'submitted' as const, choice } };
      return {
        ...state,
        audienceVotes,
        step: state.audiencePlayerIds.every((id) => audienceVotes[id] !== undefined) ? 'PREDICTION' : 'AUDIENCE_VOTE',
      };
    }
    if (actionType === 'SUBMIT_PREDICTION') {
      const predictions = { ...state.predictions, [playerId]: { status: 'submitted' as const, choice } };
      return {
        ...state,
        predictions,
        step: state.selectedPlayerIds.every((id) => predictions[id] !== undefined) ? 'COMPLETED' : 'PREDICTION',
      };
    }
    return state;
  },

  isComplete: (state) => state.step === 'COMPLETED',
  getInternalStep: (state) => state.step,
  handleTimeout: (state) => ({
    ...state,
    step: state.step === 'AUDIENCE_VOTE' ? 'PREDICTION' : 'COMPLETED',
  }),
  resolve: (state, reason) => ({
    success: true,
    scoreDeltas: {},
    resultSummary: { kind: 'PREDICT_THEM', reason, ...publicResult(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { choices: ['A', 'B'], internalSteps: true } }),
  getDurationMs: (_ctx, state) =>
    state?.step === 'PREDICTION' ? PREDICT_THEM_PREDICTION_DURATION_MS : PREDICT_THEM_AUDIENCE_DURATION_MS,

  buildTvView: (state, view): JsonValue => {
    if (view.revealResults) return { kind: 'PREDICT_THEM', status: 'REVEALED', ...publicResult(state) };
    const submittedCount = state.step === 'AUDIENCE_VOTE' ? Object.keys(state.audienceVotes).length : Object.keys(state.predictions).length;
    const total = state.step === 'AUDIENCE_VOTE' ? state.audiencePlayerIds.length : state.selectedPlayerIds.length;
    return { kind: 'PREDICT_THEM', status: state.step, submittedCount, total };
  },

  buildPlayerView: (state, playerId, _role, view): JsonValue => {
    if (view.revealResults) return { kind: 'PREDICT_THEM', status: 'REVEALED', ...publicResult(state) };
    if (state.audiencePlayerIds.includes(playerId)) {
      return {
        kind: 'PREDICT_THEM',
        group: 'AUDIENCE',
        step: state.step,
        question: state.step === 'AUDIENCE_VOTE' ? state.audienceQuestion : null,
        options: state.step === 'AUDIENCE_VOTE' ? { A: state.optionA, B: state.optionB } : null,
        submission: state.audienceVotes[playerId] ?? { status: 'not_submitted' },
      };
    }
    const assignment = state.promptAssignments[playerId];
    return {
      kind: 'PREDICT_THEM',
      group: 'SELECTED',
      step: state.step,
      prompt: state.step === 'PREDICTION' && assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      options: state.step === 'PREDICTION' ? { A: state.optionA, B: state.optionB } : null,
      submission: state.predictions[playerId] ?? { status: 'not_submitted' },
    };
  },

  buildSpectatorView: (state, view): JsonValue =>
    view.revealResults
      ? { kind: 'PREDICT_THEM', status: 'REVEALED', ...publicResult(state) }
      : { kind: 'PREDICT_THEM', status: 'SPECTATING', step: state.step },
};
