import type WebSocket from 'ws';

interface RoomSockets {
  host: WebSocket | null;
  players: Map<string, WebSocket>; // playerId -> socket
}

/**
 * Tracks which authenticated socket (if any) is bound to each room's host slot and each of its
 * players, so the gateway knows exactly who to broadcast a view to after an accepted mutation —
 * and so "two rooms never receive each other's messages" is a structural property (each room has
 * its own entry, looked up only by that room's own roomId).
 */
export class RoomSocketRegistry {
  private readonly rooms = new Map<string, RoomSockets>();

  private getOrCreate(roomId: string): RoomSockets {
    let entry = this.rooms.get(roomId);
    if (!entry) {
      entry = { host: null, players: new Map() };
      this.rooms.set(roomId, entry);
    }
    return entry;
  }

  /** Binds `ws` as the room's host socket, returning whichever socket previously held that slot (if any). */
  setHost(roomId: string, ws: WebSocket): WebSocket | null {
    const entry = this.getOrCreate(roomId);
    const previous = entry.host;
    entry.host = ws;
    return previous;
  }

  getHost(roomId: string): WebSocket | null {
    return this.rooms.get(roomId)?.host ?? null;
  }

  removeHost(roomId: string, ws: WebSocket): void {
    const entry = this.rooms.get(roomId);
    if (entry?.host === ws) {
      entry.host = null;
    }
    this.cleanupIfEmpty(roomId);
  }

  /** Binds `ws` as `playerId`'s socket, returning whichever socket previously held that slot (if any). */
  setPlayer(roomId: string, playerId: string, ws: WebSocket): WebSocket | null {
    const entry = this.getOrCreate(roomId);
    const previous = entry.players.get(playerId) ?? null;
    entry.players.set(playerId, ws);
    return previous;
  }

  getPlayer(roomId: string, playerId: string): WebSocket | null {
    return this.rooms.get(roomId)?.players.get(playerId) ?? null;
  }

  removePlayer(roomId: string, playerId: string, ws: WebSocket): void {
    const entry = this.rooms.get(roomId);
    if (entry && entry.players.get(playerId) === ws) {
      entry.players.delete(playerId);
    }
    this.cleanupIfEmpty(roomId);
  }

  getAllPlayerSockets(roomId: string): Array<[string, WebSocket]> {
    const entry = this.rooms.get(roomId);
    return entry ? [...entry.players.entries()] : [];
  }

  private cleanupIfEmpty(roomId: string): void {
    const entry = this.rooms.get(roomId);
    if (entry && !entry.host && entry.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /** Test/diagnostic use: how many rooms currently have at least one bound socket. */
  roomCount(): number {
    return this.rooms.size;
  }
}
