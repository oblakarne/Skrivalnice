import { describe, expect, it } from 'vitest';
import { HUNTER_HALF, PHYSICS_DT, TRANSFORM_RANGE } from './constants';
import { MAPS } from './maps/index';
import { groundHeight, penetrationDepth, shapeOf, stepBody, type Body, type Box } from './physics';
import { PROPS } from './props';
import { MODEL_GHOST, MODEL_HUNTER } from './types';
import { allWorlds, boxesFor, elevatorBox, elevatorY, getWorld, placementBox } from './world';

function overlap3(a: Box, b: Box, eps = 1e-3): boolean {
  return (
    a.minX < b.maxX - eps &&
    a.maxX > b.minX + eps &&
    a.minY < b.maxY - eps &&
    a.maxY > b.minY + eps &&
    a.minZ < b.maxZ - eps &&
    a.maxZ > b.minZ + eps
  );
}

function overlapXZ(a: Box, b: Box, eps = 1e-3): boolean {
  return a.minX < b.maxX - eps && a.maxX > b.minX + eps && a.minZ < b.maxZ - eps && a.maxZ > b.minZ + eps;
}

describe('katalog predmetov', () => {
  it('ima unikatne id-je in smiselne hitboxe', () => {
    const ids = new Set(PROPS.map((p) => p.id));
    expect(ids.size).toBe(PROPS.length);
    for (const p of PROPS) {
      expect(p.hx, p.id).toBeGreaterThan(0.1);
      expect(p.hz, p.id).toBeGreaterThan(0.1);
      expect(p.h, p.id).toBeGreaterThan(0.1);
      expect(p.h, p.id).toBeLessThanOrEqual(2.0);
    }
  });

  it('pravilno izračuna hitbox stola in zasukane cevi', () => {
    const stol = PROPS.find((p) => p.id === 'stol')!;
    expect(stol.hx).toBeCloseTo(0.225, 3);
    expect(stol.h).toBeCloseTo(0.98, 3);
    const cev = PROPS.find((p) => p.id === 'cev')!;
    expect(cev.hx).toBeCloseTo(0.701, 3);
    expect(cev.hz).toBeCloseTo(0.45, 3);
    expect(cev.h).toBeCloseTo(0.9, 3);
  });

  it('placementBox zamenja širino in globino pri četrt obrata', () => {
    const kavc = PROPS.findIndex((p) => p.id === 'kavc');
    const a = placementBox(kavc, 0, 0, 0, 0);
    const b = placementBox(kavc, 0, 0, 0, 1);
    expect(a.maxX - a.minX).toBeCloseTo(b.maxZ - b.minZ, 6);
    expect(a.maxZ - a.minZ).toBeCloseTo(b.maxX - b.minX, 6);
  });
});

