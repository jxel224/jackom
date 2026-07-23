'use client';

/**
 * Catches errors thrown by the ROOT layout itself (App Router convention) — since the root layout
 * is what's failing, this file must render its own `<html>`/`<body>` and cannot rely on
 * `app/globals.css`/Tailwind having loaded, so every style here is inline on purpose.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          textAlign: 'center',
          backgroundColor: '#100e1f',
          color: '#f7f5ff',
          fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", sans-serif',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.75rem' }}>حدث خطأ غير متوقع</h1>
          <p style={{ color: '#b3aed1', marginBottom: '1.5rem' }}>نعتذر، حدث خطأ في التطبيق.</p>
          <button
            onClick={reset}
            style={{
              borderRadius: '1rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 700,
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            حاول مرة أخرى
          </button>
        </div>
      </body>
    </html>
  );
}
