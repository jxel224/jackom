import { z } from 'zod';
import type { JsonValue, MiniGameModule } from '../shared.js';

export const BOMB_PROTOCOL_DURATION_MS = 90_000;
export const BOMB_PROTOCOL_MAX_STRIKES = 3;
export type BombProtocolModule = 'SYMBOLS' | 'WIRES' | 'CODE_SEQUENCE';
export type BombProtocolStatus = 'ACTIVE' | 'SUCCESS' | 'FAILURE';

const WireSchema = z.object({ wireId: z.string().min(1), color: z.string().min(1), position: z.number().int().positive() }).strict();
const InstructionsSchema = z.object({
  SYMBOLS: z.array(z.string().min(1)).max(4),
  WIRES: z.array(z.string().min(1)).max(2),
  CODE_SEQUENCE: z.array(z.string().min(1)).max(4),
}).strict();
const StartConfigSchema = z.object({
  operatorId: z.string().min(1),
  analystIds: z.array(z.string().min(1)).min(2).max(4),
  symbols: z.object({ visible: z.array(z.string().min(1)).length(4), solution: z.array(z.string().min(1)).length(4) }).strict(),
  wires: z.object({ board: z.array(WireSchema).min(2).max(6), correctWireId: z.string().min(1) }).strict(),
  code: z.object({ slots: z.literal(4), allowedValues: z.array(z.number().int()).min(2).max(10), solution: z.array(z.number().int()).length(4) }).strict(),
  analystInstructions: z.record(z.string(), InstructionsSchema),
}).strict();
const SymbolActionSchema = z.object({ symbolId: z.string().min(1) }).strict();
const WireActionSchema = z.object({ wireId: z.string().min(1) }).strict();
const CodeActionSchema = z.object({ code: z.array(z.number().int()).length(4) }).strict();

export interface BombProtocolState extends Record<string, JsonValue> {
  kind: 'BOMB_PROTOCOL';
  participantIds: string[];
  operatorId: string;
  analystIds: string[];
  currentModule: BombProtocolModule;
  status: BombProtocolStatus;
  strikes: number;
  maxStrikes: number;
  symbols: { visible: string[]; solution: string[]; progress: number };
  wires: { board: Array<{ wireId: string; color: string; position: number }>; correctWireId: string };
  code: { slots: number; allowedValues: number[]; solution: number[] };
  analystInstructions: Record<string, Record<BombProtocolModule, string[]>>;
}

function addStrike(state: BombProtocolState): BombProtocolState {
  const strikes = Math.min(state.maxStrikes, state.strikes + 1);
  return { ...state, strikes, status: strikes >= state.maxStrikes ? 'FAILURE' : 'ACTIVE' };
}

function moduleProgress(state: BombProtocolState) {
  if (state.currentModule === 'SYMBOLS') return { completed: state.symbols.progress, total: state.symbols.solution.length };
  return { completed: 0, total: 1 };
}

function operatorBoard(state: BombProtocolState): JsonValue {
  if (state.currentModule === 'SYMBOLS') return { symbols: state.symbols.visible, pressedCount: state.symbols.progress };
  if (state.currentModule === 'WIRES') return { wires: state.wires.board };
  return { slots: state.code.slots, allowedValues: state.code.allowedValues };
}

function publicState(state: BombProtocolState) {
  return {
    title: 'Bomb Protocol', participantIds: state.participantIds, operatorId: state.operatorId,
    analystIds: state.analystIds, currentModule: state.currentModule, status: state.status,
    strikes: state.strikes, maxStrikes: state.maxStrikes, progress: moduleProgress(state),
  };
}

