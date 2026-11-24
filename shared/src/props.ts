// Katalog predmetov. Modeli so sestavljeni iz preprostih oblik; iz istih podatkov
// se izračuna tudi hitbox, zato se model in zadetna površina vedno ujemata.

export type Vec3 = [number, number, number];

export type Part =
  | { k: 'box'; s: Vec3; p: Vec3; r?: Vec3; c: number }
  | { k: 'cyl'; rt: number; rb: number; h: number; p: Vec3; r?: Vec3; c: number }
  | { k: 'sph'; rad: number; p: Vec3; sc?: Vec3; c: number }
  /** Vrtenina: profil [polmer, višina] okoli osi Y (sodi, lonci, vedra …). */
  | { k: 'lathe'; pts: [number, number][]; p: Vec3; c: number }
  /** Obroč (npr. guma): R = polmer obroča, t = debelina; leži vodoravno. */
  | { k: 'torus'; R: number; t: number; p: Vec3; c: number };

export interface PropDef {
  id: string;
  name: string;
  parts: Part[];
  /** Polovična širina (X) hitboxa. */
  hx: number;
  /** Polovična globina (Z) hitboxa. */
  hz: number;
  /** Višina hitboxa (od tal). */
  h: number;
}

// Barve
const WOOD_DARK = 0x7a4b24;
const WOOD_MID = 0xa0703c;
const WOOD_LIGHT = 0xc8a165;
const WHITE = 0xf2f2f2;
const OFF_WHITE = 0xe8eef2;
const METAL = 0xb8bcc2;
const DARK = 0x2a2a2a;
const GLASS = 0x2e3d4f;
const CARDBOARD = 0xc49a6c;
/** Profil soda: izbočen trup. */
const BARREL: [number, number][] = [
  [0, 0],
  [0.255, 0],
  [0.28, 0.08],
  [0.3, 0.25],
  [0.305, 0.45],
  [0.3, 0.65],
  [0.28, 0.82],
  [0.255, 0.9],
  [0, 0.9],
];

function box(s: Vec3, p: Vec3, c: number, r?: Vec3): Part {
  return r ? { k: 'box', s, p, c, r } : { k: 'box', s, p, c };
}
function cyl(rt: number, rb: number, h: number, p: Vec3, c: number, r?: Vec3): Part {
  return r ? { k: 'cyl', rt, rb, h, p, c, r } : { k: 'cyl', rt, rb, h, p, c };
}
function sph(rad: number, p: Vec3, c: number, sc?: Vec3): Part {
  return sc ? { k: 'sph', rad, p, c, sc } : { k: 'sph', rad, p, c };
}
function lathe(pts: [number, number][], p: Vec3, c: number): Part {
  return { k: 'lathe', pts, p, c };
}
function torus(R: number, t: number, p: Vec3, c: number): Part {
  return { k: 'torus', R, t, p, c };
}
/** Štiri noge na vogalih (okrogle, rahlo zožene navzdol). */
function legs(sx: number, h: number, ox: number, oz: number, c: number, y0 = 0): Part[] {
  const out: Part[] = [];
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) out.push(cyl(sx / 2, sx * 0.38, h, [dx * ox, y0 + h / 2, dz * oz], c));
  }
  return out;
}

type RawProp = { id: string; name: string; parts: Part[] };

