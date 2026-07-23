import Link from 'next/link';
import { buttonClassName } from '../../../components/ui/button-styles';
import { Panel } from '../../../components/ui/Panel';
import { PageContainer } from '../../../components/ui/PageContainer';
import { SectionTitle } from '../../../components/ui/SectionTitle';
import { isValidRoomCodeFormat, normalizeRoomCodeInput } from '../../../lib/shared';

/**
 * Direct QR/deep-link join shell (`/join/ABC123`). The route param is normalized and format-checked
 * the same way `RoomCodeInput` sanitizes typed input — safe against any string a QR code or a
 * manually-edited URL could contain, never crashes on an empty/oversized/malformed segment.
 */
export default async function JoinWithCodePage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const normalized = normalizeRoomCodeInput(roomCode);
  const isValidFormat = isValidRoomCodeFormat(normalized);

  return (
    <PageContainer className="flex min-h-dvh flex-col justify-center gap-6">
      <SectionTitle as="h1">الانضمام إلى غرفة</SectionTitle>

      <Panel className="flex flex-col gap-4">
        {isValidFormat ? (
          <>
            <p className="text-ink-muted">رمز الغرفة:</p>
            <p dir="ltr" className="text-center text-3xl font-black tracking-[0.3em] text-ink">
              {normalized}
            </p>
            <p className="text-sm text-ink-subtle">الانضمام المباشر عبر الرابط سيُفعَّل في خطوة قادمة.</p>
          </>
        ) : (
          <p className="text-ink-muted">رابط الغرفة غير صالح. تحقق من الرمز أو أدخله يدويًا.</p>
        )}
        <Link href="/join" className={buttonClassName({ variant: 'secondary' })}>
          إدخال الرمز يدويًا
        </Link>
      </Panel>
    </PageContainer>
  );
}
