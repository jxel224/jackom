'use client';

import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { PageContainer } from '../../components/ui/PageContainer';
import { RoomCodeInput } from '../../components/ui/RoomCodeInput';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { ROOM_CODE_LENGTH } from '../../lib/shared';

/** Room-code join shell. The form validates/normalizes locally but isn't wired to a real join API yet. */
export default function JoinPage() {
  const [code, setCode] = useState('');
  const isComplete = code.length === ROOM_CODE_LENGTH;

  return (
    <PageContainer className="flex min-h-dvh flex-col justify-center gap-6">
      <SectionTitle as="h1" subtitle={`أدخل رمز الغرفة المكوّن من ${ROOM_CODE_LENGTH} رموز`}>
        انضم إلى غرفة
      </SectionTitle>

      <Panel as="form" className="flex flex-col gap-5" onSubmit={(event) => event.preventDefault()}>
        <RoomCodeInput value={code} onChange={setCode} />
        <Button type="submit" disabled={!isComplete} fullWidth>
          انضم
        </Button>
        <p className="text-sm text-ink-subtle">الانضمام الفعلي إلى الغرف سيُفعَّل في خطوة قادمة.</p>
      </Panel>
    </PageContainer>
  );
}