const RAW: RawProp[] = [
  {
    id: 'duh',
    name: 'Duh',
    parts: [
      cyl(0.3, 0.34, 0.3, [0, 0.2, 0], 0xeef3ff),
      sph(0.3, [0, 0.55, 0], 0xeef3ff, [1, 1.1, 1]),
      sph(0.06, [-0.1, 0.62, -0.26], DARK),
      sph(0.06, [0.1, 0.62, -0.26], DARK),
    ],
  },
  {
    id: 'stol',
    name: 'Stol',
    parts: [
      box([0.45, 0.06, 0.45], [0, 0.45, 0], WOOD_LIGHT),
      ...legs(0.05, 0.42, 0.19, 0.19, WOOD_DARK),
      box([0.45, 0.5, 0.05], [0, 0.73, 0.2], WOOD_LIGHT),
    ],
  },
  {
    id: 'miza',
    name: 'Miza',
    parts: [box([1.4, 0.06, 0.8], [0, 0.75, 0], WOOD_MID), ...legs(0.07, 0.72, 0.62, 0.32, WOOD_DARK)],
  },
  {
    id: 'kavc',
    name: 'Kavč',
    parts: [
      ...legs(0.06, 0.05, 0.94, 0.4, DARK),
      box([2.0, 0.25, 0.9], [0, 0.175, 0], 0x4a6fa5),
      box([0.79, 0.16, 0.7], [-0.4, 0.38, -0.07], 0x5b80b8),
      box([0.79, 0.16, 0.7], [0.4, 0.38, -0.07], 0x5b80b8),
      box([2.0, 0.5, 0.2], [0, 0.55, 0.35], 0x4a6fa5),
      box([0.78, 0.38, 0.14], [-0.4, 0.6, 0.2], 0x5b80b8),
      box([0.78, 0.38, 0.14], [0.4, 0.6, 0.2], 0x5b80b8),
      box([0.2, 0.6, 0.9], [-0.9, 0.35, 0], 0x42639a),
      box([0.2, 0.6, 0.9], [0.9, 0.35, 0], 0x42639a),
    ],
  },
  {
    id: 'fotelj',
    name: 'Fotelj',
    parts: [
      ...legs(0.06, 0.05, 0.4, 0.37, DARK),
      box([0.9, 0.25, 0.85], [0, 0.175, 0], 0xa84444),
      box([0.6, 0.15, 0.65], [0, 0.375, -0.07], 0xbd5656),
      box([0.9, 0.55, 0.2], [0, 0.575, 0.325], 0xa84444),
      box([0.15, 0.6, 0.85], [-0.375, 0.35, 0], 0x973c3c),
      box([0.15, 0.6, 0.85], [0.375, 0.35, 0], 0x973c3c),
    ],
  },
  {
    id: 'tv',
    name: 'Televizor',
    parts: [
      box([1.2, 0.5, 0.4], [0, 0.25, 0], WOOD_DARK),
      box([0.25, 0.04, 0.2], [0, 0.52, 0], DARK),
      box([1.1, 0.65, 0.06], [0, 0.88, 0.02], 0x151515),
      box([1.0, 0.56, 0.01], [0, 0.88, -0.015], 0x223344),
    ],
  },
  {
    id: 'polica',
    name: 'Knjižna polica',
    parts: [
      box([0.04, 2.0, 0.35], [-0.48, 1.0, 0], WOOD_MID),
      box([0.04, 2.0, 0.35], [0.48, 1.0, 0], WOOD_MID),
      box([1.0, 2.0, 0.02], [0, 1.0, 0.165], WOOD_DARK),
      box([0.92, 0.03, 0.33], [0, 0.015, 0], WOOD_MID),
      box([0.92, 0.03, 0.33], [0, 0.5, 0], WOOD_MID),
      box([0.92, 0.03, 0.33], [0, 1.0, 0], WOOD_MID),
      box([0.92, 0.03, 0.33], [0, 1.5, 0], WOOD_MID),
      box([0.92, 0.03, 0.33], [0, 1.985, 0], WOOD_MID),
      box([0.3, 0.35, 0.25], [-0.28, 0.205, 0], 0xb83a3a),
      box([0.25, 0.3, 0.25], [0.05, 0.18, 0], 0x3a5ab8),
      box([0.2, 0.38, 0.25], [0.3, 0.22, 0], 0x3a9a4a),
      box([0.4, 0.32, 0.25], [-0.2, 0.675, 0], 0xd9b43a),
      box([0.2, 0.36, 0.25], [0.3, 0.695, 0], 0x7a4a9a),
      box([0.35, 0.34, 0.25], [0.15, 1.185, 0], 0xd9773a),
      box([0.15, 0.3, 0.25], [-0.3, 1.165, 0], 0x3a9a9a),
      box([0.5, 0.3, 0.25], [-0.1, 1.665, 0], 0x9a3a3a),
    ],
  },
  {
    id: 'svetilka',
    name: 'Svetilka',
    parts: [
      lathe([[0, 0], [0.2, 0], [0.2, 0.012], [0.12, 0.035], [0.04, 0.045], [0, 0.045]], [0, 0, 0], 0x444444),
      cyl(0.025, 0.025, 1.4, [0, 0.74, 0], METAL),
      lathe([[0.25, 0], [0.24, 0.03], [0.17, 0.27], [0.15, 0.3], [0.14, 0.3], [0.23, 0.02], [0.24, 0]], [0, 1.35, 0], 0xf3e3b5),
    ],
  },
  {
    id: 'rastlina',
    name: 'Rastlina',
    parts: [
      lathe([[0, 0], [0.14, 0], [0.15, 0.02], [0.185, 0.29], [0.2, 0.3], [0.2, 0.35], [0.18, 0.35], [0.17, 0.31], [0, 0.31]], [0, 0, 0], 0xc0643a),
      cyl(0.18, 0.18, 0.02, [0, 0.34, 0], 0x4a3020),
      sph(0.3, [0, 0.6, 0], 0x3f8f3f, [1, 1.2, 1]),
      sph(0.2, [0.12, 0.85, 0.05], 0x5fb55f),
      sph(0.18, [-0.12, 0.8, -0.08], 0x4fa04f),
    ],
  },
  {
    id: 'skatla',
    name: 'Škatla',
    parts: [box([0.5, 0.4, 0.5], [0, 0.2, 0], CARDBOARD), box([0.1, 0.004, 0.502], [0, 0.398, 0], 0xe0c890)],
  },
  {
    id: 'sod',
    name: 'Sod',
    parts: [
      lathe(BARREL, [0, 0, 0], 0x2f5f9f),
      cyl(0.3, 0.3, 0.04, [0, 0.2, 0], 0x23476f),
      cyl(0.3, 0.3, 0.04, [0, 0.7, 0], 0x23476f),
      cyl(0.24, 0.24, 0.006, [0, 0.9, 0], 0x23476f),
    ],
  },
  {
    id: 'vedro',
    name: 'Vedro',
    parts: [
      lathe([[0, 0], [0.12, 0], [0.155, 0.26], [0.16, 0.28], [0.148, 0.28], [0.115, 0.03], [0, 0.03]], [0, 0, 0], 0xc03a3a),
      cyl(0.112, 0.112, 0.004, [0, 0.033, 0], 0x6a1f1f),
    ],
  },
  {
    id: 'stozec',
    name: 'Prometni stožec',
    parts: [
      box([0.4, 0.04, 0.4], [0, 0.02, 0], 0xd95a10),
      cyl(0.03, 0.15, 0.55, [0, 0.315, 0], 0xff7a1a),
      cyl(0.085, 0.1, 0.08, [0, 0.3, 0], WHITE),
    ],
  },
  {
    id: 'zoga',
    name: 'Žoga',
    parts: [sph(0.2, [0, 0.2, 0], 0xe04040), sph(0.201, [0, 0.2, 0], WHITE, [1, 0.3, 1])],
  },
  {
    id: 'lonec',
    name: 'Lonec',
    parts: [
      lathe([[0, 0], [0.15, 0], [0.175, 0.02], [0.18, 0.06], [0.18, 0.17], [0, 0.17]], [0, 0, 0], METAL),
      lathe([[0, 0], [0.185, 0], [0.17, 0.012], [0.08, 0.03], [0, 0.032]], [0, 0.17, 0], 0x9aa0a6),
      sph(0.03, [0, 0.21, 0], DARK),
      box([0.08, 0.03, 0.04], [-0.22, 0.15, 0], DARK),
      box([0.08, 0.03, 0.04], [0.22, 0.15, 0], DARK),
    ],
  },
  {
    id: 'kos',
    name: 'Koš za smeti',
    parts: [
      lathe([[0, 0], [0.16, 0], [0.17, 0.02], [0.2, 0.58], [0.2, 0.6], [0, 0.6]], [0, 0, 0], 0x3f7f4f),
      lathe([[0, 0], [0.21, 0], [0.21, 0.02], [0.15, 0.04], [0, 0.04]], [0, 0.6, 0], 0x2f5f3a),
    ],
  },
  {
    id: 'blazina',
    name: 'Blazina',
    parts: [box([0.5, 0.1, 0.5], [0, 0.05, 0], 0xe0b040), box([0.42, 0.04, 0.42], [0, 0.12, 0], 0xe8bc50)],
  },
  {
    id: 'mikrovalovna',
    name: 'Mikrovalovna',
    parts: [
      box([0.5, 0.3, 0.36], [0, 0.15, 0], WHITE),
      box([0.34, 0.22, 0.01], [-0.06, 0.15, -0.185], GLASS),
      box([0.1, 0.22, 0.01], [0.19, 0.15, -0.185], 0x9aa0a6),
    ],
  },
  {
    id: 'pralni',
    name: 'Pralni stroj',
    parts: [
      box([0.6, 0.85, 0.6], [0, 0.425, 0], WHITE),
      cyl(0.2, 0.2, 0.03, [0, 0.4, -0.31], 0x8899aa, [Math.PI / 2, 0, 0]),
      box([0.56, 0.1, 0.01], [0, 0.78, -0.305], 0x9aa0a6),
    ],
  },
  {
    id: 'skoljka',
    name: 'Straniščna školjka',
    parts: [
      lathe([[0, 0], [0.13, 0], [0.12, 0.15], [0.19, 0.36], [0.2, 0.4], [0, 0.4]], [0, 0, -0.05], WHITE),
      cyl(0.21, 0.21, 0.03, [0, 0.415, -0.05], 0xe2e2e2),
      box([0.42, 0.4, 0.18], [0, 0.6, 0.2], WHITE),
    ],
  },
  {
    id: 'medvedek',
    name: 'Medvedek',
    parts: [
      sph(0.2, [0, 0.22, 0], 0x9b6b3d, [1, 1.1, 0.9]),
      sph(0.14, [0, 0.52, 0], 0x9b6b3d),
      sph(0.05, [-0.1, 0.64, 0], 0x8a5a30),
      sph(0.05, [0.1, 0.64, 0], 0x8a5a30),
      sph(0.06, [0, 0.5, -0.12], 0xd8b48a),
      sph(0.07, [-0.2, 0.28, -0.03], 0x8a5a30),
      sph(0.07, [0.2, 0.28, -0.03], 0x8a5a30),
      sph(0.07, [-0.1, 0.07, -0.12], 0x8a5a30),
      sph(0.07, [0.1, 0.07, -0.12], 0x8a5a30),
    ],
  },
  {
    id: 'hladilnik',
    name: 'Hladilnik',
    parts: [
      box([0.7, 1.8, 0.65], [0, 0.9, 0], OFF_WHITE),
      box([0.7, 0.015, 0.66], [0, 1.25, 0], 0xb0b8c0),
      box([0.03, 0.3, 0.04], [0.28, 1.45, -0.345], METAL),
      box([0.03, 0.4, 0.04], [0.28, 0.9, -0.345], METAL),
    ],
  },
  {
    id: 'postelja',
    name: 'Postelja',
    parts: [
      ...legs(0.06, 0.05, 0.65, 0.95, WOOD_DARK),
      box([1.4, 0.3, 2.0], [0, 0.2, 0], WOOD_MID),
      box([1.34, 0.15, 1.94], [0, 0.425, 0], WHITE),
      box([1.36, 0.04, 1.3], [0, 0.49, -0.3], 0x6a8fc0),
    ],
  },
  {
    id: 'omara',
    name: 'Omara',
    parts: [
      box([1.2, 2.0, 0.6], [0, 1.0, 0], WOOD_MID),
      box([0.01, 1.9, 0.01], [0, 1.0, -0.305], WOOD_DARK),
      sph(0.025, [-0.06, 1.0, -0.31], METAL),
      sph(0.025, [0.06, 1.0, -0.31], METAL),
    ],
  },
  {
    id: 'pult',
    name: 'Kuhinjski pult',
    parts: [
      box([1.0, 0.86, 0.6], [0, 0.43, 0], 0xf0ece0),
      box([1.02, 0.04, 0.62], [0, 0.88, 0], 0x555555),
      box([0.3, 0.02, 0.02], [0, 0.75, -0.31], METAL),
    ],
  },
  {
    id: 'stedilnik',
    name: 'Štedilnik',
    parts: [
      box([0.6, 0.86, 0.6], [0, 0.43, 0], WHITE),
      box([0.6, 0.04, 0.6], [0, 0.88, 0], 0x1a1a1a),
      cyl(0.08, 0.08, 0.01, [-0.14, 0.905, -0.14], 0x444444),
      cyl(0.08, 0.08, 0.01, [0.14, 0.905, -0.14], 0x444444),
      cyl(0.08, 0.08, 0.01, [-0.14, 0.905, 0.14], 0x444444),
      cyl(0.08, 0.08, 0.01, [0.14, 0.905, 0.14], 0x444444),
      box([0.5, 0.4, 0.01], [0, 0.4, -0.305], GLASS),
    ],
  },
  {
    id: 'kad',
    name: 'Kad',
    parts: [box([1.6, 0.55, 0.75], [0, 0.275, 0], WHITE), box([1.45, 0.02, 0.6], [0, 0.54, 0], 0x9fd0e8)],
  },
  {
    id: 'umivalnik',
    name: 'Umivalnik',
    parts: [
      cyl(0.08, 0.12, 0.7, [0, 0.35, 0.05], WHITE),
      box([0.6, 0.15, 0.45], [0, 0.775, 0], WHITE),
      box([0.04, 0.12, 0.04], [0, 0.91, 0.17], METAL),
    ],
  },
  {
    id: 'delovnamiza',
    name: 'Delovna miza',
    parts: [
      box([2.0, 0.08, 0.7], [0, 0.86, 0], WOOD_MID),
      ...legs(0.08, 0.82, 0.92, 0.3, WOOD_DARK),
      box([1.9, 0.04, 0.6], [0, 0.25, 0], WOOD_LIGHT),
    ],
  },
  {
    id: 'guma',
    name: 'Avtomobilska guma',
    parts: [torus(0.22, 0.11, [0, 0.11, 0], 0x1e1e1e), cyl(0.15, 0.15, 0.16, [0, 0.11, 0], 0x8a8f96)],
  },
  {
    id: 'predalnik',
    name: 'Predalnik',
    parts: [
      box([1.2, 0.8, 0.45], [0, 0.4, 0], WOOD_LIGHT),
      box([1.1, 0.01, 0.01], [0, 0.27, -0.23], WOOD_DARK),
      box([1.1, 0.01, 0.01], [0, 0.53, -0.23], WOOD_DARK),
      sph(0.02, [0, 0.14, -0.235], METAL),
      sph(0.02, [0, 0.4, -0.235], METAL),
      sph(0.02, [0, 0.66, -0.235], METAL),
    ],
  },
  {
    id: 'mizica',
    name: 'Klubska mizica',
    parts: [box([1.0, 0.05, 0.6], [0, 0.4, 0], WOOD_DARK), ...legs(0.05, 0.375, 0.45, 0.25, WOOD_DARK)],
  },
  {
    id: 'nocna',
    name: 'Nočna omarica',
    parts: [box([0.45, 0.5, 0.4], [0, 0.25, 0], WOOD_LIGHT), sph(0.02, [0, 0.35, -0.21], METAL)],
  },

  // ---------------- Gradbišče ----------------
  {
    id: 'paleta',
    name: 'Paleta',
    parts: [
      box([1.2, 0.12, 0.12], [0, 0.06, -0.44], WOOD_DARK),
      box([1.2, 0.12, 0.12], [0, 0.06, 0], WOOD_DARK),
      box([1.2, 0.12, 0.12], [0, 0.06, 0.44], WOOD_DARK),
      box([0.14, 0.03, 1.0], [-0.53, 0.135, 0], WOOD_LIGHT),
      box([0.14, 0.03, 1.0], [-0.265, 0.135, 0], WOOD_LIGHT),
      box([0.14, 0.03, 1.0], [0, 0.135, 0], WOOD_LIGHT),
      box([0.14, 0.03, 1.0], [0.265, 0.135, 0], WOOD_LIGHT),
      box([0.14, 0.03, 1.0], [0.53, 0.135, 0], WOOD_LIGHT),
    ],
  },
  {
    id: 'opeka',
    name: 'Kup opeke',
    parts: [
      box([1.0, 0.12, 0.8], [0, 0.06, 0], WOOD_MID),
      box([0.9, 0.5, 0.7], [0, 0.37, 0], 0xb5523b),
      box([0.92, 0.015, 0.72], [0, 0.25, 0], 0xe0b4a0),
      box([0.92, 0.015, 0.72], [0, 0.37, 0], 0xe0b4a0),
      box([0.92, 0.015, 0.72], [0, 0.49, 0], 0xe0b4a0),
    ],
  },
  {
    id: 'cement',
    name: 'Vreče cementa',
    parts: [
      box([0.45, 0.14, 0.7], [-0.24, 0.07, 0], 0xd6d3c8),
      box([0.45, 0.14, 0.7], [0.24, 0.07, 0], 0xd6d3c8),
      box([0.45, 0.14, 0.7], [0, 0.21, 0], 0xcac6b9),
      box([0.46, 0.05, 0.2], [0, 0.21, 0], 0x2e6da4),
    ],
  },
  {
    id: 'cev',
    name: 'Betonska cev',
    parts: [
      cyl(0.45, 0.45, 1.4, [0, 0.45, 0], 0xa8a39a, [0, 0, Math.PI / 2]),
      cyl(0.33, 0.33, 1.402, [0, 0.45, 0], 0x4f4b45, [0, 0, Math.PI / 2]),
    ],
  },
  {
    id: 'samokolnica',
    name: 'Samokolnica',
    parts: [
      box([0.6, 0.3, 0.6], [0, 0.55, -0.05], 0x3c8d5a),
      cyl(0.18, 0.18, 0.08, [0, 0.18, -0.45], DARK, [0, 0, Math.PI / 2]),
      box([0.04, 0.4, 0.04], [-0.2, 0.2, 0.2], 0x555555),
      box([0.04, 0.4, 0.04], [0.2, 0.2, 0.2], 0x555555),
      box([0.04, 0.04, 0.7], [-0.26, 0.6, 0.42], 0x555555),
      box([0.04, 0.04, 0.7], [0.26, 0.6, 0.42], 0x555555),
    ],
  },
  {
    id: 'zaboj',
    name: 'Lesen zaboj',
    parts: [
      box([0.8, 0.8, 0.8], [0, 0.4, 0], 0xb07a45),
      box([0.82, 0.08, 0.82], [0, 0.04, 0], 0x7a4b24),
      box([0.82, 0.08, 0.82], [0, 0.76, 0], 0x7a4b24),
      box([0.08, 0.8, 0.82], [-0.37, 0.4, 0], 0x8a5a30),
      box([0.08, 0.8, 0.82], [0.37, 0.4, 0], 0x8a5a30),
    ],
  },
  {
    id: 'kanister',
    name: 'Kanister',
    parts: [
      box([0.35, 0.42, 0.22], [0, 0.21, 0], 0xc0392b),
      box([0.2, 0.05, 0.06], [-0.04, 0.445, 0], DARK),
      cyl(0.03, 0.03, 0.08, [0.12, 0.46, 0], DARK),
    ],
  },
  {
    id: 'kolut',
    name: 'Kolut kabla',
    parts: [
      cyl(0.5, 0.5, 0.06, [-0.3, 0.5, 0], WOOD_MID, [0, 0, Math.PI / 2]),
      cyl(0.5, 0.5, 0.06, [0.3, 0.5, 0], WOOD_MID, [0, 0, Math.PI / 2]),
      cyl(0.3, 0.3, 0.54, [0, 0.5, 0], 0x222222, [0, 0, Math.PI / 2]),
    ],
  },
  {
    id: 'zapora',
    name: 'Cestna zapora',
    parts: [
      box([0.08, 0.9, 0.4], [-0.65, 0.45, 0], WHITE),
      box([0.08, 0.9, 0.4], [0.65, 0.45, 0], WHITE),
      box([0.35, 0.18, 0.06], [-0.525, 0.75, 0], 0xd63c3c),
      box([0.35, 0.18, 0.06], [-0.175, 0.75, 0], WHITE),
      box([0.35, 0.18, 0.06], [0.175, 0.75, 0], 0xd63c3c),
      box([0.35, 0.18, 0.06], [0.525, 0.75, 0], WHITE),
      box([0.35, 0.14, 0.06], [-0.525, 0.45, 0], WHITE),
      box([0.35, 0.14, 0.06], [-0.175, 0.45, 0], 0xd63c3c),
      box([0.35, 0.14, 0.06], [0.175, 0.45, 0], WHITE),
      box([0.35, 0.14, 0.06], [0.525, 0.45, 0], 0xd63c3c),
    ],
  },
  {
    id: 'orodje',
    name: 'Škatla za orodje',
    parts: [
      box([0.5, 0.22, 0.25], [0, 0.11, 0], 0xd63c3c),
      box([0.51, 0.02, 0.26], [0, 0.2, 0], 0x7a1f1f),
      box([0.2, 0.04, 0.04], [0, 0.24, 0], DARK),
    ],
  },
  {
    id: 'celada',
    name: 'Zaščitna čelada',
    parts: [
      lathe([[0, 0], [0.2, 0], [0.2, 0.015], [0.15, 0.03], [0.155, 0.1], [0.13, 0.17], [0.08, 0.21], [0, 0.22]], [0, 0, 0], 0xf2c12e),
      cyl(0.03, 0.03, 0.2, [0, 0.13, 0], 0xe8b923, [0, 0, Math.PI / 2]),
    ],
  },
  {
    id: 'barva',
    name: 'Vedro barve',
    parts: [
      lathe([[0, 0], [0.15, 0], [0.165, 0.015], [0.17, 0.29], [0, 0.29]], [0, 0, 0], WHITE),
      cyl(0.172, 0.172, 0.1, [0, 0.15, 0], 0x2e6da4),
      lathe([[0, 0], [0.175, 0], [0.175, 0.018], [0.16, 0.03], [0, 0.03]], [0, 0.29, 0], 0x9aa0a6),
    ],
  },
  {
    id: 'deske',
    name: 'Kup desk',
    parts: [
      box([2.0, 0.08, 0.5], [0, 0.04, 0], WOOD_MID),
      box([2.0, 0.08, 0.5], [0, 0.12, 0], WOOD_LIGHT),
      box([2.0, 0.08, 0.5], [0, 0.2, 0], WOOD_MID),
    ],
  },
  {
    id: 'sodrumen',
    name: 'Rumen sod',
    parts: [
      lathe(BARREL, [0, 0, 0], 0xe8b923),
      cyl(0.3, 0.3, 0.04, [0, 0.2, 0], 0xa67c0f),
      cyl(0.3, 0.3, 0.04, [0, 0.7, 0], 0xa67c0f),
      cyl(0.24, 0.24, 0.006, [0, 0.9, 0], 0xa67c0f),
    ],
  },
  {
    id: 'blok',
    name: 'Betonski blok',
    parts: [
      box([0.8, 0.4, 0.4], [0, 0.2, 0], 0x9a968e),
      box([0.25, 0.004, 0.25], [-0.2, 0.399, 0], 0x5f5b55),
      box([0.25, 0.004, 0.25], [0.2, 0.399, 0], 0x5f5b55),
    ],
  },
  {
    id: 'mesalnik',
    name: 'Mešalnik betona',
    parts: [
      box([0.9, 0.1, 0.6], [0, 0.35, 0], 0x555555),
      ...legs(0.06, 0.35, 0.4, 0.25, 0x555555),
      cyl(0.3, 0.45, 0.7, [0, 0.85, 0], 0xe8742a, [-0.6, 0, 0]),
      cyl(0.2, 0.2, 0.05, [0, 1.15, -0.2], 0x333333, [-0.6, 0, 0]),
    ],
  },
  {
    id: 'pesek',
    name: 'Kup peska',
    parts: [cyl(0.12, 0.9, 0.75, [0, 0.375, 0], 0xe2b57a), cyl(0.5, 0.75, 0.3, [0.15, 0.15, 0.1], 0xd6a86a)],
  },
  {
    id: 'wc',
    name: 'Prenosno stranišče',
    parts: [
      box([1.1, 1.95, 1.1], [0, 0.975, 0], 0x2e6da4),
      box([1.15, 0.05, 1.15], [0, 1.975, 0], 0xdddddd),
      box([0.7, 1.6, 0.01], [0, 0.9, -0.555], 0x4a8ad0),
      box([0.06, 0.12, 0.03], [0.25, 0.9, -0.57], DARK),
    ],
  },
  {
    id: 'tabla',
    name: 'Opozorilna tabla',
    parts: [
      box([0.4, 0.06, 0.4], [0, 0.03, 0], 0x555555),
      box([0.06, 1.2, 0.06], [0, 0.6, 0], 0x888888),
      box([0.62, 0.62, 0.02], [0, 1.3, 0.02], DARK),
      box([0.56, 0.56, 0.03], [0, 1.3, 0], 0xf2c12e),
    ],
  },
];

