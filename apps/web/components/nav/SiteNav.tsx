'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { CreateRoomButton } from '../create-room-button';
import { StickerLabel } from '../graphics/StickerLabel';

const LINKS = [
  { href: '/', label: 'الرئيسية' },
  { href: '/games', label: 'الألعاب' },
  { href: '/join', label: 'انضم' },
  { href: '/account', label: 'الحساب' },
];

/**
 * Site-wide navigation for the marketing/shell routes (`/`, `/games`, `/account`, `/join`,
 * `/join/[roomCode]`) — deliberately NOT rendered on TV/player-lobby screens, which stay
 * nav-free per the brief ("functional game screens must remain simpler"). Desktop shows a plain
 * link row; mobile collapses into a single accessible disclosure, never a mega-menu, and the
 * primary "أنشئ غرفة" action is never hidden behind it.
 */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  return (
    <header className="relative z-20 border-b border-border">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="inline-flex items-center gap-2 shrink-0">
          <StickerLabel tone="brand" tilt={false} className="font-display text-base">
            جاكوم
          </StickerLabel>
        </Link>

        <nav aria-label="روابط رئيسية" className="hidden items-center gap-6 text-sm font-bold text-ink-muted md:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors duration-150 hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden w-44 shrink-0 md:block">
          <CreateRoomButton size="md">أنشئ غرفة</CreateRoomButton>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border-2 border-border-strong text-ink md:hidden"
        >
          <span className="sr-only">{open ? 'إغلاق القائمة' : 'فتح القائمة'}</span>
          <svg aria-hidden="true" viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6 L18 18 M18 6 L6 18" /> : <path d="M4 7 H20 M4 12 H20 M4 17 H20" />}
          </svg>
        </button>
      </div>

      {open ? (
        <nav id={menuId} aria-label="روابط رئيسية (جوال)" className="flex flex-col gap-1 border-t border-border px-5 py-3 md:hidden">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-2 py-2.5 text-base font-bold text-ink-muted transition-colors duration-150 hover:bg-surface-1 hover:text-ink">
              {link.label}
            </Link>
          ))}
          <div className="pt-2">
            <CreateRoomButton>أنشئ غرفة</CreateRoomButton>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
