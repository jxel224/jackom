import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../../src/config/defaults.js';
import { authenticateHost, nextMessage, send, sendRaw, startTestGateway, type TestGatewaySetup } from '../helpers/gateway.js';

describe('Gateway message validation', () => {
  let setup: TestGatewaySetup;

  beforeEach(async () => {
    setup = await startTestGateway();
  });
  afterEach(async () => {
    await setup.close();
  });

  it('9. malformed JSON is rejected safely, without crashing the connection', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    sendRaw(ws, '{ this is not valid json ][');
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('MALFORMED_JSON');

    // Connection must still be usable afterward.
    send(ws, { type: 'host:closeRoom', payload: {} });
    const tv = await nextMessage(ws, (m) => m.type === 'view:tv');
    expect((tv.payload as { phase: { state: string } }).phase.state).toBe('ABANDONED');
    ws.close();
  });

  it('10a. an unknown event type is rejected before reaching the actor', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const versionBefore = setup.manager.get(handle.roomId).getSnapshot()!.room.stateVersion;

    send(ws, { type: 'host:doesNotExist', payload: {} });
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('UNSUPPORTED_EVENT_TYPE');
    expect(setup.manager.get(handle.roomId).getSnapshot()!.room.stateVersion).toBe(versionBefore);
    ws.close();
  });

  it('10b. a known event type with an invalid payload shape is rejected before reaching the actor', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);
    const versionBefore = setup.manager.get(handle.roomId).getSnapshot()!.room.stateVersion;

    // host:startGame requires { phaseId: string } — send it with the wrong type entirely.
    send(ws, { type: 'host:startGame', payload: { phaseId: 12345 } });
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('INVALID_MESSAGE_SCHEMA');
    // The FSM was never touched — state is exactly what it was before (still LOBBY, same version).
    expect(setup.manager.get(handle.roomId).getSnapshot()!.room.stateVersion).toBe(versionBefore);
    expect(setup.manager.get(handle.roomId).getSnapshot()!.room.phase.state).toBe('LOBBY');
    ws.close();
  });

  it('an envelope missing required fields is rejected', async () => {
    const handle = await setup.manager.createRoom(createDefaultConfig());
    const { ws } = await authenticateHost(setup.port, handle.roomCode, handle.hostSessionToken);

    sendRaw(ws, JSON.stringify({ notAType: true }));
    const err = await nextMessage(ws, (m) => m.type === 'error:actionRejected');
    expect((err.payload as { code: string }).code).toBe('INVALID_MESSAGE_SCHEMA');
    ws.close();
  });
});
