// Mapa "Construction": gradbišče na prostem (48 m x 36 m) s stavbo v gradnji v treh nivojih.
// Skrivalci se lahko spremenijo samo v 5 vrst predmetov; ostali predmeti so okras.
//
//  z=0  +--------+-------------------------------------------------+
//       | lovci  |  stopnice Z -> [ODER (3 m)] <- stopnice S (na 6 m)  žerjav
//  z=8  +--[ ]---+                 |                                |
//  z=10 |                +-------STAVBA--------+   [zabojnik]       |
//       |                | pritličje / 3 m /   |   [zabojnik]       |
//       |                | streha 6 m          |                    |
//  z=21 |  +--opečnata--+|                     |=most= [STOLP 3 m] <- stopnice
//  z=26 |  |  stavba    |+--------------------+                    |
//       |  |            |  stopnice J    [zab.]   skladišče         |
//  z=36 +--+------------+-------------------------------------------+
//      x=0              18                  34                      48

import type { DecorDef, MapDef, SolidDef } from './types';
import { p, solid, wallX, wallZ } from './types';

const FENCE = 0xe07a5f;
const PEN = 0x4f7cac;
const PLANK = 0xc98a4b;
const PLANK2 = 0xdba468;
const POLE = 0xe6c229;
const RAIL = 0x5fae4f;
const BRICK = 0xc4673f;
const PILLAR = 0xf1d9b5;
const SLAB = 0xbdb8ae;
const COLUMN = 0xd9d3c6;
const STRIPE = 0xffd23f;

const L1 = 3.0; // višina 1. nadstropja
const L2 = 6.0; // višina strehe

function hide(list: SolidDef[]): SolidDef[] {
  return list.map((s) => ({ ...s, hidden: true }));
}

const solids: SolidDef[] = [];
const stripes: DecorDef[] = [];

// ---------------------------------------------------------------- ograja (meja)
solids.push(
  ...wallX(0, -0.15, 48.15, [], 0.3, 3, FENCE),
  ...wallX(36, -0.15, 48.15, [], 0.3, 3, FENCE),
  ...wallZ(0, 0, 36, [], 0.3, 3, FENCE),
  ...wallZ(48, 0, 36, [], 0.3, 3, FENCE),
  // Nevidni višji del, da nihče ne skoči čez.
  ...hide(wallX(0, -0.15, 48.15, [], 0.3, 17, FENCE, 3)),
  ...hide(wallX(36, -0.15, 48.15, [], 0.3, 17, FENCE, 3)),
  ...hide(wallZ(0, 0, 36, [], 0.3, 17, FENCE, 3)),
  ...hide(wallZ(48, 0, 36, [], 0.3, 17, FENCE, 3)),
);

// ---------------------------------------------------------------- soba lovcev (s streho; vrata se odprejo ob lovu)
solids.push(
  ...wallZ(9, 0, 8, [[5.5, 7.5]], 0.2, 3, PEN),
  ...wallX(8, 0, 9, [[3, 5]], 0.2, 3, PEN),
  solid(0.3, 0, 0.3, 6.3, 2.6, 2.7, 0x7fa7c9),
  solid(0, 3, 0, 9.1, 3.2, 8.1, 0x3f668f),
);
const GATE = 0xf2b01e;
const gates: SolidDef[] = [solid(8.9, 0, 5.5, 9.1, 3, 7.5, GATE), solid(3, 0, 7.9, 5, 3, 8.1, GATE)];

// ---------------------------------------------------------------- pomočniki
/** Ograja (0.1 m debela, 1 m visoka) na višini y. */
function railX(z0: number, z1: number, x0: number, x1: number, y: number): void {
  solids.push(solid(x0, y, z0, x1, y + 1, z1, RAIL));
}

/**
 * Stopnice: stopnice po 0.25 m (0.5 m globoke) od baseY do topY.
 * edge = rob zgornjega nivoja; smer = kam se stopnice spuščajo.
 */
