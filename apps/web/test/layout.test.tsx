import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// next/font/google's real implementation is a build-time (webpack/SWC) transform that doesn't
// exist under Vitest — mock it the way Next.js's own testing docs recommend, so importing the real
// app/layout.tsx doesn't blow up outside an actual `next build`/`next dev` process.
vi.mock('next/font/google', () => ({
  Cairo: () => ({ variable: 'font-cairo-var', className: 'font-cairo-class' }),
  Baloo_Bhaijaan_2: () => ({ variable: 'font-baloo-var', className: 'font-baloo-class' }),
  JetBrains_Mono: () => ({ variable: 'font-jetbrains-mono-var', className: 'font-jetbrains-mono-class' }),
  // Headquarters (Hacker game) fonts — Bible V1.1 §10.
  Almarai: () => ({ variable: 'font-almarai-var', className: 'font-almarai-class' }),
  VT323: () => ({ variable: 'font-vt323-var', className: 'font-vt323-class' }),
}));

// Must follow the vi.mock() call above.
import RootLayout from '../app/layout';

describe('RootLayout', () => {
  it('renders <html lang="ar" dir="rtl"> and passes children through', () => {
    // Rendered via renderToStaticMarkup (SSR to a string) rather than @testing-library/react's
    // render(), which mounts into a container appended to document.body — the root layout renders
    // its OWN <html>/<body>, so string SSR output is the faithful, jsdom-nesting-free way to check it.
    const html = renderToStaticMarkup(
      <RootLayout>
        <div data-testid="child-marker">child content</div>
      </RootLayout>,
    );

    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('child content');
  });
});
