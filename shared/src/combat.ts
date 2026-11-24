// Zadetki strelov – ista koda na strežniku (odločitev) in telefonu (takojšen učinek).

import { AIM_ASSIST_MARGIN, HUNTER_EYE, SHOVEL_ARC, SHOVEL_RANGE, SHOVEL_SWEEP_REACH } from './constants';
import { collisionYaw, shapeOf } from './physics';
import { rayOBB, type Ray } from './raycast';
import type { ShotKind } from './types';
import { isScenery, raycastWorld, type World } from './world';

export interface ShotTarget {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  model: number;
}

export interface ShotResult {
  t: number;
  kind: ShotKind;
  /** Id zadetega igralca ali null. */
  target: string | null;
  /** Indeks zadetega predmeta mape ali -1. */
  propIndex: number;
  /** Zadetek je bil mogoč le zaradi pomoči pri merjenju. */
  assisted: boolean;
}

function hitTarget(ray: Ray, tg: ShotTarget, margin: number, maxT: number): number | null {
  const s = shapeOf(tg.model);
  return rayOBB(
    ray,
    tg.x,
    tg.y + s.h / 2,
    tg.z,
    s.hx + margin,
    s.h / 2 + margin,
    s.hz + margin,
    collisionYaw(tg.model, tg.yaw),
    maxT,
  );
}

/**
 * Najbližji zadetek: stene, predmeti mape in igralci-predmeti.
 *
 * Pomoč pri merjenju (marked): skrivalci, ki jih je ta lovec že zadel, imajo
 * nekoliko večji hitbox – a samo, če bi strel sicer zadel steno, tla ali nič.
 * Če žarek najprej zadene pravi predmet (npr. kavč poleg skrivalca), ostane
 * zadetek kavča.
 */
export function resolveShot(
  world: World,
  ray: Ray,
  maxT: number,
  targets: readonly ShotTarget[],
  marked: ReadonlySet<string> = new Set(),
): ShotResult {
  const wh = raycastWorld(world, ray, maxT);
  let result: ShotResult;
  if (!wh) result = { t: maxT, kind: 'none', target: null, propIndex: -1, assisted: false };
  else if (wh.kind === 'prop' && !isScenery(world, wh.index)) {
    result = { t: wh.t, kind: 'prop', target: null, propIndex: wh.index, assisted: false };
  } else {
    // Stena ali okras (v okras se ni mogoče spremeniti – strel vanj ni kazen).
    result = { t: wh.t, kind: 'wall', target: null, propIndex: -1, assisted: false };
  }

  for (const tg of targets) {
    const t = hitTarget(ray, tg, 0, result.t);
    if (t !== null && t < result.t) result = { t, kind: 'player', target: tg.id, propIndex: -1, assisted: false };
  }

  if (result.kind === 'wall' || result.kind === 'none') {
    let best: ShotResult | null = null;
    let limit = result.t;
    for (const tg of targets) {
      if (!marked.has(tg.id)) continue;
      const t = hitTarget(ray, tg, AIM_ASSIST_MARGIN, limit);
      if (t !== null && t < limit) {
        limit = t;
        best = { t, kind: 'player', target: tg.id, propIndex: -1, assisted: true };
      }
    }
    if (best) result = best;
  }
  return result;
}

/**
 * Zamah z lopato: najprej natančen žarek (pravi predmet pod merkom ostane zadetek predmeta).
 * Če žarek zadene le steno, tla ali nič, lopata pokrije lok pred lovcem – zadene skrivalca,
 * ki je pod lopato, tudi če križ meri bolj naravnost (npr. nad nizkim vedrom).
 */
export function resolveSwing(
  world: World,
  ray: Ray,
  hunter: { x: number; y: number; z: number },
  targets: readonly ShotTarget[],
  marked: ReadonlySet<string> = new Set(),
): ShotResult {
  const direct = resolveShot(world, ray, SHOVEL_RANGE, targets, marked);
  if (direct.kind === 'player' || direct.kind === 'prop') return direct;
  const fl = Math.hypot(ray.dx, ray.dz);
  if (fl < 1e-6) return direct;
  const fx = ray.dx / fl;
  const fz = ray.dz / fl;
  const cosArc = Math.cos(SHOVEL_ARC);
  let best: ShotResult | null = null;
  let bestScore = Infinity;
  for (const tg of targets) {
    const s = shapeOf(tg.model);
    // Na isti višini kot lovec (ne nadstropje nižje ali višje).
    if (tg.y + s.h < hunter.y - 0.3 || tg.y > hunter.y + 2.2) continue;
    const dx = tg.x - hunter.x;
    const dz = tg.z - hunter.z;
    const d = Math.hypot(dx, dz);
    const radius = Math.min(Math.max(s.hx, s.hz), 1.0);
    if (d - radius > SHOVEL_SWEEP_REACH) continue;
    const cos = d < 1e-6 ? 1 : (dx * fx + dz * fz) / d;
    // Zelo blizu (lovec se ga skoraj dotika) šteje tudi širši kot.
    if (cos < cosArc && !(d < radius + 0.6 && cos > 0)) continue;
    // Med lovcem in skrivalcem ne sme biti stene ali drugega predmeta.
    const oy = hunter.y + 1.0;
    const ty = tg.y + Math.min(s.h / 2, 0.9);
    const vx = dx;
    const vy = ty - oy;
    const vz = dz;
    const len = Math.hypot(vx, vy, vz);
    if (len > 1e-6) {
      const los: Ray = { ox: hunter.x, oy, oz: hunter.z, dx: vx / len, dy: vy / len, dz: vz / len };
      const wh = raycastWorld(world, los, len);
      // Dovolimo zadetek tik ob skrivalcu (stoji ob steni / na mizi).
      if (wh && wh.t < len - radius - 0.05) continue;
    }
    const score = d * (2 - cos);
    if (score < bestScore) {
      bestScore = score;
      const t = Math.max(0.3, (tg.x - ray.ox) * ray.dx + (ty - ray.oy) * ray.dy + (tg.z - ray.oz) * ray.dz);
      best = { t, kind: 'player', target: tg.id, propIndex: -1, assisted: true };
    }
  }
  return best ?? direct;
}

/**
 * Žarek iz kamere premaknemo naprej do točke ob glavi lovca, da ne zadene
 * stvari med kamero in lovcem (kamera je za njegovim hrbtom).
 */
export function shotRayFromCamera(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  hunter: { x: number; y: number; z: number },
): Ray {
  const hx = hunter.x;
  const hy = hunter.y + HUNTER_EYE;
  const hz = hunter.z;
  const t0 = Math.max(0, (hx - origin.x) * dir.x + (hy - origin.y) * dir.y + (hz - origin.z) * dir.z);
  return {
    ox: origin.x + dir.x * t0,
    oy: origin.y + dir.y * t0,
    oz: origin.z + dir.z * t0,
    dx: dir.x,
    dy: dir.y,
    dz: dir.z,
  };
}
