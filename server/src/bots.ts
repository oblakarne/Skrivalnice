// Boti za testiranje: pridružijo se sobi in igrajo preprosto.
// Uporaba: npm run bots -- --room ABCD [--count 3] [--url http://localhost:3000]
//  - kot skrivalci se spremenijo v najbližji predmet in mirujejo,
//  - kot lovci se naključno sprehajajo po hiši (z isto fiziko kot igralci).

import { io, type Socket } from 'socket.io-client';
import {
  collisionYaw,
  MODEL_GHOST,
  MOVE_SPEED,
  normalizeCode,
  PHYSICS_DT,
  shapeOf,
  stepBody,
  getWorld,
  type Body,
  type ClientToServerEvents,
  type RoomInfo,
  type ServerToClientEvents,
} from '../../shared/src/index';

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}

const url = arg('url', 'http://localhost:3000');
const code = normalizeCode(arg('room', ''));
const count = Math.max(1, Math.min(7, Number(arg('count', '3')) || 3));

if (!code) {
  console.error('Uporaba: npm run bots -- --room ABCD [--count 3] [--url http://localhost:3000]');
  process.exit(1);
}

class BotPlayer {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private room: RoomInfo | null = null;
  private id = '';
  private seq = 0;
  private body: Body = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
  private yaw = 0;
  private model = MODEL_GHOST;
  private alive = false;
  private dirYaw = 0;
  private nextTurn = 0;
  private transformed = false;

  constructor(private readonly name: string) {
    const token = `bot${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.padEnd(20, 'x').slice(0, 40);
    this.socket = io(url, { auth: { token }, transports: ['websocket'] });
    this.socket.on('connect', () => void this.join());
    this.socket.on('welcome', (w) => (this.id = w.playerId));
    this.socket.on('room', (r) => this.onRoom(r));
    this.socket.on('teleport', (t) => {
      this.body = { x: t.x, y: t.y, z: t.z, vy: 0, onGround: true };
      this.yaw = t.yaw;
      this.seq = t.seq;
    });
    this.socket.on('snap', (s) => {
      const me = s.p.find((p) => p[0] === this.id);
      if (me) {
        this.model = me[6];
        this.alive = me[7] === 1;
      }
    });
    setInterval(() => this.tick(), 50);
  }

  private async join(): Promise<void> {
    const res = await this.socket.timeout(5000).emitWithAck('joinRoom', { name: this.name, code: code! });
    if (res.ok) {
      this.id = res.playerId;
      console.log(`${this.name}: v sobi ${res.code}`);
    } else {
      console.log(`${this.name}: ${res.error}`);
    }
  }

  private onRoom(r: RoomInfo): void {
    const prevRound = this.room?.round;
    this.room = r;
    if (r.round !== prevRound) this.transformed = false;
  }

  private get world(): ReturnType<typeof getWorld> {
    return getWorld(this.room?.mapId ?? 'hisa');
  }

  private get role(): string {
    return this.room?.players.find((p) => p.id === this.id)?.role ?? 'spectator';
  }

  private tick(): void {
    const r = this.room;
    if (!r || !this.alive || (r.phase !== 'hiding' && r.phase !== 'hunting')) return;
    if (this.role === 'prop') {
      if (!this.transformed) {
        this.transformed = true;
        let best = -1;
        let bestD = Infinity;
        this.world.map.props.forEach((p, i) => {
          const d = Math.hypot(p.x - this.body.x, p.z - this.body.z);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best >= 0) void this.socket.timeout(3000).emitWithAck('transform', best).catch(() => undefined);
      }
      this.send();
      return;
    }
    if (this.role === 'hunter' && r.phase === 'hunting') {
      const now = Date.now();
      if (now > this.nextTurn) {
        this.dirYaw = Math.random() * Math.PI * 2;
        this.nextTurn = now + 1500 + Math.random() * 2500;
      }
      const shape = shapeOf(this.model);
      const steps = Math.round(0.05 / PHYSICS_DT);
      const before = { x: this.body.x, z: this.body.z };
      for (let i = 0; i < steps; i++) {
        stepBody(
          this.body,
          shape,
          collisionYaw(this.model, this.yaw),
          -Math.sin(this.dirYaw) * MOVE_SPEED * 0.7,
          -Math.cos(this.dirYaw) * MOVE_SPEED * 0.7,
          false,
          PHYSICS_DT,
          this.world.staticBoxes,
        );
      }
      // Če se ni premaknil (stena), zavije.
      if (Math.hypot(this.body.x - before.x, this.body.z - before.z) < 0.02) this.nextTurn = 0;
      this.yaw = this.dirYaw;
    }
    this.send();
  }

  private send(): void {
    this.socket.emit('state', {
      x: this.body.x,
      y: this.body.y,
      z: this.body.z,
      yaw: this.yaw,
      pitch: 0,
      seq: this.seq,
    });
  }
}

for (let i = 1; i <= count; i++) new BotPlayer(`Bot ${i}`);
console.log(`Zaganjam ${count} botov za sobo ${code} na ${url} (Ctrl+C za konec)`);
