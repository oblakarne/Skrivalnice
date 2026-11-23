// Preprosta, deterministična fizika: telo je kvader (pravokotnik v XZ, zasukan za yaw)
// z višino; statični svet so osno poravnani kvadri (AABB).

import { GRAVITY, HUNTER_HALF, HUNTER_HEIGHT, JUMP_SPEED, STEP_HEIGHT } from './constants';
import { PROPS } from './props';
import { MODEL_GHOST, MODEL_HUNTER } from './types';

export interface Box {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface Shape {
  hx: number;
  hz: number;
  h: number;
}

/** Pravokotnik v ravnini XZ. */
export interface Rect {
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  yaw: number;
}

export interface Overlap {
  depth: number;
  /** Smer (normala), v katero je treba premakniti prvi pravokotnik. */
  nx: number;
  nz: number;
}

const HUNTER_SHAPE: Shape = { hx: HUNTER_HALF, hz: HUNTER_HALF, h: HUNTER_HEIGHT };

export function shapeOf(model: number): Shape {
  if (model === MODEL_HUNTER) return HUNTER_SHAPE;
  const def = PROPS[model] ?? PROPS[MODEL_GHOST]!;
  return { hx: def.hx, hz: def.hz, h: def.h };
}

/** Lovec in duh imata osno poravnan hitbox (vrtenje ne vpliva na trke). */
export function collisionYaw(model: number, yaw: number): number {
  return model === MODEL_HUNTER || model === MODEL_GHOST ? 0 : yaw;
}

export function boxRect(b: Box): Rect {
  return {
    cx: (b.minX + b.maxX) / 2,
    cz: (b.minZ + b.maxZ) / 2,
    hx: (b.maxX - b.minX) / 2,
    hz: (b.maxZ - b.minZ) / 2,
    yaw: 0,
  };
}

/** SAT test dveh zasukanih pravokotnikov. Vrne najmanjši premik za ločitev ali null. */
export function rectOverlap(a: Rect, b: Rect): Overlap | null {
  // Hitri izločitveni test z očrtanima krogoma.
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  const ra = Math.hypot(a.hx, a.hz);
  const rb = Math.hypot(b.hx, b.hz);
  if (dx * dx + dz * dz >= (ra + rb) * (ra + rb)) return null;

  const ca = Math.cos(a.yaw);
  const sa = Math.sin(a.yaw);
  const cb = Math.cos(b.yaw);
  const sb = Math.sin(b.yaw);
  // Lokalne osi v svetu (Three.js rotacija okoli Y): X' = (cos, -sin), Z' = (sin, cos)
  const aXx = ca;
  const aXz = -sa;
  const aZx = sa;
  const aZz = ca;
  const bXx = cb;
  const bXz = -sb;
  const bZx = sb;
  const bZz = cb;
  const axes: [number, number][] = [
    [aXx, aXz],
    [aZx, aZz],
    [bXx, bXz],
    [bZx, bZz],
  ];
  let best = Infinity;
  let bnx = 0;
  let bnz = 0;
  for (const [lx, lz] of axes) {
    const rA = a.hx * Math.abs(aXx * lx + aXz * lz) + a.hz * Math.abs(aZx * lx + aZz * lz);
    const rB = b.hx * Math.abs(bXx * lx + bXz * lz) + b.hz * Math.abs(bZx * lx + bZz * lz);
    const d = dx * lx + dz * lz;
    const o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) {
      best = o;
      const sign = d > 0 ? -1 : 1;
      bnx = lx * sign;
      bnz = lz * sign;
    }
  }
  return { depth: best, nx: bnx, nz: bnz };
}

function bodyRect(x: number, z: number, shape: Shape, yaw: number): Rect {
  return { cx: x, cz: z, hx: shape.hx, hz: shape.hz, yaw };
}

/** Ali kvader ovira vodoravno gibanje telesa na višini y? (nizke stvari prestopimo) */
function isBlocker(b: Box, y: number, h: number): boolean {
  return b.maxY > y + STEP_HEIGHT + 1e-6 && b.minY < y + h - 1e-6;
}

export interface ResolveResult {
  x: number;
  z: number;
  ok: boolean;
}

/** Potisne telo iz vseh ovir. ok=false, če po iteracijah še vedno prekriva oviro. */
export function resolveHorizontal(
  x: number,
  z: number,
  y: number,
  shape: Shape,
  yaw: number,
  boxes: readonly Box[],
  iterations = 4,
): ResolveResult {
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const b of boxes) {
      if (!isBlocker(b, y, shape.h)) continue;
      const o = rectOverlap(bodyRect(x, z, shape, yaw), boxRect(b));
      if (o && o.depth > 1e-7) {
        x += o.nx * (o.depth + 1e-5);
        z += o.nz * (o.depth + 1e-5);
        moved = true;
      }
    }
    if (!moved) return { x, z, ok: true };
  }
  return { x, z, ok: penetrationDepth(x, y, z, shape, yaw, boxes) < 1e-3 };
}

