import type { ReactNode } from 'react';

export interface PlayerScreenLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  /** Sticky bottom action bar — keeps the primary action within thumb reach on a phone. */
  footer?: ReactNode;
}

/**
 * Layout for a player's phone screen: portrait-first, safe-area-aware top/bottom padding, and an
 * optional sticky footer for the primary action, so a player never has to reach across the screen
 * (or scroll past content) to tap the one button that matters right now.
 */
export function PlayerScreenLayout({ children, header, footer }: PlayerScreenLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-0">
      {header ? (
        <header className="border-b border-border px-4 py-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          {header}
        </header>
      ) : null}

      <main className="flex-1 overflow-y-auto px-4 py-4">{children}</main>

      {footer ? (
        <footer
          className="sticky bottom-0 border-t border-border bg-surface-0/95 px-4 py-3 backdrop-blur"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
