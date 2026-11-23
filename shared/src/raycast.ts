import type { Box } from './physics';

export interface Ray {
  ox: number;
  oy: number;
  oz: number;
  /** Normalizirana smer. */
  dx: number;
  dy: number;
  dz: number;
}

/** Žarek proti osno poravnanemu kvadru (slab metoda). Vrne razdaljo t ali null. */
export function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  maxT: number,
): number | null {
  let tmin = 0;
  let tmax = maxT;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [minX, minY, minZ];
  const hi = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i++) {
    const oi = o[i]!;
    const di = d[i]!;
    const l = lo[i]!;
    const h = hi[i]!;
    if (Math.abs(di) < 1e-12) {
      if (oi < l || oi > h) return null;
      continue;
    }
    const inv = 1 / di;
    let t1 = (l - oi) * inv;
    let t2 = (h - oi) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function rayAABB(ray: Ray, b: Box, maxT: number): number | null {
  return rayBox(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, maxT);
}

/** Žarek proti kvadru, zasukanemu okoli osi Y za yaw (središče cx,cy,cz). */
export function rayOBB(
  ray: Ray,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  yaw: number,
  maxT: number,
): number | null {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // Lokalni osi v svetu: X' = (c, 0, -s), Z' = (s, 0, c)
  const px = ray.ox - cx;
  const py = ray.oy - cy;
  const pz = ray.oz - cz;
  const lox = px * c - pz * s;
  const loz = px * s + pz * c;
  const ldx = ray.dx * c - ray.dz * s;
  const ldz = ray.dx * s + ray.dz * c;
  return rayBox(lox, py, loz, ldx, ray.dy, ldz, -hx, -hy, -hz, hx, hy, hz, maxT);
}

export function normalizeRay(ray: Ray): Ray | null {
  const len = Math.hypot(ray.dx, ray.dy, ray.dz);
  if (!Number.isFinite(len) || len < 1e-6) return null;
  return { ox: ray.ox, oy: ray.oy, oz: ray.oz, dx: ray.dx / len, dy: ray.dy / len, dz: ray.dz / len };
}
