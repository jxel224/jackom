import type { RejectionCode } from '../shared.js';
import type { RoomState, RoomPrivateState } from '../types/room-state.js';

export interface Rejection {
  code: RejectionCode;
  message?: string;
}

export interface HandleEventResult {
  room: RoomState;
  priv: RoomPrivateState;
  rejected?: Rejection;
}

export function ok(room: RoomState, priv: RoomPrivateState): HandleEventResult {
  return { room, priv };
}

export function rejected(room: RoomState, priv: RoomPrivateState, code: RejectionCode, message?: string): HandleEventResult {
  const rejection: Rejection = message === undefined ? { code } : { code, message };
  return { room, priv, rejected: rejection };
}
