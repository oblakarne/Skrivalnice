// Preverjanje vseh podatkov, ki pridejo od odjemalca (nikoli jim ne zaupamo slepo).

import {
  HIDE_TIME_OPTIONS,
  HUNT_TIME_OPTIONS,
  HUNTER_COUNT_OPTIONS,
  NAME_MAX_LEN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LEN,
  ROUND_OPTIONS,
} from './constants';
import { isMapId } from './maps/index';
import type { ShootMsg, StateMsg } from './protocol';
import type { RoomSettings } from './types';

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Kontrolni in nevidni znaki (tudi obračanje smeri besedila), ki jih v imenih ne dovolimo. */
function isForbiddenChar(cp: number): boolean {
  return (
    cp <= 0x1f ||
    (cp >= 0x7f && cp <= 0x9f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202e) ||
    (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0xfeff
  );
}

/** Očisti ime: brez kontrolnih znakov, strnjeni presledki, največ NAME_MAX_LEN znakov. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = Array.from(raw.slice(0, 200))
    .filter((ch) => !isForbiddenChar(ch.codePointAt(0) ?? 0))
    .join('');
  const collapsed = cleaned.replace(/\s+/g, ' ').trim();
  const chars = Array.from(collapsed).slice(0, NAME_MAX_LEN);
  const name = chars.join('').trim();
  return name.length > 0 ? name : null;
}

/** Normalizira kodo sobe (velike črke, brez presledkov). */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '').toUpperCase();
  if (code.length !== ROOM_CODE_LEN) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function parseState(raw: unknown): StateMsg | null {
  if (!isObject(raw)) return null;
  const { x, y, z, yaw, pitch, seq } = raw;
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(z) ||
    !isFiniteNumber(yaw) ||
    !isFiniteNumber(pitch) ||
    !isFiniteNumber(seq)
  ) {
    return null;
  }
  return { x, y, z, yaw: wrapAngle(yaw), pitch: Math.max(-1.6, Math.min(1.6, pitch)), seq: Math.floor(seq) };
}

export function parseShoot(raw: unknown): ShootMsg | null {
  if (!isObject(raw)) return null;
  const { ox, oy, oz, dx, dy, dz } = raw;
  if (
    !isFiniteNumber(ox) ||
    !isFiniteNumber(oy) ||
    !isFiniteNumber(oz) ||
    !isFiniteNumber(dx) ||
    !isFiniteNumber(dy) ||
    !isFiniteNumber(dz)
  ) {
    return null;
  }
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return null;
  return { ox, oy, oz, dx: dx / len, dy: dy / len, dz: dz / len };
}

function pick<T extends number>(options: readonly T[], v: unknown): T | undefined {
  return options.find((o) => o === v);
}

/** Iz neznanega objekta vzame samo veljavne nastavitve. */
export function parseSettings(raw: unknown): Partial<RoomSettings> {
  const out: Partial<RoomSettings> = {};
  if (!isObject(raw)) return out;
  if (isMapId(raw.map)) out.map = raw.map;
  const hide = pick(HIDE_TIME_OPTIONS, raw.hideTime);
  if (hide !== undefined) out.hideTime = hide;
  const hunt = pick(HUNT_TIME_OPTIONS, raw.huntTime);
  if (hunt !== undefined) out.huntTime = hunt;
  const hunters = pick(HUNTER_COUNT_OPTIONS, raw.hunters);
  if (hunters !== undefined) out.hunters = hunters;
  const rounds = pick(ROUND_OPTIONS, raw.rounds);
  if (rounds !== undefined) out.rounds = rounds;
  if (typeof raw.penalty === 'boolean') out.penalty = raw.penalty;
  if (typeof raw.radar === 'boolean') out.radar = raw.radar;
  return out;
}

/** Kot v obseg (-PI, PI]. */
export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  let r = a % t;
  if (r <= -Math.PI) r += t;
  if (r > Math.PI) r -= t;
  return r;
}

export function isToken(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
}
