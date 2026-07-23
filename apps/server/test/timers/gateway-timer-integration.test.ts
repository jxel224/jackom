import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, joinAsPlayer, nextMessage, send, startTestGatewayWithTimers, type TestGatewayWithTimersSetup } from '../helpers/gateway.js';

async function joinN(port: number, roomCode: string, n: number) {
  const players = [];
  for (let i = 0; i < n; i++) {
    players.push(await joinAsPlayer(port, roomCode, `Player${i}`));
  }
  return players;
}

/**
 * Development Step 5's WebSocket-facing integration: proves a timer-driven `timer:expired`
 * transition flows through the EXACT same `broadcastRoom()` path (`GatewayServer.broadcastRoom`)
 * as any client-originated event — same message types, same per-recipient personalization — and
 * that two rooms' timers stay independent through the full gateway stack, not just at the
 * `RoomActorManager` level (already covered by `phase-timer-service.test.ts`).
 */
describe('Gateway + PhaseTimerService integration', () => {
  let setup: TestGatewayWithTimersSetup;

  afterEach(async () => {
    await setup.close();
  });

  it("a timer-driven transition sends the host a fresh view:tv and every player a fresh view:player, with no client message involved", async () => {
    setup = await startTestGatewayWithTimers();
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = await joinN(setup.port, handle.roomCode, 5);
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', payload: { phaseId } });
    await nextMessage(hostWs, (m) => (m.payload as { phase?: { state: string } })?.phase?.state === 'ROLE_REVEAL');
    for (const p of players) {
      await nextMessage(p.ws, (m) => m.type === 'view:player' && (m.payload as { phase: { state: string } }).phase.state === 'ROLE_REVEAL');
    }

    // Now let the ROLE_REVEAL phase timer expire ENTIRELY server-side — no WebSocket message sent by any client.
    const scheduled = setup.scheduler.getScheduled(handle.roomId)!;
    expect(scheduled.phaseId).toBe(setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId);
    await setup.scheduler.advanceTo(scheduled.deadline);

    const tv = await nextMessage(hostWs, (m) => m.type === 'view:tv' && (m.payload as { phase: { state: string } }).phase.state === 'GAME_INTRO');
    expect((tv.payload as { phase: { state: string } }).phase.state).toBe('GAME_INTRO');

    for (const p of players) {
      const view = await nextMessage(p.ws, (m) => m.type === 'view:player' && (m.payload as { phase: { state: string } }).phase.state === 'GAME_INTRO');
      expect((view.payload as { phase: { state: string } }).phase.state).toBe('GAME_INTRO');
    }

    expect(setup.manager.get(handle.roomId).getSnapshot()?.room.phase.state).toBe('GAME_INTRO');

    hostWs.close();
    for (const p of players) p.ws.close();
  });

  it('two rooms keep fully independent timers through the full gateway stack', async () => {
    setup = await startTestGatewayWithTimers();
    const handleA = await setup.manager.createRoom(createDefaultConfig());
    const handleB = await setup.manager.createRoom(createDefaultConfig());
    const playersA = await joinN(setup.port, handleA.roomCode, 5);
    const playersB = await joinN(setup.port, handleB.roomCode, 5);
    const { ws: hostA } = await authenticateHost(setup.port, handleA.roomCode, handleA.hostSessionToken);
    const { ws: hostB } = await authenticateHost(setup.port, handleB.roomCode, handleB.hostSessionToken);

    const phaseIdA = setup.manager.get(handleA.roomId).getSnapshot()!.room.phase.phaseId;
    const phaseIdB = setup.manager.get(handleB.roomId).getSnapshot()!.room.phase.phaseId;
    send(hostA, { type: 'host:startGame', payload: { phaseId: phaseIdA } });
    await nextMessage(hostA, (m) => (m.payload as { phase?: { state: string } })?.phase?.state === 'ROLE_REVEAL');
    send(hostB, { type: 'host:startGame', payload: { phaseId: phaseIdB } });
    await nextMessage(hostB, (m) => (m.payload as { phase?: { state: string } })?.phase?.state === 'ROLE_REVEAL');

    expect(setup.scheduler.size()).toBe(2);
    const scheduledA = setup.scheduler.getScheduled(handleA.roomId)!;

    await setup.scheduler.advanceTo(scheduledA.deadline);

    await nextMessage(hostA, (m) => m.type === 'view:tv' && (m.payload as { phase: { state: string } }).phase.state === 'GAME_INTRO');
    expect(setup.manager.get(handleA.roomId).getSnapshot()?.room.phase.state).toBe('GAME_INTRO');
    // Room B must never have received a spurious broadcast from A's timer.
    expect(setup.manager.get(handleB.roomId).getSnapshot()?.room.phase.state).toBe('ROLE_REVEAL');

    hostA.close();
    hostB.close();
    for (const p of [...playersA, ...playersB]) p.ws.close();
  });
});
