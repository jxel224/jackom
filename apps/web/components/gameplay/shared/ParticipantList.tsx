import type { PublicPlayerSummary } from '../../../lib/shared';
import { StatusBadge } from '../../ui/StatusBadge';

export function PlayerStatus({ player }: { player: PublicPlayerSummary }) {
  if (!player.alive) {
    return <StatusBadge tone="neutral"><span className="line-through opacity-70">{player.name}</span> مقصى</StatusBadge>;
  }
  const connected = player.connectionStatus === 'connected';
  return <StatusBadge tone={connected ? 'success' : player.connectionStatus === 'afk' ? 'warning' : 'neutral'}>{player.name}</StatusBadge>;
}

export function ParticipantList({ players }: { players: PublicPlayerSummary[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2" aria-label="اللاعبون">
      {players.map((player) => <li key={player.playerId}><PlayerStatus player={player} /></li>)}
    </ul>
  );
}
