import type { ReactNode } from 'react';

export interface PageContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Consistent page-level width/padding wrapper, including safe-area padding so content never sits
 * under a phone's notch/home indicator. Individual routes should not redeclare this padding.
 */
export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div
      className={['mx-auto w-full max-w-3xl px-5 py-8', className].filter(Boolean).join(' ')}
      style={{
        paddingInlineStart: 'max(1.25rem, env(safe-area-inset-left))',
        paddingInlineEnd: 'max(1.25rem, env(safe-area-inset-right))',
      }}
    >
      {children}
    </div>
  );
}
