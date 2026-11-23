import * as THREE from 'three';
import {
  AIM_ASSIST_ANGLE,
  canTransformInto,
  CLIENT_SEND_MS,
  collisionYaw,
  distanceToProp,
  getWorld,
  WEAPONS,
  type WeaponId,
  SCOPE_FOV,
  SCOPE_SENS_FACTOR,
  SCOPE_SPEED_FACTOR,
  HP_MAX,
  HUNTER_EYE,
  MODEL_GHOST,
  MODEL_HUNTER,
  MOVE_SPEED,
  PHYSICS_DT,
  RADAR_COOLDOWN_MS,
  PROPS,
  pushFromOthers,
  rayAABB,
  raycastWorld,
  resolveHorizontal,
  resolveShot,
  shapeOf,
  shotRayFromCamera,
  stepBody,
  TRANSFORM_COOLDOWN_MS,
  TRANSFORM_RANGE,
  tryRotate,
  type Body,
  type OtherBody,
  type Phase,
  type Ray,
  type Role,
  type RoomInfo,
  type ShotEvent,
  type ShotTarget,
  type Snapshot,
  type TeleportMsg,
  type World,
} from '../../../shared/src/index';
import type { InputState } from '../input/Input';
import type { Network } from '../net/Network';
import type { ControlMode, Hud } from '../ui/Hud';
import type { UserSettings } from '../util/settings';
import type { GameAudio } from './Audio';
import { Effects } from './Effects';
import { hunterModel, propMesh, type HunterModel } from './models';
import { RemotePlayers, type RemotePlayer } from './RemotePlayers';
import { buildWorldView, type WorldViewHandle } from './WorldView';

const IN_ROUND = new Set<Phase>(['hiding', 'hunting', 'roundEnd']);
const PIXEL_RATIOS = [1, 1.5, 2];

export interface GameHooks {
  toast: (msg: string) => void;
  openMenu: () => void;
  qualityChanged: (q: number) => void;
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  /** Svet trenutne mape (trki, raycast) in njegova 3D scena. */
  world: World = getWorld('hisa');
  private mapId = '';
  private worldView: WorldViewHandle | null = null;
  /** Skrivalci, ki sem jih kot lovec v tej rundi že zadel (pomoč pri merjenju). */
  private readonly marked = new Set<string>();
  private readonly remotes: RemotePlayers;
  private readonly effects: Effects;
  private readonly highlight: THREE.LineSegments;
  private running = false;
  menuOpen = false;

  // Soba
  private room: RoomInfo | null = null;
  private myId = '';
  private role: Role = 'spectator';
  private phase: Phase = 'lobby';
  private round = 0;
  private alive = false;
  private phaseEndLocal = 0;

  // Lokalni igralec
  private readonly body: Body = { x: 13, y: 0, z: 8.5, vy: 0, onGround: true };
  private model = MODEL_GHOST;
  private modelLockUntil = 0;
  private camYaw = 0;
  private camPitch = -0.15;
  private modelYaw = 0;
  private locked = false;
  private seq = 0;
  private hasSpawn = false;
  private localObj: THREE.Object3D | null = null;
  private localHunter: HunterModel | null = null;
  private localKey = Number.NaN;

  // Orožje
  private hp = HP_MAX;
  private ammo = WEAPONS.pistol.mag;
  private weapon: WeaponId = 'pistol';
  private walkPhase = 0;
  private frameDt = 0;
  private decoysLeft = 0;
  private radarReadyAt = 0;
  private warned30 = false;
  private lastHuntBeep = -1;
  private lastDecoyHitAt = 0;
  private walkAmount = 0;
  private lastBodyX = 0;
  private lastBodyZ = 0;
  private reloading = false;
  private nextFireAt = 0;
  private lastShotAt = 0;

  // Skrivalec
  private target = -1;
  private transformReadyAt = 0;
  private transformPending = false;
  private lastNoTargetToast = 0;
  private lastLockedHint = 0;
  private lastLookInput = false;
  /** Opis predmeta pod merkom skrivalca (tudi če ga ni mogoče izbrati). */
  private targetText: string | null = null;

  // Merek (lovec)
  private scoped = false;
  private scopeToggle = false;
  private lastRangeHint = 0;
  private baseFov = 70;

  // Gledalec
  private specId: string | null = null;

  // Zanka
  private accumulator = 0;
  private lastFrame = 0;
  private lastSend = 0;
  private lastBeep = -1;
  private fpsFrames = 0;
  private fpsTime = 0;
  private lowFpsStreak = 0;

