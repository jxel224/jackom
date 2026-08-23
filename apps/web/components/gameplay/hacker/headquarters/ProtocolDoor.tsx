import { DOORWAY_BOX, boxStyle } from '../../../../lib/gameplay/headquarters-layout';

/**
 * Signature object #5 — the one place bronze/chamfered geometry "escapes" plain office realism
 * (spec §06). Door art only; Protocol Room's interior is explicitly out of scope this phase.
 */
export function ProtocolDoor({ active = false }: { active?: boolean }) {
  return (
    <div className="absolute" style={boxStyle(DOORWAY_BOX)} data-hq-asset="protocol-door">
      <svg viewBox="0 0 100 220" className="h-full w-full overflow-visible" role="img" aria-label="باب غرفة البروتوكول">
        <path
          d="M10 220 L10 40 Q10 10 40 6 L60 6 Q90 10 90 40 L90 220 Z"
          fill="var(--color-hq-wall-dim)"
          stroke="var(--color-hq-bronze-line)"
          strokeWidth={4}
        />
        <path d="M20 220 L20 44 Q20 20 42 16 L58 16 Q80 20 80 44 L80 220 Z" fill="var(--color-hq-metal)" stroke="var(--color-hq-bronze)" strokeWidth={2} />
        <circle cx={50} cy={2} r={5} fill={active ? 'var(--color-hq-gold)' : 'var(--color-hq-ink-subtle)'} opacity={active ? 1 : 0.5} />
        {/* Restricted threshold marking. */}
        <g stroke="var(--color-hq-gold)" strokeWidth={2} opacity={0.4}>
          <line x1={16} y1={214} x2={26} y2={214} />
          <line x1={34} y1={214} x2={44} y2={214} />
          <line x1={52} y1={214} x2={62} y2={214} />
          <line x1={70} y1={214} x2={80} y2={214} />
        </g>
      </svg>
    </div>
  );
}
