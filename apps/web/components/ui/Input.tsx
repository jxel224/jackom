'use client';

import { forwardRef, useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** Shown under the field, e.g. format guidance. Not an error — see `errorMessage`. */
  hint?: string;
  /** When set, marks the field invalid and announces the message via `aria-describedby`. */
  errorMessage?: string;
}

/**
 * A labeled text input with a real, associated `<label>` (never a placeholder-only field) and
 * proper `aria-describedby`/`aria-invalid` wiring for hints and errors — required so RTL Arabic
 * screen-reader users get the same information sighted users do.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, errorMessage, className = '', ...rest }, ref) {
  const autoId = useId();
  const id = `input-${autoId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errorMessage ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink-muted">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={errorMessage ? true : undefined}
        className={[
          'h-control rounded-2xl border bg-surface-1 px-4 text-base text-ink placeholder:text-ink-subtle',
          'transition-colors duration-150 ease-out',
          'disabled:cursor-not-allowed disabled:opacity-50',
          errorMessage ? 'border-danger' : 'border-border-strong',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        {...rest}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm font-semibold text-danger">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
});
