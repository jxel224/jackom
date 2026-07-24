import Link from 'next/link';
import { buttonClassName } from '../components/ui/button-styles';
import { CreateRoomButton } from '../components/create-room-button';
import { PageContainer } from '../components/ui/PageContainer';
import { SectionTitle } from '../components/ui/SectionTitle';

export default function HomePage() {
  return (
    <PageContainer className="flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-10 text-center">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-extrabold tracking-widest text-brand">جاكوم</p>
        <SectionTitle as="h1" className="items-center">
          العبوا معًا، من أي شاشة
        </SectionTitle>
        <p className="text-ink-muted">افتح اللعبة على الشاشة الرئيسية، واستخدموا جوالاتكم كأداة تحكم.</p>
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <div className="w-full sm:flex-1">
          <CreateRoomButton>أنشئ غرفة</CreateRoomButton>
        </div>
        <Link href="/join" className={buttonClassName({ variant: 'secondary', size: 'lg', fullWidth: true })}>
          انضم إلى غرفة
        </Link>
      </div>

      <nav aria-label="روابط إضافية" className="flex gap-6 text-sm font-semibold text-ink-muted">
        <Link href="/games" className="transition-colors duration-150 hover:text-ink">
          الألعاب
        </Link>
        <Link href="/account" className="transition-colors duration-150 hover:text-ink">
          الحساب
        </Link>
      </nav>
    </PageContainer>
  );
}
