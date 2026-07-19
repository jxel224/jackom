import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, joinAsPlayer, startTestGateway, type TestGatewaySetup } from '../helpers/gateway.js';

function waitUntil(predicate: () => boolean, timeoutMs = 2000, stepMs = 20): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('timed out waiting for condition'));
      }
    }, stepMs);
  });
}

describe('Gateway connection lifecycle', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('20. a graceful player disconnect updates their connectionStatus to disconnected', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');

    alice.ws.close();

    await waitUntil(() => setup.manager.get(handle.roomId).getSnapshot()?.room.players[alice.playerId]?.connectionStatus === 'disconnected');
    const snapshot = setup.manager.get(handle.roomId).getSnapshot();
    expect(snapshot?.room.players[alice.playerId]?.connectionStatus).toBe('disconnected');
  });

  it('a host disconnect updates host.connectionStatus, and a subsequent reconnect flips it back', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    ws.close();
    await waitUntil(() => setup.manager.get(handle.roomId).getSnapshot()?.room.host.connectionStatus === 'disconnected');
    expect(setup.manager.get(handle.roomId).getSnapshot()?.room.host.connectionStatus).toBe('disconnected');

    const { ws: ws2 } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    expect(setup.manager.get(handle.roomId).getSnapshot()?.room.host.connectionStatus).toBe('connected');
    ws2.close();
  });

  it('the gateway does not crash when a room actor throws (room expired mid-session)', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    // Simulate the room having expired out of Redis entirely from underneath a live connection.
    await setup.repos.roomStateRepo.delete(handle.roomId);
    await setup.repos.roomPrivateStateRepo.delete(handle.roomId);
    setup.manager.evict(handle.roomId); // drop the in-memory actor too, forcing a reload attempt

    // The server must still be alive and able to serve other rooms after this.
    const otherHandle = await setup.manager.createRoom(createDefaultConfig());
    const other = await authenticateHost(setup.port, otherHandle.roomCode, otherHandle.hostSessionToken);
    expect(other.ws.readyState).toBe(other.ws.OPEN);

    ws.close();
    other.ws.close();
  });
});
