export interface PlayerAvatarProps {
  /** Display name — used both for the initials shown and the accessible label. */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
} as const;

/** Deterministic hue from the name so avatars stay visually distinct without needing real uploaded images yet. */
function hueFromName(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '؟';
  return [...trimmed][0]!.toUpperCase();
}

/** Placeholder avatar (no real avatar/upload system yet) — a colored initial circle, per §3.2/§8.3 `PlayerPublic.avatarId`. */
export function PlayerAvatar({ name, size = 'md', className = '' }: PlayerAvatarProps) {
  const hue = hueFromName(name);
  return (
    <span
      role="img"
      aria-label={name}
      className={['inline-flex shrink-0 items-center justify-center rounded-full font-extrabold text-white', SIZE_CLASSES[size], className]
        .filter(Boolean)
        .join(' ')}
      style={{ backgroundColor: `hsl(${hue} 65% 45%)` }}
    >
      {initialsFromName(name)}
    </span>
  );
}
