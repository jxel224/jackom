import { JoinRoomForm } from '../../../components/join-room-form';
import { PageContainer } from '../../../components/ui/PageContainer';
import { SectionTitle } from '../../../components/ui/SectionTitle';
import { isValidRoomCodeFormat, normalizeRoomCodeInput } from '../../../lib/shared';

/**
 * Direct QR/deep-link join shell (`/join/ABC123`). This (server) page only ever does the cheap,
 * safe, synchronous part — normalizing and format-checking the route param, exactly like
 * `RoomCodeInput` sanitizes typed input, safe against any string a QR code or a manually-edited URL
 * could contain. Everything that needs a live network call (room availability, the join request
 * itself) happens client-side in `JoinRoomForm`.
 */
export default async function JoinWithCodePage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const normalized = normalizeRoomCodeInput(roomCode);
  const formatValid = isValidRoomCodeFormat(normalized);

  return (
    <PageContainer className="flex min-h-dvh flex-col justify-center gap-6">
      <SectionTitle as="h1">الانضمام إلى غرفة</SectionTitle>
      <JoinRoomForm roomCode={normalized} formatValid={formatValid} />
    </PageContainer>
  );
}
