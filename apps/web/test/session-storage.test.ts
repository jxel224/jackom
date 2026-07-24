// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearHostSession, clearPlayerSession, loadHostSession, loadPlayerSession, savePlayerSession, saveHostSession } from '../lib/session-storage';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('session-storage', () => {
  it('round-trips a host session', () => {
    expect(loadHostSession()).toBeNull();
    saveHostSession({ roomCode: 'AB23XY', hostSessionToken: 'host-token' });
    expect(loadHostSession()).toEqual({ roomCode: 'AB23XY', hostSessionToken: 'host-token' });
    clearHostSession();
    expect(loadHostSession()).toBeNull();
  });

  it('round-trips a player session', () => {
    expect(loadPlayerSession()).toBeNull();
    savePlayerSession({ roomCode: 'AB23XY', playerId: 'p1', playerSessionToken: 'player-token', displayName: 'سارة' });
    expect(loadPlayerSession()).toEqual({ roomCode: 'AB23XY', playerId: 'p1', playerSessionToken: 'player-token', displayName: 'سارة' });
    clearPlayerSession();
    expect(loadPlayerSession()).toBeNull();
  });

  it('keeps host and player sessions independent (different keys)', () => {
    saveHostSession({ roomCode: 'AB23XY', hostSessionToken: 'host-token' });
    savePlayerSession({ roomCode: 'AB23XY', playerId: 'p1', playerSessionToken: 'player-token', displayName: 'سارة' });
    expect(loadHostSession()).not.toBeNull();
    expect(loadPlayerSession()).not.toBeNull();
    clearHostSession();
    expect(loadHostSession()).toBeNull();
    expect(loadPlayerSession()).not.toBeNull(); // clearing one never touches the other
  });

  it('treats corrupted stored JSON as "no session" instead of throwing', () => {
    window.sessionStorage.setItem('jackom.hostSession', 'not valid json{{{');
    expect(() => loadHostSession()).not.toThrow();
    expect(loadHostSession()).toBeNull();
  });

  it('degrades safely (returns false, never throws) when sessionStorage.setItem throws (e.g. private-browsing/quota)', () => {
    const spy = vi.spyOn(window.sessionStorage.__proto__ as Storage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveHostSession({ roomCode: 'AB23XY', hostSessionToken: 'host-token' })).not.toThrow();
    expect(saveHostSession({ roomCode: 'AB23XY', hostSessionToken: 'host-token' })).toBe(false);
    spy.mockRestore();
  });

  it('degrades safely (returns null, never throws) when sessionStorage.getItem throws', () => {
    const spy = vi.spyOn(window.sessionStorage.__proto__ as Storage, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => loadHostSession()).not.toThrow();
    expect(loadHostSession()).toBeNull();
    spy.mockRestore();
  });
});
