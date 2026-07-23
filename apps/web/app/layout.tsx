import type { Metadata, Viewport } from 'next';
import { Cairo } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-cairo',
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
  themeColor: '#100e1f',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body>{children}</body>
    </html>
  );
}
