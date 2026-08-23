import type { JsonValue, Role } from '../shared.js';

export interface PromptPair {
  id: string;
  crewVariant: string;
  hackerVariant: string;
}

export interface PromptAssignment extends Record<string, JsonValue> {
  contentId: string;
  prompt: string;
}

/**
 * Assignment boundary shared by every minigame's prompt-pair content. A player normally gets the
 * variant matching their own role; being individually hacked this round (GAMEPLAY_RULES_V1.md §7)
 * flips ONLY that player's variant — nobody else's assignment is affected. Modules receive only
 * the completed per-player assignment and never need to know a participant's role or hack status.
 */
export function assignPromptPair(
  pair: PromptPair,
  participantIds: string[],
  roles: Record<string, Role | null>,
  hackedPlayerIds: ReadonlySet<string>,
): Record<string, PromptAssignment> {
  return Object.fromEntries(
    participantIds.map((playerId) => {
      const normallyGetsHackerVariant = roles[playerId] === 'HACKER';
      const isHackedThisRound = hackedPlayerIds.has(playerId);
      const getsHackerVariant = isHackedThisRound ? !normallyGetsHackerVariant : normallyGetsHackerVariant;
      return [
        playerId,
        {
          contentId: pair.id,
          prompt: getsHackerVariant ? pair.hackerVariant : pair.crewVariant,
        },
      ];
    }),
  );
}
