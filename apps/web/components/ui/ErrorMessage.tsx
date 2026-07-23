export interface ErrorMessageProps {
  message: string;
  id?: string;
  className?: string;
}

/** A visible, announced error message. `role="alert"` makes screen readers announce it as soon as it mounts. */
export function ErrorMessage({ message, id, className = '' }: ErrorMessageProps) {
  return (
    <p id={id} role="alert" className={['flex items-start gap-2 text-sm font-semibold text-danger', className].filter(Boolean).join(' ')}>
      <span aria-hidden="true">⚠</span>
      <span>{message}</span>
    </p>
  );
}
