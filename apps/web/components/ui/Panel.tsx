import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export type PanelVariant = 'default' | 'hard';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Semantic tag for the wrapper — defaults to a plain `div`, but pass `"section"`/`"article"` where it aids the document outline. */
  as?: ElementType;
  /** 'hard' swaps the soft shadow for the thick-outline/offset-shadow comic treatment — reserve for the one focal panel on a screen (e.g. the TV room-code panel), not every card. */
  variant?: PanelVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<PanelVariant, string> = {
  default: 'border border-border shadow-lg shadow-black/20',
  hard: 'border-[3px] border-ink shadow-hard',
};

/** The base card/panel surface used throughout the app — a raised, rounded surface on the dark background. */
export function Panel({ as: Tag = 'div', variant = 'default', className = '', children, ...rest }: PanelProps) {
  return (
    <Tag className={['rounded-3xl bg-surface-1 p-6', VARIANT_CLASSES[variant], className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