function stairs(dir: 'x-' | 'x+' | 'z-' | 'z+', a0: number, a1: number, edge: number, baseY: number, topY: number): void {
  const n = Math.round((topY - baseY) / 0.25) - 1;
  for (let k = 1; k <= n; k++) {
    const top = baseY + 0.25 * k;
    const near = (n - k) * 0.5;
    const far = (n + 1 - k) * 0.5;
    const color = k % 2 ? PLANK2 : PLANK;
    const sy = top + 0.006;
    if (dir === 'x-') {
      solids.push(solid(edge - far, baseY, a0, edge - near, top, a1, color));
      stripes.push({ s: [0.08, 0.012, a1 - a0], p: [edge - far + 0.04, sy, (a0 + a1) / 2], c: STRIPE });
    } else if (dir === 'x+') {
      solids.push(solid(edge + near, baseY, a0, edge + far, top, a1, color));
      stripes.push({ s: [0.08, 0.012, a1 - a0], p: [edge + far - 0.04, sy, (a0 + a1) / 2], c: STRIPE });
    } else if (dir === 'z+') {
      solids.push(solid(a0, baseY, edge + near, a1, top, edge + far, color));
      stripes.push({ s: [a1 - a0, 0.012, 0.08], p: [(a0 + a1) / 2, sy, edge + far - 0.04], c: STRIPE });
    } else {
      solids.push(solid(a0, baseY, edge - far, a1, top, edge - near, color));
      stripes.push({ s: [a1 - a0, 0.012, 0.08], p: [(a0 + a1) / 2, sy, edge - far + 0.04], c: STRIPE });
    }
  }
}

/** Rumen rob plošče/odra (samo okras). */
function edgeStripes(x0: number, z0: number, x1: number, z1: number, y: number): void {
  stripes.push({ s: [x1 - x0, 0.1, 0.02], p: [(x0 + x1) / 2, y, z0 - 0.011], c: STRIPE });
  stripes.push({ s: [x1 - x0, 0.1, 0.02], p: [(x0 + x1) / 2, y, z1 + 0.011], c: STRIPE });
  stripes.push({ s: [0.02, 0.1, z1 - z0], p: [x0 - 0.011, y, (z0 + z1) / 2], c: STRIPE });
  stripes.push({ s: [0.02, 0.1, z1 - z0], p: [x1 + 0.011, y, (z0 + z1) / 2], c: STRIPE });
}

// ---------------------------------------------------------------- stavba v gradnji (x 18-34, z 10-26)
// Pritličje: opečnati zidovi z vhodi
solids.push(
  ...wallZ(18, 10, 26, [
    [12, 14],
    [21, 23],
  ], 0.3, L1 - 0.25, BRICK),
  ...wallX(10, 18, 34, [[24, 28]], 0.3, L1 - 0.25, BRICK),
  ...wallZ(34, 10, 26, [
    [13, 15],
    [20, 22],
  ], 0.3, L1 - 0.25, BRICK),
  ...wallX(26, 18, 34, [[24, 28]], 0.3, L1 - 0.25, BRICK),
);
// Plošči 1. nadstropja in strehe
solids.push(solid(18, L1 - 0.25, 10, 34, L1, 26, SLAB), solid(18, L2 - 0.25, 10, 34, L2, 26, SLAB));
edgeStripes(18, 10, 34, 26, L1 - 0.125);
edgeStripes(18, 10, 34, 26, L2 - 0.125);
// Stebri (pritličje in 1. nadstropje)
for (const cx of [18, 26, 34]) {
  for (const cz of [10, 18, 26]) {
    solids.push(solid(cx - 0.25, 0, cz - 0.25, cx + 0.25, L1 - 0.25, cz + 0.25, COLUMN));
    solids.push(solid(cx - 0.25, L1, cz - 0.25, cx + 0.25, L2 - 0.25, cz + 0.25, COLUMN));
  }
}
// 1. nadstropje: predelne stene in ograje ob robovih (odprtine za oder, stopnice in most)
solids.push(
  ...wallX(18, 18, 30, [[22, 24]], 0.3, L2 - 0.25 - L1, BRICK, L1),
  ...wallZ(26, 18, 26, [[21, 23]], 0.3, L2 - 0.25 - L1, BRICK, L1),
);
railX(10, 10.1, 18, 22, L1);
railX(10, 10.1, 30, 34, L1);
railX(25.9, 26, 18, 20, L1);
railX(25.9, 26, 22, 34, L1);
solids.push(solid(18, L1, 10.1, 18.1, L1 + 1, 25.9, RAIL));
// Odprtina za dvigalo (z 14.5-16.5) v vzhodni ograji 1. nadstropja in strehe
solids.push(solid(33.9, L1, 10.1, 34, L1 + 1, 14.5, RAIL));
solids.push(solid(33.9, L1, 16.5, 34, L1 + 1, 22, RAIL));
solids.push(solid(33.9, L1, 24, 34, L1 + 1, 25.9, RAIL));
// Streha: ograja okoli, odprtina za stopnice na severu (x 27-29)
railX(10, 10.1, 18, 27, L2);
railX(10, 10.1, 29, 34, L2);
railX(25.9, 26, 18, 34, L2);
solids.push(solid(18, L2, 10.1, 18.1, L2 + 1, 25.9, RAIL));
solids.push(solid(33.9, L2, 10.1, 34, L2 + 1, 14.5, RAIL));
solids.push(solid(33.9, L2, 16.5, 34, L2 + 1, 25.9, RAIL));

