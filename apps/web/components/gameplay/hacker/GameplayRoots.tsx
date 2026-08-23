'use client';

import type { PlayerView, PrivatePlayerPayload, TvView } from '../../../lib/realtime/public-types';
import type { ConnectionState } from '../../../lib/realtime/types';
import type { JsonValue } from '../../../lib/shared';
import type { DisplayError } from '../../../lib/realtime/public-types';
import { ConnectionBanner } from '../shared/ConnectionBanner';
import { GameplayErrorBoundary } from '../shared/GameplayErrorBoundary';
import { GameplayLoading } from '../shared/GameplayStates';
import { PlayerPhaseRouter } from './PlayerPhaseRouter';
import { TvPhaseRouter } from './TvPhaseRouter';

export function TvGameplayRoot({ view, connectionState, startPending = false, startError = null, sendHostEvent = () => false, retry }: {
  view: TvView | null; connectionState: ConnectionState; startPending?: boolean; startError?: DisplayError | null;
  sendHostEvent?: (type: string, extra?: Record<string, JsonValue>) => boolean; retry?: () => void;
}) {
  if (!view) return <GameplayLoading />;
  return <GameplayErrorBoundary><ConnectionBanner state={connectionState} onRetry={retry} /><TvPhaseRouter key={view.phase.phaseId} view={view} startPending={startPending} startError={startError} sendHostEvent={sendHostEvent} /></GameplayErrorBoundary>;
}

export function PlayerGameplayRoot({ view, privateInfo, connectionState, actionPending = false, actionError = null, submitMinigameAction = () => false, sendPlayerEvent = () => false, retry }: {
  view: PlayerView | null; privateInfo: PrivatePlayerPayload | null; connectionState: ConnectionState;
  actionPending?: boolean; actionError?: DisplayError | null; submitMinigameAction?: (actionType: string, data: JsonValue) => boolean;
  sendPlayerEvent?: (type: string, extra?: Record<string, JsonValue>) => boolean; retry?: () => void;
}) {
  if (!view) return <GameplayLoading />;
  return <GameplayErrorBoundary><ConnectionBanner state={connectionState} onRetry={retry} /><PlayerPhaseRouter key={view.phase.phaseId} view={view} privateInfo={privateInfo} actionPending={actionPending} actionError={actionError} submitAction={submitMinigameAction} sendPlayerEvent={sendPlayerEvent} /></GameplayErrorBoundary>;
}
