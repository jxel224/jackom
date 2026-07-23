'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A minimal dialog foundation built on the native `<dialog>` element rather than a hand-rolled
 * div/portal stack — the platform already gives us focus trapping, Escape-to-close, and correct
 * top-layer stacking, which matters more than saving a dependency here would.
 */
export function Modal({ open, onClose, title, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Native `close` fires on Escape too, so route it through the same onClose callback.
  const handleNativeClose = () => onClose();

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleNativeClose}
      onClick={handleBackdropClick}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-border bg-surface-1 p-0 text-ink backdrop:bg-black/60 open:animate-none"
    >
      <div className="p-6">
        <h2 id={titleId} className="mb-4 text-xl font-extrabold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
