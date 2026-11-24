import { describe, expect, it } from 'vitest';
import { resolveShot, resolveSwing, type ShotTarget } from './combat';
import { HUNTER_EYE, SHOVEL_RANGE } from './constants';
import { propIndex, PROPS } from './props';
import { getWorld } from './world';

const world = getWorld('hisa');

// Kavč v dnevni sobi (6.0, 25.43) ob steni; skrivalec-medvedek tik pred njim.
const sofaIdx = world.map.props.findIndex((p) => PROPS[p.type]!.id === 'kavc' && p.x === 6.0);
const sofa = world.map.props[sofaIdx]!;
const bear: ShotTarget = { id: 'medo', x: 7.4, y: 0, z: 23.8, yaw: 0, model: propIndex('medvedek') };

function shotAt(tx: number, ty: number, tz: number, from = { x: 7.4, y: 1.5, z: 17 }) {
  const dx = tx - from.x;
  const dy = ty - from.y;
  const dz = tz - from.z;
  const len = Math.hypot(dx, dy, dz);
  return { ox: from.x, oy: from.y, oz: from.z, dx: dx / len, dy: dy / len, dz: dz / len };
}

describe('resolveShot in pomoč pri merjenju', () => {
  it('neposreden zadetek skrivalca', () => {
    const r = resolveShot(world, shotAt(7.4, 0.35, 23.8), 60, [bear]);
    expect(r.kind).toBe('player');
    expect(r.target).toBe('medo');
    expect(r.assisted).toBe(false);
  });

  // Medvedek sredi dnevne sobe; lovec cilja 20 cm nad njegovo glavo – za njim je samo stena.
  const open: ShotTarget = { id: 'medo', x: 14.0, y: 0, z: 21.0, yaw: 0, model: propIndex('medvedek') };
  const hunterPos = { x: 14.0, y: 1.5, z: 15.0 };

  it('brez prejšnjega zadetka ni pomoči (zgrešen strel zadene steno)', () => {
    const r = resolveShot(world, shotAt(14.0, 0.69 + 0.2, 21.0, hunterPos), 60, [open]);
    expect(r.kind).toBe('wall');
  });

  it('po prvem zadetku tak strel zadene skrivalca (pomoč)', () => {
    const r = resolveShot(world, shotAt(14.0, 0.69 + 0.2, 21.0, hunterPos), 60, [open], new Set(['medo']));
    expect(r.kind).toBe('player');
    expect(r.target).toBe('medo');
    expect(r.assisted).toBe(true);
  });

  it('pomoč je majhna (strel 1 m mimo zgreši tudi po prvem zadetku)', () => {
    const r = resolveShot(world, shotAt(15.0, 0.4, 21.0, hunterPos), 60, [open], new Set(['medo']));
    expect(r.kind).not.toBe('player');
  });

  it('pomoč NIKOLI ne ukrade strela v pravi predmet (kavč ostane kavč)', () => {
    // Medvedek stoji tik ob kavču; lovec cilja v kavč tik ob medvedku.
    const nearSofa: ShotTarget = { ...bear, x: sofa.x - 1.3, z: 25.4 };
    const r = resolveShot(world, shotAt(sofa.x - 0.9, 0.4, sofa.z), 60, [nearSofa], new Set(['medo']));
    expect(r.kind).toBe('prop');
    expect(r.propIndex).toBe(sofaIdx);
  });

  it('lopata seže samo blizu (daljši doseg bi zadel)', () => {
    const far: ShotTarget = { id: 'dalec', x: 28.5, y: 0, z: 11, yaw: 0, model: propIndex('zoga') };
    const ray = shotAt(28.5, 0.2, 11, { x: 2.5, y: 1.5, z: 11 });
    const normal = resolveShot(world, ray, SHOVEL_RANGE, [far]);
    expect(normal.kind).toBe('none');
    expect(normal.t).toBe(SHOVEL_RANGE);
    const longer = resolveShot(world, ray, 45, [far]);
    expect(longer.kind).toBe('player');
    expect(longer.t).toBeGreaterThan(SHOVEL_RANGE);
  });

  it('na mapi Construction je strel v okras brez kazni, v predmet za skrivanje pa s kaznijo', () => {
    const cw = getWorld('construction');
    const shootProp = (id: string): string => {
      const i = cw.map.props.findIndex((pl) => PROPS[pl.type]!.id === id && pl.y === 0);
      const pl = cw.map.props[i]!;
      const h = PROPS[pl.type]!.h;
      // Od zgoraj navzdol – nič vmes.
      return resolveShot(cw, { ox: pl.x, oy: pl.y + h + 1, oz: pl.z, dx: 0, dy: -1, dz: 0 }, 10, []).kind;
    };
    expect(shootProp('mesalnik')).toBe('wall');
    expect(shootProp('opeka')).toBe('prop');
    expect(shootProp('cev')).toBe('wall');
    expect(shootProp('sodrumen')).toBe('prop');
    expect(shootProp('kolut')).toBe('prop');
  });

  it('pomoč ne deluje skozi steno', () => {
    // Skrivalec v kuhinji, lovec na hodniku cilja v steno ob vratih.
    const kitchen: ShotTarget = { id: 'k', x: 13.0, y: 0, z: 8.5, yaw: 0, model: propIndex('zoga') };
    const r = resolveShot(world, shotAt(13.0, 0.4, 9.0, { x: 13.0, y: 1.5, z: 11.5 }), 60, [kitchen], new Set(['k']));
    expect(r.kind).toBe('wall');
  });
});

