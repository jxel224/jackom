import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

export const COMPLETE_IT_FIXTURE = {
  id: 'complete_it_fixture_001',
  crewVariant: 'The worst excuse for being late is _____.',
  hackerVariant: 'The best excuse for being late is _____.',
} as const;

export function assignCompleteItPrompts(
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(COMPLETE_IT_FIXTURE, participantIds, roles, hackedPlayerIds);
}