export const BombProtocolModule: MiniGameModule<BombProtocolState> = {
  id: 'BOMB_PROTOCOL',
  version: '1.0.0',

  start: (ctx) => {
    if (ctx.participantIds.length < 3 || ctx.participantIds.length > 5 || new Set(ctx.participantIds).size !== ctx.participantIds.length) {
      throw new Error('BOMB_PROTOCOL requires three to five unique participants');
    }
    const config = StartConfigSchema.parse(ctx.config);
    const participants = new Set(ctx.participantIds);
    if (!participants.has(config.operatorId) || config.analystIds.length !== participants.size - 1 ||
      new Set([config.operatorId, ...config.analystIds]).size !== participants.size || config.analystIds.some((id) => !participants.has(id))) {
      throw new Error('BOMB_PROTOCOL requires exactly one Operator and all remaining participants as Analysts');
    }
    if (Object.keys(config.analystInstructions).length !== config.analystIds.length || config.analystIds.some((id) => !config.analystInstructions[id])) {
      throw new Error('BOMB_PROTOCOL requires private instructions for every Analyst');
    }
    if (!config.wires.board.some((wire) => wire.wireId === config.wires.correctWireId) ||
      config.code.solution.some((digit) => !config.code.allowedValues.includes(digit)) ||
      new Set(config.symbols.visible).size !== 4 || config.symbols.solution.some((id) => !config.symbols.visible.includes(id))) {
      throw new Error('BOMB_PROTOCOL puzzle config is not solvable');
    }
    return {
      kind: 'BOMB_PROTOCOL', participantIds: [...ctx.participantIds], operatorId: config.operatorId,
      analystIds: [...config.analystIds], currentModule: 'SYMBOLS', status: 'ACTIVE', strikes: 0,
      maxStrikes: BOMB_PROTOCOL_MAX_STRIKES,
      symbols: { ...config.symbols, progress: 0 }, wires: config.wires, code: config.code,
      analystInstructions: config.analystInstructions,
    };
  },

  validateAction: (state, playerId, _ctx, action, actionType) => {
    if (state.status !== 'ACTIVE') return { valid: false, reason: 'Bomb Protocol is already resolved' };
    if (playerId !== state.operatorId) return { valid: false, reason: 'Only the Operator can use the Bomb Board' };
    if (actionType === 'PRESS_SYMBOL') {
      const parsed = SymbolActionSchema.safeParse(action);
      return state.currentModule === 'SYMBOLS' && parsed.success && state.symbols.visible.includes(parsed.data.symbolId)
        ? { valid: true } : { valid: false, reason: 'Invalid Symbols action' };
    }
    if (actionType === 'CUT_WIRE') {
      const parsed = WireActionSchema.safeParse(action);
      return state.currentModule === 'WIRES' && parsed.success && state.wires.board.some((wire) => wire.wireId === parsed.data.wireId)
        ? { valid: true } : { valid: false, reason: 'Invalid Wires action' };
    }
    if (actionType === 'SUBMIT_CODE') {
      const parsed = CodeActionSchema.safeParse(action);
      return state.currentModule === 'CODE_SEQUENCE' && parsed.success && parsed.data.code.every((digit) => state.code.allowedValues.includes(digit))
        ? { valid: true } : { valid: false, reason: 'Invalid Code Sequence action' };
    }
    return { valid: false, reason: 'Unknown Bomb Protocol action' };
  },

  handleAction: (state, _playerId, action, actionType) => {
    if (actionType === 'PRESS_SYMBOL') {
      const { symbolId } = SymbolActionSchema.parse(action);
      if (symbolId !== state.symbols.solution[state.symbols.progress]) return addStrike(state);
      const progress = state.symbols.progress + 1;
      return progress === state.symbols.solution.length
        ? { ...state, currentModule: 'WIRES', symbols: { ...state.symbols, progress } }
        : { ...state, symbols: { ...state.symbols, progress } };
    }
    if (actionType === 'CUT_WIRE') {
      const { wireId } = WireActionSchema.parse(action);
      return wireId === state.wires.correctWireId ? { ...state, currentModule: 'CODE_SEQUENCE' } : addStrike(state);
    }
    if (actionType === 'SUBMIT_CODE') {
      const { code } = CodeActionSchema.parse(action);
      return code.every((digit, index) => digit === state.code.solution[index]) ? { ...state, status: 'SUCCESS' } : addStrike(state);
    }
    return state;
  },

  isComplete: (state) => state.status !== 'ACTIVE',
  resolve: (state, reason) => ({
    success: state.status === 'SUCCESS', scoreDeltas: {},
    resultSummary: { kind: 'BOMB_PROTOCOL', reason, status: state.status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE', strikes: state.strikes },
  }),
  handleDisconnect: (state) => state,
  getInstructions: () => ({ default: { cooperative: true, overallTimer: true, maxStrikes: BOMB_PROTOCOL_MAX_STRIKES } }),
  getDurationMs: () => BOMB_PROTOCOL_DURATION_MS,

  buildTvView: (state): JsonValue => ({ kind: 'BOMB_PROTOCOL', ...publicState(state), board: operatorBoard(state) }),
  buildPlayerView: (state, playerId): JsonValue => {
    if (playerId === state.operatorId) return {
      kind: 'BOMB_PROTOCOL', specialRole: 'OPERATOR', ...publicState(state), board: operatorBoard(state),
      allowedAction: state.currentModule === 'SYMBOLS' ? 'PRESS_SYMBOL' : state.currentModule === 'WIRES' ? 'CUT_WIRE' : 'SUBMIT_CODE',
    };
    const instructions = state.analystInstructions[playerId];
    return {
      kind: 'BOMB_PROTOCOL', specialRole: 'ANALYST', ...publicState(state),
      instructionFragments: instructions?.[state.currentModule] ?? [],
    };
  },
  buildSpectatorView: (state): JsonValue => ({ kind: 'BOMB_PROTOCOL', spectating: true, ...publicState(state) }),
};
