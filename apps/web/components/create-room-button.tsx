'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { ErrorMessage } from './ui/ErrorMessage';
import type { ButtonSize } from './ui/button-styles';
import { createRoom, ApiClientError } from '../lib/api/client';
import { arabicMessageForErrorCode } from '../lib/api/error-messages';
import { saveHostSession } from '../lib/session-storage';

export interface CreateRoomButtonProps {
  children: ReactNode;
  className?: string;
  /** Defaults to 'lg' (the hero placement) — the nav embeds a compact 'md' instance instead. */
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * Owns the entire "إنشاء غرفة" flow: calls the real create-room API, stores the host session
 * (`lib/session-storage.ts`), and navigates to `/tv`. Reused both as the hero's primary CTA and
 * (compact) as the nav's always-available create action — every instance hits the real API.
 */
export function CreateRoomButton({ children, className, size = 'lg', fullWidth = true }: CreateRoomButtonProps) {
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
      <Button type="button" onClick={() => void handleClick()} loading={loading} size={size} fullWidth={fullWidth} className={className}>
        {children}
      </Button>
      {error ? <ErrorMessage message={error} /> : null}
    </div>
  );
}
