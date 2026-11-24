// Drugi igralci: interpolacija med posnetki strežnika (100 ms zamika za gladko gibanje).

import * as THREE from 'three';
import { MODEL_HUNTER, type PlayerSnap } from '../../../shared/src/index';
import { disposeSprite, hunterModel, nameTag, propMesh, type HunterModel } from './models';

const INTERP_DELAY_MS = 100;
const MAX_SAMPLES = 30;

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
}

export class RemotePlayer {
  readonly group = new THREE.Group();
  model = Number.NaN;
  alive = true;
  hp = 100;
  private samples: Sample[] = [];
  private body: THREE.Object3D | null = null;
  hunter: HunterModel | null = null;
  tag: THREE.Sprite | null = null;
  private tagText = '';
  readonly pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  private lastUpdate = 0;
  private walkPhase = 0;
  private walkAmount = 0;

  constructor(readonly id: string) {}

  /** Vrne true, če se je oblika spremenila (ne ob prvem prikazu). */
  setModel(model: number): boolean {
    if (model === this.model) return false;
    const changed = !Number.isNaN(this.model);
    this.model = model;
    if (this.body) this.group.remove(this.body);
    if (model === MODEL_HUNTER) {
      this.hunter = hunterModel();
      this.body = this.hunter.group;
    } else {
      this.hunter = null;
      this.body = propMesh(model);
    }
    this.group.add(this.body);
    return changed;
  }

  setTag(text: string, color: string, height: number, xray = false): void {
    const key = text + '|' + color + '|' + xray;
    if (key !== this.tagText) {
      if (this.tag) {
        this.group.remove(this.tag);
        disposeSprite(this.tag);
        this.tag = null;
      }
      this.tagText = key;
      if (text) {
        this.tag = nameTag(text, color);
        // Med razkrivanjem so imena vidna tudi skozi stene.
        this.tag.material.depthTest = !xray;
        this.group.add(this.tag);
      }
    }
    if (this.tag) this.tag.position.set(0, height + 0.35, 0);
  }

  push(t: number, s: PlayerSnap): void {
    const sample: Sample = { t, x: s[1], y: s[2], z: s[3], yaw: s[4], pitch: s[5] };
    const last = this.samples[this.samples.length - 1];
    // Velik skok (teleport, nova runda) -> brez drsenja skozi stene.
    if (last && Math.hypot(sample.x - last.x, sample.y - last.y, sample.z - last.z) > 3) this.samples = [];
    this.samples.push(sample);
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
  }

  /** Takojšen premik brez interpolacije (npr. nova runda). */
  snap(s: PlayerSnap, t: number): void {
    this.samples = [];
    this.push(t, s);
  }

  update(now: number): void {
    const rt = now - INTERP_DELAY_MS;
    const ss = this.samples;
    if (ss.length === 0) return;
    let a = ss[0]!;
    let b = a;
    if (rt <= a.t) {
      b = a;
    } else {
      for (let i = ss.length - 1; i >= 0; i--) {
        if (ss[i]!.t <= rt) {
          a = ss[i]!;
          b = ss[i + 1] ?? a;
          break;
        }
      }
    }
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(1, Math.max(0, (rt - a.t) / span)) : 1;
    this.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    let dy = b.yaw - a.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw = a.yaw + dy * k;
    this.pitch = a.pitch + (b.pitch - a.pitch) * k;
    // Odstrani stare vzorce, a vedno obdrži vsaj dva.
    while (ss.length > 2 && ss[1]!.t < rt - 200) ss.shift();

    // Hitrost za animacijo hoje (nog in rok)
    const dtSec = this.lastUpdate > 0 ? Math.min(0.2, (now - this.lastUpdate) / 1000) : 0;
    this.lastUpdate = now;
    if (dtSec > 0) {
      const moved = Math.hypot(this.pos.x - this.group.position.x, this.pos.z - this.group.position.z);
      const speed = moved / dtSec;
      this.walkAmount += (Math.min(1, speed / 3.5) - this.walkAmount) * Math.min(1, dtSec * 10);
      this.walkPhase += speed * dtSec * 2.6;
    }

    this.group.position.copy(this.pos);
    if (this.body) this.body.rotation.y = this.yaw;
    if (this.hunter) {
      this.hunter.gunPivot.rotation.x = this.pitch;
      this.hunter.animate(this.walkPhase, this.walkAmount);
    }
  }

  dispose(): void {
    if (this.tag) disposeSprite(this.tag);
  }
}

export class RemotePlayers {
  readonly map = new Map<string, RemotePlayer>();

  constructor(private readonly scene: THREE.Scene) {}

  get(id: string): RemotePlayer | undefined {
    return this.map.get(id);
  }

  /** Posodobi seznam iz posnetka; vrne igralce, ki so pravkar umrli. */
  /** Spremenjene oblike v zadnjem apply (za dim). */
  changed: RemotePlayer[] = [];

  apply(snaps: PlayerSnap[], myId: string, now: number): RemotePlayer[] {
    this.changed = [];
    const seen = new Set<string>();
    const died: RemotePlayer[] = [];
    for (const s of snaps) {
      const id = s[0];
      if (id === myId) continue;
      seen.add(id);
      let rp = this.map.get(id);
      const fresh = !rp;
      if (!rp) {
        rp = new RemotePlayer(id);
        this.map.set(id, rp);
        this.scene.add(rp.group);
      }
      if (rp.setModel(s[6]) && rp.alive && s[7] === 1) this.changed.push(rp);
      const alive = s[7] === 1;
      if (rp.alive && !alive && !fresh) died.push(rp);
      rp.alive = alive;
      rp.hp = s[8];
      rp.group.visible = alive;
      if (fresh) rp.snap(s, now);
      else rp.push(now, s);
    }
    for (const [id, rp] of this.map) {
      if (!seen.has(id)) {
        this.scene.remove(rp.group);
        rp.dispose();
        this.map.delete(id);
      }
    }
    return died;
  }

  update(now: number): void {
    for (const rp of this.map.values()) rp.update(now);
  }

  clear(): void {
    for (const rp of this.map.values()) {
      this.scene.remove(rp.group);
      rp.dispose();
    }
    this.map.clear();
  }
}
