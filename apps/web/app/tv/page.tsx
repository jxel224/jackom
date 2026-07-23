import { TvScreenLayout } from '../../components/layouts/TvScreenLayout';
import { Button } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { RoomCodeDisplay } from '../../components/ui/RoomCodeDisplay';
import { SectionTitle } from '../../components/ui/SectionTitle';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ROOM_CODE_LENGTH } from '../../lib/shared';

// A repeated placeholder character (not a real-looking code like "AB3XQ9") so it reads as a
// preview, never as a room a player could actually try to join.
const PLACEHOLDER_CODE = 'X'.repeat(ROOM_CODE_LENGTH);

/**
 * TV/host screen shell. Room creation, the real code, and the live roster all require the
 * WebSocket client + create-room API, which are out of scope for this step — everything here is
 * clearly marked as a preview.
 */
export default function TvPage() {
  return (
    <TvScreenLayout eyebrow="جاكوم">
      <StatusBadge tone="info">معاينة الشاشة الرئيسية</StatusBadge>

      <SectionTitle as="h1" scale="tv" className="items-center">
        أنشئ غرفة والعبوا معًا
      </SectionTitle>

      <RoomCodeDisplay code={PLACEHOLDER_CODE} />

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Panel className="flex flex-col items-center gap-3">
          <p className="text-tv-sm font-bold text-ink">امسح رمز QR</p>
          <div
            role="img"
            aria-label="سيظهر هنا رمز QR للانضمام لاحقًا"
            className="flex h-40 w-40 items-center justify-center rounded-2xl border-2 border-dashed border-border-strong p-4 text-center text-sm text-ink-subtle"
          >
            رمز QR قريبًا
          </div>
        </Panel>

        <Panel className="flex flex-col items-center justify-center gap-3">
          <p className="text-tv-sm font-bold text-ink">اللاعبون</p>
          <p className="text-ink-subtle">بانتظار انضمام اللاعبين...</p>
        </Panel>
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button size="tv" disabled>
          ابدأ اللعبة
        </Button>
        <p className="text-sm text-ink-subtle">سيتم تفعيل إنشاء الغرف الفعلي في خطوة قادمة.</p>
      </div>
    </TvScreenLayout>
  );
}
