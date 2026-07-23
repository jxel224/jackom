import type { ElementType, ReactNode } from 'react';

export interface SectionTitleProps {
  children: ReactNode;
  /** Semantic heading level — pick based on the page outline, not the desired visual size. */
  as?: 'h1' | 'h2' | 'h3';
  subtitle?: ReactNode;
  /** Use the larger TV-safe scale on the host screen. */
  scale?: 'default' | 'tv';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SectionTitleProps['scale']>, string> = {
  default: 'text-2xl',
  tv: 'text-tv-lg',
};

export function SectionTitle({ children, as, subtitle, scale = 'default', className = '' }: SectionTitleProps) {
  const Tag: ElementType = as ?? 'h2';
  return (
    <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
      <Tag className={['font-extrabold text-ink', SIZE_CLASSES[scale]].join(' ')}>{children}</Tag>
      {subtitle ? <p className="text-ink-muted">{subtitle}</p> : null}
    </div>
  );
}