for (const world of allWorlds()) {
  const map = world.map;
  const boxes = world.propBoxes;
  const name = (i: number): string => `${PROPS[map.props[i]!.type]!.id}#${i}`;

  describe(`mapa ${map.name}`, () => {
    it('je večja od prvotne hiše (26 x 18 m)', () => {
      expect(map.width * map.depth).toBeGreaterThan(26 * 18 * 1.5);
    });

    it('ima predmete znotraj meja in ne v stenah ali odrih', () => {
      boxes.forEach((b, i) => {
        expect(b.minX, name(i)).toBeGreaterThanOrEqual(0.1);
        expect(b.maxX, name(i)).toBeLessThanOrEqual(map.width - 0.1);
        expect(b.minZ, name(i)).toBeGreaterThanOrEqual(0.1);
        expect(b.maxZ, name(i)).toBeLessThanOrEqual(map.depth - 0.1);
        expect(b.maxY, name(i)).toBeLessThan(map.height - 0.3);
        for (const s of map.solids) expect(overlap3(b, s), `${name(i)} seka oviro`).toBe(false);
      });
    });

    it('nima prekrivajočih se predmetov', () => {
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlap3(boxes[i]!, boxes[j]!), `${name(i)} in ${name(j)} se prekrivata`).toBe(false);
        }
      }
    });

    it('ima zložene predmete podprte (s predmetom ali odrom)', () => {
      map.props.forEach((pl, i) => {
        if (pl.y <= 0) return;
        const me = boxes[i]!;
        const support = [...boxes.filter((_, j) => j !== i), ...map.solids].some(
          (b) => Math.abs(b.maxY - pl.y) < 0.006 && overlapXZ(b, me),
        );
        expect(support, `${name(i)} lebdi`).toBe(true);
      });
    });

    it('ima proste začetne točke in predmet v dosegu vsake točke skrivalca', () => {
      const hunter = shapeOf(MODEL_HUNTER);
      const ghost = shapeOf(MODEL_GHOST);
      for (const [x, z] of map.hunterSpawns) {
        expect(penetrationDepth(x, 0, z, hunter, 0, world.staticBoxes), `lovec ${x},${z}`).toBe(0);
        expect(groundHeight(x, z, 0, hunter, 0, world.staticBoxes)).toBe(0);
      }
      for (const [x, z] of map.propSpawns) {
        expect(penetrationDepth(x, 0, z, ghost, 0, world.staticBoxes), `skrivalec ${x},${z}`).toBe(0);
        expect(groundHeight(x, z, 0, ghost, 0, world.staticBoxes)).toBe(0);
        const nearest = Math.min(...map.props.map((pl) => Math.hypot(pl.x - x, pl.z - z)));
        expect(nearest, `ni predmeta blizu ${x},${z}`).toBeLessThan(TRANSFORM_RANGE - 0.3);
      }
      expect(map.propSpawns.length).toBeGreaterThanOrEqual(7);
      expect(map.hunterSpawns.length).toBeGreaterThanOrEqual(3);
    });

    it('ima vse prostore in začetne točke dosegljive (vrata niso zastavljena)', () => {
      const step = 0.2;
      const nx = Math.round(map.width / step);
      const nz = Math.round(map.depth / step);
      const shape = { hx: HUNTER_HALF, hz: HUNTER_HALF, h: 1.7 };
      const blockers = world.staticBoxes.filter((b) => b.maxY > 0.3 && b.minY < 1.7);
      const seen = new Uint8Array((nx + 1) * (nz + 1));
      const free = (ix: number, iz: number): boolean => penetrationDepth(ix * step, 0, iz * step, shape, 0, blockers) === 0;
      const [sx, sz] = map.hunterSpawns[0]!;
      const queue: number[] = [Math.round(sx / step), Math.round(sz / step)];
      seen[queue[1]! * (nx + 1) + queue[0]!] = 1;
      while (queue.length) {
        const iz = queue.pop()!;
        const ix = queue.pop()!;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx > nx || jz > nz) continue;
          const k = jz * (nx + 1) + jx;
          if (seen[k] || !free(jx, jz)) continue;
          seen[k] = 1;
          queue.push(jx, jz);
        }
      }
      const reached = (x: number, z: number): boolean => seen[Math.round(z / step) * (nx + 1) + Math.round(x / step)] === 1;
      for (const [x, z] of map.propSpawns) expect(reached(x, z), `spawn ${x},${z}`).toBe(true);
      if (!map.outdoor) {
        for (const f of map.floors) {
          let ok = false;
          for (let x = f.x0 + 0.6; x < f.x1 - 0.5 && !ok; x += step) {
            for (let z = f.z0 + 0.6; z < f.z1 - 0.5 && !ok; z += step) if (reached(x, z)) ok = true;
          }
          expect(ok, `prostor ${f.name} ni dosegljiv`).toBe(true);
        }
      }
    });
  });
}

