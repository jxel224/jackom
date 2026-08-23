import { CENTRAL_UNIT_BOX, boxStyle } from '../../../../lib/gameplay/headquarters-layout';

export type CentralUnitMode = 'normal' | 'discussion' | 'firewallActive';

/**
 * The Unit — JACKOM's primary signature object (HEADQUARTERS_HERO_PRODUCTION_SPEC_V1 §01/§02).
 * ASSET BOUNDARY: this is a real placeholder built from CSS/SVG shapes to the exact locked
 * geometry, NOT final pixel art — see HEADQUARTERS_ASSET_MANIFEST.md `central-unit-*`. The
 * asymmetric silhouette (heavier left mass, lower right shelf) is load-bearing: do not
 * "balance" it visually when swapping in final art.
 */
export function CentralUnit({ mode }: { mode: CentralUnitMode }) {
  return (
    <div className="absolute" style={boxStyle(CENTRAL_UNIT_BOX)} data-hq-asset="central-unit">
      <svg viewBox="0 0 420 210" className="h-full w-full overflow-visible" role="img" aria-label="النظام المركزي">
        {/* Bronze casing — deliberately NOT a symmetric rectangle: left mass taller, right shelf lower/shallower. */}
        <path
          d="M8 30 L8 190 Q8 202 20 202 L300 202 Q312 202 312 190 L312 150 Q312 138 324 138 L400 138 Q412 138 412 150 L412 176 Q412 188 400 188 L324 188"
          fill="var(--color-hq-bronze)"
          stroke="var(--color-hq-bronze-line)"
          strokeWidth={3}
        />
        <path d="M8 30 Q8 8 30 8 L280 8 Q302 8 302 30 L302 96 L8 96 Z" fill="var(--color-hq-bronze)" stroke="var(--color-hq-bronze-line)" strokeWidth={3} />
        {/* Rivets — "maintained/patched over the years" per spec §02. */}
        {[24, 60, 96, 132, 168, 204, 240, 276].map((cx) => (
          <circle key={cx} cx={cx} cy={16} r={2.4} fill="var(--color-hq-bronze-dark)" />
        ))}
        {[340, 372, 400].map((cx) => (
          <circle key={cx} cx={cx} cy={148} r={2} fill="var(--color-hq-bronze-dark)" />
        ))}
        <line x1={8} y1={96} x2={302} y2={96} stroke="var(--color-hq-bronze-dark)" strokeWidth={2} opacity={0.6} />
        <line x1={312} y1={150} x2={312} y2={188} stroke="var(--color-hq-bronze-dark)" strokeWidth={2} opacity={0.6} />

        {/* Dominant display — offset left-of-center on purpose (never centered: that reads as a face/TV). */}
        <rect x={30} y={26} width={150} height={124} rx={8} fill="var(--color-hq-teal-dark)" stroke="var(--color-hq-metal)" strokeWidth={4} />
        <rect x={38} y={34} width={134} height={108} rx={4} fill="var(--color-hq-teal)" />
        <CentralScreenReadout mode={mode} />

        {/* Two smaller supporting screens on the lower-right shelf. */}
        <rect x={200} y={40} width={90} height={44} rx={4} fill="var(--color-hq-teal-dark)" stroke="var(--color-hq-metal)" strokeWidth={3} />
        <rect x={200} y={92} width={90} height={44} rx={4} fill="var(--color-hq-teal-dark)" stroke="var(--color-hq-metal)" strokeWidth={3} />

        {/* Status-light cluster — system health only; NOT the Firewall lock indicator (that's on the arms). */}
        <g>
          {[46, 60, 74].map((cx) => (
            <circle key={cx} cx={cx} cy={172} r={4} fill="var(--color-hq-teal-active)" />
          ))}
        </g>

        <FirewallArms mode={mode} />
      </svg>
    </div>
  );
}

function CentralScreenReadout({ mode }: { mode: CentralUnitMode }) {
  // Simple neutral system-state graphic — never Matrix code, never emergency red outside the
  // console/arms. A quiet line-trend glyph reads as "system is alive" without claiming to be a
  // real dashboard the player is meant to parse.
  return (
    <g opacity={mode === 'discussion' ? 0.55 : 1} style={{ transition: 'opacity 300ms ease' }}>
      <polyline
        points="46,120 66,100 86,108 106,84 126,92 146,68 160,76"
        fill="none"
        stroke="var(--color-hq-teal-highlight)"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[46, 86, 126, 160].map((cx, i) => (
        <circle key={cx} cx={cx} cy={[120, 108, 92, 76][i]} r={2.6} fill="var(--color-hq-teal-highlight)" />
      ))}
    </g>
  );
}

/** Signature object #3 (Lock Arms) — folded flush in normal state, clamp onto the display's OUTER frame only when Firewall is active. Never covers the screen. */
function FirewallArms({ mode }: { mode: CentralUnitMode }) {
  const active = mode === 'firewallActive';
  return (
    <g data-hq-state={active ? 'locked' : 'folded'} style={{ transition: 'transform 400ms ease' }}>
      <g transform={active ? 'translate(2,0)' : 'translate(-6,0) rotate(-8 30 90)'}>
        <rect x={16} y={20} width={14} height={140} rx={4} fill="var(--color-hq-bronze-dark)" stroke="var(--color-hq-bronze-line)" strokeWidth={2} />
        <circle cx={23} cy={90} r={4} fill={active ? 'var(--color-hq-teal-highlight)' : 'var(--color-hq-metal)'} />
      </g>
      <g transform={active ? 'translate(-2,0)' : 'translate(6,0) rotate(8 180 90)'}>
        <rect x={166} y={20} width={14} height={140} rx={4} fill="var(--color-hq-bronze-dark)" stroke="var(--color-hq-bronze-line)" strokeWidth={2} />
        <circle cx={173} cy={90} r={4} fill={active ? 'var(--color-hq-teal-highlight)' : 'var(--color-hq-metal)'} />
      </g>
    </g>
  );
}
