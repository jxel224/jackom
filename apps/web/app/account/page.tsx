'use client';

import Link from 'next/link';
import { IllustratedEmptyState } from '../../components/ui/IllustratedEmptyState';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { SiteNav } from '../../components/nav/SiteNav';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { buttonClassName } from '../../components/ui/button-styles';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator';
import { useCurrentUser } from '../../lib/auth/useCurrentUser';

/** Real authentication state (Permanent Business Backend) — every other section here remains an honest placeholder for future steps. */
export default function AccountPage() {
  const currentUser = useCurrentUser();

  return (
    <>
      <SiteNav />
      <PageContainer className="flex max-w-4xl flex-col gap-8 py-10">
        <SectionTitle as="h1" subtitle="إدارة حسابك وألعابك المملوكة">
          الحساب
        </SectionTitle>

        {currentUser.status === 'loading' ? (
          <Panel className="flex items-center justify-center py-8">
            <LoadingIndicator size="lg" label="جارٍ التحقق من الحساب" />
          </Panel>
        ) : currentUser.status === 'authenticated' ? (
          <Panel variant="hard" className="flex flex-col gap-4" data-account-authenticated>
            <div>
              <p className="text-sm text-ink-muted">مسجّل الدخول باسم</p>
              <p className="text-xl font-bold">{currentUser.user.displayName}</p>
              <p dir="ltr" className="text-end text-sm text-ink-subtle">
                {currentUser.user.email}
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/games" className={buttonClassName({ variant: 'secondary' })}>
                ألعابي
              </Link>
              <Button type="button" variant="danger" onClick={() => void currentUser.logout()}>
                تسجيل الخروج
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel variant="hard" className="flex flex-col items-center gap-4 py-8 text-center" data-account-unauthenticated>
            <p className="text-ink-muted">سجّل الدخول لإدارة ألعابك المملوكة واستضافة الغرف.</p>
            <div className="flex gap-3">
              <Link href="/login" className={buttonClassName()}>
                تسجيل الدخول
              </Link>
              <Link href="/register" className={buttonClassName({ variant: 'secondary' })}>
                إنشاء حساب
              </Link>
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <IllustratedEmptyState
            title="سجل المشتريات"
            description="ستجد هنا سجلًا بأي عمليات شراء تقوم بها."
            futureLabel="قريبًا"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16l-1.5 12h-13Z" />
                <path d="M8 10v6M16 10v6" />
              </svg>
            }
          />
          <IllustratedEmptyState
            title="إعدادات الملف الشخصي"
            description="تعديل الاسم أو البريد الإلكتروني أو كلمة المرور."
            futureLabel="قريبًا"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
              </svg>
            }
          />
        </div>
      </PageContainer>
    </>
  );
}
