import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

export const PREDICT_THEM_FIXTURE = {
  id: 'predict_them_fixture_001',
  audienceQuestion: 'Would most people rather arrive 30 minutes early or 10 minutes late?',
  optionA: 'Arrive early',
  optionB: 'Arrive late',
  crewVariant: 'Which option would MOST people choose?',
  hackerVariant: 'Which option would YOUNGER people choose?',
} as const;

export function assignPredictThemPrompts(
  selectedPlayerIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(PREDICT_THEM_FIXTURE, selectedPlayerIds, roles, hackedPlayerIds);
}
