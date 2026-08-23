'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { env } from '../env';
import type { PlayerSessionRecord } from '../session-storage';
import { RealtimeSocket } from './realtime-socket';
import { PlayerViewPayloadSchema, PrivatePlayerPayloadSchema } from './wire-schemas';
import { arabicMessageForRejectionCode } from './rejection-messages';
import type { ConnectionState } from './types';
import type { DisplayError, PlayerView, PrivatePlayerPayload } from './public-types';
import type { JsonValue } from '../shared';

export interface UsePlayerRealtimeResult {
  connectionState: ConnectionState;
  view: PlayerView | null;
  /** Scoped strictly to this authenticated connection — never another player's payload, never cached across a session change. */
  privateInfo: PrivatePlayerPayload | null;
  connectionError: DisplayError | null;
  actionPending: boolean;
  actionError: DisplayError | null;
  submitMinigameAction: (actionType: string, data: JsonValue) => boolean;
  /**
   * Sends any other real, server-defined `player:*` event for the current phase (Admin selection,
   * hack submission, push-the-button, accusation, accusation vote, rematch request) — always
   * `{phaseId, ...extra}`, `playerId` is never included (the gateway injects it from the
   * authenticated socket, same as `submitMinigameAction`). Returns false without sending if there
   * is no live connection/view or another action is already pending — callers should treat a
   * `false` return as "the click was a no-op," not throw.
   */
  sendPlayerEvent: (type: string, extra?: Record<string, JsonValue>) => boolean;
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
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<DisplayError | null>(null);

  const socketRef = useRef<RealtimeSocket | null>(null);
  const viewRef = useRef<PlayerView | null>(null);
  const connectionRef = useRef<ConnectionState>('idle');
  const seqRef = useRef(0);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { connectionRef.current = connectionState; }, [connectionState]);

  useEffect(() => {
    // Session changed (or became unavailable) — never carry a stale player's private payload
    // forward. Clearing it here is synchronizing with that external fact, not deriving UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setPrivateInfo(null);
    setActionPending(false);
    setActionError(null);

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
          if (parsed.success) {
            setView(parsed.data as PlayerView);
            setActionPending(false);
          }
          return;
        }
        if (type === 'player:privateRoleInfo') {
          const parsed = PrivatePlayerPayloadSchema.safeParse(payload);
          if (parsed.success) setPrivateInfo(parsed.data as PrivatePlayerPayload);
          return;
        }
        if (type === 'error:actionRejected') {
          const parsed = payload as { code?: unknown };
          const code = typeof parsed.code === 'string' ? parsed.code : 'ACTION_REJECTED';
          setActionPending(false);
          setActionError({ code, message: arabicMessageForRejectionCode(code) });
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

  const submitMinigameAction = useCallback((actionType: string, data: JsonValue): boolean => {
    const socket = socketRef.current;
    const currentView = viewRef.current;
    if (!socket || !currentView || connectionRef.current !== 'connected' || actionPending) return false;
    const actionId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID() : `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    seqRef.current = Math.max(seqRef.current + 1, Date.now());
    setActionError(null);
    setActionPending(true);
    socket.send('player:submitAction', {
      phaseId: currentView.phase.phaseId,
      seq: seqRef.current,
      actionId,
      actionType,
      data,
    });
    return true;
  }, [actionPending]);

  const sendPlayerEvent = useCallback((type: string, extra: Record<string, JsonValue> = {}): boolean => {
    const socket = socketRef.current;
    const currentView = viewRef.current;
    if (!socket || !currentView || connectionRef.current !== 'connected' || actionPending) return false;
    setActionError(null);
    setActionPending(true);
    socket.send(type, { phaseId: currentView.phase.phaseId, ...extra });
    return true;
  }, [actionPending]);

  return { connectionState, view, privateInfo, connectionError, actionPending, actionError, submitMinigameAction, sendPlayerEvent, retry };
}
