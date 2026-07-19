// Key structure exactly as specified in ARCHITECTURE.md §7.

export function roomStateKey(roomId: string): string {
  return `room:${roomId}`;
}

export function roomPrivateStateKey(roomId: string): string {
  return `room:${roomId}:private`;
}

export function roomCodeKey(roomCode: string): string {
  return `roomCode:${roomCode}`;
}

export function playerSessionKey(sessionToken: string): string {
  return `session:${sessionToken}`;
}

export function hostSessionKey(hostSessionToken: string): string {
  return `hostSession:${hostSessionToken}`;
}
