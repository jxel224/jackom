import Link from 'next/link';
import { buttonClassName } from '../components/ui/button-styles';
import { Panel } from '../components/ui/Panel';
import { PageContainer } from '../components/ui/PageContainer';
import { SectionTitle } from '../components/ui/SectionTitle';

export default function NotFound() {
  return (
    <PageContainer className="flex min-h-dvh flex-col items-center justify-center">
      <Panel className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <SectionTitle as="h1">الصفحة غير موجودة</SectionTitle>
        <p className="text-ink-muted">الرابط الذي فتحته غير متاح.</p>
        <Link href="/" className={buttonClassName()}>
          العودة إلى الرئيسية
        </Link>
      </Panel>
    </PageContainer>
  );
}
