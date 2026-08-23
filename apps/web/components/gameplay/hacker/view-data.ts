import type { JsonValue } from '../../../lib/shared';

/** Arabic display titles for every server-registered minigame id, shared by every TV/Player router and the Admin selection UI. */
export const GAME_TITLES = {
  RANK_IT: 'رتّبها', COMPLETE_IT: 'كمّلها', PREDICT_THEM: 'توقّعهم', DRAW_IT: 'ارسمها',
  DESCRIBE_IT: 'صفها', DEFEND_IT: 'دافع عنها', BOMB_PROTOCOL: 'Bomb Protocol',
} as const;
export type GameplayId = keyof typeof GAME_TITLES;
export function isGameplayId(value: string): value is GameplayId { return value in GAME_TITLES; }

export function asObject(value: JsonValue | null): Record<string, JsonValue> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function stringField(value: JsonValue | null, key: string): string | null {
  const object = asObject(value);
  return typeof object?.[key] === 'string' ? object[key] : null;
}

export function stringArrayField(value: JsonValue | null, key: string): string[] {
  const object = asObject(value);
  const field = object?.[key];
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string') : [];
}
