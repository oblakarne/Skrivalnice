// Kratkotrajni učinki: sledi krogel, iskre, blisk cevi, oblaček ob ulovu.

import * as THREE from 'three';

interface Effect {
  obj: THREE.Object3D;
  life: number;
  max: number;
  update?: (k: number, dt: number) => void;
  dispose: () => void;
}

const sparkGeo = new THREE.SphereGeometry(0.06, 8, 6);
const flashGeo = new THREE.SphereGeometry(0.09, 8, 6);
const puffGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const smokeGeo = new THREE.SphereGeometry(0.35, 10, 7);

export class Effects {
  private list: Effect[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe27a): void {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.add({
      obj: line,
      life: 0.12,
      max: 0.12,
      update: (k) => (mat.opacity = 0.9 * k),
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  spark(at: THREE.Vector3, color = 0xffd27a): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.copy(at);
    this.add({
      obj: m,
      life: 0.2,
      max: 0.2,
      update: (k) => {
        mat.opacity = k;
        m.scale.setScalar(1 + (1 - k) * 1.5);
      },
      dispose: () => mat.dispose(),
    });
  }

  muzzle(at: THREE.Vector3): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true });
    const m = new THREE.Mesh(flashGeo, mat);
    m.position.copy(at);
    this.add({ obj: m, life: 0.06, max: 0.06, update: (k) => (mat.opacity = k), dispose: () => mat.dispose() });
  }

  /** Radarski val: zelen obroč, ki se razširi do dosega. */
  ring(at: THREE.Vector3, radius: number): void {
    const geo = new THREE.RingGeometry(0.9, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5ee08a, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at);
    this.add({
      obj: m,
      life: 0.9,
      max: 0.9,
      update: (k) => {
        m.scale.setScalar(0.1 + (1 - k) * radius);
        mat.opacity = k;
      },
      dispose: () => {
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** Oblak dima ob spremembi oblike. */
  smoke(at: THREE.Vector3, size = 1): void {
    for (let i = 0; i < 14; i++) {
      const shade = 0.75 + Math.random() * 0.2;
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(shade, shade, shade), transparent: true, depthWrite: false });
      const m = new THREE.Mesh(smokeGeo, mat);
      m.position.set(at.x + (Math.random() - 0.5) * size, at.y + Math.random() * size * 0.6, at.z + (Math.random() - 0.5) * size);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2);
      const s0 = (0.5 + Math.random() * 0.4) * size;
      this.add({
        obj: m,
        life: 1.2,
        max: 1.2,
        update: (k, dt) => {
          m.position.addScaledVector(v, dt);
          m.scale.setScalar(s0 * (1 + (1 - k) * 1.6));
          mat.opacity = 0.85 * k;
        },
        dispose: () => mat.dispose(),
      });
    }
  }

  puff(at: THREE.Vector3): void {
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xffd54f, transparent: true });
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.copy(at);
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3 + 1, (Math.random() - 0.5) * 3);
      this.add({
        obj: m,
        life: 0.7,
        max: 0.7,
        update: (k, dt) => {
          v.y -= 6 * dt;
          m.position.addScaledVector(v, dt);
          m.rotation.x += dt * 5;
          mat.opacity = k;
        },
        dispose: () => mat.dispose(),
      });
    }
  }

  private add(e: Effect): void {
    this.scene.add(e.obj);
    this.list.push(e);
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i]!;
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.obj);
        e.dispose();
        this.list.splice(i, 1);
      } else {
        e.update?.(e.life / e.max, dt);
      }
    }
  }

  clear(): void {
    for (const e of this.list) {
      this.scene.remove(e.obj);
      e.dispose();
    }
    this.list = [];
  }
}
