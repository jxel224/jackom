'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../env';
import type { PlayerSessionRecord } from '../session-storage';
import { RealtimeSocket } from './realtime-socket';
import { PlayerViewPayloadSchema, PrivatePlayerPayloadSchema } from './wire-schemas';
import type { ConnectionState } from './types';
import type { DisplayError, PlayerView, PrivatePlayerPayload } from './public-types';

export interface UsePlayerRealtimeResult {
  connectionState: ConnectionState;
  view: PlayerView | null;
  /** Scoped strictly to this authenticated connection — never another player's payload, never cached across a session change. */
  privateInfo: PrivatePlayerPayload | null;
  connectionError: DisplayError | null;
  retry: () => void;
}

const NOT_CONFIGURED_ERROR: DisplayError = { code: 'NOT_CONFIGURED', message: 'الخدمة غير متاحة حاليًا.' };

/**
 * Owns a player's WebSocket connection: authenticates with the stored `playerSessionToken` (via
 * the existing `player:reconnect` gateway event — NEVER `player:join`, which would register a
 * second player; Step 7A's HTTP API is the only join path), keeps the latest `PlayerView`, and
 * isolates `PrivatePlayerPayload` to this connection only.
 */
export function usePlayerRealtime(session: PlayerSessionRecord | null): UsePlayerRealtimeResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [connectionError, setConnectionError] = useState<DisplayError | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [privateInfo, setPrivateInfo] = useState<PrivatePlayerPayload | null>(null);

  const socketRef = useRef<RealtimeSocket | null>(null);

  useEffect(() => {
    // Session changed (or became unavailable) — never carry a stale player's private payload
    // forward. Clearing it here is synchronizing with that external fact, not deriving UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setPrivateInfo(null);

    if (!session) {
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

    const socket = new RealtimeSocket({
      wsBaseUrl: env.NEXT_PUBLIC_WS_URL,
      kind: 'player',
      roomCode: session.roomCode,
      buildAuthMessage: () => ({ type: 'player:reconnect', payload: { sessionToken: session.playerSessionToken } }),
      onStateChange: (state, error) => {
        setConnectionState(state);
        setConnectionError(error);
        if (state === 'unauthorized') setPrivateInfo(null);
      },
      onEnvelope: (type, payload) => {
        if (type === 'view:player') {
          const parsed = PlayerViewPayloadSchema.safeParse(payload);
          if (parsed.success) setView(parsed.data as PlayerView);
          return;
        }
        if (type === 'player:privateRoleInfo') {
          const parsed = PrivatePlayerPayloadSchema.safeParse(payload);
          if (parsed.success) setPrivateInfo(parsed.data as PrivatePlayerPayload);
        }
      },
    });

    socketRef.current = socket;
    socket.connect();

    return () => {
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
      setPrivateInfo(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on primitive session fields, not the object reference
  }, [session?.roomCode, session?.playerSessionToken]);

  const retry = useCallback(() => {
    socketRef.current?.retry();
  }, []);

  return { connectionState, view, privateInfo, connectionError, retry };
}
