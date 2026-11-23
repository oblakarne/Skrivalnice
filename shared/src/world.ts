import { DEFAULT_MAP_ID, MAPS, type MapDef } from './maps/index';
import type { Box } from './physics';
import { propIndex, PROPS } from './props';
import { rayAABB, type Ray } from './raycast';

export interface World {
  map: MapDef;
  /** Stene, odri, tla in strop/zgornja meja (vse, kar ni predmet). */
  wallBoxes: Box[];
  /** Hitboxi predmetov mape (isti vrstni red kot map.props). */
  propBoxes: Box[];
  /** Vse statične ovire za gibanje. */
  staticBoxes: Box[];
  /** Vrste predmetov, v katere se lahko spremeniš (null = vse). */
  transformable: ReadonlySet<number> | null;
}

/** Ali se skrivalec na tej mapi lahko spremeni v predmet te vrste? */
export function canTransformInto(world: World, type: number): boolean {
  return world.transformable === null || world.transformable.has(type);
}

/** Ali je predmet mape samo okras (v njega se ni mogoče spremeniti)? */
export function isScenery(world: World, propIndex: number): boolean {
  const pl = world.map.props[propIndex];
  return !!pl && !canTransformInto(world, pl.type);
}

export function propYaw(q: number): number {
  return (((q % 4) + 4) % 4) * (Math.PI / 2);
}

export function placementBox(type: number, x: number, y: number, z: number, q: number): Box {
  const def = PROPS[type];
  if (!def) throw new Error(`Neznan tip predmeta ${type}`);
  const odd = (((q % 4) + 4) % 4) % 2 === 1;
  const hx = odd ? def.hz : def.hx;
  const hz = odd ? def.hx : def.hz;
  return { minX: x - hx, maxX: x + hx, minY: y, maxY: y + def.h, minZ: z - hz, maxZ: z + hz };
}

export function buildWorld(map: MapDef): World {
  const floor: Box = { minX: -2, maxX: map.width + 2, minY: -1, maxY: 0, minZ: -2, maxZ: map.depth + 2 };
  const ceiling: Box = {
    minX: -2,
    maxX: map.width + 2,
    minY: map.height,
    maxY: map.height + 0.5,
    minZ: -2,
    maxZ: map.depth + 2,
  };
  const solids: Box[] = map.solids.map((s) => ({
    minX: s.minX,
    minY: s.minY,
    minZ: s.minZ,
    maxX: s.maxX,
    maxY: s.maxY,
    maxZ: s.maxZ,
  }));
  const wallBoxes = [...solids, floor, ceiling];
  const propBoxes = map.props.map((pl) => placementBox(pl.type, pl.x, pl.y, pl.z, pl.q));
  const transformable = map.transformable ? new Set(map.transformable.map((id) => propIndex(id))) : null;
  return { map, wallBoxes, propBoxes, staticBoxes: [...wallBoxes, ...propBoxes], transformable };
}

const WORLDS = new Map<string, World>(Object.values(MAPS).map((m) => [m.id, buildWorld(m)]));

/** Svet za dano mapo (neznan id -> privzeta mapa). */
export function getWorld(mapId: string): World {
  return WORLDS.get(mapId) ?? WORLDS.get(DEFAULT_MAP_ID)!;
}

export function allWorlds(): World[] {
  return [...WORLDS.values()];
}

export interface WorldHit {
  t: number;
  kind: 'wall' | 'prop';
  index: number;
}

function pointInBox(b: Box, x: number, y: number, z: number): boolean {
  return x > b.minX && x < b.maxX && y > b.minY && y < b.maxY && z > b.minZ && z < b.maxZ;
}

/**
 * Najbližji zadetek žarka v statičnem svetu. Kvadri, v katerih se žarek začne,
 * se preskočijo (npr. kamera, ki je zdrsnila v predmet).
 */
export function raycastWorld(world: World, ray: Ray, maxT: number): WorldHit | null {
  let best: WorldHit | null = null;
  let limit = maxT;
  for (let i = 0; i < world.wallBoxes.length; i++) {
    const b = world.wallBoxes[i]!;
    if (pointInBox(b, ray.ox, ray.oy, ray.oz)) continue;
    const t = rayAABB(ray, b, limit);
    if (t !== null && t < limit) {
      limit = t;
      best = { t, kind: 'wall', index: i };
    }
  }
  for (let i = 0; i < world.propBoxes.length; i++) {
    const b = world.propBoxes[i]!;
    if (pointInBox(b, ray.ox, ray.oy, ray.oz)) continue;
    const t = rayAABB(ray, b, limit);
    if (t !== null && t < limit) {
      limit = t;
      best = { t, kind: 'prop', index: i };
    }
  }
  return best;
}

/** Ali je točka znotraj mej mape? */
export function insideBounds(world: World, x: number, y: number, z: number): boolean {
  const m = world.map;
  return x >= 0 && x <= m.width && z >= 0 && z <= m.depth && y >= -0.05 && y <= m.height;
}

/** Razdalja v ravnini XZ med igralcem in predmetom mape. */
export function distanceToProp(world: World, index: number, x: number, z: number): number {
  const pl = world.map.props[index];
  if (!pl) return Infinity;
  return Math.hypot(pl.x - x, pl.z - z);
}
