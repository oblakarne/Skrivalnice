// Zadetki strelov – ista koda na strežniku (odločitev) in telefonu (takojšen učinek).

import { AIM_ASSIST_MARGIN, HUNTER_EYE } from './constants';
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
