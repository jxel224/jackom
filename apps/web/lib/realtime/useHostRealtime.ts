'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../env';
import type { HostSessionRecord } from '../session-storage';
import { RealtimeSocket } from './realtime-socket';
import { TvViewPayloadSchema } from './wire-schemas';
import { arabicMessageForRejectionCode } from './rejection-messages';
import type { ConnectionState } from './types';
import type { DisplayError, TvView } from './public-types';
import type { JsonValue } from '../shared';

export interface UseHostRealtimeResult {
  connectionState: ConnectionState;
  view: TvView | null;
  connectionError: DisplayError | null;
  /** Sends `host:startGame` for the CURRENT phaseId — works from LOBBY or REMATCH_LOBBY alike, the server routes on phase. No-op if not connected or no view yet. */
  startGame: () => void;
  startPending: boolean;
  startError: DisplayError | null;
  /** Sends any other real, phaseId-scoped `host:*` event (e.g. `host:advance` to leave FINAL_RESULTS for REMATCH_LOBBY). Shares `startPending`/`startError`. */
  sendHostEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
  retry: () => void;
}

const NOT_CONFIGURED_ERROR: DisplayError = { code: 'NOT_CONFIGURED', message: 'الخدمة غير متاحة حاليًا.' };

/**
 * Owns the host's WebSocket connection: authenticates with the stored `hostSessionToken` (via the
 * existing `host:reconnect` gateway event — never re-creates a room or a host), keeps the latest
 * `TvView`, and exposes `startGame()` for the lobby's "ابدأ اللعبة" button. `session === null` means
 * "no session yet" — the hook stays idle and connects nothing (the page owns deciding whether a
 * session exists at all, exactly as it already did in Step 7A).
 */
export function useHostRealtime(session: HostSessionRecord | null): UseHostRealtimeResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionError, setConnectionError] = useState<DisplayError | null>(null);
  const [view, setView] = useState<TvView | null>(null);
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<DisplayError | null>(null);

  const socketRef = useRef<RealtimeSocket | null>(null);
  const viewRef = useRef<TvView | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!session) {
      // Reflecting "no session" into connection state is synchronizing with the external fact that
      // the caller no longer has a session to connect with — see the matching pattern in app/tv/page.tsx.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setConnectionState('idle');
      setConnectionError(null);
      setView(null);
      return;
    }
    if (!env.NEXT_PUBLIC_WS_URL) {
      setConnectionState('failed');
      setConnectionError(NOT_CONFIGURED_ERROR);
      return;
    }

    setView(null);
    setConnectionError(null);
    setStartError(null);
    setStartPending(false);

    const socket = new RealtimeSocket({
      wsBaseUrl: env.NEXT_PUBLIC_WS_URL,
      kind: 'host',
      roomCode: session.roomCode,
      buildAuthMessage: () => ({ type: 'host:reconnect', payload: { hostSessionToken: session.hostSessionToken } }),
      onStateChange: (state, error) => {
        setConnectionState(state);
        setConnectionError(error);
      },
      onEnvelope: (type, payload) => {
        if (type === 'view:tv') {
          const parsed = TvViewPayloadSchema.safeParse(payload);
          if (parsed.success) {
            setView(parsed.data as TvView);
            setStartPending(false);
          }
          return;
        }
        if (type === 'error:actionRejected') {
          const parsed = payload as { code?: unknown };
          const code = typeof parsed.code === 'string' ? parsed.code : 'ACTION_REJECTED';
          setStartError({ code, message: arabicMessageForRejectionCode(code) });
          setStartPending(false);
        }
      },
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on primitive session fields, not the object reference
  }, [session?.roomCode, session?.hostSessionToken]);

  const startGame = useCallback(() => {
    const socket = socketRef.current;
    const currentView = viewRef.current;
    if (!socket || !currentView) return;
    setStartError(null);
    setStartPending(true);
    socket.send('host:startGame', { phaseId: currentView.phase.phaseId });
  }, []);

  const sendHostEvent = useCallback((type: string, extra: Record<string, JsonValue> = {}): boolean => {
    const socket = socketRef.current;
    const currentView = viewRef.current;
    if (!socket || !currentView) return false;
    setStartError(null);
    setStartPending(true);
    socket.send(type, { phaseId: currentView.phase.phaseId, ...extra });
    return true;
  }, []);

  const retry = useCallback(() => {
    socketRef.current?.retry();
  }, []);

  return { connectionState, view, connectionError, startGame, startPending, startError, sendHostEvent, retry };
}