// ---------------------------------------------------------------- 3. nadstropje (9 m) nad zahodno polovico
const L3 = 9.0;
solids.push(solid(18, L3 - 0.25, 10, 26, L3, 26, SLAB));
edgeStripes(18, 10, 26, 26, L3 - 0.125);
for (const cx of [18, 26]) {
  for (const cz of [10, 18, 26]) solids.push(solid(cx - 0.25, L2, cz - 0.25, cx + 0.25, L3 - 0.25, cz + 0.25, COLUMN));
}
railX(10, 10.1, 18, 26, L3);
railX(25.9, 26, 18, 26, L3);
solids.push(solid(18, L3, 10.1, 18.1, L3 + 1, 25.9, RAIL));
solids.push(solid(25.9, L3, 10.1, 26, L3 + 1, 12, RAIL));
solids.push(solid(25.9, L3, 14, 26, L3 + 1, 25.9, RAIL));
stairs('x+', 12, 14, 26, L2, L3); // streha -> 3. nadstropje

// ---------------------------------------------------------------- severni oder (3 m) in stopnice
solids.push(solid(22, L1 - 0.25, 4, 30, L1, 10, PLANK));
for (const px of [22.1, 26, 29.9]) {
  for (const pz of [4.1, 9.6]) solids.push(solid(px - 0.1, 0, pz - 0.1, px + 0.1, L1 - 0.25, pz + 0.1, POLE));
}
edgeStripes(22, 4, 30, 10, L1 - 0.125);
railX(4, 4.1, 22, 30, L1);
solids.push(solid(29.9, L1, 4.1, 30, L1 + 1, 10, RAIL));
solids.push(solid(22, L1, 4.1, 22.1, L1 + 1, 5, RAIL));
solids.push(solid(22, L1, 7, 22.1, L1 + 1, 10, RAIL));
stairs('x-', 5, 7, 22, 0, L1); // tla -> oder (zahod)
stairs('z-', 27, 29, 10, L1, L2); // oder -> streha

// Južne stopnice: tla -> 1. nadstropje
stairs('z+', 20, 22, 26, 0, L1);

// ---------------------------------------------------------------- vzhodni stolp (3 m) z mostom do stavbe
solids.push(solid(36, L1 - 0.25, 20, 42, L1, 26, PLANK));
solids.push(solid(34, L1 - 0.25, 22, 36, L1, 24, PLANK2));
for (const px of [36.1, 39, 41.9]) {
  for (const pz of [20.1, 25.9]) solids.push(solid(px - 0.1, 0, pz - 0.1, px + 0.1, L1 - 0.25, pz + 0.1, POLE));
}
edgeStripes(36, 20, 42, 26, L1 - 0.125);
railX(21.9, 22, 34, 36, L1);
railX(24, 24.1, 34, 36, L1);
railX(20, 20.1, 36, 42, L1);
railX(25.9, 26, 36, 42, L1);
solids.push(solid(36, L1, 20.1, 36.1, L1 + 1, 22, RAIL));
solids.push(solid(36, L1, 24, 36.1, L1 + 1, 25.9, RAIL));
solids.push(solid(41.9, L1, 20.1, 42, L1 + 1, 21, RAIL));
solids.push(solid(41.9, L1, 23, 42, L1 + 1, 25.9, RAIL));
stairs('x+', 21, 23, 42, 0, L1);

