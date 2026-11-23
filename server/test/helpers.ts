import { io as connect, type Socket } from 'socket.io-client';
import {
  MODEL_HUNTER,
  PHYSICS_DT,
  shapeOf,
  stepBody,
  type Body,
  type World,
} from '../../shared/src/index';
import type {
  ClientToServerEvents,
  JoinResult,
  Result,
  RoomInfo,
  ServerToClientEvents,
  ShotEvent,
  Snapshot,
  TeleportMsg,
  TransformResult,
} from '../../shared/src/index';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let tokenCounter = 0;

export function makeToken(): string {
  tokenCounter++;
  return `testtoken${String(tokenCounter).padStart(8, '0')}${Math.random().toString(36).slice(2, 10)}`;
}

/** Testni odjemalec, ki si zapomni zadnje stanje. */
export class Bot {
  readonly socket: ClientSocket;
  room: RoomInfo | null = null;
  snap: Snapshot | null = null;
  seq = 0;
  playerId = '';
  pos = { x: 0, y: 0, z: 0, yaw: 0 };
  toasts: string[] = [];
  shots: ShotEvent[] = [];
  kills: { killer: string | null; victim: string }[] = [];
  teleports: TeleportMsg[] = [];
  /** Zgodovina sprememb faze/runde (kratka okna ne uidejo). */
  history: { phase: string; round: number; winner: string | null }[] = [];

  constructor(
    url: string,
    readonly token: string = makeToken(),
  ) {
    this.socket = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    this.socket.on('room', (r) => {
      this.room = r;
      const last = this.history[this.history.length - 1];
      if (!last || last.phase !== r.phase || last.round !== r.round) {
        this.history.push({ phase: r.phase, round: r.round, winner: r.lastWinner });
      }
    });
    this.socket.on('snap', (s) => (this.snap = s));
    this.socket.on('teleport', (t) => {
      this.seq = t.seq;
      this.pos = { x: t.x, y: t.y, z: t.z, yaw: t.yaw };
      this.teleports.push(t);
    });
    this.socket.on('welcome', (w) => (this.playerId = w.playerId));
    this.socket.on('toast', (m) => this.toasts.push(m));
    this.socket.on('shot', (s) => this.shots.push(s));
    this.socket.on('kill', (k) => this.kills.push(k));
  }

  connected(): Promise<void> {
    if (this.socket.connected) return Promise.resolve();
    return new Promise((res, rej) => {
      this.socket.once('connect', () => res());
      this.socket.once('connect_error', rej);
    });
  }

  async create(name: string): Promise<JoinResult> {
    await this.connected();
    const r = await this.socket.timeout(5000).emitWithAck('createRoom', { name });
    if (r.ok) this.playerId = r.playerId;
    return r;
  }

  async join(name: string, code: string): Promise<JoinResult> {
    await this.connected();
    const r = await this.socket.timeout(5000).emitWithAck('joinRoom', { name, code });
    if (r.ok) this.playerId = r.playerId;
    return r;
  }

  start(): Promise<Result> {
    return this.socket.timeout(5000).emitWithAck('startGame');
  }

  transform(index: number): Promise<TransformResult> {
    return this.socket.timeout(5000).emitWithAck('transform', index);
  }

  sendState(x: number, y: number, z: number, yaw = this.pos.yaw, pitch = 0): void {
    this.socket.emit('state', { x, y, z, yaw, pitch, seq: this.seq });
    this.pos = { x, y, z, yaw };
  }

  me(): RoomInfo['players'][number] | undefined {
    return this.room?.players.find((p) => p.id === this.playerId);
  }

  role(): string | undefined {
    return this.me()?.role;
  }

  close(): void {
    this.socket.disconnect();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitFor(cond: () => boolean, timeoutMs = 5000, label = 'pogoj'): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Časovna omejitev: ${label}`);
    await sleep(10);
  }
}

/** Hoja z isto fiziko kot na telefonu (stopnice, odri, trki) po zaporedju točk. */
export async function walkPhysics(bot: Bot, world: World, points: [number, number][], speed = 4): Promise<void> {
  const shape = shapeOf(MODEL_HUNTER);
  const body: Body = { x: bot.pos.x, y: bot.pos.y, z: bot.pos.z, vy: 0, onGround: true };
  for (const [tx, tz] of points) {
    let stuck = 0;
    for (let i = 0; i < 400; i++) {
      const dx = tx - body.x;
      const dz = tz - body.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const before = { x: body.x, z: body.z };
      for (let s = 0; s < 3; s++) {
        const v = Math.min(speed, d / (PHYSICS_DT * 3));
        stepBody(body, shape, 0, (dx / d) * v, (dz / d) * v, false, PHYSICS_DT, world.staticBoxes);
      }
      bot.sendState(body.x, body.y, body.z);
      await sleep(50);
      stuck = Math.hypot(body.x - before.x, body.z - before.z) < 0.01 ? stuck + 1 : 0;
      if (stuck > 10) throw new Error(`Obtičal pri (${body.x.toFixed(2)}, ${body.z.toFixed(2)}) na poti do (${tx}, ${tz})`);
    }
  }
}

/** Premakne bota v majhnih korakih (znotraj dovoljene hitrosti). */
export async function walk(bot: Bot, tx: number, tz: number, speed = 4): Promise<void> {
  const stepMs = 50;
  for (let i = 0; i < 1000; i++) {
    const dx = tx - bot.pos.x;
    const dz = tz - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return;
    const step = Math.min(d, (speed * stepMs) / 1000);
    bot.sendState(bot.pos.x + (dx / d) * step, bot.pos.y, bot.pos.z + (dz / d) * step);
    await sleep(stepMs);
  }
}
