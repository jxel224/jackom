import { Panel } from '../../components/ui/Panel';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';

/** Account shell — no real authentication exists yet (explicitly out of scope). */
export default function AccountPage() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionTitle as="h1">الحساب</SectionTitle>
      <Panel>
        <p className="text-ink-muted">تسجيل الدخول وإدارة الحساب ستكونان متاحتين في خطوة قادمة.</p>
      </Panel>
    </PageContainer>
  );
}
