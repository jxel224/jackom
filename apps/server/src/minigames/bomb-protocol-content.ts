import type { JsonValue } from '../shared.js';
import type { Deps } from '../types/deps.js';
import { randomChoice, shuffle } from '../fsm/random.js';

export interface BombProtocolConfig extends Record<string, JsonValue> {
  operatorId: string;
  analystIds: string[];
  symbols: { visible: string[]; solution: string[] };
  wires: { board: Array<{ wireId: string; color: string; position: number }>; correctWireId: string };
  code: { slots: number; allowedValues: number[]; solution: number[] };
  analystInstructions: Record<string, Record<'SYMBOLS' | 'WIRES' | 'CODE_SEQUENCE', string[]>>;
}

function distribute(
  analystIds: string[],
  module: 'SYMBOLS' | 'WIRES' | 'CODE_SEQUENCE',
  clues: string[],
  instructions: BombProtocolConfig['analystInstructions'],
): void {
  clues.forEach((clue, index) => instructions[analystIds[index % analystIds.length]!]![module].push(clue));
}

export function createBombProtocolConfig(participantIds: string[], rng: Deps['rng']): BombProtocolConfig {
  if (participantIds.length < 3 || participantIds.length > 5) throw new Error('Bomb Protocol requires three to five participants');
  const operatorId = randomChoice(participantIds, rng);
  const analystIds = participantIds.filter((id) => id !== operatorId);
  const analystInstructions = Object.fromEntries(analystIds.map((id) => [id, {
    SYMBOLS: [], WIRES: [], CODE_SEQUENCE: [],
  }])) as BombProtocolConfig['analystInstructions'];

  const symbolIds = ['triangle', 'circle', 'square', 'star'];
  const symbolSolution = shuffle(symbolIds, rng);
  distribute(analystIds, 'SYMBOLS', symbolSolution.map((id, index) => `Symbol position ${index + 1} is ${id}.`), analystInstructions);

  const wireTemplate = [
    { wireId: 'wire-1', color: 'red' },
    { wireId: 'wire-2', color: 'blue' },
    { wireId: 'wire-3', color: 'yellow' },
    { wireId: 'wire-4', color: 'blue' },
  ];
  const board = shuffle(wireTemplate, rng).map((wire, index) => ({ ...wire, position: index + 1 }));
  const blueWires = board.filter((wire) => wire.color === 'blue');
  const correctWire = randomChoice(blueWires, rng);
  distribute(analystIds, 'WIRES', [
    `The target wire color is ${correctWire.color}.`,
    `Among target-color wires, cut the one at board position ${correctWire.position}.`,
  ], analystInstructions);

  const allowedValues = [0, 1, 2, 3, 4, 5];
  const codeSolution = Array.from({ length: 4 }, () => randomChoice(allowedValues, rng));
  distribute(analystIds, 'CODE_SEQUENCE', codeSolution.map((digit, index) => `Code position ${index + 1} is ${digit}.`), analystInstructions);

  return {
    operatorId,
    analystIds,
    symbols: { visible: shuffle(symbolIds, rng), solution: symbolSolution },
    wires: { board, correctWireId: correctWire.wireId },
    code: { slots: 4, allowedValues, solution: codeSolution },
    analystInstructions,
  };
}
