// Gradnja statične scene za izbrano mapo: tla s ploščicami, stene/odri, okras,
// strop ali nebo, luči in predmeti mape (instancirani – malo klicev risanja).

import * as THREE from 'three';
import { propYaw, type FloorDef, type MapDef, type World } from '../../../shared/src/index';
import { mergeParts, propGeometry, shadeByHeight, VERTEX_MATERIAL, withColor } from './models';

const SKIRTING = 0x5e3f28;
const CEILING_COLOR = 0xcfc8bb;

export interface WorldViewHandle {
  group: THREE.Group;
  dispose: () => void;
}

const tmpColor = new THREE.Color();

/** Tla kot šahovnica ploščic (ena geometrija, brez škatel – lahka). */
function floorGeometry(floors: FloorDef[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const f of floors) {
    const nx = Math.ceil((f.x1 - f.x0) / f.tile - 1e-6);
    const nz = Math.ceil((f.z1 - f.z0) / f.tile - 1e-6);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x0 = f.x0 + i * f.tile;
        const z0 = f.z0 + j * f.tile;
        const x1 = Math.min(f.x1, x0 + f.tile);
        const z1 = Math.min(f.z1, z0 + f.tile);
        tmpColor.setHex((i + j) % 2 === 0 ? f.color : f.color2);
        // Trikotnika (a, c, b) in (a, d, c) imata normalo +Y.
        const quad = [x0, z0, x1, z1, x1, z0, x0, z0, x0, z1, x1, z1];
        for (let k = 0; k < 6; k++) {
          pos.push(quad[k * 2]!, 0, quad[k * 2 + 1]!);
          nor.push(0, 1, 0);
          col.push(tmpColor.r, tmpColor.g, tmpColor.b);
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

function boxAt(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, hex: number) {
  const g = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  return withColor(g, hex);
}

/** Barvne obloge sten v vsakem prostoru (notranje mape) – prostori se jasno ločijo. */
function roomPanels(map: MapDef): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const y0 = 0.1;
  const y1 = map.height - 0.02;
  const d = 0.01;
  for (const f of map.floors) {
    if (f.wall === undefined) continue;
    const color = f.wall;
    for (const s of map.solids) {
      if (s.hidden) continue;
      const horizontal = s.maxX - s.minX > s.maxZ - s.minZ;
      if (horizontal) {
        const ax = Math.max(s.minX, f.x0 + 0.1);
        const bx = Math.min(s.maxX, f.x1 - 0.1);
        if (bx - ax < 0.05) continue;
        if (s.minZ <= f.z0 + 0.01 && s.maxZ >= f.z0 - 0.01) {
          out.push(shadeByHeight(boxAt(ax, y0, s.maxZ, bx, y1, s.maxZ + d, color), 0, 3, 0.7));
        }
        if (s.minZ <= f.z1 + 0.01 && s.maxZ >= f.z1 - 0.01) {
          out.push(shadeByHeight(boxAt(ax, y0, s.minZ - d, bx, y1, s.minZ, color), 0, 3, 0.7));
        }
      } else {
        const az = Math.max(s.minZ, f.z0 + 0.1);
        const bz = Math.min(s.maxZ, f.z1 - 0.1);
        if (bz - az < 0.05) continue;
        if (s.minX <= f.x0 + 0.01 && s.maxX >= f.x0 - 0.01) {
          out.push(shadeByHeight(boxAt(s.maxX, y0, az, s.maxX + d, y1, bz, color), 0, 3, 0.7));
        }
        if (s.minX <= f.x1 + 0.01 && s.maxX >= f.x1 - 0.01) {
          out.push(shadeByHeight(boxAt(s.minX - d, y0, az, s.minX, y1, bz, color), 0, 3, 0.7));
        }
      }
    }
  }
  return out;
}

function skyDome(map: MapDef, top: number, horizon: number): THREE.Mesh {
  const g = new THREE.SphereGeometry(80, 32, 16);
  const pos = g.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(top);
  const cHor = new THREE.Color(horizon);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, pos.getY(i) / 50));
    tmpColor.copy(cHor).lerp(cTop, k);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  m.position.set(map.width / 2, 0, map.depth / 2);
  m.renderOrder = -1;
  return m;
}

/** Puhasti beli oblaki iz krogel (deterministično razporejeni). */
function clouds(map: MapDef): THREE.Mesh {
  let seed = 12345;
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const geos: THREE.BufferGeometry[] = [];
  const cx = map.width / 2;
  const cz = map.depth / 2;
  for (let c = 0; c < 16; c++) {
    const ang = (c / 16) * Math.PI * 2 + rnd() * 0.3;
    const r = c % 4 === 0 ? 15 + rnd() * 20 : 42 + rnd() * 18;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    const y = 24 + rnd() * 12;
    const size = 2.5 + rnd() * 2.5;
    const puffs = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < puffs; i++) {
      const g = new THREE.SphereGeometry(size * (0.6 + rnd() * 0.5), 10, 7);
      g.scale(1.3, 0.75, 1);
      g.translate(x + (i - puffs / 2) * size * 0.9, y + rnd() * size * 0.4, z + (rnd() - 0.5) * size);
      geos.push(shadeByHeight(withColor(g, 0xffffff), y - size, y + size, 0.82));
    }
  }
  const mesh = new THREE.Mesh(mergeParts(geos), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.renderOrder = -1;
  return mesh;
}

