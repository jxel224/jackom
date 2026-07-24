import { Panel } from './ui/Panel';
import { SectionTitle } from './ui/SectionTitle';

/**
 * Rendered by both the TV and player lobbies once the authoritative phase leaves `LOBBY` (i.e. the
 * host successfully started the match). Deliberately generic and static — Step 7B stops here; role
 * reveal and every phase after it are later work. The server remains responsible for every
 * transition from this point on; this component does not interpret `phase.state` at all.
 */
export function PostLobbyPlaceholder() {
  return (
    <Panel className="flex flex-col items-center gap-3 text-center">
      <SectionTitle as="h2">بدأت اللعبة</SectionTitle>
      <p className="text-ink-muted">جاري تجهيز المرحلة التالية...</p>
      <p className="text-sm text-ink-subtle">سيتم عرض الأدوار في الخطوة القادمة.</p>
    </Panel>
  );
}
