import { CONSOLE_BOX, boxStyle } from '../../../../lib/gameplay/headquarters-layout';

/**
 * Signature object #2 — standalone, never touching the Central Unit (spec §03). Its only job on
 * the TV is theatrical/environmental: the real Push-the-Button action still comes from a player's
 * phone (existing gameplay logic, untouched). `dormant` is the only state implemented this phase —
 * the open-cover/pressed sequence is future motion work (§23), not business logic.
 */
export function EmergencyDecisionConsole({ dormant = true }: { dormant?: boolean }) {
  return (
    <div className="absolute" style={boxStyle(CONSOLE_BOX)} data-hq-asset="decision-console">
      <svg viewBox="0 0 100 84" className="h-full w-full overflow-visible" role="img" aria-label="منصّة القرار الطارئ">
        <rect x={6} y={30} width={88} height={54} rx={10} fill="var(--color-hq-bronze)" stroke="var(--color-hq-bronze-line)" strokeWidth={3} />
        {/* Closed protective cover. */}
        <path d="M10 30 Q10 6 50 6 Q90 6 90 30 Z" fill="var(--color-hq-bronze)" stroke="var(--color-hq-bronze-line)" strokeWidth={3} />
        <line x1={14} y1={30} x2={86} y2={30} stroke="var(--color-hq-bronze-dark)" strokeWidth={2} />
        {/* Maintenance/warning label. */}
        <rect x={16} y={40} width={30} height={10} rx={2} fill="var(--color-hq-metal)" stroke="var(--color-hq-gold)" strokeWidth={1} opacity={0.8} />
        {/* Dormant indicator lamp. */}
        <circle cx={50} cy={54} r={4} fill={dormant ? 'var(--color-hq-ink-subtle)' : 'var(--color-hq-ember)'} />
      </svg>
    </div>
  );
}
