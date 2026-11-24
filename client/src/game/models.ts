// Gradnja 3D modelov iz podatkov kataloga (vsak predmet = ena geometrija z barvami oglišč).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PROPS, type Part } from '../../../shared/src/index';

export const VERTEX_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true });

const tmpColor = new THREE.Color();

/**
 * Kvader z zaobljenimi robovi (mehkejši, manj "kockast" videz). Zelo tanki deli
 * (črte, okna) ostanejo ostri.
 */
export function roundedBox(w: number, h: number, d: number, maxRadius = 0.06): THREE.BufferGeometry {
  const min = Math.min(w, h, d);
  if (min < 0.025) return new THREE.BoxGeometry(w, h, d);
  const r = Math.min(maxRadius, min * 0.28);
  return new RoundedBoxGeometry(w, h, d, 1, r);
}

function partGeometry(part: Part): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (part.k === 'box') {
    g = roundedBox(part.s[0], part.s[1], part.s[2]);
  } else if (part.k === 'cyl') {
    const seg = Math.max(part.rt, part.rb) > 0.15 ? 24 : 14;
    g = new THREE.CylinderGeometry(part.rt, part.rb, part.h, seg);
  } else if (part.k === 'lathe') {
    g = new THREE.LatheGeometry(
      part.pts.map(([r, y]) => new THREE.Vector2(r, y)),
      24,
    );
  } else if (part.k === 'torus') {
    g = new THREE.TorusGeometry(part.R, part.t, 12, 28);
    g.rotateX(Math.PI / 2);
  } else {
    g = new THREE.SphereGeometry(part.rad, 16, 11);
    if (part.sc) g.scale(part.sc[0], part.sc[1], part.sc[2]);
  }
  const rot = (part.k === 'box' || part.k === 'cyl') && part.r ? part.r : null;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ'));
  m.compose(new THREE.Vector3(part.p[0], part.p[1], part.p[2]), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return withColor(g, part.c);
}

/** Doda atribut barve (Three.js barve pretvori v linearni prostor). */
export function withColor(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  tmpColor.setHex(hex);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function mergeParts(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Vsi deli morajo biti enaki: z indeksi ali brez; poenotimo in obdržimo samo skupne atribute.
  const anyNonIndexed = geos.some((g) => !g.index);
  const parts = geos.map((g) => {
    const n = anyNonIndexed && g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') n.deleteAttribute(name);
    }
    return n;
  });
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('Združevanje geometrije ni uspelo');
  merged.computeBoundingSphere();
  return merged;
}

const propCache = new Map<number, THREE.BufferGeometry>();

/**
 * Navpično senčenje: spodnji del temnejši, zgornji svetlejši. Daje več kontrasta
 * in globine brez senc (ki bi bile na telefonu predrage).
 */
export function shadeByHeight(g: THREE.BufferGeometry, y0: number, y1: number, fMin: number): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const span = Math.max(1e-3, y1 - y0);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / span));
    const f = fMin + (1 - fMin) * k;
    col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
  }
  col.needsUpdate = true;
  return g;
}

export function propGeometry(type: number): THREE.BufferGeometry {
  let g = propCache.get(type);
  if (!g) {
    const def = PROPS[type] ?? PROPS[0]!;
    g = shadeByHeight(mergeParts(def.parts.map(partGeometry)), 0, Math.max(0.3, def.h), 0.72);
    propCache.set(type, g);
  }
  return g;
}

export function propMesh(type: number): THREE.Mesh {
  return new THREE.Mesh(propGeometry(type), VERTEX_MATERIAL);
}

// ---------------------------------------------------------------- lovec


function box(w: number, h: number, d: number, x: number, y: number, z: number, c: number): THREE.BufferGeometry {
  const g = roundedBox(w, h, d, 0.04);
  g.translate(x, y, z);
  return withColor(g, c);
}

interface HunterGeos {
  body: THREE.BufferGeometry;
  leg: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
  sleeve: THREE.BufferGeometry;
  shovel: THREE.BufferGeometry;
}
let hunterGeos: HunterGeos | null = null;

