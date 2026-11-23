import { describe, expect, it } from 'vitest';
import { PHYSICS_DT } from './constants';
import {
  penetrationDepth,
  pushFromOthers,
  rectOverlap,
  shapeOf,
  stepBody,
  tryRotate,
  type Body,
  type Box,
} from './physics';
import { propIndex } from './props';
import { rayAABB, rayOBB } from './raycast';
import { MODEL_HUNTER } from './types';
import { getWorld, raycastWorld } from './world';

const WORLD = getWorld('hisa');

const floor: Box = { minX: -50, maxX: 50, minY: -1, maxY: 0, minZ: -50, maxZ: 50 };
const wall: Box = { minX: 2, maxX: 2.2, minY: 0, maxY: 3.5, minZ: -5, maxZ: 5 };
const table: Box = { minX: -3, maxX: -2, minY: 0, maxY: 0.78, minZ: -0.5, maxZ: 0.5 };
const cushion: Box = { minX: -0.5, maxX: 0.5, minY: 0, maxY: 0.14, minZ: 3, maxZ: 4 };
const boxes = [floor, wall, table, cushion];

function body(x: number, z: number, y = 0): Body {
  return { x, y, z, vy: 0, onGround: true };
}

function run(b: Body, model: number, yaw: number, vx: number, vz: number, steps: number, jump = false): void {
  const shape = shapeOf(model);
  for (let i = 0; i < steps; i++) stepBody(b, shape, yaw, vx, vz, jump && i === 0, PHYSICS_DT, boxes);
}

describe('rectOverlap', () => {
  it('zazna prekrivanje osno poravnanih', () => {
    const o = rectOverlap({ cx: 0, cz: 0, hx: 1, hz: 1, yaw: 0 }, { cx: 1.5, cz: 0, hx: 1, hz: 1, yaw: 0 });
    expect(o).not.toBeNull();
    expect(o!.depth).toBeCloseTo(0.5, 6);
    expect(o!.nx).toBeCloseTo(-1, 6);
  });
  it('ne zazna ločenih', () => {
    expect(rectOverlap({ cx: 0, cz: 0, hx: 1, hz: 1, yaw: 0 }, { cx: 2.01, cz: 0, hx: 1, hz: 1, yaw: 0 })).toBeNull();
  });
  it('upošteva zasuk', () => {
    // Dolg tanek pravokotnik vzdolž X ne seka kvadra pri z=1.5, zasukan za 90° pa ga.
    const a = { cx: 0, cz: 0, hx: 2, hz: 0.1, yaw: 0 };
    const b = { cx: 0, cz: 1.5, hx: 0.2, hz: 0.2, yaw: 0 };
    expect(rectOverlap(a, b)).toBeNull();
    expect(rectOverlap({ ...a, yaw: Math.PI / 2 }, b)).not.toBeNull();
  });
});

