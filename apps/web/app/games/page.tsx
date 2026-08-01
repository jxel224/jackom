import { GameCard } from '../../components/ui/GameCard';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { SiteNav } from '../../components/nav/SiteNav';
import { DecorativeSpark, StickerLabel } from '../../components/graphics';

/**
 * Games shell. Only the hacker social-deduction game exists right now — a full multi-game
 * registry is explicitly out of scope for this step, so this page is one cover-art-style card, not
 * a grid/list component pretending there's a catalog.
 */
export default function GamesPage() {
  return (
    <>
      <SiteNav />
      <PageContainer className="flex max-w-4xl flex-col gap-8 py-10">
        <SectionTitle as="h1" subtitle="اختر لعبة لبدء الغرفة">
          الألعاب
        </SectionTitle>

        <GameCard
          title="لعبة الهاكر"
          description="لعبة استنتاج اجتماعي — من بينكم هاكر يحاول تخريب المهمة؟ ناقشوا، صوّتوا، واكتشفوا الحقيقة قبل فوات الأوان."
          facts={['استنتاج اجتماعي', '٤ إلى ١٢ لاعبًا']}
          statusLabel="متاحة"
          statusTone="brand"
          href="/tv"
          ctaLabel="ابدأ اللعبة"
          art={<DecorativeSpark size={64} accent="action" />}
        />

        <div className="flex items-center gap-3 rounded-3xl border border-dashed border-border-strong p-5 text-ink-subtle">
          <StickerLabel tone="ink">قريبًا</StickerLabel>
          <p className="text-sm">ألعاب جماعية جديدة قادمة — لا يوجد شيء آخر متاح للعب الآن.</p>
        </div>
      </PageContainer>
    </>
  );
}