describe('resolveSwing – zamah z lopato pokrije lok pred lovcem', () => {
  const bearOpen: ShotTarget = { id: 'medo', x: 14.0, y: 0, z: 21.0, yaw: 0, model: propIndex('medvedek') };
  // Lovec gleda vodoravno naprej (+z), križ je visoko nad nizkim medvedkom.
  const swing = (hunter: { x: number; y: number; z: number }, dx: number, dz: number, targets: ShotTarget[]) => {
    const len = Math.hypot(dx, dz);
    const ray = { ox: hunter.x, oy: hunter.y + HUNTER_EYE, oz: hunter.z, dx: dx / len, dy: 0, dz: dz / len };
    return resolveSwing(world, ray, hunter, targets);
  };

  it('zadene nizek predmet pod lopato, čeprav križ meri naravnost', () => {
    const hunter = { x: 14.0, y: 0, z: 19.6 };
    expect(resolveShot(world, { ox: 14, oy: HUNTER_EYE, oz: 19.6, dx: 0, dy: 0, dz: 1 }, SHOVEL_RANGE, [bearOpen]).kind).not.toBe('player');
    const r = swing(hunter, 0, 1, [bearOpen]);
    expect(r.kind).toBe('player');
    expect(r.target).toBe('medo');
  });

  it('zadene tudi rahlo ob strani (lok), ne pa za hrbtom ali predaleč', () => {
    expect(swing({ x: 14.6, y: 0, z: 19.8 }, 0, 1, [bearOpen]).kind).toBe('player');
    expect(swing({ x: 14.0, y: 0, z: 19.6 }, 0, -1, [bearOpen]).kind).not.toBe('player');
    expect(swing({ x: 14.0, y: 0, z: 18.2 }, 0, 1, [bearOpen]).kind).not.toBe('player');
  });

  it('ne zadene skozi steno', () => {
    const kitchen: ShotTarget = { id: 'k', x: 13.0, y: 0, z: 8.5, yaw: 0, model: propIndex('zoga') };
    expect(swing({ x: 13.0, y: 0, z: 10.4 }, 0, -1, [kitchen]).kind).not.toBe('player');
  });

  it('pravi predmet pod križem ostane zadetek predmeta (kavč ne postane skrivalec)', () => {
    const nearSofa: ShotTarget = { ...bear, x: sofa.x - 1.3, z: 25.4 };
    const hunter = { x: sofa.x - 0.9, y: 0, z: 23.9 };
    const ray = shotAt(sofa.x - 0.9, 0.4, sofa.z, { x: hunter.x, y: HUNTER_EYE, z: hunter.z });
    const r = resolveSwing(world, ray, hunter, [nearSofa]);
    expect(r.kind).toBe('prop');
    expect(r.propIndex).toBe(sofaIdx);
  });
});
