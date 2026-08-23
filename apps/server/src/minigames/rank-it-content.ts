import type { Role } from '../shared.js';
import { assignPromptPair, type PromptAssignment } from './prompt-assignment.js';

/**
 * Same single-fixture pattern every other minigame content file uses (COMPLETE_IT,
 * DRAW_IT, DEFEND_IT, DESCRIBE_IT) — a small, high-quality dev/test pack, not a production content
 * pool. The four cards are shared, unlabeled, and identical for every participant; only the
 * ranking INSTRUCTION differs by role (via `assignPromptPair`, the same targeted-hack-aware
 * boundary every other minigame's prompt already goes through) — RANK_IT never scores "correctness",
 * so there is no hidden "right order" to leak here, only which lens to rank through.
 */
export const RANK_IT_FIXTURE = {
  id: 'rank_it_fixture_001',
  cards: [
    { id: 'card_1', text: 'ترسل رسالة للشخص الغلط' },
    { id: 'card_2', text: 'تطيح قدام ناس' },
    { id: 'card_3', text: 'تنادي شخص باسم غلط' },
    { id: 'card_4', text: 'تسلم على شخص ما كان يسلم عليك' },
  ],
  crewVariant: 'رتّبها من أكثر موقف محرج إلى الأقل.',
  hackerVariant: 'رتّبها من أكثر موقف مضحك إلى الأقل.',
} as const;

export function assignRankItInstructions(
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return assignPromptPair(RANK_IT_FIXTURE, participantIds, roles, hackedPlayerIds);
}
