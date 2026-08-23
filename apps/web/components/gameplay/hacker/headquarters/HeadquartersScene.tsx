import type { TvView } from '../../../../lib/shared';
import { activeStationSlots } from '../../../../lib/gameplay/headquarters-layout';
import { Countdown } from '../../shared/Countdown';
import { CentralUnit } from './CentralUnit';
import { MatchTimerDisplay } from './MatchTimerDisplay';
import { PlayerStation } from './PlayerStation';
import { SpineLayer } from './SpineLayer';
import { EmergencyDecisionConsole } from './EmergencyDecisionConsole';
import { ProtocolDoor } from './ProtocolDoor';
import { EnvironmentProps } from './EnvironmentProps';

/**
 * The Headquarters — B+ "Warm Retro Tech Operations Office" (Bible V1.1, HEADQUARTERS_HERO_
 * PRODUCTION_SPEC_V1). Renders the shared TV room for every phase that isn't a specific minigame,
 * the special game, an accusation, or final results (see TvPhaseRouter's HQ_PHASES set) — i.e.
 * exactly the phases that used to fall through to the bare `{label}` fallback panel.
 *
 * Layer order (back → front), matching spec §15:
 * wall/floor → EnvironmentProps → SpineLayer → CentralUnit → MatchTimerDisplay →
 * EmergencyDecisionConsole → ProtocolDoor → PlayerStation×N → phase-label overlay.
 *
 * Deliberately self-contained (not wrapped in the lobby-era TvScreenLayout/PixelGrid/NoiseOverlay
 * chrome) — see HEADQUARTERS_VISUAL_IMPLEMENTATION_REPORT.md §19 for why that old visual language
 * is intentionally absent here while still present on the lobby/minigame/final-results screens.
 */
export function HeadquartersScene({ view, phaseLabel, phaseDeadlineAt }: { view: TvView; phaseLabel: string; phaseDeadlineAt: number | null }) {
  const activeSlots = activeStationSlots(view.players.length);
  const discussion = view.phase.state === 'DISCUSSION';

  return (
    <div
      className="relative mx-auto aspect-video w-full max-w-[1600px] overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, var(--color-hq-wall) 0%, var(--color-hq-wall) 62%, var(--color-hq-floor) 62%, var(--color-hq-floor) 100%)',
        fontFamily: 'var(--font-hq-body)',
      }}
      data-hq-scene="headquarters"
      data-hq-mode={discussion ? 'discussion' : 'normal'}
    >
      {/* Title-safe margin guide (visual only via padding on the overlay layer below — see §24). */}
      <EnvironmentProps />
      <SpineLayer activeSlots={activeSlots} />
      <CentralUnit mode={view.firewallActive ? 'firewallActive' : discussion ? 'discussion' : 'normal'} />
      <MatchTimerDisplay matchClock={view.matchClock} />
      <EmergencyDecisionConsole />
      <ProtocolDoor />

      {activeSlots.map((slot, i) => {
        const player = view.players[i];
        if (!player) return null;
        return <PlayerStation key={player.playerId} slot={slot} player={player} isAdmin={player.playerId === view.adminId} />;
      })}

      {/* Small game-title mark — orientation for a first-time viewer ("where am I"), not a banner. */}
      <div
        className="absolute right-[6%] top-[5%] text-xs font-bold tracking-wide"
        style={{ color: 'var(--color-hq-ink-subtle)', fontFamily: 'var(--font-hq-display)' }}
      >
        الهاكرز
      </div>

      {/* Small neutral system-state label — top-left, inside the 6% safe margin, never a giant panel.
          The sub-round countdown (e.g. Admin's pick window) rides along here, small/secondary per
          Bible §15 — the bronze module above is reserved for the match clock only. */}
      <div
        className="absolute left-[6%] top-[5%] flex items-center gap-2 rounded-[6px] px-2 py-1 text-xs font-bold"
        style={{ background: 'rgba(20,14,8,0.72)', color: 'var(--color-hq-ink-muted)', fontFamily: 'var(--font-hq-display)' }}
      >
        <span>{phaseLabel}</span>
        {phaseDeadlineAt !== null ? <Countdown deadlineAt={phaseDeadlineAt} className="!text-xs" /> : null}
      </div>
    </div>
  );
}
