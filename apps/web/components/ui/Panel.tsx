import type { ElementType, HTMLAttributes, ReactNode } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Semantic tag for the wrapper — defaults to a plain `div`, but pass `"section"`/`"article"` where it aids the document outline. */
  as?: ElementType;
  children: ReactNode;
}

/** The base card/panel surface used throughout the app — a raised, rounded surface on the dark background. */
export function Panel({ as: Tag = 'div', className = '', children, ...rest }: PanelProps) {
  return (
    <Tag className={['rounded-3xl border border-border bg-surface-1 p-6 shadow-lg shadow-black/20', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}
