import type { Deps } from '../../src/types/deps.js';
import type { InboundEvent, RoomConfig } from '../../src/shared.js';
import type { HandleEventResult } from '../../src/fsm/result.js';
import { RoomActorManager } from '../../src/actors/room-actor-manager.js';
import { PhaseTimerService } from '../../src/timers/phase-timer-service.js';
import { FakeTimerScheduler } from '../../src/timers/fake-timer-scheduler.js';
import type { RoomLogger } from '../../src/persistence/logging.js';
import type { TimerExpiryCallback } from '../../src/timers/types.js';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { joinPlayer } from '../../src/fsm/room-lifecycle.js';
import { buildRepos } from './persistence.js';

export interface TimerHarness {
  manager: RoomActorManager;
  service: PhaseTimerService;
  /** The FakeTimerScheduler instance PhaseTimerService constructed internally. */
  scheduler: FakeTimerScheduler;
  /**
   * The raw `(roomId, phaseId) => void` callback PhaseTimerService handed to the scheduler
   * factory — calling this directly (bypassing FakeTimerScheduler's own bookkeeping) simulates a
   * duplicate/late/racing timer callback for an arbitrary (roomId, phaseId) pair, independent of
   * whatever the scheduler currently has recorded for that room.
   */
  fireExpiry: TimerExpiryCallback;
  /** roomIds passed to the `onRoomMutated` callback, in call order (stands in for "views were broadcast"). */
  mutatedRooms: string[];
}

/** Builds a RoomActorManager + PhaseTimerService pair wired together exactly as production code would, backed by an in-memory KeyValueStore standing in for Redis. */
export function buildTimerHarness(deps: Deps, repos: ReturnType<typeof buildRepos>, opts: { ttlSeconds?: number; logger?: RoomLogger } = {}): TimerHarness {
  const manager = new RoomActorManager({
    fsmDeps: deps,
    roomStateRepo: repos.roomStateRepo,
    roomPrivateStateRepo: repos.roomPrivateStateRepo,
    roomLookupRepo: repos.roomLookupRepo,
    sessionRepo: repos.sessionRepo,
    ttlSeconds: opts.ttlSeconds ?? 3600,
  });

  const mutatedRooms: string[] = [];
  let scheduler!: FakeTimerScheduler;
  let fireExpiry!: TimerExpiryCallback;

  const service = new PhaseTimerService({
    manager,
    now: deps.now,
    createScheduler: (onExpire) => {
      fireExpiry = onExpire;
      scheduler = new FakeTimerScheduler(onExpire);
      return scheduler;
    },
    onRoomMutated: (roomId) => {
      mutatedRooms.push(roomId);
    },
    logger: opts.logger,
  });

  return { manager, service, scheduler, fireExpiry, mutatedRooms };
}

/**
 * The following drive a room through `RoomActor`/`RoomActorManager` — never through the pure FSM
 * helpers in `test/helpers/room.ts` directly — because ONLY actor-mediated mutations fire the
 * `onMutated` lifecycle hook that keeps `PhaseTimerService` in sync. This is deliberate: it proves
 * the timer subsystem reacts correctly to the exact same integration path a real gateway uses.
 */

export interface ViaActorSetup {
  roomId: string;
  hostSessionToken: string;
  playerIds: string[];
}

export async function setupRoomViaActor(harness: TimerHarness, playerCount: number, overrides: Partial<RoomConfig> = {}): Promise<ViaActorSetup> {
  const config = createDefaultConfig(overrides);
  const handle = await harness.manager.createRoom(config);
  const actor = harness.manager.get(handle.roomId);

  const playerIds: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const outcome = await actor.runLifecycle((room, priv, fsmDeps) => {
      const result = joinPlayer(room, priv, { name: `Player${i}`, avatarId: `avatar-${i}` }, fsmDeps);
      return { room: result.room, priv: result.priv, value: result.playerId, rejected: result.rejected };
    });
    if (outcome.rejected || !outcome.value) {
      throw new Error(`join failed in test setup: ${JSON.stringify(outcome.rejected)}`);
    }
    playerIds.push(outcome.value);
  }

  return { roomId: handle.roomId, hostSessionToken: handle.hostSessionToken, playerIds };
}

async function currentPhaseId(harness: TimerHarness, roomId: string): Promise<string> {
  const actor = harness.manager.get(roomId);
  const snapshot = actor.getSnapshot() ?? (await actor.getOrLoadSnapshot());
  return snapshot.room.phase.phaseId;
}

export async function hostDispatch(harness: TimerHarness, roomId: string, type: InboundEvent['type'], extra: Record<string, unknown> = {}): Promise<HandleEventResult> {
  const phaseId = await currentPhaseId(harness, roomId);
  const actor = harness.manager.get(roomId);
  return actor.dispatch({ type, phaseId, ...extra } as InboundEvent, { kind: 'host' });
}

export async function playerDispatch(
  harness: TimerHarness,
  roomId: string,
  playerId: string,
  type: InboundEvent['type'],
  extra: Record<string, unknown> = {},
): Promise<HandleEventResult> {
  const phaseId = await currentPhaseId(harness, roomId);
  const actor = harness.manager.get(roomId);
  return actor.dispatch({ type, phaseId, playerId, ...extra } as InboundEvent, { kind: 'player', playerId });
}

export function startGameViaActor(harness: TimerHarness, roomId: string): Promise<HandleEventResult> {
  return hostDispatch(harness, roomId, 'host:startGame');
}

export async function ackAllRevealsViaActor(harness: TimerHarness, roomId: string, playerIds: string[]): Promise<HandleEventResult> {
  let last: HandleEventResult | undefined;
  for (const id of playerIds) {
    last = await playerDispatch(harness, roomId, id, 'player:acknowledgeReveal');
  }
  return last!;
}

/**
 * Repeatedly reads whatever `PhaseTimerService` has actually scheduled for `roomId` and advances
 * the `FakeTimerScheduler` straight to that deadline, letting the real timer subsystem (not a
 * pure-FSM shortcut) drive the room through every auto/timed phase until `predicate` is satisfied.
 * This exercises scheduling, dispatch, persistence, and the `onMutated` re-sync loop exactly as
 * production would for a string of consecutive timed phases.
 */
export async function driveViaTimersUntil(harness: TimerHarness, roomId: string, predicate: (state: string) => boolean, maxSteps = 60): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    const actor = harness.manager.get(roomId);
    const snapshot = actor.getSnapshot() ?? (await actor.getOrLoadSnapshot());
    if (predicate(snapshot.room.phase.state)) return;
    const scheduled = harness.scheduler.getScheduled(roomId);
    if (!scheduled) {
      throw new Error(`driveViaTimersUntil: no timer scheduled at state ${snapshot.room.phase.state}`);
    }
    await harness.scheduler.advanceTo(scheduled.deadline);
  }
  throw new Error('driveViaTimersUntil: exceeded maxSteps without satisfying predicate');
}
