'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TvScreenLayout } from './layouts/TvScreenLayout';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import { Panel } from './ui/Panel';
import { PlayerAvatar } from './ui/PlayerAvatar';
import { QrCode } from './ui/QrCode';
import { RoomCodeDisplay } from './ui/RoomCodeDisplay';
import { SectionTitle } from './ui/SectionTitle';
import { StatusBadge } from './ui/StatusBadge';
import { buttonClassName } from './ui/button-styles';
import { ConnectionPulse, GlitchFrame } from './graphics';
import { PostLobbyPlaceholder } from './post-lobby-placeholder';
import { useHostRealtime } from '../lib/realtime/useHostRealtime';
import { describeConnectionState, pulseToneFor } from '../lib/realtime/connection-status';
import { clearHostSession, type HostSessionRecord } from '../lib/session-storage';
import { env } from '../lib/env';

export interface TvLobbyProps {
  session: HostSessionRecord;
  minPlayers: number;
  maxPlayers: number;
}

/** The real, live host lobby (Development Step 7B) — everything past "we have a host session" lives here. */
export function TvLobby({ session, minPlayers, maxPlayers }: TvLobbyProps) {
  const { connectionState, view, connectionError, startGame, startPending, startError, retry } = useHostRealtime(session);

  useEffect(() => {
    // The stored session is no longer valid — never let a stale token linger for the next visit.
    if (connectionState === 'unauthorized') clearHostSession();
  }, [connectionState]);

  if (connectionState === 'unauthorized') {
    return (
      <TvScreenLayout eyebrow="جاكوم">
        <ErrorMessage message="انتهت الجلسة، أنشئ غرفة جديدة." />
        <Link href="/" className={buttonClassName({ size: 'tv' })}>
          العودة إلى الرئيسية
        </Link>
      </TvScreenLayout>
    );
  }

  const status = describeConnectionState(connectionState);
  const joinUrl = env.NEXT_PUBLIC_WEB_BASE_URL ? `${env.NEXT_PUBLIC_WEB_BASE_URL.replace(/\/+$/, '')}/join/${session.roomCode}` : null;

  if (view && view.phase.state !== 'LOBBY') {
    return (
      <TvScreenLayout eyebrow="جاكوم">
        <StatusBadge tone={status.tone} live>
          <ConnectionPulse tone={pulseToneFor(status.tone)} animated={connectionState === 'connected'} />
          {status.label}
        </StatusBadge>
        <PostLobbyPlaceholder />
      </TvScreenLayout>
    );
  }

  const players = view?.players ?? [];
  const canStart = view !== null && players.length >= minPlayers && players.length <= maxPlayers;

  return (
    <TvScreenLayout eyebrow="جاكوم">
      <StatusBadge tone={status.tone} live>
        <ConnectionPulse tone={pulseToneFor(status.tone)} animated={connectionState === 'connected'} />
        {status.label}
      </StatusBadge>

      <SectionTitle as="h1" scale="tv" className="items-center">
        انضموا إلى الغرفة
      </SectionTitle>

      <GlitchFrame accent="brand" className="p-4 sm:p-6">
        <RoomCodeDisplay code={session.roomCode} />
      </GlitchFrame>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Panel variant="hard" className="flex flex-col items-center gap-3">
          <p className="text-tv-sm font-bold text-ink">امسح رمز QR</p>
          {joinUrl ? (
            <QrCode value={joinUrl} size={176} />
          ) : (
            <p className="text-center text-sm text-ink-subtle">استخدموا رمز الغرفة أعلاه للانضمام.</p>
          )}
        </Panel>

        <Panel variant="hard" className="flex flex-col items-center gap-3">
          <p className="text-tv-sm font-bold text-ink">اللاعبون ({players.length})</p>
          {players.length === 0 ? (
            <p className="text-ink-subtle">بانتظار انضمام اللاعبين...</p>
          ) : (
            <ul className="flex w-full flex-wrap justify-center gap-3">
              {players.map((player) => {
                const connected = player.connectionStatus === 'connected';
                return (
                  <li key={player.playerId} className="flex flex-col items-center gap-1">
                    <PlayerAvatar name={player.name} size="lg" />
                    <span className="max-w-[6rem] truncate text-sm font-semibold text-ink">{player.name}</span>
                    <StatusBadge tone={connected ? 'success' : 'neutral'}>
                      <ConnectionPulse tone={connected ? 'success' : 'neutral'} animated={connected} />
                      {player.connectionStatus === 'connected' ? 'متصل' : player.connectionStatus === 'afk' ? 'غير نشط' : 'غير متصل'}
                    </StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button size="tv" onClick={startGame} loading={startPending} disabled={!canStart || startPending}>
          ابدأ اللعبة
        </Button>
        {view && !canStart ? <p className="text-sm text-ink-subtle">بحاجة إلى {minPlayers} لاعبين على الأقل لبدء اللعبة.</p> : null}
        {startError ? <ErrorMessage message={startError.message} /> : null}
      </div>

      {connectionState === 'failed' || connectionState === 'disconnected' ? (
        <div className="flex flex-col items-center gap-2">
          {connectionError ? <ErrorMessage message={connectionError.message} /> : null}
          <Button variant="secondary" onClick={retry}>
            إعادة المحاولة
          </Button>
        </div>
      ) : null}
    </TvScreenLayout>
  );
}
