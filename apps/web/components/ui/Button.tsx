'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { LoadingIndicator } from './LoadingIndicator';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './button-styles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and marks the button busy without changing its accessible label. */
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * A real `<button>` element (never a clickable `div`) so keyboard activation (Enter/Space),
 * `:focus-visible`, and `disabled` semantics all come from the platform for free. `loading` keeps
 * the button disabled and marks `aria-busy` without swapping out the visible label text.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, disabled, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClassName({ variant, size, fullWidth, disabled: disabled || loading, className })}
      {...rest}
    >
      {loading ? <LoadingIndicator size="sm" label={null} /> : null}
      <span>{children}</span>
    </button>
  );
});