/** Največja globina prekrivanja z ovirami (0 = prosto). */
export function penetrationDepth(
  x: number,
  y: number,
  z: number,
  shape: Shape,
  yaw: number,
  boxes: readonly Box[],
): number {
  let worst = 0;
  const r = bodyRect(x, z, shape, yaw);
  for (const b of boxes) {
    if (!isBlocker(b, y, shape.h)) continue;
    const o = rectOverlap(r, boxRect(b));
    if (o && o.depth > worst) worst = o.depth;
  }
  return worst;
}

/** Najvišja površina pod telesom, na katero lahko stopi. */
export function groundHeight(x: number, z: number, y: number, shape: Shape, yaw: number, boxes: readonly Box[]): number {
  let g = -Infinity;
  const r = bodyRect(x, z, shape, yaw);
  for (const b of boxes) {
    if (b.maxY > y + STEP_HEIGHT + 1e-6) continue;
    if (b.maxY <= g) continue;
    const o = rectOverlap(r, boxRect(b));
    if (o && o.depth > 1e-3) g = b.maxY;
  }
  return g;
}

/** Najnižji strop nad telesom. */
export function ceilingHeight(x: number, z: number, y: number, shape: Shape, yaw: number, boxes: readonly Box[]): number {
  let c = Infinity;
  const r = bodyRect(x, z, shape, yaw);
  for (const b of boxes) {
    if (b.minY < y + shape.h - 1e-3) continue;
    if (b.minY >= c) continue;
    const o = rectOverlap(r, boxRect(b));
    if (o && o.depth > 1e-3) c = b.minY;
  }
  return c;
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vy: number;
  onGround: boolean;
}

/** En korak fizike. vx, vz sta želeni vodoravni hitrosti. */
export function stepBody(
  body: Body,
  shape: Shape,
  yaw: number,
  vx: number,
  vz: number,
  jump: boolean,
  dt: number,
  boxes: readonly Box[],
): void {
  const r = resolveHorizontal(body.x + vx * dt, body.z + vz * dt, body.y, shape, yaw, boxes);
  if (r.ok) {
    body.x = r.x;
    body.z = r.z;
  } else {
    // Ne moremo se razrešiti (zelo redko) – ostanemo na mestu, če je tam prosto.
    const here = resolveHorizontal(body.x, body.z, body.y, shape, yaw, boxes);
    body.x = here.x;
    body.z = here.z;
  }

  if (jump && body.onGround) {
    body.vy = JUMP_SPEED;
    body.onGround = false;
  }
  body.vy -= GRAVITY * dt;
  let ny = body.y + body.vy * dt;
  const g = groundHeight(body.x, body.z, body.y, shape, yaw, boxes);
  if (ny <= g) {
    ny = g;
    body.vy = 0;
    body.onGround = true;
  } else {
    body.onGround = false;
  }
  const c = ceilingHeight(body.x, body.z, body.y, shape, yaw, boxes);
  if (ny + shape.h > c) {
    ny = Math.max(g, c - shape.h);
    if (body.vy > 0) body.vy = 0;
  }
  body.y = ny;
}

/**
 * Poskusi zasukati telo. Če novi zasuk povzroči prekrivanje, ki se ga ne da
 * razrešiti z majhnim premikom, ostane stari zasuk. Vrne sprejeti zasuk.
 */
export function tryRotate(
  body: Body,
  shape: Shape,
  oldYaw: number,
  newYaw: number,
  boxes: readonly Box[],
  maxShift = 0.5,
): number {
  if (oldYaw === newYaw) return newYaw;
  if (penetrationDepth(body.x, body.y, body.z, shape, newYaw, boxes) < 1e-4) return newYaw;
  const r = resolveHorizontal(body.x, body.z, body.y, shape, newYaw, boxes);
  if (r.ok && Math.hypot(r.x - body.x, r.z - body.z) <= maxShift) {
    body.x = r.x;
    body.z = r.z;
    return newYaw;
  }
  return oldYaw;
}

export interface OtherBody {
  x: number;
  y: number;
  z: number;
  shape: Shape;
  yaw: number;
}

/** Mehko odrivanje od drugih igralcev (največ maxPush na korak). */
export function pushFromOthers(
  body: Body,
  shape: Shape,
  yaw: number,
  others: readonly OtherBody[],
  maxPush: number,
): void {
  let budget = maxPush;
  for (const o of others) {
    if (budget <= 0) break;
    if (o.y >= body.y + shape.h || o.y + o.shape.h <= body.y) continue;
    const ov = rectOverlap(bodyRect(body.x, body.z, shape, yaw), bodyRect(o.x, o.z, o.shape, o.yaw));
    if (!ov) continue;
    const d = Math.min(ov.depth, budget);
    body.x += ov.nx * d;
    body.z += ov.nz * d;
    budget -= d;
  }
}
