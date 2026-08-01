import { IllustratedEmptyState } from '../../components/ui/IllustratedEmptyState';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { SiteNav } from '../../components/nav/SiteNav';

/** Account shell — no real authentication exists yet (explicitly out of scope). Every section here is an honest placeholder, never simulated data. */
export default function AccountPage() {
  return (
    <>
      <SiteNav />
      <PageContainer className="flex max-w-4xl flex-col gap-8 py-10">
        <SectionTitle as="h1" subtitle="تسجيل الدخول وإدارة الحساب ستكونان متاحتين في خطوة قادمة">
          الحساب
        </SectionTitle>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <IllustratedEmptyState
            title="تسجيل الدخول"
            description="سجّل دخولك لحفظ إعداداتك عبر أجهزتك."
            futureLabel="قريبًا"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
              </svg>
            }
          />
          <IllustratedEmptyState
            title="الألعاب المملوكة"
            description="ألعاب إضافية يمكن اقتناؤها لاحقًا ستظهر هنا."
            futureLabel="قريبًا"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="6" width="18" height="12" rx="3" />
                <path d="M8 12h.01M12 9v6M16 12h.01" />
              </svg>
            }
          />
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
            title="الحساب"
            description="إعدادات الملف الشخصي والتفضيلات العامة."
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
