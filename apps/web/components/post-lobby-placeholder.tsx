import { LoadingIndicator } from './ui/LoadingIndicator';
import { Panel } from './ui/Panel';
import { SectionTitle } from './ui/SectionTitle';
import { PixelGrid } from './graphics';

/**
 * Rendered by both the TV and player lobbies once the authoritative phase leaves `LOBBY` (i.e. the
 * host successfully started the match). Deliberately generic and static — Step 7B/8A stop here;
 * role reveal and every phase after it are later work. The server remains responsible for every
 * transition from this point on; this component does not interpret `phase.state` at all.
 */
export function PostLobbyPlaceholder() {
  return (
    <Panel variant="hard" className="relative flex flex-col items-center gap-3 overflow-hidden text-center">
      <PixelGrid className="opacity-30" />
      <div className="relative flex flex-col items-center gap-3">
        <SectionTitle as="h2">بدأت اللعبة</SectionTitle>
        <LoadingIndicator size="md" />
        <p className="text-ink-muted">جاري تجهيز المرحلة التالية...</p>
        <p className="text-sm text-ink-subtle">سيتم عرض الأدوار في الخطوة القادمة.</p>
      </div>
    </Panel>
  );
}
