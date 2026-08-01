import type { Metadata, Viewport } from 'next';
import { Cairo, Baloo_Bhaijaan_2, JetBrains_Mono } from 'next/font/google';
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
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${baloo.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
