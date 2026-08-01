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

// The primary variant carries the "comic" thick-outline + hard-shadow treatment — a small press
// effect (shadow shrinks, button nudges toward it) on :active reinforces it as the one dominant
// action per screen. Secondary/ghost/danger stay flatter so the primary action keeps visual priority.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'border-[3px] border-ink bg-brand text-ink-on-accent shadow-hard hover:bg-brand-strong active:translate-x-[2px] active:translate-y-[2px] active:shadow-hard-sm',
  secondary: 'border border-border-strong bg-surface-2 text-ink hover:bg-surface-1',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'border-[3px] border-ink bg-danger text-white shadow-hard-sm hover:brightness-95 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'h-control px-5 text-base',
  lg: 'h-14 px-7 text-lg',
  tv: 'h-16 px-10 text-tv-sm',
};

export function buttonClassName({ variant = 'primary', size = 'md', fullWidth = false, disabled = false, className = '' }: ButtonClassNameOptions = {}): string {
  return [
    'inline-flex items-center justify-center gap-2 rounded-2xl font-extrabold',
    'transition-[background-color,box-shadow,transform] duration-150 ease-out',
    disabled ? 'pointer-events-none cursor-not-allowed opacity-50 shadow-none' : '',
    fullWidth ? 'w-full' : '',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
