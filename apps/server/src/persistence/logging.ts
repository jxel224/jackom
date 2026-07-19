/**
 * A deliberately narrow logging surface: every call site names a roomId and a short event label,
 * never a full RoomState/RoomPrivateState object or a session token. There is no `log(obj: unknown)`
 * escape hatch anywhere in the persistence/actor layers — this is what makes "private state and
 * tokens are never written to logs" a structural property rather than a habit to remember.
 */
export interface RoomLogEvent {
  roomId: string;
  event: string;
  detail?: Record<string, string | number | boolean>;
}

export type RoomLogger = (entry: RoomLogEvent) => void;

/** Default logger: writes a redacted, single-line summary to stderr. Safe to call in production. */
export const consoleRoomLogger: RoomLogger = (entry) => {
  const detail = entry.detail ? ` ${JSON.stringify(entry.detail)}` : '';
  // eslint-disable-next-line no-console
  console.error(`[room:${entry.roomId}] ${entry.event}${detail}`);
};

/** No-op logger, useful for tests that don't want console noise. */
export const noopRoomLogger: RoomLogger = () => {};
