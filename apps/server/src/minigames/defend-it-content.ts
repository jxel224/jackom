import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

export const DEFEND_IT_FIXTURE = {
  id: 'defend_it_fixture_001',
  crewVariant: 'Working from home is better than working from an office.',
  hackerVariant: 'Working from an office is better than working from home.',
} as const;

export function assignDefendItStatements(
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(DEFEND_IT_FIXTURE, participantIds, roles, hackedPlayerIds);
}
