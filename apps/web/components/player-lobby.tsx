'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import { Panel } from './ui/Panel';
import { PlayerAvatar } from './ui/PlayerAvatar';
import { SectionTitle } from './ui/SectionTitle';
import { StatusBadge } from './ui/StatusBadge';
import { buttonClassName } from './ui/button-styles';
import { ConnectionPulse, PixelGrid } from './graphics';
import { PlayerGameplayRoot } from './gameplay/hacker/GameplayRoots';
import { usePlayerRealtime } from '../lib/realtime/usePlayerRealtime';
import { describeConnectionState, pulseToneFor } from '../lib/realtime/connection-status';
import { clearPlayerSession, type PlayerSessionRecord } from '../lib/session-storage';

export interface PlayerLobbyProps {
  session: PlayerSessionRecord;
}

/** The real, live player lobby (Development Step 7B) — mounted once `/join/[roomCode]` has a player session, whether from a fresh join or a restored one after a refresh. */
export function PlayerLobby({ session }: PlayerLobbyProps) {
  const { connectionState, view, privateInfo, connectionError, actionPending, actionError, submitMinigameAction, sendPlayerEvent, retry } = usePlayerRealtime(session);

  useEffect(() => {
    if (connectionState === 'unauthorized') clearPlayerSession();
  }, [connectionState]);

  if (connectionState === 'unauthorized') {
    return (
      <Panel className="flex flex-col items-center gap-4 text-center">
        <ErrorMessage message="انتهت الجلسة، انضم من جديد." />
        <Link href="/join" className={buttonClassName({ variant: 'secondary' })}>
          انضم من جديد
        </Link>
      </Panel>
    );
  }

  const status = describeConnectionState(connectionState);

  if (view && view.phase.state !== 'LOBBY') {
    return <PlayerGameplayRoot view={view} privateInfo={privateInfo} connectionState={connectionState} actionPending={actionPending} actionError={actionError} submitMinigameAction={submitMinigameAction} sendPlayerEvent={sendPlayerEvent} retry={retry} />;
  }

  const totalPlayers = view ? view.others.length + 1 : null;

  return (
    <Panel variant="hard" className="relative overflow-hidden">
      <PixelGrid className="opacity-20" size={24} />
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <PlayerAvatar name={session.displayName} size="lg" />
        <SectionTitle as="h2" className="items-center">
          أهلًا، {session.displayName}!
        </SectionTitle>
        <p className="text-ink-muted">تم انضمامك إلى الغرفة {session.roomCode} — جوالك هو أداة التحكم الآن.</p>
        <StatusBadge tone={status.tone} live>
          <ConnectionPulse tone={pulseToneFor(status.tone)} animated={connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'reconnecting'} />
          {status.label}
        </StatusBadge>
        {totalPlayers !== null ? <p className="text-sm text-ink-subtle">عدد اللاعبين في الغرفة: {totalPlayers}</p> : null}
        <p className="text-sm font-semibold text-ink-subtle">تم انضمامك، الآن انتظر المضيف.</p>

        {connectionState === 'failed' || connectionState === 'disconnected' ? (
          <div className="flex flex-col items-center gap-2">
            {connectionError ? <ErrorMessage message={connectionError.message} /> : null}
            <Button variant="secondary" onClick={retry}>
              إعادة المحاولة
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
