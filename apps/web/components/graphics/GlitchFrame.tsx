import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export type GlitchFrameAccent = 'ink' | 'brand' | 'action' | 'cyan';

export interface GlitchFrameProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
  /** Which color the offset "double outline" shadow uses. */
  accent?: GlitchFrameAccent;
  className?: string;
}

const SHADOW_CLASSES: Record<GlitchFrameAccent, string> = {
  ink: 'shadow-hard',
  brand: 'shadow-hard-brand',
  action: 'shadow-[4px_4px_0_0_var(--color-action)]',
  cyan: 'shadow-[4px_4px_0_0_var(--color-cyan)]',
};

/**
 * A comic-panel-style frame: thick solid border + a hard offset shadow instead of a soft blur.
 * Used to give one focal element per screen (the TV room code + QR panel, a feature card) a
 * "breaks outside a normal card" presence — deliberately not applied to every panel.
 */
export function GlitchFrame({ as: Tag = 'div', accent = 'ink', className = '', children, ...rest }: GlitchFrameProps) {
  return (
    <Tag className={['rounded-2xl border-[3px] border-ink bg-surface-1', SHADOW_CLASSES[accent], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
