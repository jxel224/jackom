import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

export const DRAW_IT_FIXTURE = {
  id: 'draw_it_fixture_001',
  crewVariant: 'Draw someone running to catch a bus.',
  hackerVariant: 'Draw someone running away from a bus.',
} as const;

export function assignDrawItPrompts(
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(DRAW_IT_FIXTURE, participantIds, roles, hackedPlayerIds);
}
