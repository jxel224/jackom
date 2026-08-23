import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClassName, type ButtonSize } from './ui/button-styles';

export interface CreateRoomButtonProps {
  children: ReactNode;
  className?: string;
  /** Defaults to 'lg' (the hero placement) — the nav embeds a compact 'md' instance instead. */
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * The marketing-wide "أنشئ غرفة" entry point (hero CTA + nav shortcut) — a plain navigation link to
 * `/games`, the one real, ownership-aware Create Room surface (Permanent Business Backend). This
 * used to call the create-room API directly and land on `/tv` immediately; now that hosting
 * requires an authenticated, owning User, instantly creating a room from an anonymous marketing
 * page no longer makes sense as a product flow — `/games` is where the real, server-authorized
 * action lives (see apps/web/app/games/page.tsx), matching the intended
 * "Login → /games → HACKERS → Create Room" path exactly. The security boundary was never here
 * anyway — it's enforced server-side regardless of which UI surface a request comes from.
 */
export function CreateRoomButton({ children, className, size = 'lg', fullWidth = true }: CreateRoomButtonProps) {
  return (
    <Link href="/games" className={[buttonClassName({ size, fullWidth }), className].filter(Boolean).join(' ')}>
      {children}
    </Link>
  );
}
