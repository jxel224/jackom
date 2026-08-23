import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

export const DESCRIBE_IT_THINK_DURATION_MS = 9_000;
export const DESCRIBE_IT_SPEAK_DURATION_MS = 12_000;

export type DescribeItStep = 'THINK' | 'SPEAKING' | 'COMPLETED';
export type SpeakingTurnResult = 'FINISHED' | 'TIMEOUT';

const PromptAssignmentSchema = z.object({ contentId: z.string().min(1), prompt: z.string().min(1) }).strict();
const StartConfigSchema = z.object({
  speakerOrder: z.array(z.string().min(1)).min(3).max(5),
  promptAssignments: z.record(z.string(), PromptAssignmentSchema),
  crewWord: z.string().min(1),
  hackerWord: z.string().min(1),
}).strict();
const FinishActionSchema = z.object({}).strict();

export interface DescribeItState extends Record<string, JsonValue> {
  kind: 'DESCRIBE_IT';
  participantIds: string[];
  promptAssignments: Record<string, { contentId: string; prompt: string }>;
  crewWord: string;
  hackerWord: string;
  step: DescribeItStep;
  speakerOrder: string[];
  currentSpeakerIndex: number;
  turnResults: Record<string, SpeakingTurnResult>;
}

function currentSpeaker(state: DescribeItState): string | null {
  return state.step === 'SPEAKING' ? (state.speakerOrder[state.currentSpeakerIndex] ?? null) : null;
}

function advanceTurn(state: DescribeItState, result: SpeakingTurnResult): DescribeItState {
  if (state.step !== 'SPEAKING') return state;
  const playerId = currentSpeaker(state);
  if (!playerId || state.turnResults[playerId]) return state;
  const turnResults = { ...state.turnResults, [playerId]: result };
  const nextIndex = state.currentSpeakerIndex + 1;
  return {
    ...state,
    turnResults,
    currentSpeakerIndex: nextIndex,
    step: nextIndex >= state.speakerOrder.length ? 'COMPLETED' : 'SPEAKING',
  };
}

function publicProgress(state: DescribeItState) {
  return {
    participantIds: state.participantIds,
    step: state.step,
    speakerOrder: state.speakerOrder,
    currentSpeaker: currentSpeaker(state),
    currentSpeakerIndex: state.currentSpeakerIndex,
    completedPlayerIds: state.speakerOrder.filter((id) => state.turnResults[id] !== undefined),
  };
}

/**
 * Internal only — feeds `resolve()`'s `resultSummary`, which is persisted to `RoundRecord` for
 * debugging/analytics/match-history but is NEVER read by any view builder (verified: only
 * `minigameId`/`success` from `RoundRecord` ever reach a client, via `lastRoundResultFor`). Safe to
 * keep the crew/hacker label here since this value structurally cannot reach a client.
 */
function internalReveal(state: DescribeItState) {
  return { crewWord: state.crewWord, hackerWord: state.hackerWord };
}

/**
 * Client-facing reveal (Core Logic Phase 1.1 fix — hack targets must stay completely secret).
 * Deliberately does NOT label which word is the crew/hacker variant — a hacked participant already
 * privately knows their own word from MINIGAME_PLAY, and labeling the pair here would let them (or
 * anyone comparing notes) read off "mine is the hackerWord" directly from the wire payload. Sorting
 * is a stable, deterministic, role-blind ordering (no rng available in a pure view function, and
 * none needed) — it carries no information about which entry belonged to which role.
 */
function publicReveal(state: DescribeItState): { words: [string, string] } {
  return { words: [state.crewWord, state.hackerWord].sort() as [string, string] };
}

