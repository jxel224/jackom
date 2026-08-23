import type { PublicPlayerSummary } from '../../../../lib/shared';
import type { StationSlot } from '../../../../lib/gameplay/headquarters-layout';

const CONNECTION_LABEL: Record<PublicPlayerSummary['connectionStatus'], string> = {
  connected: 'متصل',
  afk: 'إعادة الاتصال',
  disconnected: 'غير متصل',
};

/**
 * A warm wooden workstation — Direction A's blend into B+ (spec §05): wood surface, one bronze
 * cable-channel stub feeding the Spine, one physical status lamp. Gameplay state = the lamp
 * color; connection state = the small independent dot (Bible V1.1 §07 — the two never share one
 * indicator, since a player can be simultaneously "locked" and "reconnecting").
 */
export function PlayerStation({ slot, player, isAdmin }: { slot: StationSlot; player: PublicPlayerSummary; isAdmin: boolean }) {
  const scale = slot.row === 'front' ? 1 : 0.72;
  const lampColor = isAdmin ? 'var(--color-hq-gold)' : 'var(--color-hq-ink-subtle)';
  const name = player.name.length > 14 ? `${player.name.slice(0, 13)}…` : player.name;

  return (
    <div
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${slot.xPct}%`, top: `${slot.yPct}%`, width: `${slot.rPct * 2}%` }}
      data-hq-asset={slot.row === 'front' ? 'station-front' : 'station-back'}
      data-connection={player.connectionStatus}
    >
      {/* Nameplate — always attached directly beneath the seat it belongs to, never floating (Bible §13). */}
      <div
        className="relative z-10 mb-1 flex items-center gap-1 whitespace-nowrap rounded-[6px] px-2 py-0.5 text-center"
        style={{
          background: 'rgba(20,14,8,0.82)',
          border: `1px solid ${isAdmin ? 'var(--color-hq-gold)' : 'var(--color-hq-bronze-line)'}`,
          fontFamily: 'var(--font-hq-body)',
          fontWeight: 800,
          fontSize: `${0.72 * scale + 0.35}rem`,
          color: player.alive ? 'var(--color-hq-ink)' : 'var(--color-hq-ink-subtle)',
          textDecoration: player.alive ? 'none' : 'line-through',
        }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{
            background: player.connectionStatus === 'connected' ? 'var(--color-hq-teal-active)' : 'var(--color-hq-gold)',
            opacity: player.connectionStatus === 'disconnected' ? 0.5 : 1,
            animation: player.connectionStatus === 'afk' ? 'pulse-ring 1.4s ease-in-out infinite' : undefined,
          }}
          title={CONNECTION_LABEL[player.connectionStatus]}
        />
        {name}
        {isAdmin ? <span style={{ color: 'var(--color-hq-gold)' }}> · ADMIN</span> : null}
      </div>

      {/* Character placeholder — ASSET BOUNDARY. Not final pixel art; see manifest `character-*`. */}
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: `${3.2 * scale}rem`,
          height: `${3.2 * scale}rem`,
          background: 'var(--color-hq-wood)',
          border: '2px solid var(--color-hq-wood-line)',
          boxShadow: 'var(--shadow-hq-s)',
          opacity: player.alive ? 1 : 0.45,
        }}
      >
        <span style={{ fontFamily: 'var(--font-hq-display)', fontWeight: 800, color: 'var(--color-hq-ink)', fontSize: `${1.1 * scale}rem` }}>
          {player.name.slice(0, 1)}
        </span>
        {/* Ground shadow — flat, single tone, no blur (Bible §05). */}
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{ width: '85%', height: '18%', bottom: `-${2.6 * scale}rem`, background: 'rgba(0,0,0,0.35)', filter: 'none' }}
        />
      </div>

      {/* Desk + status lamp. */}
      <div
        className="relative mt-1 rounded-[4px]"
        style={{ width: `${4.4 * scale}rem`, height: `${0.85 * scale}rem`, background: 'var(--color-hq-wood)', border: '1px solid var(--color-hq-wood-line)', boxShadow: 'var(--shadow-hq-s)' }}
      >
        <span
          aria-hidden="true"
          className="absolute -top-1 left-1 h-1.5 w-1.5 rounded-full"
          style={{ background: lampColor, boxShadow: isAdmin ? '0 0 6px var(--color-hq-gold)' : 'none' }}
        />
      </div>
    </div>
  );
}
