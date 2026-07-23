export type LoadingIndicatorSize = 'sm' | 'md' | 'lg';

export interface LoadingIndicatorProps {
  size?: LoadingIndicatorSize;
  /**
   * Accessible label announced to screen readers. Defaults to "جارٍ التحميل" (loading). Pass
   * `null` when an ancestor already announces the busy state (e.g. inside `<Button loading>`,
   * which sets `aria-busy` on the button itself) to avoid a duplicate announcement.
   */
  label?: string | null;
  className?: string;
}

const SIZE_CLASSES: Record<LoadingIndicatorSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

/** A simple spinning-ring indicator. Respects `prefers-reduced-motion` globally (app/globals.css). */
export function LoadingIndicator({ size = 'md', label = 'جارٍ التحميل', className = '' }: LoadingIndicatorProps) {
  return (
    <span
      className={['inline-block animate-spin rounded-full border-current border-t-transparent align-middle', SIZE_CLASSES[size], className]
        .filter(Boolean)
        .join(' ')}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
