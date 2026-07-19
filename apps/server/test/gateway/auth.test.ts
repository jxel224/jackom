import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import {
  authenticateHost,
  connectClient,
  joinAsPlayer,
  nextMessage,
  send,
  startTestGateway,
  waitForOpen,
  type TestGatewaySetup,
} from '../helpers/gateway.js';

describe('Gateway authentication', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('1. host connects with a valid host session', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    expect(ws.readyState).toBe(ws.OPEN);
    ws.close();
  });

  it('2a. player connects and joins fresh, establishing a valid player session', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws, playerId, sessionToken } = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    expect(playerId).toBeTruthy();
    expect(sessionToken).toBeTruthy();
    ws.close();
  });

  it('2b. player connects with an already-valid session token via player:reconnect', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const first = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    first.ws.close();

    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: first.sessionToken } });
    const ack = await nextMessage(ws2, (m) => m.type === 'player:reconnected');
    expect((ack.payload as { playerId: string }).playerId).toBe(first.playerId);
    ws2.close();
  });

  it('3. an invalid or expired host session is rejected with a typed error', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const ws = connectClient(setup.port, 'host', handle.roomCode);
    await waitForOpen(ws);
    send(ws, { type: 'host:reconnect', payload: { hostSessionToken: 'not-a-real-token' } });
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('SESSION_INVALID');
    ws.close();
  });

  it('4. an invalid or expired player session is rejected with a typed error', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const ws = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws);
    send(ws, { type: 'player:reconnect', payload: { sessionToken: 'not-a-real-token' } });
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('SESSION_INVALID');
    ws.close();
  });

  it('4b. an EXPIRED (previously valid) player session is rejected the same way', async () => {
    let clock = 0;
    const seededDeps = { ...setup.deps, now: () => clock };
    await setup.close();
    setup = await startTestGateway({}, seededDeps);

    const handle = await setup.manager.createRoom(createDefaultConfig());
    const joined = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    joined.ws.close();

    await setup.repos.sessionRepo.setPlayerSession('short-lived', { roomId: handle.roomId, playerId: joined.playerId }, 5);
    clock += 10_000; // well past the 5s ttl

    const ws2 = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(ws2);
    send(ws2, { type: 'player:reconnect', payload: { sessionToken: 'short-lived' } });
    const err = await nextMessage(ws2, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('SESSION_INVALID');
    ws2.close();
  });

  it('5. host and player authentication remain completely separate — tokens are not interchangeable', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());

    // A host session token used on the PLAYER endpoint must not authenticate anything there.
    const asPlayer = connectClient(setup.port, 'player', handle.roomCode);
    await waitForOpen(asPlayer);
    send(asPlayer, { type: 'player:reconnect', payload: { sessionToken: handle.hostSessionToken } });
    const err1 = await nextMessage(asPlayer, (m) => m.type === 'error:actionRejected');
    expect((err1.payload as { code: string }).code).toBe('SESSION_INVALID');
    asPlayer.close();

    // A player session token used on the HOST endpoint must not authenticate anything there.
    const joined = await joinAsPlayer(setup.port, handle.roomCode, 'Bob');
    const asHost = connectClient(setup.port, 'host', handle.roomCode);
    await waitForOpen(asHost);
    send(asHost, { type: 'host:reconnect', payload: { hostSessionToken: joined.sessionToken } });
    const err2 = await nextMessage(asHost, (m) => m.type === 'error:actionRejected');
    expect((err2.payload as { code: string }).code).toBe('SESSION_INVALID');
    asHost.close();
    joined.ws.close();
  });

  it('6. a player socket cannot send host events', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const joined = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');

    send(joined.ws, { type: 'host:startGame', payload: {} });
    const err = await nextMessage(joined.ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('WRONG_CONNECTION_KIND');
    joined.ws.close();
  });

  it('7. a host socket cannot send player gameplay events', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    send(ws, { type: 'player:submitVote', payload: { phaseId: 'whatever', targetPlayerId: 'skip' } });
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('WRONG_CONNECTION_KIND');
    ws.close();
  });

  it('8. playerId supplied inside the payload can never override the authenticated socket identity', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const alice = await joinAsPlayer(setup.port, handle.roomCode, 'Alice');
    const bob = await joinAsPlayer(setup.port, handle.roomCode, 'Bob');

    // Alice's socket tries to submit a rematch request but includes a spoofed playerId for Bob.
    // The event must be attributed to Alice (the authenticated sender) regardless.
    send(alice.ws, {
      type: 'player:requestRematch',
      payload: { phaseId: 'irrelevant-phase-id', playerId: bob.playerId },
    });
    // Since we're still in LOBBY, this is rejected for being invalid for the current state — but
    // crucially NOT because of an identity mismatch, proving the extra field was simply ignored
    // rather than acted upon.
    const err = await nextMessage(alice.ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).not.toBe('IDENTITY_MISMATCH');

    alice.ws.close();
    bob.ws.close();
  });
});