// ---------------------------------------------------------------- opečnata stavba (en nivo, okna)
const bw = (z: number, x0: number, x1: number, gaps: [number, number][], h = 3, y0 = 0): SolidDef[] =>
  wallX(z, x0, x1, gaps, 0.3, h, BRICK, y0);
const bz = (x: number, z0: number, z1: number, gaps: [number, number][], h = 3, y0 = 0): SolidDef[] =>
  wallZ(x, z0, z1, gaps, 0.3, h, BRICK, y0);
const winX = (z: number, x0: number, x1: number): SolidDef[] => [...bw(z, x0, x1, [], 1.0), ...bw(z, x0, x1, [], 0.8, 2.2)];
const winZ = (x: number, z0: number, z1: number): SolidDef[] => [...bz(x, z0, z1, [], 1.0), ...bz(x, z0, z1, [], 0.8, 2.2)];
solids.push(
  ...bw(21, 3, 17, [
    [4.5, 6],
    [7, 9],
    [13, 14.5],
  ]),
  ...winX(21, 4.5, 6),
  ...winX(21, 13, 14.5),
  ...bw(33, 3, 17, [
    [6, 7.5],
    [12, 13.5],
  ]),
  ...winX(33, 6, 7.5),
  ...winX(33, 12, 13.5),
  ...bz(3, 21, 33, [[26, 28]]),
  ...bz(17, 21, 33, [
    [24, 25.5],
    [29, 31],
  ]),
  ...winZ(17, 24, 25.5),
  ...bz(10, 21, 33, [[26, 28]]),
);
for (const [x, z] of [
  [3, 21],
  [17, 21],
  [3, 33],
  [17, 33],
  [10, 21],
  [10, 33],
] as const) {
  solids.push(solid(x - 0.35, 0, z - 0.35, x + 0.35, 3.4, z + 0.35, PILLAR));
}

// ---------------------------------------------------------------- zabojniki in žerjav
solids.push(
  solid(38, 0, 9.5, 44, 2.6, 11.9, 0xc0392b),
  solid(38, 0, 13, 44, 2.6, 15.4, 0x2e6da4),
  // Bager: gosenici, telo, kabina, protiutež
  solid(24.4, 0, 27, 27.0, 0.9, 28.2, 0x333333),
  solid(24.4, 0, 31.8, 27.0, 0.9, 33, 0x333333),
  solid(24.6, 0.9, 28.0, 26.8, 2.2, 32.0, 0xf2b01e),
  solid(24.8, 2.2, 28.3, 26.4, 3.6, 29.8, 0xf2b01e),
  solid(24.6, 2.2, 31.0, 26.8, 2.9, 32.0, 0x555555),
  // Kupa jeklenih nosilcev
  solid(11, 0, 3.2, 16, 0.5, 4.0, 0x8a8f96),
  solid(36.5, 0, 25.5, 41.5, 0.4, 26.3, 0x8a8f96),
  solid(40, 0, 0.6, 43, 1.0, 3.6, 0xb5b0a5),
  solid(41, 1.0, 1.6, 42, 18, 2.6, 0xd63c3c),
);

