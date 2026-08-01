export interface RoomCodeDisplayProps {
  code: string;
  className?: string;
}

/**
 * Large, spaced-out room-code display for the shared TV screen. Room codes are always Latin
 * letters/digits (`packages/shared-types/src/room-code.ts`), so the tile row is forced `dir="ltr"`
 * even though the surrounding page is RTL — the same pattern used for phone numbers or codes
 * embedded in Arabic text.
 */
export function RoomCodeDisplay({ code, className = '' }: RoomCodeDisplayProps) {
  const characters = code.split('');

  return (
    <div
      dir="ltr"
      role="text"
      aria-label={`رمز الغرفة ${code.split('').join(' ')}`}
      className={['flex justify-center gap-2 sm:gap-3', className].filter(Boolean).join(' ')}
    >
      {characters.map((char, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="flex h-16 w-12 items-center justify-center rounded-2xl border-[3px] border-ink bg-surface-2 font-mono text-tv-base font-black text-brand shadow-hard-sm sm:h-24 sm:w-[4.5rem]"
        >
          {char}
        </span>
      ))}
    </div>
  );
}