// ---- Izračun hitboxa iz delov ----

/** Rotacijska matrica (vrstice) za Eulerjeve kote v vrstnem redu XYZ – enako kot Three.js. */
export function eulerMatrix(r: Vec3): number[] {
  const a = Math.cos(r[0]);
  const b = Math.sin(r[0]);
  const c = Math.cos(r[1]);
  const d = Math.sin(r[1]);
  const e = Math.cos(r[2]);
  const f = Math.sin(r[2]);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [c * e, -c * f, d, af + be * d, ae - bf * d, -b * c, bf - ae * d, be + af * d, a * c];
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

export function partBounds(part: Part): Bounds {
  let hx: number;
  let hy: number;
  let hz: number;
  if (part.k === 'box') {
    hx = part.s[0] / 2;
    hy = part.s[1] / 2;
    hz = part.s[2] / 2;
  } else if (part.k === 'lathe') {
    const r = Math.max(...part.pts.map((q) => q[0]));
    const ys = part.pts.map((q) => q[1]);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    return {
      min: [part.p[0] - r, part.p[1] + y0, part.p[2] - r],
      max: [part.p[0] + r, part.p[1] + y1, part.p[2] + r],
    };
  } else if (part.k === 'torus') {
    const r = part.R + part.t;
    return {
      min: [part.p[0] - r, part.p[1] - part.t, part.p[2] - r],
      max: [part.p[0] + r, part.p[1] + part.t, part.p[2] + r],
    };
  } else if (part.k === 'cyl') {
    const r = Math.max(part.rt, part.rb);
    hx = r;
    hy = part.h / 2;
    hz = r;
  } else {
    const sc = part.sc ?? [1, 1, 1];
    hx = part.rad * sc[0];
    hy = part.rad * sc[1];
    hz = part.rad * sc[2];
  }
  const rot = part.k !== 'sph' && part.r ? part.r : null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const m = rot ? eulerMatrix(rot) : null;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        let x = sx * hx;
        let y = sy * hy;
        let z = sz * hz;
        if (m) {
          const nx = m[0]! * x + m[1]! * y + m[2]! * z;
          const ny = m[3]! * x + m[4]! * y + m[5]! * z;
          const nz = m[6]! * x + m[7]! * y + m[8]! * z;
          x = nx;
          y = ny;
          z = nz;
        }
        x += part.p[0];
        y += part.p[1];
        z += part.p[2];
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      }
    }
  }
  return { min, max };
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function buildDef(raw: RawProp): PropDef {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let maxY = 0;
  for (const part of raw.parts) {
    const b = partBounds(part);
    minX = Math.min(minX, b.min[0]);
    maxX = Math.max(maxX, b.max[0]);
    minZ = Math.min(minZ, b.min[2]);
    maxZ = Math.max(maxZ, b.max[2]);
    maxY = Math.max(maxY, b.max[1]);
  }
  return {
    id: raw.id,
    name: raw.name,
    parts: raw.parts,
    hx: round3(Math.max(Math.abs(minX), Math.abs(maxX))),
    hz: round3(Math.max(Math.abs(minZ), Math.abs(maxZ))),
    h: round3(maxY),
  };
}

export const PROPS: readonly PropDef[] = RAW.map(buildDef);

const INDEX_BY_ID = new Map<string, number>(PROPS.map((p, i) => [p.id, i]));

export function propIndex(id: string): number {
  const i = INDEX_BY_ID.get(id);
  if (i === undefined) throw new Error(`Neznan predmet: ${id}`);
  return i;
}

export function propDef(index: number): PropDef | undefined {
  return PROPS[index];
}
