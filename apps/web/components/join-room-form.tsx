'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import { Input } from './ui/Input';
import { LoadingIndicator } from './ui/LoadingIndicator';
import { Panel } from './ui/Panel';
import { SectionTitle } from './ui/SectionTitle';
import { StatusBadge } from './ui/StatusBadge';
import { buttonClassName } from './ui/button-styles';
import { ApiClientError, getRoomAvailability, joinRoom } from '../lib/api/client';
import { arabicMessageForErrorCode } from '../lib/api/error-messages';
import { savePlayerSession } from '../lib/session-storage';
import { DISPLAY_NAME_MAX_LENGTH } from '../lib/shared';

export interface JoinRoomFormProps {
  roomCode: string;
  /** Already computed by the (server) page component from the route param — avoids a wasted API call for an obviously-malformed code. */
  formatValid: boolean;
}

type Phase = { step: 'invalid-format' } | { step: 'checking' } | { step: 'unavailable'; message: string } | { step: 'ready' } | { step: 'joined'; displayName: string };

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Everything past "the route param looked like a real code" happens here, client-side: confirm the
 * room is actually joinable (one-time check, not live), collect a display name, submit the real
 * join request, and store the resulting player session. `requestId` is generated once per mount and
 * reused on every submit from this component instance, so an accidental double-submit (or a retry
 * after a dropped response) replays the same result instead of registering a second player.
 */
export function JoinRoomForm({ roomCode, formatValid }: JoinRoomFormProps) {
  const [phase, setPhase] = useState<Phase>(formatValid ? { step: 'checking' } : { step: 'invalid-format' });
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestId] = useState(generateRequestId);

  useEffect(() => {
    if (phase.step !== 'checking') return;
    let cancelled = false;

    getRoomAvailability(roomCode)
      .then((availability) => {
        if (cancelled) return;
        if (!availability.joinable) {
          const message = availability.full ? 'الغرفة ممتلئة.' : availability.matchStarted ? 'بدأت اللعبة بالفعل في هذه الغرفة.' : 'لا يمكن الانضمام إلى هذه الغرفة الآن.';
          setPhase({ step: 'unavailable', message });
          return;
        }
        setPhase({ step: 'ready' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof ApiClientError ? err.message : undefined;
        setPhase({ step: 'unavailable', message: arabicMessageForErrorCode(code, message) });
      });

    return () => {
      cancelled = true;
    };
  }, [phase.step, roomCode]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    void joinRoom(roomCode, { displayName, requestId })
      .then((result) => {
        savePlayerSession({ roomCode, playerId: result.playerId, playerSessionToken: result.playerSessionToken, displayName });
        setPhase({ step: 'joined', displayName });
      })
      .catch((err: unknown) => {
        const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof ApiClientError ? err.message : undefined;
        setSubmitError(arabicMessageForErrorCode(code, message));
      })
      .finally(() => setSubmitting(false));
  };

  if (phase.step === 'invalid-format') {
    return (
      <Panel className="flex flex-col gap-4">
        <p className="text-ink-muted">رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.</p>
        <Link href="/join" className={buttonClassName({ variant: 'secondary' })}>
          إدخال الرمز يدويًا
        </Link>
      </Panel>
    );
  }

  if (phase.step === 'checking') {
    return (
      <Panel className="flex flex-col items-center gap-3 py-8">
        <LoadingIndicator size="lg" label="جارٍ التحقق من الغرفة" />
      </Panel>
    );
  }

  if (phase.step === 'unavailable') {
    return (
      <Panel className="flex flex-col gap-4">
        <ErrorMessage message={phase.message} />
        <Link href="/join" className={buttonClassName({ variant: 'secondary' })}>
          تجربة رمز آخر
        </Link>
      </Panel>
    );
  }

  if (phase.step === 'joined') {
    return (
      <Panel className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h2">أهلًا، {phase.displayName}!</SectionTitle>
        <p className="text-ink-muted">انضممت إلى الغرفة {roomCode}.</p>
        <StatusBadge tone="success" live>
          بانتظار أن يبدأ المضيف اللعبة
        </StatusBadge>
      </Panel>
    );
  }

  return (
    <Panel as="form" className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <Input
        label="اسمك"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        autoFocus
        autoComplete="name"
      />
      <Button type="submit" loading={submitting} disabled={displayName.trim().length === 0} fullWidth>
        انضم
      </Button>
      {submitError ? <ErrorMessage message={submitError} /> : null}
    </Panel>
  );
}
