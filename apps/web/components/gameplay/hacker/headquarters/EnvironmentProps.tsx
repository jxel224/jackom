/**
 * Selective, sparse lived-in details (spec §15) — a bookshelf/corkboard cluster back-left. Kept
 * deliberately minimal per the review of the reference image (which over-clustered both walls);
 * one cluster, not two, so it reads as "occupied" without competing with the Central Unit.
 */
export function EnvironmentProps() {
  return (
    <div className="absolute left-[3%] top-[8%] hidden h-[30%] w-[16%] sm:block" aria-hidden="true" data-hq-asset="environment-props">
      <svg viewBox="0 0 160 200" className="h-full w-full">
        <rect x={4} y={4} width={80} height={70} rx={3} fill="var(--color-hq-wall-dim)" stroke="var(--color-hq-bronze-line)" strokeWidth={2} />
        {[16, 30, 44, 58].map((y) => (
          <line key={y} x1={10} y1={y} x2={78} y2={y} stroke="var(--color-hq-bronze-line)" strokeWidth={1} opacity={0.5} />
        ))}
        <rect x={94} y={4} width={54} height={40} rx={2} fill="var(--color-hq-wood)" stroke="var(--color-hq-wood-line)" strokeWidth={2} />
        {[[100, 12], [124, 18], [108, 26]].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={12} height={8} fill="var(--color-hq-ink-subtle)" opacity={0.7} />
        ))}
      </svg>
    </div>
  );
}
