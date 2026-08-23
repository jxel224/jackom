import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

export const DESCRIBE_IT_FIXTURE = {
  id: 'describe_it_fixture_001',
  crewVariant: 'Airport',
  hackerVariant: 'Train Station',
} as const;

export function assignDescribeItWords(
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(DESCRIBE_IT_FIXTURE, participantIds, roles, hackedPlayerIds);
}
