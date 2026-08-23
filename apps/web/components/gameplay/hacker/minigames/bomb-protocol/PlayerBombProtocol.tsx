'use client';

import type { JsonValue } from '../../../../../lib/shared';
import type { DisplayError } from '../../../../../lib/realtime/public-types';
import { asObject } from '../../view-data';
import { PlayerBombProtocolOperator } from './PlayerBombProtocolOperator';
import { PlayerBombProtocolAnalyst } from './PlayerBombProtocolAnalyst';

export function PlayerBombProtocol({ view, actionPending, actionError, submitAction }: {
  view: JsonValue; actionPending: boolean; actionError: DisplayError | null;
  submitAction: (actionType: string, data: JsonValue) => boolean;
}) {
  const data = asObject(view);
  const role = typeof data?.specialRole === 'string' ? data.specialRole : null;
  if (role === 'OPERATOR') return <PlayerBombProtocolOperator view={view} actionPending={actionPending} actionError={actionError} submitAction={submitAction} />;
  return <PlayerBombProtocolAnalyst view={view} />;
}