const decor: DecorDef[] = [
  ...stripes,
  // Betonska tla stavb
  { s: [14.6, 0.01, 12.6], p: [10, 0.005, 27], c: 0xd8cbb8 },
  { s: [15.7, 0.01, 15.7], p: [26, 0.005, 18], c: 0xcfc9bd },
  // Pisarna: okna in vrata
  { s: [1.2, 0.8, 0.02], p: [1.8, 1.5, 2.71], c: 0xbfe3f5 },
  { s: [1.2, 0.8, 0.02], p: [3.6, 1.5, 2.71], c: 0xbfe3f5 },
  { s: [0.8, 2.0, 0.02], p: [5.4, 1.0, 2.71], c: 0x355f8a },
  // Vrata zabojnikov
  { s: [0.02, 2.4, 2.2], p: [44.01, 1.3, 10.7], c: 0x922b21 },
  { s: [0.02, 2.4, 2.2], p: [44.01, 1.3, 14.2], c: 0x1f4f7a },
  // Bager: okno kabine, roka in žlica
  { s: [0.02, 0.9, 1.1], p: [24.79, 3.0, 29.05], c: 0xbfe3f5 },
  { s: [0.5, 0.5, 1.7], p: [25.6, 3.4, 27.15], c: 0xf2b01e },
  { s: [0.5, 2.6, 0.4], p: [25.6, 2.1, 26.55], c: 0xf2b01e },
  { s: [1.2, 0.7, 0.5], p: [25.6, 0.45, 26.55], c: 0x555555 },
  // Jašek dvigala: stebri in prečka (samo okras)
  ...[
    [34.2, 14.5],
    [36.05, 14.5],
    [34.2, 16.5],
    [36.05, 16.5],
  ].map(([x, z]): DecorDef => ({ s: [0.1, 7.6, 0.1], p: [x!, 3.8, z!], c: 0x2e6da4 })),
  { s: [2.0, 0.15, 0.1], p: [35.12, 7.55, 14.5], c: 0x2e6da4 },
  { s: [2.0, 0.15, 0.1], p: [35.12, 7.55, 16.5], c: 0x2e6da4 },
  // Robovi nosilcev
  { s: [5.02, 0.06, 0.82], p: [13.5, 0.25, 3.6], c: 0x5f646b },
  // Žerjav: roka, protiutež, kabina, vrv in kavelj, beli pasovi na stebru
  { s: [26, 0.6, 0.6], p: [33, 17.3, 2.1], c: 0xd63c3c },
  { s: [1.6, 1.2, 1.0], p: [45, 16.6, 2.1], c: 0x777777 },
  { s: [1.4, 1.3, 1.4], p: [41.5, 15.9, 2.9], c: 0xf2c12e },
  { s: [0.05, 9, 0.05], p: [28, 12.5, 2.1], c: 0x333333 },
  { s: [0.4, 0.5, 0.4], p: [28, 7.8, 2.1], c: 0xf2c12e },
  ...[4, 8, 12, 16].map((y): DecorDef => ({ s: [1.02, 0.3, 1.02], p: [41.5, y, 2.1], c: 0xffffff })),
  // Pasovi na ograji
  ...[6, 18, 30, 42].map((x): DecorDef => ({ s: [3, 0.25, 0.02], p: [x, 2.5, 0.16], c: 0xffffff })),
  ...[6, 18, 30, 42].map((x): DecorDef => ({ s: [3, 0.25, 0.02], p: [x, 2.5, 35.84], c: 0xffffff })),
];