export function buildWorldView(world: World): WorldViewHandle {
  const map = world.map;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const instanced: THREE.InstancedMesh[] = [];
  const addStatic = (mesh: THREE.Mesh): void => {
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    geometries.push(mesh.geometry);
    group.add(mesh);
  };

  // Tla
  addStatic(new THREE.Mesh(floorGeometry(map.floors), VERTEX_MATERIAL));

  // Stene, odri, stopnice (+ talne letve in obloge prostorov pri notranjih mapah)
  const solidGeos: THREE.BufferGeometry[] = [];
  for (const s of map.solids) {
    if (s.hidden) continue;
    solidGeos.push(shadeByHeight(boxAt(s.minX, s.minY, s.minZ, s.maxX, s.maxY, s.maxZ, s.color), 0, 3.2, 0.62));
    if (!map.outdoor && s.minY === 0) {
      solidGeos.push(boxAt(s.minX - 0.01, 0, s.minZ - 0.01, s.maxX + 0.01, 0.1, s.maxZ + 0.01, SKIRTING));
    }
  }
  if (!map.outdoor) solidGeos.push(...roomPanels(map));
  if (solidGeos.length) addStatic(new THREE.Mesh(mergeParts(solidGeos), VERTEX_MATERIAL));

  // Okras
  if (map.decor.length) {
    const decorGeos = map.decor.map((dc) => {
      const g = new THREE.BoxGeometry(dc.s[0], dc.s[1], dc.s[2]);
      g.translate(dc.p[0], dc.p[1], dc.p[2]);
      return withColor(g, dc.c);
    });
    addStatic(new THREE.Mesh(mergeParts(decorGeos), VERTEX_MATERIAL));
  }

  if (!map.outdoor) {
    // Strop: neosvetljen material (sicer bi bil od spodaj temen).
    const ceilGeo = new THREE.PlaneGeometry(map.width, map.depth);
    ceilGeo.rotateX(Math.PI / 2);
    ceilGeo.translate(map.width / 2, map.height, map.depth / 2);
    const ceilMat = new THREE.MeshBasicMaterial({ color: CEILING_COLOR });
    materials.push(ceilMat);
    addStatic(new THREE.Mesh(ceilGeo, ceilMat));
    // Luči na stropu (samo videz)
    const lampGeos = map.floors.map((f) => {
      const g = new THREE.CylinderGeometry(0.25, 0.3, 0.06, 16);
      g.translate((f.x0 + f.x1) / 2, map.height - 0.03, (f.z0 + f.z1) / 2);
      return withColor(g, 0xfff6d8);
    });
    const lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    materials.push(lampMat);
    addStatic(new THREE.Mesh(mergeParts(lampGeos), lampMat));
  } else if (map.sky) {
    const sky = skyDome(map, map.sky[0], map.sky[1]);
    materials.push(sky.material as THREE.Material);
    addStatic(sky);
    if (map.clouds) {
      const cl = clouds(map);
      materials.push(cl.material as THREE.Material);
      addStatic(cl);
    }
  }

  // Predmeti mape – ista geometrija kot pri igralcih-predmetih, instancirano po vrstah.
  const byType = new Map<number, number[]>();
  map.props.forEach((pl, i) => {
    const list = byType.get(pl.type) ?? [];
    list.push(i);
    byType.set(pl.type, list);
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  for (const [type, list] of byType) {
    const mesh = new THREE.InstancedMesh(propGeometry(type), VERTEX_MATERIAL, list.length);
    list.forEach((idx, k) => {
      const pl = map.props[idx]!;
      q.setFromAxisAngle(up, propYaw(pl.q));
      mesh.setMatrixAt(k, m4.compose(v.set(pl.x, pl.y, pl.z), q, one));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    instanced.push(mesh);
    group.add(mesh);
  }

  // Svetloba
  const L = map.lighting;
  const hemi = new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(L.sunColor, L.sun);
  sun.position.set(0.45, 1, 0.3);
  group.add(sun);
  // Šibka nasprotna luč, da so tudi "senčne" strani berljive, a še vedno temnejše.
  const fill = new THREE.DirectionalLight(0xdfe8ff, L.sun * 0.22);
  fill.position.set(-0.6, 0.4, -0.7);
  group.add(fill);

  return {
    group,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const im of instanced) im.dispose();
    },
  };
}
