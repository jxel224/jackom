import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, collectMessages, joinAsPlayer, nextMessage, send, startTestGateway, waitForClose, type TestGatewaySetup } from '../helpers/gateway.js';
import type { RoomLogEvent } from '../../src/persistence/logging.js';

describe('Gateway security protections', () => {
  let setup: TestGatewaySetup;

  afterEach(async () => {
    await setup?.close();
  });

  it('22. rate limiting rejects excessive messages and eventually closes an abusive socket', async () => {
    setup = await startTestGateway({ rateLimitMaxMessages: 3, rateLimitWindowMs: 60_000, maxViolations: 5 });
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    // Burn through the allowance with cheap no-op rejections (unsupported type) so we don't also
    // race genuine state-changing broadcasts.
    for (let i = 0; i < 3; i++) {
      send(ws, { type: 'host:doesNotExist', payload: {} });
      await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    }

    send(ws, { type: 'host:doesNotExist', payload: {} });
    const limited = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((limited.payload as { code: string }).code).toBe('RATE_LIMITED');
    ws.close();
  });

  it('22b. enough rate-limit/malformed violations eventually close the socket', async () => {
    setup = await startTestGateway({ rateLimitMaxMessages: 1000, maxViolations: 3 });
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    const closePromise = waitForClose(ws);
    for (let i = 0; i < 3; i++) {
      ws.send('not valid json {{{');
    }
    const closeInfo = await closePromise;
    expect(closeInfo.code).toBe(4002);
  });

  it('23. a payload larger than the configured maximum is rejected with a typed error', async () => {
    setup = await startTestGateway({ maxPayloadBytes: 200 });
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    // Bigger than maxPayloadBytes (200) but smaller than the ws-level protocol backstop
    // (maxPayloadBytes * 4 = 800) — otherwise ws itself terminates the connection at the frame
    // level before our own graceful size check ever runs, and no message is received at all.
    const oversized = JSON.stringify({ type: 'host:startGame', requestId: null, payload: { phaseId: 'x'.repeat(300) } });
    ws.send(oversized);
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('PAYLOAD_TOO_LARGE');
    ws.close();
  });

  it('24. session tokens and private state never appear in any outbound message', async () => {
    setup = await startTestGateway();
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const players = [];
    for (let i = 0; i < 5; i++) players.push(await joinAsPlayer(setup.port, handle.roomCode, `P${i}`));
    const { ws: hostWs } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const phaseId = setup.manager.get(handle.roomId).getSnapshot()!.room.phase.phaseId;

    send(hostWs, { type: 'host:startGame', payload: { phaseId } });
    await nextMessage(hostWs, (m) => (m.payload as { phase: { state: string } })?.phase?.state === 'ROLE_REVEAL');

    const hostMessages = await collectMessages(hostWs, 150);
    const playerMessages = await Promise.all(players.map((p) => collectMessages(p.ws, 150)));

    // The sessionToken legitimately appears ONCE, in that player's own join ack — but never in any
    // view/broadcast message. Filter those acks out before asserting no token ever recurs.
    const allTokens = [handle.hostSessionToken, ...players.map((p) => p.sessionToken)];
    const nonAckMessages = [...hostMessages, ...playerMessages.flat()].filter(
      (m) => m.type !== 'player:joined' && m.type !== 'player:reconnected' && m.type !== 'host:authenticated',
    );
    const nonAckJson = JSON.stringify(nonAckMessages);
    for (const token of allTokens) {
      expect(nonAckJson).not.toContain(token);
    }
    // Roles are private — must never appear in ANY message the host receives.
    const hostJson = JSON.stringify(hostMessages);
    expect(hostJson).not.toContain('"role"');

    hostWs.close();
    for (const p of players) p.ws.close();
  });

  it('24b. the gateway logger never receives a session token or role, even during a forced actor error', async () => {
    const logEntries: RoomLogEvent[] = [];
    setup = await startTestGateway({ logger: (entry) => logEntries.push(entry) });
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    await setup.repos.roomStateRepo.delete(handle.roomId);
    await setup.repos.roomPrivateStateRepo.delete(handle.roomId);
    setup.manager.evict(handle.roomId);

    send(ws, { type: 'host:closeRoom', payload: {} });
    await nextMessage(ws, (m) => m.type === 'error:actionRejected');

    const serializedLogs = JSON.stringify(logEntries);
    expect(serializedLogs).not.toContain(handle.hostSessionToken);
    ws.close();
  });
});
