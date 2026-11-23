import {
  collisionYaw,
  DEFAULT_SETTINGS,
  isWeaponId,
  WEAPONS,
  canTransformInto,
  HP_MAX,
  HUNTER_EYE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODEL_GHOST,
  MODEL_HUNTER,
  parseSettings,
  parseShoot,
  parseState,
  ceilingHeight,
  DECOYS_PER_ROUND,
  KILL_HEAL,
  RADAR_COOLDOWN_MS,
  RADAR_RANGE,
  SCORE_DECOY,
  resolveHorizontal,
  ROUND_END_MS,
  SCORE_KILL,
  SCORE_SURVIVE_ROUND,
  SCORE_SURVIVE_TICK,
  SCORE_SURVIVE_TICK_MS,
  shapeOf,
  SHOT_ORIGIN_TOLERANCE,
  TRANSFORM_COOLDOWN_MS,
  TRANSFORM_RANGE,
  getWorld,
  resolveShot,
  shotRayFromCamera,
  WRONG_PROP_PENALTY,
  type ShotTarget,
  type World,
  type Phase,
  type PlayerSnap,
  type Result,
  type RoomInfo,
  type RoomSettings,
  type Snapshot,
  type Team,
  type TransformResult,
} from '../../shared/src/index';
import { checkMove } from './movement';
import { Player } from './Player';
import { chooseHunters, hunterCount, shuffle } from './roles';
import type { GameServer, GameSocket, RoomOptions } from './types';

const IN_ROUND: ReadonlySet<Phase> = new Set<Phase>(['hiding', 'hunting', 'roundEnd']);

