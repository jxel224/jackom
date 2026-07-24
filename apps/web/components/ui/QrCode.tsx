'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface QrCodeProps {
  /** The exact URL to encode — callers build this, this component never guesses at a base URL. */
  value: string;
  size?: number;
  className?: string;
}

/**
 * A real QR code (Development Step 7B), generated client-side via the `qrcode` package (small,
 * widely-used, actively maintained) into a PNG data URL — rendered as a plain `<img>`, never
 * `dangerouslySetInnerHTML`. Generation is async (the library's public API is promise-based), so
 * this renders a neutral loading state first; a generation failure renders a clear text fallback
 * rather than a broken image.
 */
export function QrCode({ value, size = 200, className = '' }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Resetting to the loading state here is synchronizing with the external, async QR-generation
    // call started right below — a new `value`/`size` genuinely invalidates whatever was previously
    // rendered, and there's no way to know that any earlier than this effect running.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above
    setDataUrl(null);
    setFailed(false);

    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  const boxClassName = ['flex items-center justify-center rounded-2xl border-2 border-dashed border-border-strong p-2', className].filter(Boolean).join(' ');

  if (failed) {
    return (
      <div role="img" aria-label="تعذر إنشاء رمز QR" className={boxClassName} style={{ width: size, height: size }}>
        <p className="px-2 text-center text-sm text-ink-subtle">تعذر إنشاء رمز QR</p>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div aria-hidden="true" className={boxClassName} style={{ width: size, height: size }}>
        <div className="h-8 w-8 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  return <img src={dataUrl} alt={`رمز QR للانضمام إلى الغرفة عبر الرابط ${value}`} width={size} height={size} className={['rounded-2xl bg-white p-2', className].filter(Boolean).join(' ')} />;
}
