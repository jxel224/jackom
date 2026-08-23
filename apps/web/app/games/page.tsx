'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GameCard } from '../../components/ui/GameCard';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { SiteNav } from '../../components/nav/SiteNav';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { DecorativeSpark, HackerFigure, PixelGrid } from '../../components/graphics';
import { useCurrentUser } from '../../lib/auth/useCurrentUser';
import { ApiClientError, createRoom, getOwnedGames } from '../../lib/api/client';
import { arabicMessageForErrorCode } from '../../lib/api/error-messages';
import { saveHostSession } from '../../lib/session-storage';

const HACKERS_SLUG = 'hackers';

/**
 * Games shell. Only the hacker social-deduction game exists right now — a full multi-game
 * registry is explicitly out of scope, so this page is one cover-art-style card, not a
 * grid/list component pretending there's a catalog.
 *
 * Permanent Business Backend: "Create Room" is real and authorized — it calls the actual
 * ownership-gated API, never merely a `/tv` navigation link. The server is the true gate (a
 * direct HTTP request bypassing this page would be rejected identically); this UI simply
 * reflects that honestly rather than showing a button that would just fail anyway.
 */
export default function GamesPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [ownedSlugs, setOwnedSlugs] = useState<Set<string> | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser.status !== 'authenticated') {
      setOwnedSlugs(null);
      return;
    }
    let cancelled = false;
    void getOwnedGames().then(({ games }) => {
      if (!cancelled) setOwnedSlugs(new Set(games.map((g) => g.slug)));
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser.status]);

  function handleCreateRoom() {
    setCreateError(null);
    setCreating(true);
    void createRoom({ gameSlug: HACKERS_SLUG })
      .then((result) => {
        saveHostSession({ roomCode: result.roomCode, hostSessionToken: result.hostSessionToken });
        router.push('/tv');
      })
      .catch((err: unknown) => {
        const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof ApiClientError ? err.message : undefined;
        setCreateError(arabicMessageForErrorCode(code, message));
      })
      .finally(() => setCreating(false));
  }

  const ownsHackers = ownedSlugs?.has(HACKERS_SLUG) ?? false;
  const checkingOwnership = currentUser.status === 'authenticated' && ownedSlugs === null;

  let statusLabel = 'سجّل الدخول لعرض حالتها';
  let statusTone: 'brand' | 'cyan' = 'brand';
  let ctaLabel = 'سجّل الدخول';
  let onCtaClick: (() => void) | undefined = () => router.push('/login?next=/games');
  let ctaDisabled = false;

  if (currentUser.status === 'authenticated') {
    if (checkingOwnership) {
      statusLabel = 'جارٍ التحقق…';
      ctaLabel = 'جارٍ التحقق…';
      ctaDisabled = true;
    } else if (ownsHackers) {
      statusLabel = 'مملوكة';
      ctaLabel = 'أنشئ غرفة';
      onCtaClick = handleCreateRoom;
    } else {
      statusLabel = 'غير مملوكة';
      ctaLabel = 'غير مملوكة بعد';
      onCtaClick = undefined;
    }
  }

  return (
    <>
      <SiteNav />
      <div className="relative overflow-hidden">
        <PixelGrid className="opacity-25" size={28} />
        <DecorativeSpark size={20} accent="cyan" className="absolute right-10 top-8 hidden sm:block" />
        <PageContainer className="relative flex max-w-4xl flex-col gap-8 py-10">
          <SectionTitle as="h1" subtitle="اختر لعبة لبدء الغرفة">
            الألعاب
          </SectionTitle>

          <div className="flex flex-col gap-2">
            <GameCard
              title="لعبة الهاكر"
              description="لعبة استنتاج اجتماعي — من بينكم هاكر يحاول تخريب المهمة؟ ناقشوا، صوّتوا، واكتشفوا الحقيقة قبل فوات الأوان."
              facts={['استنتاج اجتماعي', '٤ إلى ١٠ لاعبين']}
              statusLabel={statusLabel}
              statusTone={statusTone}
              ctaLabel={ctaLabel}
              onCtaClick={onCtaClick}
              ctaLoading={creating}
              ctaDisabled={ctaDisabled}
              art={<HackerFigure size={148} />}
            />
            {createError ? <ErrorMessage message={createError} /> : null}
          </div>

          <GameCard
            title="تحدّي جاكوم"
            description="مسابقة جماعية سريعة يديرها المضيف من شاشة واحدة — اختاروا الفئات، تحدّوا الفريق الآخر، واستخدموا قدراتكم في الوقت المناسب."
            facts={['فريقان', '٣٦ سؤالًا', 'تحكم من جهاز واحد']}
            statusLabel="جديدة"
            statusTone="cyan"
            href="/quiz"
            ctaLabel="أنشئ تحديًا"
            art={
              <div className="grid h-36 w-36 place-items-center font-display text-7xl" aria-hidden>
                ؟
              </div>
            }
          />
        </PageContainer>
      </div>
    </>
  );
}