function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export class Room {
  readonly players = new Map<string, Player>();
  hostId = '';
  phase: Phase = 'lobby';
  round = 0;
  totalRounds = DEFAULT_SETTINGS.rounds;
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  phaseEndsAt = 0;
  lastWinner: Team | null = null;
  /** Mapa trenutne igre (v čakalnici = izbrana mapa). */
  mapId: string = DEFAULT_SETTINGS.map;
  private world: World = getWorld(DEFAULT_SETTINGS.map);
  private nextId = 0;
  private decoyId = 0;
  /** Vabe v trenutni rundi. */
  readonly decoys: { id: string; owner: string; x: number; y: number; z: number; yaw: number; model: number; alive: boolean }[] = [];
  private dirty = true;
  private lastTick: number;
  readonly channel: string;

  constructor(
    readonly code: string,
    private readonly io: GameServer,
    private readonly opts: RoomOptions,
    private readonly onEmpty: (room: Room) => void,
  ) {
    this.channel = `room:${code}`;
    this.lastTick = opts.now();
  }

  // ------------------------------------------------------------------ igralci

  get size(): number {
    return this.players.size;
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  private uniqueName(name: string): string {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 100; i++) {
      const suffix = ` ${i}`;
      const base = Array.from(name)
        .slice(0, 16 - suffix.length)
        .join('')
        .trimEnd();
      const candidate = base + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  addPlayer(token: string, name: string, socket: GameSocket): Player | string {
    if (this.isFull()) return 'Soba je polna.';
    const player = new Player(`p${++this.nextId}`, token, this.uniqueName(name));
    this.players.set(player.id, player);
    if (!this.hostId) this.hostId = player.id;
    this.attach(player, socket);
    if (IN_ROUND.has(this.phase)) {
      player.role = 'spectator';
      player.alive = false;
      this.toastTo(player, 'Igra že poteka – pridružiš se v naslednji rundi.');
    }
    this.dirty = true;
    return player;
  }

  private attach(player: Player, socket: GameSocket): void {
    player.socket = socket;
    player.connected = true;
    player.disconnectedAt = 0;
    socket.data.code = this.code;
    socket.data.playerId = player.id;
    void socket.join(this.channel);
  }

  /** Ponovna povezava (npr. po zaklepu zaslona). */
  reconnect(player: Player, socket: GameSocket): void {
    const old = player.socket;
    if (old && old !== socket) {
      old.data.code = null;
      old.data.playerId = null;
      old.emit('kicked', 'Povezan si z drugega okna.');
      old.disconnect(true);
    }
    this.attach(player, socket);
    socket.emit('welcome', { playerId: player.id, code: this.code });
    socket.emit('room', this.info());
    if (IN_ROUND.has(this.phase) && player.role !== 'spectator') this.teleport(player);
    this.dirty = true;
  }

  onDisconnect(player: Player, socket: GameSocket): void {
    if (player.socket !== socket) return;
    player.socket = null;
    player.connected = false;
    player.disconnectedAt = this.opts.now();
    if (this.hostId === player.id) {
      const next = [...this.players.values()].find((p) => p.connected);
      if (next) this.hostId = next.id;
    }
    this.dirty = true;
  }

  removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    const s = player.socket;
    if (s) {
      void s.leave(this.channel);
      s.data.code = null;
      s.data.playerId = null;
    }
    player.socket = null;
    if (this.hostId === id) {
      const next = [...this.players.values()].find((p) => p.connected) ?? [...this.players.values()][0];
      this.hostId = next ? next.id : '';
    }
    if (this.players.size === 0) {
      this.onEmpty(this);
      return;
    }
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd' && this.players.size < MIN_PLAYERS) {
      this.toLobby('Premalo igralcev – nazaj v čakalnico.');
    }
    this.dirty = true;
  }

  // ------------------------------------------------------------------ ukazi

  updateSettings(playerId: string, raw: unknown): void {
    if (playerId !== this.hostId || this.phase !== 'lobby') return;
    const s = parseSettings(raw);
    this.settings = { ...this.settings, ...s };
    this.mapId = this.settings.map;
    this.dirty = true;
  }

  startGame(playerId: string): Result {
    if (playerId !== this.hostId) return { ok: false, error: 'Igro lahko začne samo gostitelj.' };
    if (this.phase !== 'lobby' && this.phase !== 'gameEnd') return { ok: false, error: 'Igra že poteka.' };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < MIN_PLAYERS) return { ok: false, error: `Potrebna sta vsaj ${MIN_PLAYERS} igralca.` };
    for (const p of this.players.values()) {
      p.score = 0;
      p.kills = 0;
      p.timesHunter = 0;
    }
    this.round = 0;
    this.totalRounds = this.settings.rounds;
    this.lastWinner = null;
    this.mapId = this.settings.map;
    this.world = getWorld(this.mapId);
    this.startRound();
    return { ok: true };
  }

  backToLobby(playerId: string): void {
    if (playerId !== this.hostId || this.phase !== 'gameEnd') return;
    this.toLobby(null);
  }

  private toLobby(msg: string | null): void {
    this.phase = 'lobby';
    this.phaseEndsAt = 0;
    this.round = 0;
    for (const p of this.players.values()) {
      p.role = 'spectator';
      p.alive = false;
      p.reloadUntil = 0;
    }
    if (msg) this.io.to(this.channel).emit('toast', msg);
    this.dirty = true;
  }

  private startRound(): void {
    const now = this.opts.now();
    const participants = [...this.players.values()].filter((p) => p.connected);
    if (participants.length < MIN_PLAYERS) {
      this.toLobby('Premalo igralcev – nazaj v čakalnico.');
      return;
    }
    this.round++;
    const hunters = chooseHunters(
      participants,
      hunterCount(participants.length, this.settings.hunters),
      this.opts.random,
    );
    const map = this.world.map;
    const propSpawns = shuffle(map.propSpawns, this.opts.random);
    let hi = 0;
    let pi = 0;
    for (const p of this.players.values()) {
      p.reloadUntil = 0;
      p.lastShotAt = 0;
      p.transformReadyAt = 0;
      p.surviveAccum = 0;
      p.marked.clear();
      p.decoysLeft = DECOYS_PER_ROUND;
      p.radarReadyAt = 0;
      p.scoped = false;
      p.hp = HP_MAX;
      p.weapon = 'pistol';
      p.ammoBy = { pistol: WEAPONS.pistol.mag, sniper: WEAPONS.sniper.mag };
      p.pitch = 0;
      p.y = 0;
      p.lastMoveAt = now;
      if (!participants.includes(p)) {
        p.role = 'spectator';
        p.alive = false;
        continue;
      }
      p.alive = true;
      if (hunters.has(p.id)) {
        p.role = 'hunter';
        p.timesHunter++;
        p.model = MODEL_HUNTER;
        const [x, z] = map.hunterSpawns[hi++ % map.hunterSpawns.length]!;
        p.x = x;
        p.z = z;
        p.yaw = Math.PI; // gleda proti vratom (+z)
      } else {
        p.role = 'prop';
        p.model = MODEL_GHOST;
        const [x, z] = propSpawns[pi++ % propSpawns.length]!;
        p.x = x;
        p.z = z;
        p.yaw = (this.opts.random() * 2 - 1) * Math.PI;
      }
    }
    this.decoys.length = 0;
    this.phase = 'hiding';
    this.phaseEndsAt = now + this.settings.hideTime * 1000 * this.opts.timeScale;
    this.lastWinner = null;
    // Najprej stanje sobe (vloge), nato teleporti – odjemalec tako vedno pozna svojo vlogo.
    this.io.to(this.channel).emit('room', this.info());
    this.dirty = false;
    for (const p of participants) this.teleport(p);
  }

  private teleport(p: Player): void {
    p.seq++;
    p.socket?.emit('teleport', { x: p.x, y: p.y, z: p.z, yaw: p.yaw, seq: p.seq });
  }

  private toastTo(p: Player, msg: string): void {
    p.socket?.emit('toast', msg);
  }

  handleState(player: Player, raw: unknown): void {
    const s = parseState(raw);
    if (!s || s.seq !== player.seq) return;
    if (!IN_ROUND.has(this.phase) || !player.alive || player.role === 'spectator') return;
    const now = this.opts.now();
    if (this.phase === 'hiding' && player.role === 'hunter') {
      // Lovci med skrivanjem stojijo na mestu; sprejmemo le smer pogleda.
      player.yaw = s.yaw;
      player.pitch = s.pitch;
      return;
    }
    const verdict = checkMove(
      this.world,
      { x: player.x, z: player.z, model: player.model, dt: (now - player.lastMoveAt) / 1000 },
      s,
    );
    if (verdict !== 'ok') {
      this.teleport(player);
      return;
    }
    player.x = s.x;
    player.y = s.y;
    player.z = s.z;
    player.yaw = s.yaw;
    player.pitch = s.pitch;
    player.lastMoveAt = now;
  }

  handleTransform(player: Player, rawIndex: unknown): TransformResult {
    if ((this.phase !== 'hiding' && this.phase !== 'hunting') || player.role !== 'prop' || !player.alive) {
      return { ok: false, error: 'Zdaj se ne moreš spremeniti.' };
    }
    const now = this.opts.now();
    if (now < player.transformReadyAt) return { ok: false, error: 'Počakaj trenutek.' };
    if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex)) return { ok: false, error: 'Neveljaven predmet.' };
    const placement = this.world.map.props[rawIndex];
    if (!placement) return { ok: false, error: 'Neveljaven predmet.' };
    if (Math.hypot(placement.x - player.x, placement.z - player.z) > TRANSFORM_RANGE + 0.75) {
      return { ok: false, error: 'Predmet je predaleč.' };
    }
    return this.applyShape(player, placement.type);
  }

  /** Sprememba v obliko iz nabora mape (gumb "Zamenjaj" – brez merjenja). */
  handleShape(player: Player, rawType: unknown): TransformResult {
    if ((this.phase !== 'hiding' && this.phase !== 'hunting') || player.role !== 'prop' || !player.alive) {
      return { ok: false, error: 'Zdaj se ne moreš spremeniti.' };
    }
    if (typeof rawType !== 'number' || !Number.isInteger(rawType) || this.world.transformable === null) {
      return { ok: false, error: 'Neveljaven predmet.' };
    }
    if (this.opts.now() < player.transformReadyAt) return { ok: false, error: 'Počakaj trenutek.' };
    return this.applyShape(player, rawType);
  }

  private applyShape(player: Player, type: number): TransformResult {
    const now = this.opts.now();
    if (!canTransformInto(this.world, type)) return { ok: false, error: 'V ta predmet se ne moreš spremeniti.' };
    if (type === player.model) return { ok: true, model: type };
    const shape = shapeOf(type);
    if (player.y + shape.h > this.world.map.height - 0.05) return { ok: false, error: 'Tu ni prostora.' };
    const r = resolveHorizontal(
      player.x,
      player.z,
      player.y,
      shape,
      collisionYaw(type, player.yaw),
      this.world.staticBoxes,
    );
    // Tudi nad glavo mora biti prostor (npr. pod odrom).
    const ceil = ceilingHeight(r.x, r.z, player.y, shape, collisionYaw(type, player.yaw), this.world.staticBoxes);
    if (player.y + shape.h > ceil + 1e-3) return { ok: false, error: 'Tu ni prostora.' };
    const shift = Math.hypot(r.x - player.x, r.z - player.z);
    if (!r.ok || shift > 1.0) return { ok: false, error: 'Tu ni prostora.' };
    player.model = type;
    player.transformReadyAt = now + TRANSFORM_COOLDOWN_MS;
    if (shift > 1e-3) {
      player.x = r.x;
      player.z = r.z;
      this.teleport(player);
    }
    player.lastMoveAt = now;
    return { ok: true, model: type };
  }

  handleShoot(player: Player, raw: unknown): void {
    const s = parseShoot(raw);
    if (!s || this.phase !== 'hunting' || player.role !== 'hunter' || !player.alive) return;
    const now = this.opts.now();
    const w = WEAPONS[player.weapon];
    if (player.reloadUntil > 0) return;
    if (player.ammoBy[player.weapon] <= 0) {
      this.startReload(player, now);
      return;
    }
    if (now - player.lastShotAt < w.intervalMs - 40) return;
    const head = { x: player.x, y: player.y + HUNTER_EYE, z: player.z };
    if (Math.hypot(s.ox - head.x, s.oy - head.y, s.oz - head.z) > SHOT_ORIGIN_TOLERANCE) return;

    player.lastShotAt = now;
    player.ammoBy[player.weapon]--;
    const ray = shotRayFromCamera({ x: s.ox, y: s.oy, z: s.oz }, { x: s.dx, y: s.dy, z: s.dz }, player);
    const targets: ShotTarget[] = [];
    // Vabe najprej: pri enaki razdalji (vaba na mestu skrivalca) zadene vabo.
    for (const d of this.decoys) {
      if (d.alive) targets.push({ id: d.id, x: d.x, y: d.y, z: d.z, yaw: d.yaw, model: d.model });
    }
    for (const p of this.players.values()) {
      if (p.role === 'prop' && p.alive) targets.push({ id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw, model: p.model });
    }
    // Doseg: ostrostrelka skozi merek daleč. Pomoč pri merjenju le za že zadete skrivalce.
    const range = player.scoped && w.scope ? w.scopedRange : w.range;
    const hit = resolveShot(this.world, ray, range, targets, player.marked);
    const decoy = hit.kind === 'player' ? this.decoys.find((d) => d.id === hit.target && d.alive) : undefined;
    if (decoy) {
      // Vaba: lovec je zadel "pravi predmet" (kazen), lastnik dobi točke, vaba izgine.
      hit.kind = 'prop';
      hit.target = null;
      decoy.alive = false;
      const owner = this.players.get(decoy.owner);
      if (owner) owner.score += SCORE_DECOY;
      this.io.to(this.channel).emit('decoyHit', { id: decoy.id, owner: decoy.owner, by: player.id });
      this.dirty = true;
    }
    this.io.to(this.channel).emit('shot', {
      by: player.id,
      ox: r3(ray.ox),
      oy: r3(ray.oy),
      oz: r3(ray.oz),
      hx: r3(ray.ox + ray.dx * hit.t),
      hy: r3(ray.oy + ray.dy * hit.t),
      hz: r3(ray.oz + ray.dz * hit.t),
      kind: hit.kind,
      target: hit.target,
    });
    if (hit.kind === 'player' && hit.target) {
      player.marked.add(hit.target);
      const victim = this.players.get(hit.target);
      if (victim) this.damage(victim, w.damage, player);
    } else if (hit.kind === 'prop' && this.settings.penalty) {
      this.damage(player, WRONG_PROP_PENALTY, null);
    }
    if (player.ammoBy[player.weapon] <= 0 && player.alive) this.startReload(player, now);
  }

  private startReload(player: Player, now: number): void {
    player.reloadWeapon = player.weapon;
    player.reloadUntil = now + WEAPONS[player.weapon].reloadMs;
  }

  handleWeapon(player: Player, raw: unknown): void {
    if (!isWeaponId(raw) || player.role !== 'hunter' || !player.alive || raw === player.weapon) return;
    player.weapon = raw;
    player.reloadUntil = 0; // menjava prekine polnjenje
    player.scoped = false;
    player.lastShotAt = this.opts.now() - WEAPONS[raw].intervalMs + 300; // kratek zamik ob menjavi
  }

  private damage(victim: Player, amount: number, killer: Player | null): void {
    if (!victim.alive) return;
    victim.hp = Math.max(0, victim.hp - amount);
    if (victim.hp > 0) return;
    victim.alive = false;
    victim.reloadUntil = 0;
    if (killer) {
      killer.score += SCORE_KILL;
      killer.kills++;
      killer.hp = Math.min(HP_MAX, killer.hp + KILL_HEAL);
    }
    this.io.to(this.channel).emit('kill', { killer: killer ? killer.id : null, victim: victim.id });
    this.dirty = true;
  }

  /** Skrivalec pusti vabo – lažno kopijo svoje trenutne oblike na svojem mestu. */
  handleDecoy(player: Player): Result {
    if ((this.phase !== 'hiding' && this.phase !== 'hunting') || player.role !== 'prop' || !player.alive) {
      return { ok: false, error: 'Zdaj ne moreš postaviti vabe.' };
    }
    if (player.model === MODEL_GHOST) return { ok: false, error: 'Najprej se spremeni v predmet.' };
    if (player.decoysLeft <= 0) return { ok: false, error: 'Nimaš več vab.' };
    player.decoysLeft--;
    this.decoys.push({
      id: `d${++this.decoyId}`,
      owner: player.id,
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      model: player.model,
      alive: true,
    });
    return { ok: true };
  }

  /** Lovčev radar: koliko pravih skrivalcev (ne vab) je v dosegu. */
  handleRadar(player: Player): void {
    if (this.phase !== 'hunting' || player.role !== 'hunter' || !player.alive) return;
    const now = this.opts.now();
    if (now < player.radarReadyAt) return;
    player.radarReadyAt = now + RADAR_COOLDOWN_MS;
    let count = 0;
    for (const p of this.players.values()) {
      if (p.role !== 'prop' || !p.alive) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) <= RADAR_RANGE && Math.abs(p.y - player.y) < 4) count++;
    }
    player.socket?.emit('radar', { count, range: RADAR_RANGE, x: r3(player.x), y: r3(player.y), z: r3(player.z) });
  }

  handleScope(player: Player, on: unknown): void {
    if (typeof on !== 'boolean') return;
    player.scoped =
      on && player.role === 'hunter' && player.alive && IN_ROUND.has(this.phase) && WEAPONS[player.weapon].scope;
  }

  handleReload(player: Player): void {
    if (this.phase !== 'hunting' && this.phase !== 'hiding') return;
    if (player.role !== 'hunter' || !player.alive || player.reloadUntil > 0) return;
    if (player.ammoBy[player.weapon] >= WEAPONS[player.weapon].mag) return;
    this.startReload(player, this.opts.now());
  }

  // ------------------------------------------------------------------ zanka

  private count(role: 'hunter' | 'prop'): number {
    let n = 0;
    for (const p of this.players.values()) if (p.role === role && p.alive) n++;
    return n;
  }

  private endRound(winner: Team): void {
    const now = this.opts.now();
    if (winner === 'props') {
      for (const p of this.players.values()) if (p.role === 'prop' && p.alive) p.score += SCORE_SURVIVE_ROUND;
    }
    this.lastWinner = winner;
    this.phase = 'roundEnd';
    this.phaseEndsAt = now + ROUND_END_MS * this.opts.timeScale;
    this.dirty = true;
  }

  tick(): void {
    const now = this.opts.now();
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;

    // Odstrani igralce, ki se niso vrnili.
    for (const p of [...this.players.values()]) {
      if (!p.connected && now - p.disconnectedAt > this.opts.graceMs) this.removePlayer(p.id);
    }
    if (this.players.size === 0) return;

    // Polnjenje orožja
    for (const p of this.players.values()) {
      if (p.reloadUntil > 0 && now >= p.reloadUntil) {
        p.reloadUntil = 0;
        p.ammoBy[p.reloadWeapon] = WEAPONS[p.reloadWeapon].mag;
      }
    }

    switch (this.phase) {
      case 'hiding': {
        if (this.count('prop') === 0) this.endRound('hunters');
        else if (this.count('hunter') === 0) this.endRound('props');
        else if (now >= this.phaseEndsAt) {
          this.phase = 'hunting';
          this.phaseEndsAt = now + this.settings.huntTime * 1000 * this.opts.timeScale;
          this.dirty = true;
        }
        break;
      }
      case 'hunting': {
        for (const p of this.players.values()) {
          if (p.role !== 'prop' || !p.alive) continue;
          p.surviveAccum += dt;
          const tickMs = SCORE_SURVIVE_TICK_MS * this.opts.timeScale;
          while (p.surviveAccum >= tickMs) {
            p.surviveAccum -= tickMs;
            p.score += SCORE_SURVIVE_TICK;
            this.dirty = true;
          }
        }
        if (this.count('prop') === 0) this.endRound('hunters');
        else if (this.count('hunter') === 0) this.endRound('props');
        else if (now >= this.phaseEndsAt) this.endRound('props');
        break;
      }
      case 'roundEnd': {
        if (now >= this.phaseEndsAt) {
          if (this.round < this.totalRounds) this.startRound();
          else {
            this.phase = 'gameEnd';
            this.phaseEndsAt = 0;
            for (const p of this.players.values()) p.alive = false;
            this.dirty = true;
          }
        }
        break;
      }
      default:
        break;
    }

    if (this.dirty) {
      this.dirty = false;
      this.io.to(this.channel).emit('room', this.info());
    }
    if (IN_ROUND.has(this.phase)) this.sendSnapshots(now);
  }

  private sendSnapshots(now: number): void {
    const all: PlayerSnap[] = [];
    const huntersOnly: PlayerSnap[] = [];
    for (const p of this.players.values()) {
      if (p.role === 'spectator') continue;
      const snap: PlayerSnap = [
        p.id,
        r3(p.x),
        r3(p.y),
        r3(p.z),
        r3(p.yaw),
        r3(p.pitch),
        p.model,
        p.alive ? 1 : 0,
        p.hp,
      ];
      all.push(snap);
      if (p.role === 'hunter') huntersOnly.push(snap);
    }
    // Vabe so za vse videti kot skrivalci-predmeti.
    for (const d of this.decoys) all.push([d.id, r3(d.x), r3(d.y), r3(d.z), r3(d.yaw), 0, d.model, d.alive ? 1 : 0, HP_MAX]);
    const t = Math.max(0, Math.round(this.phaseEndsAt - now));
    for (const p of this.players.values()) {
      if (!p.socket) continue;
      // Lovci med skrivanjem ne dobijo položajev skrivalcev.
      const list = this.phase === 'hiding' && p.role === 'hunter' ? huntersOnly : all;
      const snapshot: Snapshot = {
        t,
        p: list,
        you:
          p.role === 'spectator'
            ? null
            : {
                hp: p.hp,
                ammo: p.ammoBy[p.weapon],
                reloading: p.reloadUntil > 0,
                weapon: p.weapon,
                decoys: p.decoysLeft,
              },
      };
      p.socket.volatile.emit('snap', snapshot);
    }
  }

  info(): RoomInfo {
    return {
      code: this.code,
      hostId: this.hostId,
      mapId: this.mapId,
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      settings: { ...this.settings },
      players: [...this.players.values()].map((p) => p.info()),
      lastWinner: this.lastWinner,
    };
  }

  /** Za teste: neposreden dostop do stanja igralca. */
  debugPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }
}
