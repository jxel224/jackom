'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import { createRoom, ApiClientError } from '../lib/api/client';
import { arabicMessageForErrorCode } from '../lib/api/error-messages';
import { saveHostSession } from '../lib/session-storage';

export interface CreateRoomButtonProps {
  children: ReactNode;
  className?: string;
}

/**
 * Owns the entire "إنشاء غرفة" flow: calls the real create-room API, stores the host session
 * (`lib/session-storage.ts`), and navigates to `/tv` — the one client-interactive island on an
 * otherwise server-rendered landing page.
 */
export function CreateRoomButton({ children, className }: CreateRoomButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createRoom();
      saveHostSession({ roomCode: result.roomCode, hostSessionToken: result.hostSessionToken });
      router.push('/tv');
    } catch (err) {
      const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
      const message = err instanceof ApiClientError ? err.message : undefined;
      setError(arabicMessageForErrorCode(code, message));
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <Button type="button" onClick={() => void handleClick()} loading={loading} size="lg" fullWidth className={className}>
        {children}
      </Button>
      {error ? <ErrorMessage message={error} /> : null}
    </div>
  );
}
