'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';
import { ApiClientError, login } from '../../lib/api/client';
import { arabicMessageForErrorCode } from '../../lib/api/error-messages';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    void login({ email, password })
      .then(() => {
        const next = searchParams.get('next');
        router.push(next && next.startsWith('/') ? next : '/games');
      })
      .catch((err: unknown) => {
        const code = err instanceof ApiClientError ? err.code : 'INTERNAL_ERROR';
        const message = err instanceof ApiClientError ? err.message : undefined;
        setError(arabicMessageForErrorCode(code, message));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Panel as="form" variant="hard" className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <Input label="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus dir="ltr" />
      <Input label="كلمة المرور" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" dir="ltr" />
      <Button type="submit" loading={submitting} disabled={!email || !password} fullWidth>
        تسجيل الدخول
      </Button>
      {error ? <ErrorMessage message={error} /> : null}
      <p className="text-center text-sm text-ink-muted">
        ليس لديك حساب؟{' '}
        <Link href="/register" className="font-semibold text-brand underline">
          أنشئ حسابًا
        </Link>
      </p>
    </Panel>
  );
}
