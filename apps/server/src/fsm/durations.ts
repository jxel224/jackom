import type { GameState } from '../shared.js';
import type { RoomState } from '../types/room-state.js';
import { getMinigameModule, getSpecialGameModule } from '../minigames/registry.js';

/**
 * Phase timer metadata calculation. Returns null for host-paced phases and for the two
 * "instant/auto-advance" states (ROLE_ASSIGNMENT, MINIGAME_SELECT) that never wait for an event —
 * see transitions.ts `autoAdvance()`. MINIGAME_PLAY/SPECIAL_GAME_PLAY durations come from the
 * active module (`getDurationMs`), since only the module knows how long its own gameplay needs.
 */
export function durationFor(state: GameState, room: RoomState): number | null {
  const t = room.config.timers;
  switch (state) {
    case 'ROOM_CREATED':
    case 'LOBBY':
    case 'ROLE_ASSIGNMENT':
    case 'MINIGAME_SELECT':
    case 'FINAL_RESULTS':
    case 'REMATCH_LOBBY':
    case 'ABANDONED':
      return null;
    case 'ROLE_REVEAL':
      return t.roleRevealDurationMs;
    case 'GAME_INTRO':
      return t.introDurationMs;
    case 'HACKER_CORRUPTION':
      return t.corruptionWindowMs;
    case 'MINIGAME_INSTRUCTIONS':
      return t.instructionsDurationMs;
    case 'MINIGAME_PLAY': {
      if (!room.currentRound) return null;
      const ctx = { roomId: room.roomId, minigameId: room.currentRound.minigameId, participantIds: room.currentRound.participantIds, corrupted: room.currentRound.corrupted, config: null };
      return getMinigameModule(room.currentRound.minigameId).getDurationMs(ctx);
    }
    case 'RESULTS_REVEAL':
      return t.resultsDurationMs;
    case 'DISCUSSION':
      return t.discussionDurationMs;
    case 'SPECIAL_GAME_INTRO':
      return t.specialIntroDurationMs;
    case 'SPECIAL_GAME_PLAY': {
      if (!room.currentSpecialRound) return null;
      const ctx = { roomId: room.roomId, minigameId: 'generic-special-game', participantIds: room.currentSpecialRound.participantIds, corrupted: false, config: null };
      return getSpecialGameModule().getDurationMs(ctx);
    }
    case 'SPECIAL_GAME_RESULT':
      return t.specialResultDurationMs;
    case 'FINAL_DISCUSSION':
      return t.finalDiscussionDurationMs;
    case 'VOTING':
      return t.votingDurationMs;
    case 'ELIMINATION_RESULT':
      return t.eliminationRevealDurationMs;
    default:
      return null;
  }
}
