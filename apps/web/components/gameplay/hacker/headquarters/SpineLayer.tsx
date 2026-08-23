import type { StationSlot } from '../../../../lib/gameplay/headquarters-layout';
import { CENTRAL_UNIT_BOX, CONSOLE_BOX, DOORWAY_BOX } from '../../../../lib/gameplay/headquarters-layout';

const VB_W = 100;
const VB_H = 56.25; // 100 * 9/16 — keeps x/y scale uniform since the scene container is fixed 16:9.
const y = (pct: number) => pct * (VB_H / 100);

/**
 * Signature object #4 (the Spine) — a physical bronze conduit trunk connecting Central Unit →
 * Emergency Decision Console → every active station → the Protocol doorway threshold. Deliberately
 * routed as right-angle "cable trunking" segments, never diagonal starbursts or a glow — this is
 * the one element allowed to borrow C's floor-guidance idea, kept industrial per spec §01/§11.
 * `pulse` is a single boolean hook point for later motion work (§23); no animation logic lives here yet.
 */
export function SpineLayer({ activeSlots, pulse = false }: { activeSlots: StationSlot[]; pulse?: boolean }) {
  const trunkX = 50;
  const stationTrunkY = 60; // where station ribs branch off the vertical trunk
  const doorTrunkY = 46;

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-hq-asset="spine"
    >
      <g fill="none" stroke="var(--color-hq-bronze-line)" strokeWidth={0.45} strokeLinecap="round" opacity={0.85}>
        {/* Main vertical trunk: Console → Central Unit base. */}
        <line x1={trunkX} y1={y(CONSOLE_BOX.topPct)} x2={trunkX} y2={y(CENTRAL_UNIT_BOX.bottomPct)} />

        {/* One rib per active station: trunk → station's x, then down/up to the seat. */}
        {activeSlots.map((slot) => (
          <g key={slot.slot}>
            <line x1={trunkX} y1={y(stationTrunkY)} x2={slot.xPct} y2={y(stationTrunkY)} />
            <line x1={slot.xPct} y1={y(stationTrunkY)} x2={slot.xPct} y2={y(slot.yPct)} />
          </g>
        ))}

        {/* Protocol doorway threshold spur. */}
        <line x1={trunkX} y1={y(doorTrunkY)} x2={DOORWAY_BOX.leftPct - 1} y2={y(doorTrunkY)} />
        <line x1={DOORWAY_BOX.leftPct - 1} y1={y(doorTrunkY)} x2={DOORWAY_BOX.leftPct - 1} y2={y(DOORWAY_BOX.bottomPct)} strokeDasharray="1.2 1" />
      </g>

      {/* Junction nodes — small bolts where ribs meet the trunk, reinforces "physical conduit". */}
      <g fill="var(--color-hq-bronze-dark)">
        <circle cx={trunkX} cy={y(stationTrunkY)} r={0.55} />
        <circle cx={trunkX} cy={y(doorTrunkY)} r={0.5} />
      </g>

      {pulse ? (
        <line
          x1={trunkX}
          y1={y(CONSOLE_BOX.topPct)}
          x2={trunkX}
          y2={y(CENTRAL_UNIT_BOX.bottomPct)}
          stroke="var(--color-hq-ember)"
          strokeWidth={0.6}
          opacity={0.9}
        />
      ) : null}
    </svg>
  );
}
