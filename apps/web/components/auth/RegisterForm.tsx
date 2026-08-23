'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '../ui/Button';
import { ErrorMessage } from '../ui/ErrorMessage';
import { Input } from '../ui/Input';
import { Panel } from '../ui/Panel';
import { ApiClientError, registerAccount } from '../../lib/api/client';
import { arabicMessageForErrorCode } from '../../lib/api/error-messages';
import { DISPLAY_NAME_MAX_LENGTH } from '../../lib/shared';

/** Register a permanent host account. Guest players never see this — see /join, which never requires one. */
export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    void registerAccount({ email, password, displayName })
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
      <Input label="اسمك" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={DISPLAY_NAME_MAX_LENGTH} autoComplete="name" autoFocus />
      <Input label="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" dir="ltr" />
      <Input label="كلمة المرور" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint="٨ أحرف على الأقل" dir="ltr" />
      <Button type="submit" loading={submitting} disabled={!email || !password || !displayName.trim()} fullWidth>
        إنشاء حساب
      </Button>
      {error ? <ErrorMessage message={error} /> : null}
      <p className="text-center text-sm text-ink-muted">
        لديك حساب بالفعل؟{' '}
        <Link href="/login" className="font-semibold text-brand underline">
          سجّل الدخول
        </Link>
      </p>
    </Panel>
  );
}
