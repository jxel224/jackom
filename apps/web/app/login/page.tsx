import { Suspense } from 'react';
import { SiteNav } from '../../components/nav/SiteNav';
import { PageContainer } from '../../components/ui/PageContainer';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { LoginForm } from '../../components/auth/LoginForm';

export default function LoginPage() {
  return (
    <>
      <SiteNav />
      <PageContainer className="flex max-w-md flex-col gap-8 py-10">
        <SectionTitle as="h1" subtitle="سجّل الدخول لإدارة ألعابك المملوكة">
          تسجيل الدخول
        </SectionTitle>
        <Suspense>
          <LoginForm />
        </Suspense>
      </PageContainer>
    </>
  );
}
