import type { Box } from '../physics';
import { propIndex, type Vec3 } from '../props';

export interface WorldPropPlacement {
  type: number;
  x: number;
  y: number;
  z: number;
  /** Zasuk v četrtinah obrata (0-3). */
  q: number;
}

/** Trdna ovira (stena, oder, stopnica …) z barvo. hidden = nevidna (npr. višji del ograje). */
export interface SolidDef extends Box {
  color: number;
  hidden?: boolean;
}

export interface FloorDef {
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Barva ploščic. */
  color: number;
  /** Druga barva za šahovnico (več kontrasta). */
  color2: number;
  /** Velikost ploščice v metrih. */
  tile: number;
  /** Barva sten tega prostora (samo notranje mape). */
  wall?: number;
}

/** Samo okras (brez trkov): preproge, okna, slike, žerjav … */
export interface DecorDef {
  s: Vec3;
  p: Vec3;
  c: number;
}

export interface MapLighting {
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunColor: number;
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  depth: number;
  /** Višina stropa (notranje) ali nevidne meje (zunanje). */
  height: number;
  outdoor: boolean;
  solids: SolidDef[];
  floors: FloorDef[];
  props: WorldPropPlacement[];
  decor: DecorDef[];
  hunterSpawns: [number, number][];
  propSpawns: [number, number][];
  lighting: MapLighting;
  /**
   * Id-ji predmetov, v katere se skrivalci lahko spremenijo. Če ni podano,
   * se lahko spremenijo v vse. Ostali predmeti so samo okras (strel vanje ni kazen).
   */
  transformable?: string[];
  /** Nebo: [zgoraj, obzorje] (samo zunanje mape). */
  sky?: [number, number];
  /** Oblaki na nebu. */
  clouds?: boolean;
  /** Megla: [barva, blizu, daleč]. */
  fog?: [number, number, number];
}

// ---------------------------------------------------------------- pomočniki

export function p(id: string, x: number, z: number, q = 0, y = 0): WorldPropPlacement {
  return { type: propIndex(id), x, y, z, q };
}

export function solid(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  color: number,
  hidden = false,
): SolidDef {
  const s: SolidDef = { minX, minY, minZ, maxX, maxY, maxZ, color };
  if (hidden) s.hidden = true;
  return s;
}

/** Stena vzdolž osi X pri z, od x0 do x1, z odprtinami (vrata). */
export function wallX(
  z: number,
  x0: number,
  x1: number,
  gaps: [number, number][],
  t: number,
  h: number,
  color: number,
  y0 = 0,
): SolidDef[] {
  const out: SolidDef[] = [];
  let start = x0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > start) out.push(solid(start, y0, z - t / 2, g0, y0 + h, z + t / 2, color));
    start = g1;
  }
  if (x1 > start) out.push(solid(start, y0, z - t / 2, x1, y0 + h, z + t / 2, color));
  return out;
}

/** Stena vzdolž osi Z pri x, od z0 do z1, z odprtinami. */
export function wallZ(
  x: number,
  z0: number,
  z1: number,
  gaps: [number, number][],
  t: number,
  h: number,
  color: number,
  y0 = 0,
): SolidDef[] {
  const out: SolidDef[] = [];
  let start = z0;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > start) out.push(solid(x - t / 2, y0, start, x + t / 2, y0 + h, g0, color));
    start = g1;
  }
  if (z1 > start) out.push(solid(x - t / 2, y0, start, x + t / 2, y0 + h, z1, color));
  return out;
}
