import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

const RANK_IT_DURATION_MS = 45_000;
const CARD_COUNT = 4;

const CardSchema = z.object({ id: z.string().min(1), text: z.string().min(1) }).strict();
const PromptAssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z.object({
  cards: z.array(CardSchema).length(CARD_COUNT),
  promptAssignments: z.record(z.string(), PromptAssignmentSchema),
  initialOrder: z.record(z.string(), z.array(z.string().min(1)).length(CARD_COUNT)),
}).strict();
const SubmitRankingActionSchema = z.object({ order: z.array(z.string().min(1)).length(CARD_COUNT) }).strict();

export interface RankItCard extends Record<string, JsonValue> {
  id: string;
  text: string;
}

export interface RankItState extends Record<string, JsonValue> {
  kind: 'RANK_IT';
  participantIds: string[];
  cards: RankItCard[];
  promptAssignments: Record<string, { contentId: string; prompt: string }>;
  /** Per-player randomized starting display order (GAMEPLAY_RULES_V1.md RANK_IT — avoids every player seeing an identical default order if they time out). */
  initialOrder: Record<string, string[]>;
  submissions: Record<string, { status: 'submitted'; order: string[] }>;
  status: 'ACTIVE' | 'COMPLETED';
}

function publicResults(state: RankItState): Array<{ playerId: string; status: string; order?: string[] }> {
  return state.participantIds.map((playerId) => {
    const submission = state.submissions[playerId];
    return submission ? { playerId, status: 'submitted', order: submission.order } : { playerId, status: 'no_answer' };
  });
}

export const RankItModule: MiniGameModule<RankItState> = {
  id: 'RANK_IT',
  version: '1.0.0',

  start: (ctx) => {
    if (ctx.participantIds.length < 2 || ctx.participantIds.length > 5 || new Set(ctx.participantIds).size !== ctx.participantIds.length) {
      throw new Error('RANK_IT requires two to five unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const cardIds = new Set(config.cards.map((c) => c.id));
    if (cardIds.size !== CARD_COUNT) throw new Error('RANK_IT requires exactly four unique cards');

    const assignedIds = Object.keys(config.promptAssignments);
    if (assignedIds.length !== ctx.participantIds.length || ctx.participantIds.some((id) => !config.promptAssignments[id])) {
      throw new Error('RANK_IT requires exactly one ranking-instruction assignment per participant');
    }
    if (ctx.participantIds.some((id) => {
      const order = config.initialOrder[id];
      return !order || order.length !== CARD_COUNT || new Set(order).size !== CARD_COUNT || order.some((cardId) => !cardIds.has(cardId));
    })) {
      throw new Error('RANK_IT requires a valid per-participant shuffled initial order covering exactly the four real cards');
    }

    return {
      kind: 'RANK_IT',
      participantIds: [...ctx.participantIds],
      cards: config.cards,
      promptAssignments: config.promptAssignments,
      initialOrder: config.initialOrder,
      submissions: {},
      status: 'ACTIVE',
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (actionType !== 'SUBMIT_RANKING') return { valid: false, reason: 'Unknown Rank It action' };
    if (state.status === 'COMPLETED') return { valid: false, reason: 'Rank It is already complete' };
    if (!state.participantIds.includes(playerId)) return { valid: false, reason: 'Player is not a Rank It participant' };
    if (state.submissions[playerId]) return { valid: false, reason: 'Ranking is already locked' };
    const parsed = SubmitRankingActionSchema.safeParse(action);
    if (!parsed.success) return { valid: false, reason: 'Ranking must contain exactly four card ids' };
    const cardIds = new Set(state.cards.map((c) => c.id));
    const { order } = parsed.data;
    if (new Set(order).size !== CARD_COUNT) return { valid: false, reason: 'Ranking must not contain duplicate card ids' };
    if (order.some((id) => !cardIds.has(id))) return { valid: false, reason: 'Ranking contains an unknown card id' };
    return { valid: true };
  },

  handleAction: (state, playerId, action) => {
    const { order } = SubmitRankingActionSchema.parse(action);
    const submissions = { ...state.submissions, [playerId]: { status: 'submitted' as const, order } };
    return {
      ...state,
      submissions,
      status: state.participantIds.every((id) => submissions[id] !== undefined) ? 'COMPLETED' : 'ACTIVE',
    };
  },

  isComplete: (state) => state.status === 'COMPLETED',
  // No partial-ranking sync exists in this architecture (same "final submission only" pattern as
  // every other minigame — none of them continuously sync in-progress drafts to the server). A
  // player who times out without submitting is honestly reported as "no_answer", not defaulted to
  // their initial (unintentional) display order — GAMEPLAY_RULES_V1.md RANK_IT: never invent player intent.
  resolve: (state, reason) => ({
    success: state.participantIds.every((id) => state.submissions[id] !== undefined),
    scoreDeltas: {},
    resultSummary: { kind: 'RANK_IT', reason, results: publicResults(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { cardCount: CARD_COUNT, submitOnce: true, subjectiveNoCorrectOrder: true } }),
  getDurationMs: () => RANK_IT_DURATION_MS,

  buildTvView: (state, view): JsonValue => {
    if (view.revealResults) {
      return { kind: 'RANK_IT', status: 'REVEALED', cards: state.cards, results: publicResults(state) };
    }
    return {
      kind: 'RANK_IT',
      status: 'ACTIVE',
      submittedCount: Object.keys(state.submissions).length,
      participantCount: state.participantIds.length,
    };
  },

  buildPlayerView: (state, playerId, _role, view): JsonValue => {
    // Keeps `prompt`/`cards`/`submission` present at reveal too (only adding `results` on top),
    // matching every other minigame's own-answer-at-reveal pattern — a reveal payload that DROPPED
    // the player's own submission would leave the reveal screen unable to show "your own order"
    // without re-deriving it by scanning `results` for its own playerId.
    const assignment = state.promptAssignments[playerId];
    const ownSubmission = state.submissions[playerId];
    return {
      kind: 'RANK_IT',
      status: view.revealResults ? 'REVEALED' : state.status,
      prompt: assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      cards: state.cards,
      initialOrder: state.initialOrder[playerId] ?? state.cards.map((c) => c.id),
      submission: ownSubmission ?? { status: 'not_submitted' },
      ...(view.revealResults ? { results: publicResults(state) } : {}),
    };
  },

  buildSpectatorView: (state, view): JsonValue => {
    if (view.revealResults) {
      return { kind: 'RANK_IT', status: 'REVEALED', cards: state.cards, results: publicResults(state) };
    }
    return { kind: 'RANK_IT', status: 'SPECTATING' };
  },
};