  // Začasni vektorji
  private readonly fwd = new THREE.Vector3();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly net: Network,
    private readonly input: InputState,
    private readonly hud: Hud,
    private readonly audio: GameAudio,
    private readonly settings: UserSettings,
    private readonly hooks: GameHooks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.applyQuality();
    this.scene.background = new THREE.Color(0x20242e);
    this.camera.rotation.order = 'YXZ';
    this.remotes = new RemotePlayers(this.scene);
    this.effects = new Effects(this.scene);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    edges.translate(0, 0.5, 0);
    this.highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x7cff9c }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => window.setTimeout(onResize, 200));
    this.resize();
  }

  // ------------------------------------------------------------------ nastavitve

  applyQuality(): void {
    const q = Math.max(0, Math.min(2, this.settings.quality));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIOS[q]!));
    this.resize();
  }

  private resize(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Zamenja mapo (zgradi novo sceno, staro sprosti). */
  setMap(mapId: string): void {
    if (mapId === this.mapId && this.worldView) return;
    if (this.worldView) {
      this.scene.remove(this.worldView.group);
      this.worldView.dispose();
      this.worldView = null;
    }
    this.mapId = mapId;
    this.world = getWorld(mapId);
    this.worldView = buildWorldView(this.world);
    this.scene.add(this.worldView.group);
    const map = this.world.map;
    this.scene.background = new THREE.Color(map.sky ? map.sky[1] : 0x20242e);
    this.scene.fog = map.fog ? new THREE.Fog(map.fog[0], map.fog[1], map.fog[2]) : null;
  }

  // ------------------------------------------------------------------ življenjski cikel

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.hud.resetCache();
    this.renderer.setAnimationLoop(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.remotes.clear();
    this.effects.clear();
    this.highlight.visible = false;
    if (this.localObj) this.localObj.visible = false;
    this.input.reset();
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ------------------------------------------------------------------ omrežni dogodki

  setRoom(info: RoomInfo, myId: string): void {
    const prevPhase = this.phase;
    this.room = info;
    this.myId = myId;
    const me = info.players.find((p) => p.id === myId);
    const role: Role = me?.role ?? 'spectator';
    const newRound = IN_ROUND.has(info.phase) && (info.round !== this.round || !IN_ROUND.has(prevPhase));
    this.phase = info.phase;
    this.role = role;
    if (IN_ROUND.has(info.phase)) this.setMap(info.mapId);
    if (newRound) {
      this.round = info.round;
      this.beginRound();
    }
    if (me && !me.alive && this.alive && IN_ROUND.has(info.phase)) this.onLocalDeath();
    if (me) this.alive = me.alive;
    if (prevPhase === 'hiding' && info.phase === 'hunting') {
      if (role === 'hunter' && this.alive) this.hud.showBanner('Lov se je začel! Poišči skrivalce.');
      else if (role === 'prop' && this.alive) {
        this.hud.showBanner(this.locked ? 'Lovci so spuščeni!' : 'Lovci so spuščeni – zakleni se 🔒 in miruj!');
      }
      this.audio.beep(true);
    }
    if (info.phase === 'roundEnd' && prevPhase !== 'roundEnd') this.hud.hideBanner();
    if (!IN_ROUND.has(info.phase)) this.round = 0;
  }

  private beginRound(): void {
    this.model = this.role === 'hunter' ? MODEL_HUNTER : MODEL_GHOST;
    this.locked = false;
    this.hp = HP_MAX;
    this.ammo = WEAPONS.pistol.mag;
    this.weapon = 'pistol';
    this.hud.setWeapon('pistol');
    this.reloading = false;
    this.target = -1;
    this.transformReadyAt = 0;
    this.transformPending = false;
    this.marked.clear();
    this.radarReadyAt = 0;
    this.warned30 = false;
    this.lastHuntBeep = -1;
    this.scopeToggle = false;
    this.setScoped(false);
    this.specId = null;
    this.modelLockUntil = 0;
    this.lastBeep = -1;
    // Položaj za novo rundo pride s teleportom takoj za tem sporočilom.
    this.hasSpawn = false;
    this.remotes.clear();
    this.effects.clear();
    this.rebuildLocal();
    if (this.role === 'hunter') this.hud.showBanner('Ti si LOVEC! Počakaj, da se skrivalci skrijejo.', 3500);
    else if (this.role === 'prop') {
      this.hud.showBanner(
        this.world.transformable
          ? 'Ti si SKRIVALEC! Pritisni Zamenjaj in izberi obliko.'
          : 'Ti si SKRIVALEC! Poišči predmet in se spremeni vanj.',
        3500,
      );
    }
    else this.hud.showBanner('To rundo gledaš – v naslednji se pridružiš.', 3500);
  }

  onTeleport(t: TeleportMsg): void {
    this.body.x = t.x;
    this.body.y = t.y;
    this.body.z = t.z;
    this.body.vy = 0;
    this.body.onGround = true;
    if (!this.hasSpawn) {
      this.camYaw = t.yaw;
      this.camPitch = -0.15;
    }
    this.modelYaw = t.yaw;
    this.seq = t.seq;
    this.hasSpawn = true;
  }

  onSnapshot(s: Snapshot): void {
    const now = performance.now();
    this.phaseEndLocal = now + s.t;
    if (s.you) {
      const prevHp = this.hp;
      this.hp = s.you.hp;
      if (this.hp < prevHp && this.alive) {
        this.hud.damageFlash();
        this.audio.hurt();
      }
      this.reloading = s.you.reloading;
      this.decoysLeft = s.you.decoys;
      if (s.you.weapon === this.weapon && (this.reloading || now - this.lastShotAt > 450)) this.ammo = s.you.ammo;
    }
    const mine = s.p.find((p) => p[0] === this.myId);
    if (mine) {
      if (mine[6] !== this.model && now > this.modelLockUntil) this.applyModel(mine[6]);
      const alive = mine[7] === 1;
      if (this.alive && !alive) this.onLocalDeath();
      this.alive = alive;
    }
    const died = this.remotes.apply(s.p, this.myId, now);
    for (const d of died) {
      this.effects.puff(this.tmpA.copy(d.pos).setY(d.pos.y + 0.4));
      this.audio.pop(d.pos);
    }
    this.refreshTags();
  }

  onShot(e: ShotEvent): void {
    const to = new THREE.Vector3(e.hx, e.hy, e.hz);
    if (e.by === this.myId) {
      if (e.kind === 'player') {
        // Po prvem zadetku tega skrivalca dobim rahlo pomoč pri merjenju nanj.
        if (e.target) this.marked.add(e.target);
        this.hud.hitMarker();
        this.audio.hit();
      } else if (e.kind === 'prop' && this.room?.settings.penalty && performance.now() - this.lastDecoyHitAt > 500) {
        this.hud.showBanner('To je bil pravi predmet! −5 ❤', 1200);
      }
      return;
    }
    const rp = this.remotes.get(e.by);
    const from = new THREE.Vector3(e.ox, e.oy, e.oz);
    if (rp?.hunter) {
      rp.group.updateMatrixWorld(true);
      rp.hunter.muzzle.getWorldPosition(from);
    }
    this.effects.tracer(from, to);
    if (e.kind !== 'none') this.effects.spark(to);
    this.audio.shot(from);
  }

  onKill(k: { killer: string | null; victim: string }): void {
    const victim = this.nameOf(k.victim);
    if (k.killer) {
      const killer = this.nameOf(k.killer);
      this.hud.addKill(`🎯 ${killer} je ujel: ${victim}`);
      if (k.killer === this.myId) {
        this.audio.kill();
        this.hud.showBanner(`Ujel si: ${victim}! +100`, 1800);
      }
    } else {
      this.hud.addKill(`💥 ${victim} je izločen (napačni streli)`);
    }
    if (k.victim === this.myId) this.onLocalDeath();
  }

  private onLocalDeath(): void {
    if (!this.alive) return;
    this.alive = false;
    this.effects.puff(this.tmpA.set(this.body.x, this.body.y + 0.4, this.body.z));
    this.audio.pop(null);
    this.hud.showBanner(
      this.role === 'hunter' ? 'Izločen si! Zdaj gledaš igro.' : 'Ujeli so te! Zdaj gledaš igro.',
      3000,
    );
    if (this.localObj) this.localObj.visible = false;
    this.highlight.visible = false;
    this.target = -1;
    this.scopeToggle = false;
    this.setScoped(false);
  }

  private switchWeapon(w: WeaponId): void {
    if (w === this.weapon) return;
    this.weapon = w;
    this.net.weapon(w);
    this.scopeToggle = false;
    this.setScoped(false);
    this.reloading = false;
    this.ammo = w === 'sniper' ? Math.min(this.ammo, WEAPONS.sniper.mag) : this.ammo; // do posnetka strežnika
    this.nextFireAt = performance.now() + 300;
    this.localHunter?.setWeapon(w);
    this.hud.setWeapon(w);
    this.audio.click();
    this.hud.showBanner(w === 'sniper' ? '🎯 Ostrostrelka – z merkom 🔭 do 45 m' : '🔫 Pištola – hitra, do 18 m', 1300);
  }

  /** Vklopi/izklopi merek (približan pogled, daljši doseg) in o tem obvesti strežnik. */
  private setScoped(on: boolean): void {
    if (on === this.scoped) return;
    this.scoped = on;
    this.net.scope(on);
    this.hud.setScope(on);
    if (on) this.audio.click();
  }

  private updateScope(dt: number): void {
    const allowed =
      this.role === 'hunter' && this.alive && this.phase === 'hunting' && this.hasSpawn && !this.menuOpen && WEAPONS[this.weapon].scope;
    if (!allowed) this.scopeToggle = false;
    this.setScoped(allowed && (this.scopeToggle || this.input.scopeHeld));
    const fov = this.scoped ? SCOPE_FOV : this.baseFov;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 14);
      if (Math.abs(this.camera.fov - fov) < 0.1) this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private nameOf(id: string): string {
    if (id.startsWith('d')) return '🎭 Vaba';
    return this.room?.players.find((p) => p.id === id)?.name ?? '?';
  }

  private refreshTags(): void {
    const seeProps = this.role !== 'hunter' || !this.alive;
    for (const rp of this.remotes.map.values()) {
      const isHunter = rp.model === MODEL_HUNTER;
      const show = rp.alive && (isHunter || seeProps);
      const h = shapeOf(rp.model).h;
      rp.setTag(show ? this.nameOf(rp.id) : '', isHunter ? '#ff9a9a' : '#9affc0', h);
    }
  }

  // ------------------------------------------------------------------ lokalni model

  private applyModel(model: number): void {
    this.model = model;
    this.rebuildLocal();
    const shape = shapeOf(model);
    const r = resolveHorizontal(
      this.body.x,
      this.body.z,
      this.body.y,
      shape,
      collisionYaw(model, this.modelYaw),
      this.world.staticBoxes,
    );
    if (r.ok) {
      this.body.x = r.x;
      this.body.z = r.z;
    }
  }

  private rebuildLocal(): void {
    if (this.localKey === this.model && this.localObj) return;
    if (this.localObj) this.scene.remove(this.localObj);
    if (this.model === MODEL_HUNTER) {
      this.localHunter = hunterModel();
      this.localHunter.setWeapon(this.weapon);
      this.localObj = this.localHunter.group;
    } else {
      this.localHunter = null;
      this.localObj = propMesh(this.model);
    }
    this.localKey = this.model;
    this.scene.add(this.localObj);
  }

  // ------------------------------------------------------------------ zanka

  private frame = (): void => {
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    this.trackFps(dt);
    this.frameDt = dt;

    this.handleLook();
    this.aimAssist(dt);
    this.handleActions(now);
    this.updateScope(dt);
    const jump = this.input.consumeJump();
    if (this.isLockedProp() && (jump || this.input.movement().x !== 0 || this.input.movement().y !== 0)) {
      if (now - this.lastLockedHint > 3000) {
        this.lastLockedHint = now;
        this.hooks.toast('Zaklenjen si 🔒 – odkleni se za premikanje.');
      }
    }

    if (this.canMove()) {
      this.accumulator += dt;
      let steps = 0;
      let first = true;
      while (this.accumulator >= PHYSICS_DT && steps < 6) {
        this.physicsStep(first && jump);
        first = false;
        this.accumulator -= PHYSICS_DT;
        steps++;
      }
      if (steps >= 6) this.accumulator = 0;
    } else {
      this.accumulator = 0;
    }

    this.updateModelYaw();
    this.remotes.update(now);
    this.updateLocalObject();
    this.updateCamera();
    this.updateTargeting();
    this.handleFire(now);
    this.sendState(now);
    this.effects.update(dt);
    this.updateHud(now);
    this.audio.setListener(this.camera.position, this.fwd);
    this.renderer.render(this.scene, this.camera);
  };

  private trackFps(dt: number): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime < 3) return;
    const fps = this.fpsFrames / this.fpsTime;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    if (document.visibilityState !== 'visible') return;
    if (fps < 32 && this.settings.quality > 0) {
      this.lowFpsStreak++;
      if (this.lowFpsStreak >= 2) {
        this.lowFpsStreak = 0;
        this.settings.quality--;
        this.applyQuality();
        this.hooks.qualityChanged(this.settings.quality);
        this.hooks.toast('Kakovost slike znižana za bolj tekočo igro.');
      }
    } else {
      this.lowFpsStreak = 0;
    }
  }

  private canMove(): boolean {
    return (
      this.running &&
      !this.menuOpen &&
      this.hasSpawn &&
      this.alive &&
      this.role !== 'spectator' &&
      IN_ROUND.has(this.phase) &&
      !(this.role === 'hunter' && this.phase === 'hiding')
    );
  }

  private handleLook(): void {
    const sens = this.settings.sensitivity * (this.scoped ? SCOPE_SENS_FACTOR : 1);
    const inv = this.settings.invertY ? -1 : 1;
    const dx = (this.input.lookTouchX * 0.0055 + this.input.lookMouseX * 0.0022) * sens;
    const dy = (this.input.lookTouchY * 0.0055 + this.input.lookMouseY * 0.0022) * sens * inv;
    this.input.lookTouchX = 0;
    this.input.lookTouchY = 0;
    this.input.lookMouseX = 0;
    this.input.lookMouseY = 0;
    this.lastLookInput = dx !== 0 || dy !== 0;
    if (this.menuOpen) return;
    this.camYaw -= dx;
    if (this.camYaw > Math.PI) this.camYaw -= Math.PI * 2;
    if (this.camYaw < -Math.PI) this.camYaw += Math.PI * 2;
    this.camPitch = Math.max(-1.35, Math.min(1.2, this.camPitch - dy));
  }

  /** Zaklenjen skrivalec: stoji pri miru in ohrani smer, obrača se samo kamera. */
  private isLockedProp(): boolean {
    return this.role === 'prop' && this.alive && this.locked;
  }

  private physicsStep(jump: boolean): void {
    const locked = this.isLockedProp();
    const mv = locked ? { x: 0, y: 0 } : this.input.movement();
    const s = Math.sin(this.camYaw);
    const c = Math.cos(this.camYaw);
    const speed = MOVE_SPEED * (this.scoped ? SCOPE_SPEED_FACTOR : 1);
    // naprej = (-sin, -cos), desno = (cos, -sin)
    const vx = (c * mv.x - s * mv.y) * speed;
    const vz = (-s * mv.x - c * mv.y) * speed;
    const shape = shapeOf(this.model);
    const cy = collisionYaw(this.model, this.modelYaw);
    const boxes = this.world.staticBoxes;
    stepBody(this.body, shape, cy, vx, vz, jump && !locked, PHYSICS_DT, boxes);

    // Zaklenjenega skrivalca drugi ne morejo odriniti.
    const others: OtherBody[] = [];
    if (!locked) {
      for (const rp of this.remotes.map.values()) {
        if (!rp.alive || Number.isNaN(rp.model)) continue;
        others.push({ x: rp.pos.x, y: rp.pos.y, z: rp.pos.z, shape: shapeOf(rp.model), yaw: collisionYaw(rp.model, rp.yaw) });
      }
    }
    if (others.length) {
      pushFromOthers(this.body, shape, cy, others, MOVE_SPEED * PHYSICS_DT);
      const r = resolveHorizontal(this.body.x, this.body.z, this.body.y, shape, cy, boxes);
      if (r.ok) {
        this.body.x = r.x;
        this.body.z = r.z;
      }
    }
    const m = this.world.map;
    this.body.x = Math.max(0.15, Math.min(m.width - 0.15, this.body.x));
    this.body.z = Math.max(0.15, Math.min(m.depth - 0.15, this.body.z));
  }

  private updateModelYaw(): void {
    if (!this.alive || !this.hasSpawn) return;
    const isProp = this.role === 'prop';
    const transformed = isProp && this.model !== MODEL_GHOST && this.model !== MODEL_HUNTER;
    const desired = isProp && this.locked ? this.modelYaw : this.camYaw;
    if (transformed) {
      if (this.canMoveOrRotate()) {
        this.modelYaw = tryRotate(this.body, shapeOf(this.model), this.modelYaw, desired, this.world.staticBoxes);
      }
    } else {
      this.modelYaw = desired;
    }
  }

  /**
   * Pomoč pri merjenju (kamera): ko je namerek blizu skrivalca, ki sem ga že
   * zadel, ga kamera rahlo "prime". Samo med lovom, samo ko se lovec premika
   * s pogledom ali strelja, in samo če med njima ni ovire.
   */
  private aimAssist(dt: number): void {
    if (this.marked.size === 0 || this.menuOpen) return;
    if (this.role !== 'hunter' || !this.alive || this.phase !== 'hunting') return;
    const looking = this.input.fireHeld || this.lastLookInput;
    if (!looking) return;
    const cam = this.camera.position;
    let best: { yaw: number; pitch: number; err: number } | null = null;
    for (const id of this.marked) {
      const rp = this.remotes.get(id);
      if (!rp || !rp.alive) continue;
      const h = shapeOf(rp.model).h;
      const dx = rp.pos.x - cam.x;
      const dy = rp.pos.y + h / 2 - cam.y;
      const dz = rp.pos.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.5 || dist > 35) continue;
      const yaw = Math.atan2(-dx, -dz);
      const pitch = Math.asin(dy / dist);
      let dYaw = yaw - this.camYaw;
      if (dYaw > Math.PI) dYaw -= Math.PI * 2;
      if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const err = Math.hypot(dYaw * Math.cos(this.camPitch), pitch - this.camPitch);
      if (err > AIM_ASSIST_ANGLE || (best && err >= best.err)) continue;
      // Vidnost: nič statičnega ne sme biti vmes.
      const ray: Ray = { ox: cam.x, oy: cam.y, oz: cam.z, dx: dx / dist, dy: dy / dist, dz: dz / dist };
      const wh = raycastWorld(this.world, ray, dist);
      if (wh && wh.t < dist - Math.max(shapeOf(rp.model).hx, shapeOf(rp.model).hz) - 0.05) continue;
      best = { yaw: this.camYaw + dYaw, pitch, err };
    }
    if (!best) return;
    const k = 1 - Math.exp(-5 * dt);
    let dYaw = best.yaw - this.camYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.camYaw += dYaw * k;
    this.camPitch += (best.pitch - this.camPitch) * k;
  }

  private canMoveOrRotate(): boolean {
    return this.hasSpawn && this.alive && IN_ROUND.has(this.phase) && !this.menuOpen;
  }

  private updateLocalObject(): void {
    const obj = this.localObj;
    if (!obj) return;
    // Skozi merek gleda lovec iz svojih oči – svojega modela takrat ne rišemo.
    obj.visible = this.running && this.alive && this.hasSpawn && this.role !== 'spectator' && !this.scoped;
    obj.position.set(this.body.x, this.body.y, this.body.z);
    obj.rotation.y = this.modelYaw;
    if (this.localHunter) {
      this.localHunter.gunPivot.rotation.x = this.camPitch;
      // Animacija hoje glede na dejanski premik telesa
      const dt = Math.min(0.1, this.frameDt);
      if (dt > 0) {
        const speed = Math.hypot(this.body.x - this.lastBodyX, this.body.z - this.lastBodyZ) / dt;
        this.walkAmount += (Math.min(1, speed / 3.5) - this.walkAmount) * Math.min(1, dt * 10);
        this.walkPhase += speed * dt * 2.6;
      }
      this.localHunter.animate(this.walkPhase, this.walkAmount);
    }
    this.lastBodyX = this.body.x;
    this.lastBodyZ = this.body.z;
  }

  private spectating(): boolean {
    return !this.alive || this.role === 'spectator';
  }

  private spectateTarget(): RemotePlayer | null {
    const alive = [...this.remotes.map.values()]
      .filter((r) => r.alive && !r.id.startsWith('d'))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (alive.length === 0) return null;
    let cur = alive.find((r) => r.id === this.specId);
    if (!cur) {
      cur = alive[0]!;
      this.specId = cur.id;
    }
    return cur;
  }

  private nextSpectate(): void {
    const alive = [...this.remotes.map.values()]
      .filter((r) => r.alive && !r.id.startsWith('d'))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (alive.length === 0) return;
    const i = alive.findIndex((r) => r.id === this.specId);
    this.specId = alive[(i + 1) % alive.length]!.id;
  }

  private updateCamera(): void {
    const yaw = this.camYaw;
    const pitch = this.camPitch;
    const cp = Math.cos(pitch);
    this.fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    let px: number;
    let py: number;
    let pz: number;
    let dist: number;
    let shoulder = 0;
    if (this.spectating()) {
      const t = this.spectateTarget();
      if (t) {
        const h = shapeOf(t.model).h;
        px = t.pos.x;
        py = t.pos.y + Math.max(0.8, h + 0.3);
        pz = t.pos.z;
        dist = 4;
      } else {
        px = this.world.map.width / 2;
        py = 1.8;
        pz = this.world.map.depth / 2;
        dist = 0.01;
      }
    } else {
      const shape = shapeOf(this.model);
      px = this.body.x;
      pz = this.body.z;
      if (this.model === MODEL_HUNTER && this.scoped) {
        py = this.body.y + HUNTER_EYE + 0.05;
        dist = 0;
      } else if (this.model === MODEL_HUNTER) {
        py = this.body.y + HUNTER_EYE + 0.15;
        dist = 2.6;
        shoulder = 0.45;
      } else {
        py = this.body.y + Math.max(0.55, shape.h * 0.85 + 0.25);
        dist = 2.0 + Math.max(shape.hx, shape.hz) * 1.4;
      }
    }

    // Želen položaj kamere in trk s stenami.
    const ox = px + rightX * shoulder;
    const oz = pz + rightZ * shoulder;
    const desX = ox - this.fwd.x * dist;
    const desY = py - this.fwd.y * dist;
    const desZ = oz - this.fwd.z * dist;
    const dx = desX - px;
    const dy = desY - py;
    const dz = desZ - pz;
    const len = Math.hypot(dx, dy, dz);
    let k = 1;
    if (len > 1e-4) {
      const ray: Ray = { ox: px, oy: py, oz: pz, dx: dx / len, dy: dy / len, dz: dz / len };
      let best = len;
      for (const b of this.world.wallBoxes) {
        const t = rayAABB(ray, b, best);
        if (t !== null && t < best) best = t;
      }
      if (best < len) k = Math.max(0.05, best - 0.2) / len;
    }
    this.camera.position.set(px + dx * k, py + dy * k, pz + dz * k);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  private aimRay(): Ray {
    const p = this.camera.position;
    return { ox: p.x, oy: p.y, oz: p.z, dx: this.fwd.x, dy: this.fwd.y, dz: this.fwd.z };
  }

  private updateTargeting(): void {
    const active =
      this.role === 'prop' && this.alive && this.hasSpawn && (this.phase === 'hiding' || this.phase === 'hunting');
    this.target = -1;
    this.targetText = null;
    if (active) {
      const w = this.world;
      const hit = raycastWorld(w, this.aimRay(), 14);
      if (hit && hit.kind === 'prop' && distanceToProp(w, hit.index, this.body.x, this.body.z) <= TRANSFORM_RANGE) {
        const pl = w.map.props[hit.index]!;
        const name = PROPS[pl.type]?.name ?? '?';
        if (!canTransformInto(w, pl.type)) {
          this.targetText = `${name} – v to se ne moreš spremeniti`;
        } else if (pl.type !== this.model) {
          this.target = hit.index;
          this.targetText = `Spremeni se v: ${name}`;
        }
      }
    }
    if (this.target >= 0) {
      const b = this.world.propBoxes[this.target]!;
      this.highlight.position.set((b.minX + b.maxX) / 2, b.minY - 0.01, (b.minZ + b.maxZ) / 2);
      this.highlight.scale.set(b.maxX - b.minX + 0.04, b.maxY - b.minY + 0.04, b.maxZ - b.minZ + 0.04);
      this.highlight.visible = true;
    } else {
      this.highlight.visible = false;
    }
  }

  private handleActions(now: number): void {
    const inp = this.input;
    if (inp.consume('menu')) this.hooks.openMenu();
    if (inp.consume('nextSpec') && this.spectating()) this.nextSpectate();
    const isProp = this.role === 'prop' && this.alive;
    if (inp.consume('lock') && isProp) {
      this.locked = !this.locked;
      this.audio.click();
      this.hud.showBanner(
        this.locked ? '🔒 Zaklenjen – ne premikaš se, kamero lahko obračaš.' : '🔓 Odklenjen – lahko se premikaš.',
        1600,
      );
    }
    if (inp.consume('transform') && isProp) {
      (window as unknown as { __dbgC?: number }).__dbgC = Date.now();
      this.tryTransform(now);
    }
    if (inp.consume('decoy') && isProp) this.placeDecoy();
    if (inp.consume('radar') && this.role === 'hunter' && this.alive) {
      if (this.phase !== 'hunting') this.hooks.toast('Radar deluje med lovom.');
      else if (now < this.radarReadyAt) {
        this.hooks.toast('Radar bo pripravljen čez ' + Math.ceil((this.radarReadyAt - now) / 1000) + ' s.');
      } else {
        this.radarReadyAt = now + RADAR_COOLDOWN_MS;
        this.net.radar();
      }
    }
    if (inp.consume('scope') && this.role === 'hunter' && this.alive) {
      if (this.phase !== 'hunting') this.hooks.toast('Merek lahko uporabiš med lovom.');
      else if (!WEAPONS[this.weapon].scope) this.hooks.toast('Merek ima samo ostrostrelka 🎯 – zamenjaj orožje.');
      else this.scopeToggle = !this.scopeToggle;
    }
    const w1 = inp.consume('weapon1');
    const w2 = inp.consume('weapon2');
    const wt = inp.consume('weapon');
    if ((w1 || w2 || wt) && this.role === 'hunter' && this.alive) {
      const next: WeaponId = w1 ? 'pistol' : w2 ? 'sniper' : this.weapon === 'pistol' ? 'sniper' : 'pistol';
      this.switchWeapon(next);
    }
    if (inp.consume('reload') && this.role === 'hunter' && this.alive && !this.reloading && this.ammo < WEAPONS[this.weapon].mag) {
      this.net.reload();
      this.reloading = true;
    }
  }

  private placeDecoy(): void {
    if (this.phase !== 'hiding' && this.phase !== 'hunting') return;
    if (this.model === MODEL_GHOST) {
      this.hooks.toast('Najprej se spremeni v predmet – vaba je tvoja kopija.');
      return;
    }
    if (this.decoysLeft <= 0) {
      this.hooks.toast('Nimaš več vab.');
      return;
    }
    this.decoysLeft--;
    void this.net.decoy().then((res) => {
      if (res.ok) {
        this.audio.pop(null);
        this.hud.showBanner('🎭 Vaba postavljena – zdaj se odmakni!', 1800);
      } else {
        this.hooks.toast(res.error);
      }
    });
  }

  onRadar(r: { count: number; range: number; x: number; y: number; z: number }): void {
    this.effects.ring(this.tmpA.set(r.x, r.y + 0.1, r.z), r.range);
    this.audio.beep(true);
    const n = r.count;
    const text =
      n === 0
        ? 'ni nobenega skrivalca'
        : n === 1
          ? 'je 1 skrivalec'
          : n === 2
            ? 'sta 2 skrivalca'
            : n <= 4
              ? 'so ' + n + ' skrivalci'
              : 'je ' + n + ' skrivalcev';
    this.hud.showBanner('📡 Radar: v ' + r.range + ' m ' + text, 2500);
  }

  onDecoyHit(d: { id: string; owner: string; by: string }): void {
    this.lastDecoyHitAt = performance.now();
    if (d.owner === this.myId) this.hud.showBanner('🎭 Lovec je ustrelil tvojo vabo! +20', 2000);
    else if (d.by === this.myId) this.hud.showBanner('🎭 To je bila vaba! −5 ❤', 1600);
  }

  /** Nabor oblik mape (npr. 6 na Construction) ali null, če se spreminjaš z merjenjem. */
  private shapeList(): number[] | null {
    return this.world.transformable ? [...this.world.transformable] : null;
  }

  private nextShape(shapes: number[]): number {
    const i = shapes.indexOf(this.model);
    return shapes[(i + 1) % shapes.length]!;
  }

  private tryTransform(now: number): void {
    if (this.phase !== 'hiding' && this.phase !== 'hunting') return;
    if (this.transformPending) return;
    const shapes = this.shapeList();
    if (!shapes && this.target < 0) {
      if (now - this.lastNoTargetToast > 1500) {
        this.lastNoTargetToast = now;
        this.hooks.toast('Pomeri v predmet v bližini (do 4 m).');
      }
      return;
    }
    if (now < this.transformReadyAt) {
      this.hooks.toast('Počakaj trenutek …');
      return;
    }
    this.transformPending = true;
    // Mapa z naborom oblik: "Zamenjaj" kroži med njimi; sicer sprememba v predmet pod merkom.
    const request = shapes ? this.net.shape(this.nextShape(shapes)) : this.net.transform(this.target);
    void request.then((res) => {
      this.transformPending = false;
      if (res.ok) {
        const t = performance.now();
        this.transformReadyAt = t + TRANSFORM_COOLDOWN_MS;
        this.modelLockUntil = t + 600;
        if (res.model !== this.model) {
          this.applyModel(res.model);
          this.audio.pop(null);
          this.effects.puff(this.tmpA.set(this.body.x, this.body.y + 0.3, this.body.z));
        }
      } else {
        this.hooks.toast(res.error);
      }
    });
  }

  private handleFire(now: number): void {
    const tap = this.input.consumeFire();
    if (!(this.input.fireHeld || tap) || this.menuOpen) return;
    if (this.role !== 'hunter' || !this.alive || this.phase !== 'hunting' || !this.hasSpawn) return;
    if (this.reloading || now < this.nextFireAt) return;
    if (this.ammo <= 0) {
      this.audio.empty();
      this.nextFireAt = now + 400;
      this.net.reload();
      this.reloading = true;
      return;
    }
    this.nextFireAt = now + WEAPONS[this.weapon].intervalMs;
    this.lastShotAt = now;
    this.ammo--;
    const ray = this.aimRay();
    this.net.shoot({ ox: ray.ox, oy: ray.oy, oz: ray.oz, dx: ray.dx, dy: ray.dy, dz: ray.dz });

    // Takojšen lokalni učinek z isto logiko kot strežnik (ta ima zadnjo besedo o zadetku).
    const start = shotRayFromCamera(
      { x: ray.ox, y: ray.oy, z: ray.oz },
      { x: ray.dx, y: ray.dy, z: ray.dz },
      this.body,
    );
    const targets: ShotTarget[] = [];
    for (const rp of this.remotes.map.values()) {
      if (!rp.alive || rp.model === MODEL_HUNTER || Number.isNaN(rp.model)) continue;
      targets.push({ id: rp.id, x: rp.pos.x, y: rp.pos.y, z: rp.pos.z, yaw: rp.yaw, model: rp.model });
    }
    const wd = WEAPONS[this.weapon];
    const range = this.scoped && wd.scope ? wd.scopedRange : wd.range;
    const shot = resolveShot(this.world, start, range, targets, this.marked);
    const t = shot.t;
    // Namig: brez merka je cilj predaleč.
    if (!this.scoped && shot.kind === 'none' && now - this.lastRangeHint > 4000) {
      const far = resolveShot(this.world, start, WEAPONS.sniper.scopedRange, targets, this.marked);
      if (far.kind !== 'none') {
        this.lastRangeHint = now;
        this.hooks.toast(`Predaleč (več kot ${range} m)! Vzemi ostrostrelko 🎯 in merek 🔭`);
      }
    }
    const to = this.tmpB.set(start.ox + start.dx * t, start.oy + start.dy * t, start.oz + start.dz * t);
    const from = this.tmpA;
    if (this.localHunter && this.localObj && !this.scoped) {
      this.localObj.updateMatrixWorld(true);
      this.localHunter.muzzle.getWorldPosition(from);
    } else {
      // Skozi merek: sled iz točke tik pod očmi.
      from.set(start.ox, start.oy - 0.25, start.oz);
    }
    this.effects.muzzle(from);
    this.effects.tracer(from.clone(), to.clone());
    if (t < range) this.effects.spark(to.clone());
    this.audio.shot(null);
  }

  private sendState(now: number): void {
    if (now - this.lastSend < CLIENT_SEND_MS) return;
    if (!this.hasSpawn || !this.alive || this.role === 'spectator' || !IN_ROUND.has(this.phase)) return;
    this.lastSend = now;
    const r = (v: number): number => Math.round(v * 1000) / 1000;
    this.net.state({
      x: r(this.body.x),
      y: r(this.body.y),
      z: r(this.body.z),
      yaw: r(this.modelYaw),
      pitch: r(this.camPitch),
      seq: this.seq,
    });
  }

  private updateHud(now: number): void {
    const msLeft = Math.max(0, this.phaseEndLocal - now);
    const hud = this.hud;
    hud.setPhase(this.phase, msLeft);
    hud.setRole(this.role, this.alive);
    hud.setHp(this.hp, this.role !== 'spectator' && this.alive);

    const players = this.room?.players ?? [];
    const props = players.filter((p) => p.role === 'prop');
    hud.setPropsLeft(props.filter((p) => p.alive).length, props.length);

    const hunterActive = this.role === 'hunter' && this.alive;
    const propActive = this.role === 'prop' && this.alive;
    hud.setAmmo(hunterActive && this.phase !== 'roundEnd', this.ammo, this.reloading, this.scoped, this.weapon);
    hud.setCrosshair(hunterActive ? 'cross' : propActive ? 'dot' : 'none', this.target >= 0);
    hud.setTarget(propActive ? this.targetText : null);
    // Med skrivanjem skrivalcu pokažemo, v katere predmete se lahko spremeni (če je izbira omejena).
    const shapes = this.shapeList();
    if (propActive && shapes && (this.phase === 'hiding' || this.phase === 'hunting')) {
      const next = this.nextShape(shapes);
      const cur = shapes.indexOf(this.model);
      hud.setTransformList(
        this.phase === 'hiding'
          ? `Oblike: ${shapes.map((t) => PROPS[t]?.name ?? '?').join(' · ')} — Zamenjaj → ${PROPS[next]?.name ?? '?'}`
          : `${cur >= 0 ? `${cur + 1}/${shapes.length}` : '–'} · Zamenjaj → ${PROPS[next]?.name ?? '?'}`,
      );
    } else {
      hud.setTransformList(null);
    }
    const cooldown = Math.max(0, this.transformReadyAt - now);
    const base = shapes ? 'Zamenjaj' : 'Spremeni';
    hud.setTransformLabel(cooldown > 0 ? base + ' ' + Math.ceil(cooldown / 1000) + 's' : base);
    hud.setDecoys(this.decoysLeft, propActive && this.model !== MODEL_GHOST && this.decoysLeft > 0);
    hud.setRadar(this.phase === 'hunting' ? Math.max(0, Math.ceil((this.radarReadyAt - now) / 1000)) : -1);
    // Konec lova: opozorilo in odštevanje
    if (this.phase === 'hunting' && msLeft > 0) {
      if (msLeft <= 30000 && !this.warned30) {
        this.warned30 = true;
        this.hud.showBanner('⏱️ Še 30 sekund!', 2000);
        this.audio.beep(true);
      }
      const sec = Math.ceil(msLeft / 1000);
      if (sec <= 5 && sec !== this.lastHuntBeep) {
        this.lastHuntBeep = sec;
        this.audio.beep(sec === 1);
      }
    }

    const blind = this.role === 'hunter' && this.alive && this.phase === 'hiding';
    hud.setBlind(blind, msLeft);

    if (this.spectating() && IN_ROUND.has(this.phase)) {
      const t = this.spectateTarget();
      hud.setSpectate(t ? this.nameOf(t.id) : '');
    } else {
      hud.setSpectate(null);
    }

    const mode: ControlMode = blind
      ? 'none'
      : this.phase === 'roundEnd' || this.spectating()
        ? 'spectate'
        : hunterActive
          ? 'hunter'
          : propActive
            ? 'prop'
            : 'none';
    hud.setControls(mode, this.locked, (this.target >= 0 || this.shapeList() !== null) && now >= this.transformReadyAt);

    // Odštevanje zadnjih 5 sekund skrivanja
    if (this.phase === 'hiding') {
      const sec = Math.ceil(msLeft / 1000);
      if (sec <= 5 && sec >= 1 && sec !== this.lastBeep) {
        this.lastBeep = sec;
        this.audio.beep(false);
      }
    }
  }
}
