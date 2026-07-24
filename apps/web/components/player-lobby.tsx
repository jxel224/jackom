'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import { Panel } from './ui/Panel';
import { SectionTitle } from './ui/SectionTitle';
import { StatusBadge } from './ui/StatusBadge';
import { buttonClassName } from './ui/button-styles';
import { PostLobbyPlaceholder } from './post-lobby-placeholder';
import { usePlayerRealtime } from '../lib/realtime/usePlayerRealtime';
import { describeConnectionState } from '../lib/realtime/connection-status';
import { clearPlayerSession, type PlayerSessionRecord } from '../lib/session-storage';

export interface PlayerLobbyProps {
  session: PlayerSessionRecord;
}

/** The real, live player lobby (Development Step 7B) — mounted once `/join/[roomCode]` has a player session, whether from a fresh join or a restored one after a refresh. */
export function PlayerLobby({ session }: PlayerLobbyProps) {
  const { connectionState, view, connectionError, retry } = usePlayerRealtime(session);

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
    return (
      <div className="flex flex-col gap-4">
        <StatusBadge tone={status.tone} live>
          {status.label}
        </StatusBadge>
        <PostLobbyPlaceholder />
      </div>
    );
  }

  const totalPlayers = view ? view.others.length + 1 : null;

  return (
    <Panel className="flex flex-col items-center gap-3 text-center">
      <SectionTitle as="h2">أهلًا، {session.displayName}!</SectionTitle>
      <p className="text-ink-muted">تم انضمامك إلى الغرفة {session.roomCode}.</p>
      <StatusBadge tone={status.tone} live>
        {status.label}
      </StatusBadge>
      {totalPlayers !== null ? <p className="text-sm text-ink-subtle">عدد اللاعبين في الغرفة: {totalPlayers}</p> : null}
      <p className="text-sm text-ink-subtle">انتظر المضيف لبدء اللعبة.</p>

      {connectionState === 'failed' || connectionState === 'disconnected' ? (
        <div className="flex flex-col items-center gap-2">
          {connectionError ? <ErrorMessage message={connectionError.message} /> : null}
          <Button variant="secondary" onClick={retry}>
            إعادة المحاولة
          </Button>
        </div>
      ) : null}
    </Panel>
  );
}
