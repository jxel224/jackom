import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

export const DRAW_IT_DURATION_MS = 30_000;
export const DRAW_IT_MAX_STROKES = 32;
export const DRAW_IT_MAX_POINTS_PER_STROKE = 256;
export const DRAW_IT_MAX_TOTAL_POINTS = 2_048;

const PromptAssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z.object({ promptAssignments: z.record(z.string(), PromptAssignmentSchema) }).strict();
const PointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
}).strict();
const StrokeSchema = z.object({ points: z.array(PointSchema).min(1).max(DRAW_IT_MAX_POINTS_PER_STROKE) }).strict();
const DrawingActionSchema = z
  .object({ strokes: z.array(StrokeSchema).max(DRAW_IT_MAX_STROKES) })
  .strict()
  .superRefine(({ strokes }, context) => {
    const totalPoints = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
    if (totalPoints > DRAW_IT_MAX_TOTAL_POINTS) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Drawing has too many total points' });
    }
  });

export interface DrawPoint extends Record<string, JsonValue> {
  x: number;
  y: number;
}

export interface DrawStroke extends Record<string, JsonValue> {
  points: DrawPoint[];
}

export interface DrawItState extends Record<string, JsonValue> {
  kind: 'DRAW_IT';
  participantIds: string[];
  promptAssignments: Record<string, { contentId: string; prompt: string }>;
  submissions: Record<string, { status: 'submitted'; strokes: DrawStroke[] }>;
  status: 'ACTIVE' | 'COMPLETED';
}

function publicDrawings(state: DrawItState): Array<{ playerId: string; status: string; strokes?: DrawStroke[] }> {
  return state.participantIds.map((playerId) => {
    const submission = state.submissions[playerId];
    return submission
      ? { playerId, status: 'submitted', strokes: submission.strokes }
      : { playerId, status: 'no_answer' };
  });
}

export const DrawItModule: MiniGameModule<DrawItState> = {
  id: 'DRAW_IT',
  version: '1.0.0',

  start: (ctx) => {
    if (
      ctx.participantIds.length < 2 ||
      ctx.participantIds.length > 4 ||
      new Set(ctx.participantIds).size !== ctx.participantIds.length
    ) {
      throw new Error('DRAW_IT requires two to four unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const assignedIds = Object.keys(config.promptAssignments);
    if (assignedIds.length !== ctx.participantIds.length || ctx.participantIds.some((id) => !config.promptAssignments[id])) {
      throw new Error('DRAW_IT requires exactly one prompt assignment per participant');
    }
    return {
      kind: 'DRAW_IT',
      participantIds: [...ctx.participantIds],
      promptAssignments: config.promptAssignments,
      submissions: {},
      status: 'ACTIVE',
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (actionType !== 'SUBMIT_DRAWING') return { valid: false, reason: 'Unknown Draw It action' };
    if (state.status === 'COMPLETED') return { valid: false, reason: 'Draw It is already complete' };
    if (!state.participantIds.includes(playerId)) return { valid: false, reason: 'Player is not a Draw It participant' };
    if (state.submissions[playerId]) return { valid: false, reason: 'Drawing is already locked' };
    const parsed = DrawingActionSchema.safeParse(action);
    return parsed.success ? { valid: true } : { valid: false, reason: 'Drawing stroke payload is invalid or exceeds its limits' };
  },

  handleAction: (state, playerId, action) => {
    const parsed = DrawingActionSchema.parse(action);
    const submissions = {
      ...state.submissions,
      [playerId]: { status: 'submitted' as const, strokes: parsed.strokes },
    };
    return {
      ...state,
      submissions,
      status: state.participantIds.every((id) => submissions[id] !== undefined) ? 'COMPLETED' : 'ACTIVE',
    };
  },

  isComplete: (state) => state.status === 'COMPLETED',
  resolve: (state, reason) => ({
    success: state.participantIds.every((id) => state.submissions[id] !== undefined),
    scoreDeltas: {},
    resultSummary: { kind: 'DRAW_IT', reason, drawings: publicDrawings(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({
    default: {
      coordinateRange: [0, 1],
      maxStrokes: DRAW_IT_MAX_STROKES,
      maxPointsPerStroke: DRAW_IT_MAX_POINTS_PER_STROKE,
      maxTotalPoints: DRAW_IT_MAX_TOTAL_POINTS,
      finalSubmissionOnly: true,
    },
  }),
  getDurationMs: () => DRAW_IT_DURATION_MS,

  buildTvView: (state, view): JsonValue => {
    if (view.revealResults) return { kind: 'DRAW_IT', status: 'REVEALED', drawings: publicDrawings(state) };
    return {
      kind: 'DRAW_IT',
      status: 'ACTIVE',
      participantIds: state.participantIds,
      submittedCount: Object.keys(state.submissions).length,
      participantCount: state.participantIds.length,
    };
  },

  buildPlayerView: (state, playerId, _role, view): JsonValue => {
    if (view.revealResults) return { kind: 'DRAW_IT', status: 'REVEALED', drawings: publicDrawings(state) };
    const assignment = state.promptAssignments[playerId];
    const submission = state.submissions[playerId];
    return {
      kind: 'DRAW_IT',
      status: state.status,
      prompt: assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      submission: submission ? { status: 'submitted', blank: submission.strokes.length === 0 } : { status: 'not_submitted' },
      limits: {
        coordinateMin: 0,
        coordinateMax: 1,
        maxStrokes: DRAW_IT_MAX_STROKES,
        maxPointsPerStroke: DRAW_IT_MAX_POINTS_PER_STROKE,
        maxTotalPoints: DRAW_IT_MAX_TOTAL_POINTS,
      },
    };
  },

  buildSpectatorView: (state, view): JsonValue =>
    view.revealResults
      ? { kind: 'DRAW_IT', status: 'REVEALED', drawings: publicDrawings(state) }
      : { kind: 'DRAW_IT', status: 'SPECTATING', participantIds: state.participantIds },
};
