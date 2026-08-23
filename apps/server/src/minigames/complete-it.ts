import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

export const COMPLETE_IT_DURATION_MS = 45_000;
export const COMPLETE_IT_MAX_CHARACTERS = 80;

const PromptAssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z.object({ promptAssignments: z.record(z.string(), PromptAssignmentSchema) }).strict();
const SubmitTextActionSchema = z
  .object({ text: z.string() })
  .strict()
  .superRefine(({ text }, context) => {
    const normalized = text.trim();
    if (normalized.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Answer cannot be blank' });
    }
    if (Array.from(normalized).length > COMPLETE_IT_MAX_CHARACTERS) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'Answer is too long' });
    }
  });

export interface CompleteItState extends Record<string, JsonValue> {
  kind: 'COMPLETE_IT';
  participantIds: string[];
  promptAssignments: Record<string, { contentId: string; prompt: string }>;
  submissions: Record<string, { status: 'submitted'; text: string }>;
  status: 'ACTIVE' | 'COMPLETED';
}

function normalizeAnswer(text: string): string {
  return text.trim();
}

function publicResults(state: CompleteItState): Array<{ playerId: string; status: string; text?: string }> {
  return state.participantIds.map((playerId) => {
    const submission = state.submissions[playerId];
    return submission ? { playerId, status: 'submitted', text: submission.text } : { playerId, status: 'no_answer' };
  });
}

export const CompleteItModule: MiniGameModule<CompleteItState> = {
  id: 'COMPLETE_IT',
  version: '1.0.0',

  start: (ctx) => {
    if (ctx.participantIds.length === 0 || new Set(ctx.participantIds).size !== ctx.participantIds.length) {
      throw new Error('COMPLETE_IT requires a non-empty, unique participant set');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const assignedIds = Object.keys(config.promptAssignments);
    if (assignedIds.length !== ctx.participantIds.length || ctx.participantIds.some((id) => !config.promptAssignments[id])) {
      throw new Error('COMPLETE_IT requires exactly one prompt assignment per participant');
    }
    return {
      kind: 'COMPLETE_IT',
      participantIds: [...ctx.participantIds],
      promptAssignments: config.promptAssignments,
      submissions: {},
      status: 'ACTIVE',
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (actionType !== 'SUBMIT_TEXT') return { valid: false, reason: 'Unknown Complete It action' };
    if (state.status === 'COMPLETED') return { valid: false, reason: 'Complete It is already complete' };
    if (!state.participantIds.includes(playerId)) return { valid: false, reason: 'Player is not a Complete It participant' };
    if (state.submissions[playerId]) return { valid: false, reason: 'Answer is already locked' };
    const parsed = SubmitTextActionSchema.safeParse(action);
    return parsed.success
      ? { valid: true }
      : { valid: false, reason: 'Answer must be non-empty text of at most 80 characters' };
  },

  handleAction: (state, playerId, action) => {
    const parsed = SubmitTextActionSchema.parse(action);
    const submissions = {
      ...state.submissions,
      [playerId]: { status: 'submitted' as const, text: normalizeAnswer(parsed.text) },
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
    resultSummary: { kind: 'COMPLETE_IT', reason, results: publicResults(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { maxCharacters: COMPLETE_IT_MAX_CHARACTERS, submitOnce: true } }),
  getDurationMs: () => COMPLETE_IT_DURATION_MS,

  buildTvView: (state, view): JsonValue => {
    if (view.revealResults) {
      return { kind: 'COMPLETE_IT', status: 'REVEALED', results: publicResults(state) };
    }
    return {
      kind: 'COMPLETE_IT',
      status: 'ACTIVE',
      submittedCount: Object.keys(state.submissions).length,
      participantCount: state.participantIds.length,
    };
  },

  buildPlayerView: (state, playerId, _role, view) => {
    const assignment = state.promptAssignments[playerId];
    const ownSubmission = state.submissions[playerId];
    return {
      kind: 'COMPLETE_IT',
      status: view.revealResults ? 'REVEALED' : state.status,
      prompt: assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      submission: ownSubmission ?? { status: 'not_submitted' },
      maxCharacters: COMPLETE_IT_MAX_CHARACTERS,
      ...(view.revealResults ? { results: publicResults(state) } : {}),
    };
  },

  buildSpectatorView: (state, view): JsonValue => {
    if (view.revealResults) {
      return { kind: 'COMPLETE_IT', status: 'REVEALED', results: publicResults(state) };
    }
    return { kind: 'COMPLETE_IT', status: 'SPECTATING' };
  },
};