function hunterGeometries(): HunterGeos {
  if (!hunterGeos) {
    const head = new THREE.SphereGeometry(0.17, 14, 10);
    head.translate(0, 1.5, 0);
    const cap = new THREE.CylinderGeometry(0.18, 0.18, 0.08, 14);
    cap.translate(0, 1.63, 0);
    const visor = new THREE.BoxGeometry(0.22, 0.03, 0.14);
    visor.translate(0, 1.6, -0.2);
    hunterGeos = {
      // Trup in glava (noge in roke so posebej, da se lahko premikajo)
      body: mergeParts([
        box(0.46, 0.55, 0.26, 0, 1.07, 0, 0x3d6b4a),
        box(0.4, 0.08, 0.24, 0, 0.82, 0, 0x2a2f3a),
        withColor(head, 0xf0c8a0),
        withColor(cap, 0xc0392b),
        withColor(visor, 0xc0392b),
        box(0.05, 0.05, 0.02, -0.06, 1.53, -0.165, 0x222222),
        box(0.05, 0.05, 0.02, 0.06, 1.53, -0.165, 0x222222),
      ]),
      // Noga: vrtišče v kolku (y 0.8), visi navzdol
      leg: mergeParts([box(0.16, 0.7, 0.2, 0, -0.35, 0, 0x2d3a5a), box(0.17, 0.1, 0.28, 0, -0.75, -0.04, 0x1d1d1d)]),
      // Leva roka: vrtišče v rami
      arm: mergeParts([box(0.12, 0.46, 0.14, 0, -0.23, 0, 0x3d6b4a), box(0.1, 0.1, 0.1, 0, -0.5, 0, 0xf0c8a0)]),
      // Desna roka (rokav) drži orožje
      sleeve: mergeParts([box(0.12, 0.12, 0.42, 0, -0.05, -0.2, 0x3d6b4a), box(0.1, 0.1, 0.1, 0, -0.05, -0.44, 0xf0c8a0)]),
      // Lopata: ročaj in list (držalo v desni roki, list spredaj)
      shovel: mergeParts([
        box(0.14, 0.05, 0.05, 0, -0.05, -0.42, 0x3a2a1a),
        box(0.05, 0.05, 1.05, 0, -0.05, -0.92, 0x8b5a2b),
        box(0.3, 0.035, 0.34, 0, -0.07, -1.58, 0x9aa0a6),
        box(0.32, 0.06, 0.05, 0, -0.06, -1.42, 0x6b7076),
      ]),
    };
  }
  return hunterGeos;
}

export interface HunterModel {
  group: THREE.Group;
  gunPivot: THREE.Object3D;
  /** Konica lopate (za iskre ob udarcu). */
  muzzle: THREE.Object3D;
  /** Zamah z lopato (animacija). */
  swing: () => void;
  /** Animacija hoje: faza korakov in jakost (0 = stoji, 1 = teče). */
  animate: (phase: number, amount: number) => void;
}

const SWING_MS = 380;

export function hunterModel(): HunterModel {
  const g = hunterGeometries();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g.body, VERTEX_MATERIAL));
  const limb = (geo: THREE.BufferGeometry, x: number, y: number): THREE.Object3D => {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, y, 0);
    pivot.add(new THREE.Mesh(geo, VERTEX_MATERIAL));
    group.add(pivot);
    return pivot;
  };
  const legL = limb(g.leg, -0.11, 0.8);
  const legR = limb(g.leg, 0.11, 0.8);
  const armL = limb(g.arm, -0.3, 1.32);
  // gunPivot sledi pogledu gor/dol, swingPivot doda zamah
  const gunPivot = new THREE.Object3D();
  gunPivot.position.set(0.3, 1.3, 0);
  const swingPivot = new THREE.Object3D();
  gunPivot.add(swingPivot);
  swingPivot.add(new THREE.Mesh(g.sleeve, VERTEX_MATERIAL));
  swingPivot.add(new THREE.Mesh(g.shovel, VERTEX_MATERIAL));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.07, -1.6);
  swingPivot.add(muzzle);
  group.add(gunPivot);
  let swingStart = -1e9;
  const swing = (): void => {
    swingStart = performance.now();
  };
  const animate = (phase: number, amount: number): void => {
    const s = Math.sin(phase) * amount;
    legL.rotation.x = s * 0.7;
    legR.rotation.x = -s * 0.7;
    armL.rotation.x = -s * 0.6;
    group.children[0]!.position.y = Math.abs(Math.cos(phase)) * 0.04 * amount;
    // Zamah: najprej dvig nad glavo, nato hiter udarec navzdol
    const k = (performance.now() - swingStart) / SWING_MS;
    if (k >= 0 && k < 1) {
      swingPivot.rotation.x = k < 0.35 ? (k / 0.35) * 1.4 : 1.4 - ((k - 0.35) / 0.65) * 2.2;
    } else {
      swingPivot.rotation.x = 0;
    }
  };
  return { group, gunPivot, muzzle, swing, animate };
}
// ---------------------------------------------------------------- napisi

export function nameTag(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = Math.min(250, ctx.measureText(text).width + 24);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const x0 = 128 - w / 2;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x0, 12, w, 40, 12);
      ctx.fill();
    } else {
      ctx.fillRect(x0, 12, w, 40);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 33, 236);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.2, 0.3, 1);
  s.renderOrder = 10;
  return s;
}

export function disposeSprite(s: THREE.Sprite): void {
  s.material.map?.dispose();
  s.material.dispose();
}
