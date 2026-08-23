import type { Metadata, Viewport } from 'next';
import { Cairo, Baloo_Bhaijaan_2, JetBrains_Mono, Almarai, VT323 } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
  display: 'swap',
});

// Bold, rounded Arabic display font for large headings only (hero, SectionTitle) — Cairo remains
// the body/control font. See DESIGN_SYSTEM.md's typography section.
const baloo = Baloo_Bhaijaan_2({
  subsets: ['arabic', 'latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
  display: 'swap',
});

// Latin-only monospace, used narrowly for room codes and a few small tech-flavored labels —
// deliberately not a body font.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

// Headquarters (Hacker game) only — JACKOM Visual & UX Bible V1.1 §10. Almarai is the warm
// running-text Arabic body face for the in-match TV scene; Cairo (already loaded above) remains
// its display face. Do not use Almarai outside apps/web/components/gameplay/hacker/headquarters/.
const almarai = Almarai({
  subsets: ['arabic'],
  weight: ['400', '700', '800'],
  variable: '--font-almarai',
  display: 'swap',
});

// Headquarters only — retro digital-readout face for the match timer's numerals exclusively
// (Bible §10: Arabic text is never rendered in this face). Latin/digits subset only.
const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-vt323',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'جاكوم',
  description: 'العبوا معًا، من أي شاشة — منصة ألعاب جماعية عربية.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The TV screen and lobby often sit on a fixed dark background — avoid a light flash on load.
  themeColor: '#0a0a14',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${baloo.variable} ${jetbrainsMono.variable} ${almarai.variable} ${vt323.variable}`}>
      <body>{children}</body>
    </html>
  );
}
