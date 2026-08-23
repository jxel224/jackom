/**
 * Headquarters station geometry — ported verbatim (same numbers, expressed as % of a 16:9 frame
 * instead of 1600×900 px) from the approved HEADQUARTERS_HERO_PRODUCTION_SPEC_V1 §09/§11. Ten
 * fixed anchors, front row (6) then back row (4), filled strictly center-out. Any player count
 * from 4–10 is just `STATION_SLOTS.slice(0, count)` — the room is never re-composed per count,
 * only how many of its ten fixed seats are lit (Bible §28: "same room, controlled state changes").
 */

export interface StationSlot {
  /** Stable seat id — NOT a player id. Player N (by join order) sits in slot N. */
  slot: number;
  row: 'front' | 'back';
  /** Percent of frame width/height, matching the 1600×900 reference in the production spec. */
  xPct: number;
  yPct: number;
  /** Station "radius" as a percent of frame width, for sizing the character/desk footprint. */
  rPct: number;
}

export const STATION_SLOTS: StationSlot[] = [
  { slot: 0, row: 'front', xPct: 42.5, yPct: 72.78, rPct: 2.0 },
  { slot: 1, row: 'front', xPct: 57.5, yPct: 72.78, rPct: 2.0 },
  { slot: 2, row: 'front', xPct: 28.75, yPct: 68.89, rPct: 1.875 },
  { slot: 3, row: 'front', xPct: 71.25, yPct: 68.89, rPct: 1.875 },
  { slot: 4, row: 'front', xPct: 15.625, yPct: 65.0, rPct: 1.75 },
  { slot: 5, row: 'front', xPct: 84.375, yPct: 65.0, rPct: 1.75 },
  { slot: 6, row: 'back', xPct: 35.0, yPct: 47.78, rPct: 1.375 },
  { slot: 7, row: 'back', xPct: 65.0, yPct: 47.78, rPct: 1.375 },
  { slot: 8, row: 'back', xPct: 21.875, yPct: 51.11, rPct: 1.25 },
  { slot: 9, row: 'back', xPct: 78.125, yPct: 51.11, rPct: 1.25 },
];

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;

/** Active seats for the current roster, in stable center-out order — never re-sorted by name/id. */
export function activeStationSlots(playerCount: number): StationSlot[] {
  const count = Math.max(0, Math.min(playerCount, MAX_PLAYERS));
  return STATION_SLOTS.slice(0, count);
}

/** Central Unit bounding box — production spec §11, unchanged across every player count. */
export const CENTRAL_UNIT_BOX = { leftPct: 36.875, rightPct: 63.125, topPct: 16.67, bottomPct: 40 };

/** Remote timer module box — spec §11 (tethered to the Central Unit, not fused into it — §"Merge Resolution"). */
export const TIMER_BOX = { leftPct: 41.875, rightPct: 58.125, topPct: 6.44, bottomPct: 13.78 };

/** Emergency Decision Console box — spec §11, standalone, never touching the Central Unit box. */
export const CONSOLE_BOX = { leftPct: 46.875, rightPct: 53.125, topPct: 75, bottomPct: 83.9 };

/** Protocol Room doorway box — spec §11, back-right, outside the seating arc. */
export const DOORWAY_BOX = { leftPct: 84.375, rightPct: 92.5, topPct: 20, bottomPct: 42.2 };

export function boxStyle(box: { leftPct: number; rightPct: number; topPct: number; bottomPct: number }) {
  return {
    left: `${box.leftPct}%`,
    top: `${box.topPct}%`,
    width: `${box.rightPct - box.leftPct}%`,
    height: `${box.bottomPct - box.topPct}%`,
  } as const;
}
