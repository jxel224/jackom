import Link from 'next/link';
import { buttonClassName } from '../../components/ui/button-styles';
import { Panel } from '../../components/ui/Panel';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { StatusBadge } from '../../components/ui/StatusBadge';

/**
 * Games shell. Only the hacker social-deduction game exists right now — a full multi-game
 * registry is explicitly out of scope for this step (Development Step 6 brief), so this page is a
 * single card, not a grid/list component pretending there's a catalog.
 */
export default function GamesPage() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionTitle as="h1" subtitle="اختر لعبة لبدء الغرفة">
        الألعاب
      </SectionTitle>

      <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-ink">لعبة الهاكر</h2>
            <StatusBadge tone="success">متاحة</StatusBadge>
          </div>
          <p className="text-ink-muted">لعبة استنتاج اجتماعي — من بينكم هاكر يحاول تخريب المهمة؟</p>
        </div>
        <Link href="/tv" className={buttonClassName()}>
          ابدأ اللعبة
        </Link>
      </Panel>

      <p className="text-sm text-ink-subtle">المزيد من الألعاب قريبًا.</p>
    </PageContainer>
  );
}
