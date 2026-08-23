import type { ReactNode } from 'react';
import { StatusBadge } from '../../../../ui/StatusBadge';
import { asObject } from '../../view-data';
import type { JsonValue } from '../../../../../lib/shared';

export const MODULE_LABEL: Record<string, string> = { SYMBOLS: 'الرموز', WIRES: 'الأسلاك', CODE_SEQUENCE: 'الرمز السري' };

export interface BombProtocolPublicState {
  currentModule: string; status: string; strikes: number; maxStrikes: number; operatorId: string; analystIds: string[];
}

export function readPublicState(view: JsonValue): BombProtocolPublicState | null {
  const data = asObject(view);
  if (!data) return null;
  return {
    currentModule: typeof data.currentModule === 'string' ? data.currentModule : 'SYMBOLS',
    status: typeof data.status === 'string' ? data.status : 'ACTIVE',
    strikes: typeof data.strikes === 'number' ? data.strikes : 0,
    maxStrikes: typeof data.maxStrikes === 'number' ? data.maxStrikes : 3,
    operatorId: typeof data.operatorId === 'string' ? data.operatorId : '',
    analystIds: Array.isArray(data.analystIds) ? data.analystIds.filter((item): item is string => typeof item === 'string') : [],
  };
}

export function StrikeIndicator({ strikes, maxStrikes }: { strikes: number; maxStrikes: number }) {
  return (
    <div className="flex items-center gap-1" data-bomb-protocol-strikes aria-label={`${strikes} من ${maxStrikes} أخطاء`}>
      {Array.from({ length: maxStrikes }, (_, index) => (
        <span key={index} aria-hidden="true" className={['h-4 w-4 rounded-full border-2', index < strikes ? 'border-danger bg-danger' : 'border-border'].join(' ')} />
      ))}
    </div>
  );
}

export function BombProtocolHeader({ state, children }: { state: BombProtocolPublicState; children?: ReactNode }) {
  if (state.status !== 'ACTIVE') {
    return (
      <StatusBadge tone={state.status === 'SUCCESS' ? 'success' : 'danger'} live>
        {state.status === 'SUCCESS' ? 'تم تفكيك القنبلة! 🎉' : 'انفجرت القنبلة 💥'}
      </StatusBadge>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <StatusBadge tone="info">{MODULE_LABEL[state.currentModule] ?? state.currentModule}</StatusBadge>
      <StrikeIndicator strikes={state.strikes} maxStrikes={state.maxStrikes} />
      {children}
    </div>
  );
}
