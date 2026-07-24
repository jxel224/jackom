'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { PageContainer } from '../../components/ui/PageContainer';
import { RoomCodeInput } from '../../components/ui/RoomCodeInput';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { ROOM_CODE_LENGTH } from '../../lib/shared';

/** Room-code join shell: validates the code locally, then navigates to `/join/[roomCode]`, which does the real availability check + join. */
export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isComplete = code.length === ROOM_CODE_LENGTH;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isComplete) {
      setError(`يجب إدخال ${ROOM_CODE_LENGTH} رموز.`);
      return;
    }
    setError(null);
    router.push(`/join/${code}`);
  };

  return (
    <PageContainer className="flex min-h-dvh flex-col justify-center gap-6">
      <SectionTitle as="h1" subtitle={`أدخل رمز الغرفة المكوّن من ${ROOM_CODE_LENGTH} رموز`}>
        انضم إلى غرفة
      </SectionTitle>

      <Panel as="form" className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <RoomCodeInput value={code} onChange={setCode} errorMessage={error ?? undefined} />
        <Button type="submit" disabled={!isComplete} fullWidth>
          متابعة
        </Button>
      </Panel>
    </PageContainer>
  );
}
