import type { GameState } from '../shared.js';
import type { RoomState } from '../types/room-state.js';
import { getMinigameModule, getSpecialGameModule } from '../minigames/registry.js';

/**
 * Phase timer metadata calculation. Returns null for host-paced phases and for ROLE_ASSIGNMENT,
 * the one remaining "instant/auto-advance" state that never waits for an event — see
 * transitions.ts `autoAdvance()`. MINIGAME_SELECT is no longer instant (it's the Admin's real
 * selection window, GAMEPLAY_RULES_V1.md §4). MINIGAME_PLAY/SPECIAL_GAME_PLAY durations come from
 * the active module (`getDurationMs`), since only the module knows how long its own gameplay needs.
 */
export function durationFor(state: GameState, room: RoomState): number | null {
  const t = room.config.timers;
  switch (state) {
    case 'ROOM_CREATED':
    case 'LOBBY':
    case 'ROLE_ASSIGNMENT':
    case 'FINAL_RESULTS':
    case 'REMATCH_LOBBY':
    case 'ABANDONED':
      return null;
    case 'ROLE_REVEAL':
      return t.roleRevealDurationMs;
    case 'GAME_INTRO':
      return t.introDurationMs;
    case 'MINIGAME_SELECT':
      // No longer instant — this is now the Admin's real selection window (GAMEPLAY_RULES_V1.md §4).
      return t.adminSelectionTimeoutMs;
    case 'HACKER_CORRUPTION':
      return t.corruptionWindowMs;
    case 'MINIGAME_INSTRUCTIONS':
      return t.instructionsDurationMs;
    case 'MINIGAME_PLAY': {
      if (!room.currentRound) return null;
      const ctx = { roomId: room.roomId, minigameId: room.currentRound.minigameId, participantIds: room.currentRound.participantIds, config: null };
      return getMinigameModule(room.currentRound.minigameId).getDurationMs(ctx, room.currentRound.moduleState);
    }
    case 'RESULTS_REVEAL':
      return t.resultsDurationMs;
    case 'DISCUSSION':
      return t.discussionDurationMs;
    case 'ACCUSATION_SELECT':
      return t.accusationSelectionTimeoutMs;
    case 'ACCUSATION_VOTE':
      return t.accusationVotingTimeoutMs;
    case 'SPECIAL_GAME_INTRO':
      return t.specialIntroDurationMs;
    case 'SPECIAL_GAME_PLAY': {
      if (!room.currentSpecialRound) return null;
      const ctx = { roomId: room.roomId, minigameId: 'BOMB_PROTOCOL', participantIds: room.currentSpecialRound.participantIds, config: null };
      return getSpecialGameModule().getDurationMs(ctx, room.currentSpecialRound.moduleState);
    }
    case 'SPECIAL_GAME_RESULT':
      return t.specialResultDurationMs;
    default:
      return null;
  }
}
