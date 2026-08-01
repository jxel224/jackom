'use client';

import { useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Panel } from '../components/ui/Panel';
import { PageContainer } from '../components/ui/PageContainer';
import { SectionTitle } from '../components/ui/SectionTitle';

/**
 * Route-level error boundary (App Router convention — automatically wraps every page below the
 * root layout). Never renders `error.message` directly: that can carry internal/server detail, so
 * only a fixed, sanitized Arabic message is shown to the user.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Placeholder error reporting until a real logging pipeline exists.
    console.error(error);
  }, [error]);

  return (
    <PageContainer className="flex min-h-dvh flex-col items-center justify-center">
      <Panel variant="hard" className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <SectionTitle as="h1">حدث خطأ غير متوقع</SectionTitle>
        <ErrorMessage message="نعتذر، حدث خطأ أثناء تحميل هذه الصفحة." />
        <Button onClick={reset}>حاول مرة أخرى</Button>
      </Panel>
    </PageContainer>
  );
}
