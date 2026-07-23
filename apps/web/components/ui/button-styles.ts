/**
 * The button visual style, kept in its own plain module (no `'use client'`) so a Server Component
 * can call `buttonClassName()` directly — React Server Components treat every export of a
 * `'use client'` file as an opaque client reference, callable only as JSX, never as a plain
 * function, even a pure one with zero DOM/hook dependency. Splitting the pure styling logic out of
 * `Button.tsx` is what lets `app/page.tsx`, `app/not-found.tsx`, etc. (Server Components) style a
 * real navigation `<Link>` identically to `<Button>` without becoming one.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg' | 'tv';

export interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-action text-white hover:bg-action-strong shadow-glow',
  secondary: 'bg-surface-2 text-ink border border-border-strong hover:bg-surface-1',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'h-control px-5 text-base',
  lg: 'h-14 px-7 text-lg',
  tv: 'h-16 px-10 text-tv-sm',
};

export function buttonClassName({ variant = 'primary', size = 'md', fullWidth = false, disabled = false, className = '' }: ButtonClassNameOptions = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-2xl font-bold',
    'transition-colors duration-150 ease-out',
    disabled ? 'pointer-events-none cursor-not-allowed opacity-50 shadow-none' : '',
    fullWidth ? 'w-full' : '',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