describe('stepBody', () => {
  it('ustavi lovca pri steni', () => {
    const b = body(0, 0);
    run(b, MODEL_HUNTER, 0, 4.5, 0, 120);
    expect(b.x).toBeLessThanOrEqual(2 - 0.3 + 1e-3);
    expect(b.x).toBeGreaterThan(1.6);
    expect(b.y).toBe(0);
  });

  it('ne gre skozi mizo, a lahko skoči nanjo', () => {
    const b = body(-1, 0);
    run(b, MODEL_HUNTER, 0, -4.5, 0, 60);
    expect(b.x).toBeGreaterThanOrEqual(-2 + 0.3 - 1e-3);
    const j = body(-1.5, 0);
    // Skok in premik nad mizo
    const shape = shapeOf(MODEL_HUNTER);
    stepBody(j, shape, 0, 0, 0, true, PHYSICS_DT, boxes);
    for (let i = 0; i < 30; i++) stepBody(j, shape, 0, -3, 0, false, PHYSICS_DT, boxes);
    for (let i = 0; i < 60; i++) stepBody(j, shape, 0, 0, 0, false, PHYSICS_DT, boxes);
    expect(j.y).toBeCloseTo(0.78, 5);
    expect(j.onGround).toBe(true);
  });

  it('prestopi nizko blazino', () => {
    const b = body(0, 2);
    run(b, MODEL_HUNTER, 0, 0, 4.5, 20);
    expect(b.z).toBeGreaterThan(2.5);
    expect(b.y).toBeCloseTo(0.14, 5);
  });

  it('pade na tla in pristane', () => {
    const b = body(0, -2, 2);
    b.onGround = false;
    run(b, MODEL_HUNTER, 0, 0, 0, 120);
    expect(b.y).toBe(0);
    expect(b.onGround).toBe(true);
  });

  it('ne pusti zasuka dolgega predmeta v steno', () => {
    const kavc = propIndex('kavc');
    const shape = shapeOf(kavc);
    // Kavč (2 m x 0.9 m) tik ob steni, zasukan vzdolž stene.
    const b = body(2 - 0.45 - 0.01, 0);
    expect(penetrationDepth(b.x, b.y, b.z, shape, Math.PI / 2, boxes)).toBe(0);
    const accepted = tryRotate(b, shape, Math.PI / 2, 0, boxes, 0.3);
    // Za zasuk bi se moral premakniti 0.55 m stran od stene -> zavrnjeno.
    expect(accepted).toBe(Math.PI / 2);
    const accepted2 = tryRotate(b, shape, Math.PI / 2, 0, boxes, 1.0);
    expect(accepted2).toBe(0);
    expect(penetrationDepth(b.x, b.y, b.z, shape, 0, boxes)).toBeLessThan(1e-3);
  });

  it('mehko odrine od drugega igralca', () => {
    const b = body(0, 0);
    const shape = shapeOf(MODEL_HUNTER);
    pushFromOthers(b, shape, 0, [{ x: 0.4, y: 0, z: 0, shape, yaw: 0 }], 0.05);
    expect(b.x).toBeCloseTo(-0.05, 6);
  });
});

describe('raycast', () => {
  it('zadene kvader', () => {
    const t = rayAABB({ ox: 0, oy: 1, oz: 0, dx: 1, dy: 0, dz: 0 }, wall, 100);
    expect(t).toBeCloseTo(2, 6);
  });
  it('zgreši kvader', () => {
    expect(rayAABB({ ox: 0, oy: 4, oz: 0, dx: 1, dy: 0, dz: 0 }, wall, 100)).toBeNull();
  });
  it('upošteva doseg', () => {
    expect(rayAABB({ ox: 0, oy: 1, oz: 0, dx: 1, dy: 0, dz: 0 }, wall, 1.5)).toBeNull();
  });
  it('zadene zasukan kvader', () => {
    // Kvader 2 x 0.2, zasukan za 90° -> vzdolž Z.
    const ray = { ox: -5, oy: 0, oz: 0.8, dx: 1, dy: 0, dz: 0 };
    expect(rayOBB(ray, 0, 0, 0, 1, 1, 0.1, 0, 100)).toBeNull();
    const t = rayOBB(ray, 0, 0, 0, 1, 1, 0.1, Math.PI / 2, 100);
    expect(t).toBeCloseTo(4.9, 5);
  });
  it('najde predmet v svetu in preskoči kvader, v katerem se začne', () => {
    // Sod v garaži pri (1.2, 0.5) – žarek od zgoraj navzdol.
    const idx = WORLD.map.props.findIndex((p) => p.x === 1.2 && p.z === 0.5);
    expect(idx).toBeGreaterThanOrEqual(0);
    const pl = WORLD.map.props[idx]!;
    const b = WORLD.propBoxes[idx]!;
    const hit = raycastWorld(WORLD, { ox: pl.x, oy: 3.0, oz: pl.z, dx: 0, dy: -1, dz: 0 }, 50);
    expect(hit?.kind).toBe('prop');
    expect(hit?.index).toBe(idx);
    expect(hit!.t).toBeCloseTo(3.0 - b.maxY, 5);
    const inside = raycastWorld(WORLD, { ox: pl.x, oy: 0.5, oz: pl.z, dx: 0, dy: 1, dz: 0 }, 50);
    expect(inside?.kind).toBe('wall'); // strop
  });
});
