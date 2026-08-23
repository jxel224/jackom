import { Suspense } from 'react';
import { SiteNav } from '../../components/nav/SiteNav';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { RegisterForm } from '../../components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <>
      <SiteNav />
      <PageContainer className="flex max-w-md flex-col gap-8 py-10">
        <SectionTitle as="h1" subtitle="حساب دائم لاستضافة الألعاب المملوكة لك">
          إنشاء حساب
        </SectionTitle>
        <Suspense>
          <RegisterForm />
        </Suspense>
      </PageContainer>
    </>
  );
}
