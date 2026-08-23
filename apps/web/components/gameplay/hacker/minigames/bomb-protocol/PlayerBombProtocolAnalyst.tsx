import type { JsonValue } from '../../../../../lib/shared';
import { Panel } from '../../../../ui/Panel';
import { PrivatePromptCard } from '../../../shared/PrivatePromptCard';
import { asObject } from '../../view-data';
import { BombProtocolHeader, MODULE_LABEL, readPublicState } from './BombProtocolShared';

export function PlayerBombProtocolAnalyst({ view }: { view: JsonValue }) {
  const state = readPublicState(view);
  const data = asObject(view);
  if (!state || !data) return null;
  const fragments = Array.isArray(data.instructionFragments) ? data.instructionFragments.filter((item): item is string => typeof item === 'string') : [];

  if (state.status !== 'ACTIVE') {
    return (
      <div className="flex flex-col items-center gap-4" data-minigame-id="BOMB_PROTOCOL" data-surface="player" data-bomb-role="analyst" data-bomb-status="resolved">
        <h2 className="text-2xl font-bold">Bomb Protocol</h2>
        <BombProtocolHeader state={state} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-minigame-id="BOMB_PROTOCOL" data-surface="player" data-bomb-role="analyst">
      <h2 className="text-center text-2xl font-bold">Bomb Protocol — أنت محلل</h2>
      <BombProtocolHeader state={state} />
      {fragments.length > 0 ? (
        <PrivatePromptCard title={`دليلك السري — ${MODULE_LABEL[state.currentModule] ?? state.currentModule}`}>
          {fragments.map((line) => <p key={line}>{line}</p>)}
        </PrivatePromptCard>
      ) : (
        <Panel className="text-center"><p className="text-ink-muted">لا يوجد دليل جديد لهذه المرحلة.</p></Panel>
      )}
      <Panel className="text-center"><p>شارك معلوماتك بصوت عالٍ مع المسؤول عن التفكيك.</p></Panel>
    </div>
  );
}
