'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TvScreenLayout } from '../../components/layouts/TvScreenLayout';
import { Button } from '../../components/ui/Button';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { Panel } from '../../components/ui/Panel';
import { RoomCodeDisplay } from '../../components/ui/RoomCodeDisplay';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { buttonClassName } from '../../components/ui/button-styles';
import { ApiClientError, getRoomAvailability } from '../../lib/api/client';
import { arabicMessageForErrorCode } from '../../lib/api/error-messages';
import { loadHostSession, type HostSessionRecord } from '../../lib/session-storage';
import type { RoomAvailabilityResponseBody } from '../../lib/shared';

type ScreenState =
  | { status: 'checking-session' }
  | { status: 'no-session' }
  | { status: 'loading'; session: HostSessionRecord }
  | { status: 'ready'; session: HostSessionRecord; availability: RoomAvailabilityResponseBody }
  | { status: 'error'; session: HostSessionRecord; message: string };

/**
 * Real TV/host screen: reads the host session stored by `CreateRoomButton`, then confirms the
 * room is still there via a ONE-TIME availability check — no polling, no live roster (that's
 * Step 7B's WebSocket client). Everything past "room exists" is still a waiting state.
 */
export default function TvPage() {
  const [state, setState] = useState<ScreenState>({ status: 'checking-session' });

  useEffect(() => {
    // sessionStorage is a browser-only API — it cannot be read during SSR, and a `useState` lazy
    // initializer would only ever see the SSR-time "no session" result even on the client (React
    // never re-runs it during hydration), silently hiding a real session forever. Reading it here,
    // after mount, and pushing the result into state is exactly "synchronize with an external
    // system" (the case React's own effect guidance carves out) — the underlying page state
    // genuinely cannot be known any earlier than this.
    const session = loadHostSession();
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
      setState({ status: 'no-session' });
      return;
    }
    setState({ status: 'loading', session });

    let cancelled = false;
    getRoomAvailability(session.roomCode)
      .then((availability) => {
        if (!cancelled) setState({ status: 'ready', session, availability });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof ApiClientError ? err.message : undefined;
        setState({ status: 'error', session, message: arabicMessageForErrorCode(code, message) });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'checking-session' || state.status === 'loading') {
    return (
      <TvScreenLayout eyebrow="جاكوم">
        <LoadingIndicator size="lg" label="جارٍ التحقق من الغرفة" />
      </TvScreenLayout>
    );
  }

  if (state.status === 'no-session') {
    return (
      <TvScreenLayout eyebrow="جاكوم">
        <SectionTitle as="h1" scale="tv" className="items-center">
          لم يتم إنشاء غرفة بعد
        </SectionTitle>
        <Link href="/" className={buttonClassName({ size: 'tv' })}>
          العودة إلى الرئيسية
        </Link>
      </TvScreenLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <TvScreenLayout eyebrow="جاكوم">
        <ErrorMessage message={state.message} />
        <Link href="/" className={buttonClassName({ size: 'tv' })}>
          إنشاء غرفة جديدة
        </Link>
      </TvScreenLayout>
    );
  }

  const { session, availability } = state;

  return (
    <TvScreenLayout eyebrow="جاكوم">
      <StatusBadge tone="info" live>
        الاتصال المباشر باللاعبين قادم قريبًا
      </StatusBadge>

      <SectionTitle as="h1" scale="tv" className="items-center">
        انضموا إلى الغرفة
      </SectionTitle>

      <RoomCodeDisplay code={session.roomCode} />

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Panel className="flex flex-col items-center gap-3">
          <p className="text-tv-sm font-bold text-ink">امسح رمز QR</p>
          <div
            role="img"
            aria-label="سيظهر هنا رمز QR للانضمام لاحقًا"
            className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-border-strong p-4 text-center text-sm text-ink-subtle"
          >
            رمز QR قريبًا
          </div>
        </Panel>

        <Panel className="flex flex-col items-center justify-center gap-3">
          <p className="text-tv-sm font-bold text-ink">اللاعبون</p>
          <p className="text-ink-subtle">{availability.playerCount > 0 ? `${availability.playerCount} لاعبًا انضموا حتى الآن` : 'بانتظار انضمام اللاعبين...'}</p>
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button size="tv" disabled>
          ابدأ اللعبة
        </Button>
        <p className="text-sm text-ink-subtle">سيتم تفعيل بدء اللعبة في خطوة قادمة.</p>
      </div>
    </TvScreenLayout>
  );
}
