import { describe, expect, it } from 'vitest';
import { normalizeCode, parseSettings, parseShoot, parseState, sanitizeName, wrapAngle, isToken } from './validation';

describe('sanitizeName', () => {
  it('očisti in skrajša ime', () => {
    expect(sanitizeName('  Janez   Novak ')).toBe('Janez Novak');
    expect(sanitizeName('a'.repeat(40))).toBe('a'.repeat(16));
    expect(sanitizeName('Žan Čebašek')).toBe('Žan Čebašek');
    expect(sanitizeName(String.fromCharCode(0, 0x200b, 32, 32))).toBeNull();
    expect(sanitizeName('A' + String.fromCharCode(0x202e) + 'B')).toBe('AB');
    expect(sanitizeName(42)).toBeNull();
    expect(sanitizeName('<b>x</b>')).toBe('<b>x</b>'); // izpis vedno s textContent
  });
});

describe('normalizeCode', () => {
  it('sprejme veljavne kode', () => {
    expect(normalizeCode('abcd')).toBe('ABCD');
    expect(normalizeCode(' x7 k9 ')).toBe('X7K9');
  });
  it('zavrne neveljavne', () => {
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode('AB0D')).toBeNull();
    expect(normalizeCode('ABIO')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
});

describe('parseSettings', () => {
  it('vzame samo dovoljene vrednosti', () => {
    expect(parseSettings({ hideTime: 45, huntTime: 999, hunters: 2, rounds: 8, penalty: false, x: 1 })).toEqual({
      hideTime: 45,
      hunters: 2,
      rounds: 8,
      penalty: false,
    });
    expect(parseSettings('neki')).toEqual({});
  });
});

describe('parseState / parseShoot', () => {
  it('zavrne neveljavne številke', () => {
    expect(parseState({ x: 1, y: 0, z: 1, yaw: 0, pitch: 0, seq: NaN })).toBeNull();
    expect(parseState({ x: 1, y: 0, z: 1, yaw: 0, pitch: 0 })).toBeNull();
    expect(parseState(null)).toBeNull();
  });
  it('omeji pitch in ovije yaw', () => {
    const s = parseState({ x: 1, y: 0, z: 1, yaw: 7, pitch: 5, seq: 2 });
    expect(s?.pitch).toBe(1.6);
    expect(s?.yaw).toBeCloseTo(7 - Math.PI * 2, 6);
  });
  it('normalizira smer strela', () => {
    const s = parseShoot({ ox: 0, oy: 0, oz: 0, dx: 3, dy: 0, dz: 4 });
    expect(s?.dx).toBeCloseTo(0.6, 6);
    expect(s?.dz).toBeCloseTo(0.8, 6);
    expect(parseShoot({ ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 })).toBeNull();
  });
});

describe('wrapAngle / isToken', () => {
  it('ovije kot', () => {
    expect(wrapAngle(-4)).toBeCloseTo(-4 + Math.PI * 2, 6);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 6);
  });
  it('preveri žeton', () => {
    expect(isToken('abcdefghijklmnop')).toBe(true);
    expect(isToken('short')).toBe(false);
    expect(isToken('ab cd')).toBe(false);
  });
});