export const CONSTRUCTION: MapDef = {
  id: 'construction',
  name: 'Construction',
  width: 48,
  depth: 36,
  height: 12,
  outdoor: true,
  lighting: { hemiSky: 0xe6f2ff, hemiGround: 0xb98a5c, hemi: 1.7, sun: 2.4, sunColor: 0xffffff },
  sky: [0x3d8fe0, 0xcfe8ff],
  clouds: true,
  fog: [0xd6ebff, 70, 170],
  transformable: ['sodrumen', 'zaboj', 'stozec', 'kolut', 'cement', 'opeka'],
  gates,
  elevator: { x0: 34.2, z0: 14.6, x1: 36.0, z1: 16.4, stops: [0, L1, L2] },
  solids,
  floors: [{ name: 'Gradbišče', x0: 0, z0: 0, x1: 48, z1: 36, color: 0xf2c591, color2: 0xe3ae74, tile: 2 }],
  props: [
    // --- Ograda lovcev ---
    p('stozec', 8.3, 1.0),
    p('stozec', 8.3, 2.0),
    p('kanister', 7.5, 0.6),
    p('tabla', 7.8, 3.5),

    // --- Sever ---
    p('deske', 12.0, 2.0),
    p('zaboj', 15.0, 1.0),
    p('zaboj', 15.85, 1.0),
    p('zaboj', 15.0, 1.0, 0, 0.8),
    p('sodrumen', 19.0, 1.0),
    p('sodrumen', 19.65, 1.0),
    p('sodrumen', 19.0, 1.65),
    p('opeka', 25.0, 2.0),
    p('opeka', 26.2, 2.0),
    p('kolut', 29.0, 2.0),
    p('cev', 33.0, 1.5),
    p('cev', 33.0, 2.5),
    p('cev', 33.0, 2.0, 0, 0.9),
    p('stozec', 36.0, 1.0),
    p('stozec', 37.0, 1.0),
    p('cement', 45.5, 1.5),
    p('samokolnica', 46.5, 5.0),

    // --- Zahodno dvorišče ---
    p('sodrumen', 10.0, 9.0),
    p('sodrumen', 10.65, 9.0),
    p('sodrumen', 10.0, 9.65),
    p('zapora', 12.5, 9.0),
    p('zaboj', 15.0, 9.0),
    p('zaboj', 15.0, 9.85),
    p('wc', 10.0, 14.0),
    p('wc', 11.3, 14.0),
    p('kolut', 13.5, 12.0),
    p('cement', 16.0, 12.5),
    p('pesek', 14.0, 16.5),
    p('stozec', 12.0, 17.0),
    p('stozec', 16.5, 18.5),
    p('paleta', 10.5, 18.0),
    p('cement', 10.5, 18.0, 0, 0.15),
    p('sodrumen', 16.8, 15.0),
    p('blok', 12.0, 19.8),
    p('blok', 12.85, 19.8),

    // --- Pod severnim odrom ---
    p('sodrumen', 23.0, 5.0),
    p('sodrumen', 23.65, 5.0),
    p('paleta', 28.5, 6.0),
    p('zaboj', 28.5, 6.0, 0, 0.15),
    p('kolut', 25.0, 8.5),
    // --- Na severnem odru (3 m) ---
    p('stozec', 23.5, 4.6, 0, L1),
    p('sodrumen', 29.5, 4.7, 0, L1),
    p('kanister', 24.0, 9.5, 0, L1),

    // --- Stavba: pritličje ---
    p('zaboj', 20.0, 11.5),
    p('zaboj', 20.85, 11.5),
    p('zaboj', 20.0, 11.5, 0, 0.8),
    p('cement', 31.5, 11.5),
    p('mesalnik', 30.0, 15.0),
    p('sodrumen', 22.0, 16.0),
    p('sodrumen', 22.65, 16.0),
    p('sodrumen', 22.0, 16.65),
    p('opeka', 24.0, 22.0),
    p('opeka', 25.2, 22.0),
    p('kolut', 29.5, 21.0),
    p('stozec', 32.5, 24.5),
    p('stozec', 31.5, 24.8),
    p('deske', 21.0, 24.8),
    p('zaboj', 32.8, 17.0),
    p('blok', 27.5, 13.0),
    p('stozec', 24.0, 11.5),

    // --- Stavba: 1. nadstropje (3 m) ---
    p('sodrumen', 19.0, 11.0, 0, L1),
    p('sodrumen', 19.65, 11.0, 0, L1),
    p('zaboj', 24.0, 12.0, 0, L1),
    p('stozec', 30.0, 11.0, 0, L1),
    p('stozec', 31.0, 11.0, 0, L1),
    p('tabla', 28.0, 16.5, 0, L1),
    p('cement', 20.0, 16.5, 0, L1),
    p('kolut', 32.5, 14.0, 0, L1),
    p('zaboj', 19.0, 19.0, 0, L1),
    p('zaboj', 19.0, 19.85, 0, L1),
    p('orodje', 23.0, 20.0, 0, L1),
    p('sodrumen', 24.8, 24.8, 0, L1),
    p('stozec', 19.0, 24.5, 0, L1),
    p('celada', 22.5, 22.5, 0, L1),
    p('cement', 28.0, 19.5, 0, L1),
    p('zaboj', 32.5, 19.0, 0, L1),
    p('barva', 27.0, 25.0, 0, L1),
    p('kolut', 30.5, 23.0, 0, L1),
    p('sodrumen', 33.0, 25.0, 0, L1),

    // --- Stavba: streha (6 m) ---
    p('sodrumen', 19.5, 12.0, 0, L2),
    p('sodrumen', 20.15, 12.0, 0, L2),
    p('zaboj', 23.0, 15.0, 0, L2),
    p('kolut', 30.0, 16.5, 0, L2),
    // --- 3. nadstropje (9 m) ---
    p('sodrumen', 19.0, 11.0, 0, 9),
    p('zaboj', 22.0, 17.0, 0, 9),
    p('opeka', 20.0, 22.0, 0, 9),
    p('stozec', 24.5, 24.5, 0, 9),
    p('cement', 23.5, 11.5, 0, 9),
    p('celada', 19.5, 25.0, 0, 9),
    p('cement', 27.0, 20.0, 0, L2),
    p('stozec', 20.0, 24.0, 0, L2),
    p('stozec', 32.0, 24.5, 0, L2),
    p('deske', 25.0, 24.0, 0, L2),
    p('sod', 31.0, 18.0, 0, L2),
    p('zaboj', 31.0, 21.5, 0, L2),

    // --- Vzhod ---
    p('sodrumen', 45.5, 9.0),
    p('sodrumen', 46.15, 9.0),
    p('sodrumen', 45.5, 9.65),
    p('sodrumen', 46.15, 9.65),
    p('wc', 46.9, 13.0),
    p('wc', 46.9, 14.3),
    p('zaboj', 36.0, 12.0),
    p('zaboj', 36.0, 12.85),
    p('zapora', 36.8, 17.2, 1),
    p('stozec', 40.0, 17.5),
    p('stozec', 41.0, 17.5),
    p('kolut', 44.5, 18.0),
    p('tabla', 37.0, 7.5),
    p('zaboj', 34.5, 8.0),
    p('sodrumen', 42.5, 6.0),

    // --- Stolp (3 m) in pod njim ---
    p('zaboj', 37.0, 21.0, 0, L1),
    p('cement', 40.5, 25.0, 0, L1),
    p('stozec', 41.0, 21.0, 0, L1),
    p('deske', 39.0, 23.0, 0, L1),
    p('sodrumen', 38.0, 22.0),
    p('sodrumen', 38.65, 22.0),
    p('opeka', 40.5, 24.5),

    // --- Jug in skladišče ---
    p('paleta', 31.0, 29.0),
    p('opeka', 32.5, 29.0),
    p('cev', 35.0, 28.5),
    p('cev', 35.0, 29.5),
    p('cev', 35.0, 29.0, 0, 0.9),
    p('kolut', 38.0, 29.0),
    p('kolut', 39.0, 29.0),
    p('mesalnik', 42.0, 29.0),
    p('sodrumen', 46.5, 27.5),
    p('sodrumen', 46.5, 28.15),
    p('sodrumen', 45.85, 27.5),
    p('guma', 44.0, 32.0),
    p('guma', 44.0, 32.0, 0, 0.224),
    p('guma', 44.7, 32.6),
    p('zaboj', 31.5, 34.5),
    p('zaboj', 32.35, 34.5),
    p('zaboj', 31.5, 34.5, 0, 0.8),
    p('deske', 38.0, 34.8),
    p('cement', 41.0, 34.5),
    p('pesek', 46.0, 34.0),
    p('stozec', 28.5, 28.0),
    p('stozec', 28.5, 33.5),
    p('samokolnica', 23.5, 30.0),
    p('sodrumen', 23.5, 34.0),
    p('sodrumen', 23.5, 34.65),
    p('blok', 19.0, 34.5),
    p('stozec', 18.5, 31.5),

    // --- Opečnata stavba (zahodni prostor) ---
    p('opeka', 4.2, 22.5),
    p('cement', 4.0, 31.5),
    p('mesalnik', 7.0, 27.0),
    p('samokolnica', 5.0, 25.0, 1),
    p('deske', 6.5, 32.3),
    p('sodrumen', 9.2, 21.8),
    p('zaboj', 8.5, 31.8),
    p('celada', 6.0, 22.0),
    p('stozec', 4.0, 28.5),
    // --- Opečnata stavba (vzhodni prostor) ---
    p('kolut', 12.0, 23.0),
    p('opeka', 15.5, 31.5),
    p('blok', 13.5, 28.0),
    p('barva', 16.4, 22.0),
    p('zaboj', 11.0, 31.8),
    p('pesek', 14.5, 25.0),
    p('tabla', 12.0, 26.5),
    p('sodrumen', 16.3, 28.0),
  ],
  decor,
  hunterSpawns: [
    [2.5, 5.0],
    [4.5, 5.0],
    [6.5, 5.0],
    [4.5, 6.8],
  ],
  propSpawns: [
    [12.0, 11.0],
    [11.0, 16.0],
    [20.5, 3.0],
    [35.0, 6.0],
    [25.0, 13.5],
    [28.0, 19.5],
    [40.0, 7.0],
    [45.0, 16.5],
    [28.5, 30.5],
    [38.0, 31.5],
    [19.5, 33.0],
  ],
};
