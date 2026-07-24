import { WireEnvelopeSchema, ErrorPayloadSchema } from './wire-schemas';
import type { ConnectionState } from './types';
import type { DisplayError } from './public-types';

/**
 * The one place raw browser `WebSocket` code lives (Development Step 7B). Framework-agnostic on
 * purpose — `useHostRealtime`/`usePlayerRealtime` are thin React wrappers around this, so host and
 * player connection handling (auth-first-message, JSON parsing, reconnection/backoff, online/offline
 * handling, duplicate-socket-replacement handling) is implemented exactly once.
 *
 * Reuses the EXISTING WebSocket gateway unchanged (`/host/{roomCode}` / `/play/{roomCode}`,
 * ARCHITECTURE.md Step 4) — this class only ever sends `{kind}:reconnect` as its first message and
 * whatever typed actions the caller explicitly requests via `send()`. It never re-runs player
 * joining (`player:join`) — Step 7A's HTTP API is the only player-registration path.
 */

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10_000;
const BACKOFF_MULTIPLIER = 1.8;
const JITTER_RATIO = 0.2;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 6;

export interface RealtimeSocketOptions {
  /** e.g. `wss://api.example.com` — no trailing slash. */
  wsBaseUrl: string;
  kind: 'host' | 'player';
  roomCode: string;
  /** Builds the first outgoing message, sent immediately once the socket opens. Never re-invoked for later messages. */
  buildAuthMessage: () => { type: string; payload: unknown };
  /** Called for every successfully-parsed, envelope-valid inbound message. */
  onEnvelope: (type: string, payload: unknown) => void;
  onStateChange: (state: ConnectionState, error: DisplayError | null) => void;
  /** After this many consecutive failed (re)connection attempts, automatic retry stops and the state becomes `failed`. */
  maxConsecutiveFailures?: number;
  /** Injectable only for tests — real callers should never need this. */
  webSocketImpl?: typeof WebSocket;
}

/** Close codes the existing gateway already uses (`gateway-server.ts`) that carry specific meaning beyond "try again." */
const CLOSE_CODE_REPLACED = 4000;
const CLOSE_CODE_AUTH_TIMEOUT = 4001;
const CLOSE_CODE_TOO_MANY_VIOLATIONS = 4002;
const CLOSE_CODE_ROOM_UNAVAILABLE = 4003;

