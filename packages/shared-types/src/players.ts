import type { ConnectionStatus } from './enums';

export interface PlayerPublic {
  playerId: string;
  name: string;
  avatarId: string;
  alive: boolean;
  connectionStatus: ConnectionStatus;
  joinedAt: number;
  // NOTE: intentionally no `isHost` — hostness is a session property, not a player property.
  // See ARCHITECTURE.md §1.1.
}

export interface PublicPlayerSummary {
  playerId: string;
  name: string;
  avatarId: string;
  alive: boolean;
  connectionStatus: ConnectionStatus;
}