describe('Construction: nadstropja in stopnice', () => {
  const world = getWorld('construction');
  const shape = shapeOf(MODEL_HUNTER);

  /** Hoja po točkah z isto fiziko kot v igri. */
  function walk(start: [number, number, number], points: [number, number][]): Body {
    const b: Body = { x: start[0], y: start[1], z: start[2], vy: 0, onGround: true };
    for (const [tx, tz] of points) {
      for (let i = 0; i < 600; i++) {
        const dx = tx - b.x;
        const dz = tz - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const v = Math.min(4, d / PHYSICS_DT);
        stepBody(b, shape, 0, (dx / d) * v, (dz / d) * v, false, PHYSICS_DT, world.staticBoxes);
      }
    }
    // Še malo stoji, da se umiri.
    for (let i = 0; i < 30; i++) stepBody(b, shape, 0, 0, 0, false, PHYSICS_DT, world.staticBoxes);
    return b;
  }

  it('zahodne stopnice: tla -> severni oder (3 m)', () => {
    const b = walk([15.5, 0, 6], [[24.5, 6]]);
    expect(b.y).toBeCloseTo(3, 3);
    expect(b.x).toBeGreaterThan(24);
  });

  it('severne stopnice: oder -> streha (6 m)', () => {
    const b = walk([28, 3, 4.45], [[28, 12]]);
    expect(b.y).toBeCloseTo(6, 3);
    expect(b.z).toBeGreaterThan(11.5);
  });

  it('južne stopnice: tla -> 1. nadstropje (3 m)', () => {
    const b = walk([21, 0, 32.5], [[21, 24.5]]);
    expect(b.y).toBeCloseTo(3, 3);
    expect(b.z).toBeLessThan(25);
  });

  it('vzhodne stopnice -> stolp -> most -> 1. nadstropje stavbe', () => {
    const b = walk([47.4, 0, 22], [
      [40.5, 22],
      [40.5, 23],
      [31.5, 23],
    ]);
    expect(b.y).toBeCloseTo(3, 3);
    expect(b.x).toBeLessThan(32);
  });

  it('stopnice s strehe (6 m) v 3. nadstropje (9 m)', () => {
    const b = walk([32, 6, 13], [[22, 13]]);
    expect(b.y).toBeCloseTo(9, 3);
    expect(b.x).toBeLessThan(25);
  });

  it('pod odrom in v pritličje stavbe se da hoditi', () => {
    const b = walk([27, 0, 3.5], [[27, 12]]);
    expect(b.y).toBe(0);
    expect(b.z).toBeGreaterThan(11.9);
  });

  it('soba lovcev je med skrivanjem zaprta, med lovom odprta', () => {
    const shape = { hx: HUNTER_HALF, hz: HUNTER_HALF, h: 1.7 };
    const tryExit = (open: boolean): Body => {
      const b: Body = { x: 6.5, y: 0, z: 6.5, vy: 0, onGround: true };
      const boxes = boxesFor(world, open);
      for (let i = 0; i < 180; i++) stepBody(b, shape, 0, 4, 0, false, PHYSICS_DT, boxes);
      return b;
    };
    expect(tryExit(false).x).toBeLessThan(8.9);
    expect(tryExit(true).x).toBeGreaterThan(10);
  });

  it('dvigalo vozi 0 -> 3 -> 6 m in pripelje igralca na streho', () => {
    const ys = Array.from({ length: 400 }, (_, i) => elevatorY(world, i * 50));
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(6, 5);
    // Igralec stoji na ploščadi, ko je spodaj, in se pelje z njo.
    let t = 0;
    while (elevatorY(world, t) > 0.001 || elevatorY(world, t + 100) > 0.001) t += 50;
    const b: Body = { x: 35.1, y: 0, z: 15.5, vy: 0, onGround: true };
    let maxY = 0;
    for (let i = 0; i < 60 * 12; i++) {
      t += 1000 * PHYSICS_DT;
      const boxes = [...world.staticBoxes, elevatorBox(world, elevatorY(world, t))!];
      stepBody(b, shape, 0, 0, 0, false, PHYSICS_DT, boxes);
      maxY = Math.max(maxY, b.y);
    }
    expect(maxY).toBeGreaterThan(5.9);
    // Na vrhu stopi na streho (zahodno).
    while (Math.abs(elevatorY(world, t) - 6) > 0.001) {
      t += 1000 * PHYSICS_DT;
      stepBody(b, shape, 0, 0, 0, false, PHYSICS_DT, [...world.staticBoxes, elevatorBox(world, elevatorY(world, t))!]);
    }
    for (let i = 0; i < 60; i++) {
      t += 1000 * PHYSICS_DT;
      stepBody(b, shape, 0, -4, 0, false, PHYSICS_DT, [...world.staticBoxes, elevatorBox(world, elevatorY(world, t))!]);
    }
    expect(b.y).toBeCloseTo(6, 3);
    expect(b.x).toBeLessThan(33.5);
  });

  it('ima 6 vrst predmetov za spremembo, dovolj primerkov in okras', () => {
    expect(world.map.transformable).toHaveLength(6);
    const counts = new Map<string, number>();
    let scenery = 0;
    for (const pl of world.map.props) {
      const id = PROPS[pl.type]!.id;
      if (world.map.transformable!.includes(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      else scenery++;
    }
    for (const id of world.map.transformable!) expect(counts.get(id) ?? 0, id).toBeGreaterThanOrEqual(8);
    expect(scenery).toBeGreaterThan(20);
  });

  it('ima predmete za skrivanje v vseh nadstropjih (tla, 3 m, 6 m, 9 m)', () => {
    const t = world.transformable!;
    const levels = new Set(world.map.props.filter((pl) => t.has(pl.type)).map((pl) => (pl.y >= 8.9 ? 9 : pl.y >= 5.9 ? 6 : pl.y >= 2.9 ? 3 : 0)));
    expect([...levels].sort()).toEqual([0, 3, 6, 9]);
  });

  it('ima pri vsaki začetni točki skrivalca predmet za spremembo na tleh', () => {
    const t = world.transformable!;
    for (const [x, z] of world.map.propSpawns) {
      const nearest = Math.min(
        ...world.map.props.filter((pl) => t.has(pl.type) && pl.y < 1).map((pl) => Math.hypot(pl.x - x, pl.z - z)),
      );
      expect(nearest, `${x},${z}`).toBeLessThan(TRANSFORM_RANGE - 0.3);
    }
  });
});

describe('mape', () => {
  it('imajo unikatne id-je', () => {
    expect(Object.keys(MAPS).sort()).toEqual(['construction', 'hisa']);
  });
});
