import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, collectMessages, joinAsPlayer, nextMessage, send, startTestGateway, type TestGatewaySetup } from '../helpers/gateway.js';

describe('Gateway multi-room isolation', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('21. two rooms never receive each other\'s messages', async () => {
    const handleA = await setup.manager.createRoom(createDefaultConfig());
    const handleB = await setup.manager.createRoom(createDefaultConfig());

    const hostA = await authenticateHost(setup.port, handleA.roomCode, handleA.hostSessionToken);
    const hostB = await authenticateHost(setup.port, handleB.roomCode, handleB.hostSessionToken);
    const alice = await joinAsPlayer(setup.port, handleA.roomCode, 'Alice'); // room A only

    // Drain B's inbox so we can assert nothing new arrives because of room A's activity.
    await collectMessages(hostB.ws, 50);

    send(hostA.ws, { type: 'host:closeRoom', payload: {} });
    // Alice's earlier join already broadcast one view:tv to host A (still LOBBY) — match on the
    // specific state we're waiting for, not just the message type, so we don't grab that stale one.
    const tvA = await nextMessage(hostA.ws, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ABANDONED');
    expect((tvA.payload as { phase: { state: string } }).phase.state).toBe('ABANDONED');

    // Room B's host must see NO trace of room A's closeRoom (no view:tv update at all).
    const bMessages = await collectMessages(hostB.ws, 150);
    expect(bMessages.some((m) => m.type === 'view:tv')).toBe(false);

    const snapshotA = setup.manager.get(handleA.roomId).getSnapshot();
    const snapshotB = setup.manager.get(handleB.roomId).getSnapshot();
    expect(snapshotA?.room.phase.state).toBe('ABANDONED');
    expect(snapshotB?.room.phase.state).toBe('LOBBY');

    alice.ws.close();
    hostB.ws.close();
  });
});