export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private stopped = false;
  private readonly WebSocketImpl: typeof WebSocket;

  constructor(private readonly options: RealtimeSocketOptions) {
    this.WebSocketImpl = options.webSocketImpl ?? WebSocket;
  }

  /** Opens the first connection attempt. Safe to call once per instance — construct a new instance to reconnect after `close()`. */
  connect(): void {
    if (this.stopped) return;
    this.manuallyClosed = false;
    this.attachOnlineOfflineListeners();
    this.openSocket();
  }

  /** Resets failure/auth-stopped state and tries again — the manual "إعادة المحاولة" action. */
  retry(): void {
    this.stopped = false;
    this.manuallyClosed = false;
    this.attempt = 0;
    this.clearReconnectTimer();
    this.attachOnlineOfflineListeners();
    this.openSocket();
  }

  /** Sends a typed client action. No-op if the socket isn't currently open (avoids throwing from a stale UI event handler). */
  send(type: string, payload: unknown): void {
    if (!this.ws || this.ws.readyState !== this.WebSocketImpl.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ type, requestId: null, payload }));
    } catch {
      // A send failing on a dying socket is always followed by a 'close' event, which drives recovery.
    }
  }

  /** Terminal — closes the socket, cancels any pending reconnect, detaches listeners. Call from a `useEffect` cleanup. */
  close(): void {
    this.manuallyClosed = true;
    this.stopped = true;
    this.clearReconnectTimer();
    this.detachOnlineOfflineListeners();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      try {
        socket.close(1000, 'client closed');
      } catch {
        // ignore — socket may already be closing/closed
      }
    }
  }

  private openSocket(): void {
    this.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const path = this.options.kind === 'host' ? 'host' : 'play';
    const url = `${this.options.wsBaseUrl}/${path}/${encodeURIComponent(this.options.roomCode)}`;

    let socket: WebSocket;
    try {
      socket = new this.WebSocketImpl(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = socket;

    socket.addEventListener('open', () => {
      if (this.ws !== socket) return; // superseded by close()/a newer attempt — never act on a stale socket's events
      this.setState('authenticating');
      const auth = this.options.buildAuthMessage();
      this.send(auth.type, auth.payload);
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (this.ws !== socket) return;
      this.handleMessage(event, socket);
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.handleClose(event);
    });

    socket.addEventListener('error', () => {
      // 'close' always follows 'error' for WebSocket — cleanup/recovery happens there, matching the gateway's own convention.
    });
  }

  private handleMessage(event: MessageEvent, socket: WebSocket): void {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(String(event.data));
    } catch {
      return; // malformed — never crash on untrusted input, just drop it
    }
    const envelope = WireEnvelopeSchema.safeParse(parsedJson);
    if (!envelope.success) return;

    const { type, payload } = envelope.data;

    if (type === 'host:authenticated' || type === 'player:reconnected') {
      this.attempt = 0; // a successful connection resets the retry count
      this.setState('connected');
    }

    if (type === 'error:actionRejected') {
      const parsedError = ErrorPayloadSchema.safeParse(payload);
      if (parsedError.success && (parsedError.data.code === 'SESSION_INVALID' || parsedError.data.code === 'SESSION_ROOM_MISMATCH')) {
        this.stopped = true;
        this.clearReconnectTimer();
        this.detachOnlineOfflineListeners();
        try {
          socket.close(CLOSE_CODE_AUTH_TIMEOUT, 'unauthorized');
        } catch {
          // ignore
        }
        this.setState('unauthorized', { code: parsedError.data.code, message: 'انتهت الجلسة، انضم من جديد.' });
        return;
      }
    }

    this.options.onEnvelope(type, payload);
  }

  private handleClose(event: CloseEvent): void {
    if (this.manuallyClosed) return;

    if (event.code === CLOSE_CODE_REPLACED) {
      // Another connection took over this exact session (e.g. the same room open in a second tab).
      // Fighting it with auto-reconnect would just replace the other one back — stop and let the
      // user decide (manual retry) rather than loop.
      this.stopped = true;
      this.clearReconnectTimer();
      this.setState('disconnected', { code: 'SESSION_REPLACED', message: 'تم فتح هذه الجلسة من مكان آخر.' });
      return;
    }
    if (event.code === CLOSE_CODE_AUTH_TIMEOUT) {
      this.stopped = true;
      this.clearReconnectTimer();
      this.setState('unauthorized', { code: 'SESSION_INVALID', message: 'انتهت الجلسة، انضم من جديد.' });
      return;
    }
    if (event.code === CLOSE_CODE_TOO_MANY_VIOLATIONS) {
      this.stopped = true;
      this.clearReconnectTimer();
      this.setState('failed', { code: 'PROTOCOL_ERROR', message: 'تعذر الاتصال بالخادم.' });
      return;
    }
    if (event.code === CLOSE_CODE_ROOM_UNAVAILABLE) {
      this.stopped = true;
      this.clearReconnectTimer();
      this.setState('failed', { code: 'ROOM_UNAVAILABLE', message: 'لم تعد الغرفة متاحة.' });
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.manuallyClosed) return;

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // No point burning an attempt while definitely offline — the 'online' listener resumes us.
      this.clearReconnectTimer();
      this.setState('disconnected', { code: 'OFFLINE', message: 'لا يوجد اتصال بالإنترنت.' });
      return;
    }

    const maxFailures = this.options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    if (this.attempt >= maxFailures) {
      this.stopped = true;
      this.clearReconnectTimer();
      this.setState('failed', { code: 'CONNECTION_FAILED', message: 'تعذر الاتصال بالخادم.' });
      return;
    }

    this.setState('reconnecting');
    const rawDelay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, this.attempt));
    const jitter = rawDelay * JITTER_RATIO * (Math.random() * 2 - 1);
    const delay = Math.max(0, Math.round(rawDelay + jitter));
    this.attempt += 1;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private readonly handleOnline = (): void => {
    if (this.stopped || this.manuallyClosed || this.ws) return;
    this.attempt = 0;
    this.clearReconnectTimer();
    this.openSocket();
  };

  private readonly handleOffline = (): void => {
    this.clearReconnectTimer();
    this.setState('disconnected', { code: 'OFFLINE', message: 'لا يوجد اتصال بالإنترنت.' });
  };

  private attachOnlineOfflineListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private detachOnlineOfflineListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private setState(state: ConnectionState, error: DisplayError | null = null): void {
    this.options.onStateChange(state, error);
  }
}
