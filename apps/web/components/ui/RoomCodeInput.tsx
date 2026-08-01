'use client';

import { useId, type ChangeEvent } from 'react';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCodeInput } from '../../lib/shared';

export interface RoomCodeInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  label?: string;
  errorMessage?: string;
  autoFocus?: boolean;
  id?: string;
}

const ALLOWED_CHARACTERS = new Set(ROOM_CODE_ALPHABET.split(''));

/**
 * Normalizes pasted/typed input to the backend's room-code format
 * (`packages/shared-types/src/room-code.ts`): uppercases, ignores surrounding whitespace, and
 * drops any character outside the code alphabet instead of silently accepting it into the value.
 */
function sanitize(raw: string): string {
  const normalized = normalizeRoomCodeInput(raw);
  let result = '';
  for (const char of normalized) {
    if (result.length === ROOM_CODE_LENGTH) break;
    if (ALLOWED_CHARACTERS.has(char)) result += char;
  }
  return result;
}

/**
 * The room-code entry field for the join flow. Not wired to any join API yet (Step 6 is UI
 * foundation only) — `value`/`onChange` are fully controlled by the caller.
 */
export function RoomCodeInput({ value, onChange, label = 'رمز الغرفة', errorMessage, autoFocus, id }: RoomCodeInputProps) {
  const autoId = useId();
  const inputId = id ?? `room-code-${autoId}`;
  const hintId = `${inputId}-hint`;
  const errorId = errorMessage ? `${inputId}-error` : undefined;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(sanitize(event.target.value));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink-muted">
        {label}
      </label>
      {/* Room codes are Latin letters/digits — forced dir="ltr" like RoomCodeDisplay, even inside the RTL page. */}
      <input
        id={inputId}
        dir="ltr"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        maxLength={ROOM_CODE_LENGTH}
        placeholder={'X'.repeat(ROOM_CODE_LENGTH)}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={errorMessage ? true : undefined}
        className={[
          'h-control rounded-2xl border-[3px] bg-surface-1 px-4 text-center font-mono text-2xl font-black tracking-[0.3em] text-ink placeholder:text-ink-subtle',
          'transition-colors duration-150 ease-out',
          errorMessage ? 'border-danger' : 'border-ink focus-visible:border-brand',
        ].join(' ')}
      />
      <p id={hintId} className="text-sm text-ink-subtle">{`${ROOM_CODE_LENGTH} أحرف وأرقام إنجليزية`}</p>
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