export const DescribeItModule: MiniGameModule<DescribeItState> = {
  id: 'DESCRIBE_IT',
  version: '1.0.0',

  start: (ctx) => {
    if (
      ctx.participantIds.length < 3 ||
      ctx.participantIds.length > 5 ||
      new Set(ctx.participantIds).size !== ctx.participantIds.length
    ) {
      throw new Error('DESCRIBE_IT requires three to five unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const participantSet = new Set(ctx.participantIds);
    if (
      new Set(config.speakerOrder).size !== ctx.participantIds.length ||
      config.speakerOrder.length !== ctx.participantIds.length ||
      config.speakerOrder.some((id) => !participantSet.has(id))
    ) {
      throw new Error('DESCRIBE_IT speaker order must contain every participant exactly once');
    }
    const assignedIds = Object.keys(config.promptAssignments);
    if (assignedIds.length !== ctx.participantIds.length || ctx.participantIds.some((id) => !config.promptAssignments[id])) {
      throw new Error('DESCRIBE_IT requires exactly one hidden-word assignment per participant');
    }
    return {
      kind: 'DESCRIBE_IT',
      participantIds: [...ctx.participantIds],
      promptAssignments: config.promptAssignments,
      crewWord: config.crewWord,
      hackerWord: config.hackerWord,
      step: 'THINK',
      speakerOrder: [...config.speakerOrder],
      currentSpeakerIndex: 0,
      turnResults: {},
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (actionType !== 'FINISH_SPEAKING') return { valid: false, reason: 'Unknown Describe It action' };
    if (state.step === 'COMPLETED') return { valid: false, reason: 'Describe It is already complete' };
    if (!state.participantIds.includes(playerId)) return { valid: false, reason: 'Player is not a Describe It participant' };
    if (state.step !== 'SPEAKING') return { valid: false, reason: 'Speaking has not started' };
    if (currentSpeaker(state) !== playerId) return { valid: false, reason: 'It is not this player\'s turn' };
    return FinishActionSchema.safeParse(action).success
      ? { valid: true }
      : { valid: false, reason: 'Finish speaking payload must be empty' };
  },

  handleAction: (state, _playerId, action, actionType) => {
    if (actionType !== 'FINISH_SPEAKING') return state;
    FinishActionSchema.parse(action);
    return advanceTurn(state, 'FINISHED');
  },

  isComplete: (state) => state.step === 'COMPLETED',
  getInternalStep: (state) => state.step === 'SPEAKING' ? `SPEAKING:${state.currentSpeakerIndex}` : state.step,
  handleTimeout: (state) => state.step === 'THINK'
    ? { ...state, step: 'SPEAKING' }
    : advanceTurn(state, 'TIMEOUT'),
  resolve: (state, reason) => ({
    success: state.step === 'COMPLETED',
    scoreDeltas: {},
    resultSummary: { kind: 'DESCRIBE_IT', reason, ...internalReveal(state) },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { spokenCluesOnly: true, internalSteps: ['THINK', 'SPEAKING'] } }),
  getDurationMs: (_ctx, state) => state?.step === 'THINK' ? DESCRIBE_IT_THINK_DURATION_MS : DESCRIBE_IT_SPEAK_DURATION_MS,

  buildTvView: (state, view): JsonValue => view.revealResults
    ? { kind: 'DESCRIBE_IT', status: 'REVEALED', ...publicReveal(state) }
    : { kind: 'DESCRIBE_IT', ...publicProgress(state) },

  buildPlayerView: (state, playerId, _role, view): JsonValue => {
    if (view.revealResults) return { kind: 'DESCRIBE_IT', status: 'REVEALED', ...publicReveal(state) };
    const assignment = state.promptAssignments[playerId];
    return {
      kind: 'DESCRIBE_IT',
      ...publicProgress(state),
      hiddenWord: assignment ? { contentId: assignment.contentId, text: assignment.prompt } : null,
      isYourTurn: currentSpeaker(state) === playerId,
      turnStatus: state.turnResults[playerId] ?? (currentSpeaker(state) === playerId ? 'CURRENT' : 'UPCOMING'),
    };
  },

  buildSpectatorView: (state, view): JsonValue => view.revealResults
    ? { kind: 'DESCRIBE_IT', status: 'REVEALED', ...publicReveal(state) }
    : { kind: 'DESCRIBE_IT', status: 'SPECTATING', ...publicProgress(state) },
};
