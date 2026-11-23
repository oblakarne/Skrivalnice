import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import {
  isObject,
  isToken,
  normalizeCode,
  RATE_LIMIT_BURST,
  RATE_LIMIT_PER_SEC,
  RECONNECT_GRACE_MS,
  sanitizeName,
  SERVER_TICK_MS,
  type JoinResult,
  type Result,
  type TransformResult,
} from '../../shared/src/index';
import type { Player } from './Player';
import type { Room } from './Room';
import { RoomManager } from './RoomManager';
import type { GameServer, GameSocket } from './types';

export interface GameServerOptions {
  port: number;
  host?: string;
  /** Faktor za čase (testi). */
  timeScale?: number;
  graceMs?: number;
  /** Mapa z zgrajenim odjemalcem; null = ne streži datotek. */
  staticDir?: string | null;
  random?: () => number;
  log?: boolean;
}

export interface RunningServer {
  port: number;
  io: GameServer;
  manager: RoomManager;
  close: () => Promise<void>;
}

class TokenBucket {
  private tokens = RATE_LIMIT_BURST;
  private last = Date.now();

  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(RATE_LIMIT_BURST, this.tokens + ((now - this.last) * RATE_LIMIT_PER_SEC) / 1000);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function safe<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args);
    } catch (err) {
      console.error('Napaka pri obdelavi dogodka:', err);
    }
  };
}

function toAck<T>(ack: unknown): (res: T) => void {
  return typeof ack === 'function' ? (res: T) => (ack as (r: T) => void)(res) : () => undefined;
}

export function defaultStaticDir(): string {
  // Deluje iz server/src (razvoj) in iz server/dist (produkcija).
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
}

export async function createGameServer(options: GameServerOptions): Promise<RunningServer> {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/health', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  const staticDir = options.staticDir === undefined ? defaultStaticDir() : options.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.use(
      express.static(staticDir, {
        setHeaders(res, path) {
          if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
  } else if (staticDir) {
    app.get('/', (_req, res) => {
      res
        .type('text/plain; charset=utf-8')
        .send('Odjemalec ni zgrajen. Zaženi "npm run build" ali za razvoj "npm run dev".');
    });
  }

  const httpServer = createServer(app);
  const io: GameServer = new Server(httpServer, {
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10000,
    pingTimeout: 15000,
    serveClient: false,
  });

  const manager = new RoomManager(io, {
    timeScale: options.timeScale ?? 1,
    graceMs: options.graceMs ?? RECONNECT_GRACE_MS,
    now: () => Date.now(),
    random: options.random ?? Math.random,
  });

  io.on('connection', (socket: GameSocket) => {
    const rawToken: unknown = isObject(socket.handshake.auth) ? socket.handshake.auth.token : undefined;
    socket.data = {
      token: isToken(rawToken) ? rawToken : randomBytes(16).toString('hex'),
      code: null,
      playerId: null,
    };
    const bucket = new TokenBucket();
    socket.use((_packet, next) => {
      // Preveč sporočil -> paket tiho zavržemo.
      if (bucket.take()) next();
    });
    socket.on('error', () => undefined);

    const existing = manager.findByToken(socket.data.token);
    if (existing) existing.room.reconnect(existing.player, socket);

    const current = (): { room: Room; player: Player } | null => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return null;
      const room = manager.get(code);
      const player = room?.players.get(playerId);
      if (!room || !player || player.socket !== socket) return null;
      return { room, player };
    };
    const leaveCurrent = (): void => {
      const c = current();
      if (c) c.room.removePlayer(c.player.id);
    };

    socket.on(
      'createRoom',
      safe((data: unknown, ack: unknown) => {
        const reply = toAck<JoinResult>(ack);
        const name = sanitizeName(isObject(data) ? data.name : undefined);
        if (!name) return reply({ ok: false, error: 'Vpiši svoje ime.' });
        leaveCurrent();
        const room = manager.createRoom();
        const res = room.addPlayer(socket.data.token, name, socket);
        if (typeof res === 'string') return reply({ ok: false, error: res });
        socket.emit('welcome', { playerId: res.id, code: room.code });
        reply({ ok: true, code: room.code, playerId: res.id });
        socket.emit('room', room.info());
      }),
    );

    socket.on(
      'joinRoom',
      safe((data: unknown, ack: unknown) => {
        const reply = toAck<JoinResult>(ack);
        const d = isObject(data) ? data : {};
        const name = sanitizeName(d.name);
        if (!name) return reply({ ok: false, error: 'Vpiši svoje ime.' });
        const code = normalizeCode(d.code);
        if (!code) return reply({ ok: false, error: 'Koda sobe ima 4 znake.' });
        const room = manager.get(code);
        if (!room) return reply({ ok: false, error: 'Soba s to kodo ne obstaja.' });
        const c = current();
        if (c && c.room === room) {
          socket.emit('welcome', { playerId: c.player.id, code: room.code });
          reply({ ok: true, code: room.code, playerId: c.player.id });
          socket.emit('room', room.info());
          return;
        }
        if (room.isFull()) return reply({ ok: false, error: 'Soba je polna.' });
        leaveCurrent();
        const res = room.addPlayer(socket.data.token, name, socket);
        if (typeof res === 'string') return reply({ ok: false, error: res });
        socket.emit('welcome', { playerId: res.id, code: room.code });
        reply({ ok: true, code: room.code, playerId: res.id });
        socket.emit('room', room.info());
      }),
    );

    socket.on('leaveRoom', safe(leaveCurrent));

    socket.on(
      'updateSettings',
      safe((raw: unknown) => {
        const c = current();
        if (c) c.room.updateSettings(c.player.id, raw);
      }),
    );

    socket.on(
      'startGame',
      safe((ack: unknown) => {
        const reply = toAck<Result>(ack);
        const c = current();
        if (!c) return reply({ ok: false, error: 'Nisi v sobi.' });
        reply(c.room.startGame(c.player.id));
      }),
    );

    socket.on(
      'backToLobby',
      safe(() => {
        const c = current();
        if (c) c.room.backToLobby(c.player.id);
      }),
    );

    socket.on(
      'state',
      safe((raw: unknown) => {
        const c = current();
        if (c) c.room.handleState(c.player, raw);
      }),
    );

    socket.on(
      'transform',
      safe((index: unknown, ack: unknown) => {
        const reply = toAck<TransformResult>(ack);
        const c = current();
        if (!c) return reply({ ok: false, error: 'Nisi v sobi.' });
        reply(c.room.handleTransform(c.player, index));
      }),
    );

    socket.on(
      'shoot',
      safe((raw: unknown) => {
        const c = current();
        if (c) c.room.handleShoot(c.player, raw);
      }),
    );

    socket.on(
      'reload',
      safe(() => {
        const c = current();
        if (c) c.room.handleReload(c.player);
      }),
    );

    socket.on(
      'scope',
      safe((on: unknown) => {
        const c = current();
        if (c) c.room.handleScope(c.player, on);
      }),
    );

    socket.on(
      'weapon',
      safe((w: unknown) => {
        const c = current();
        if (c) c.room.handleWeapon(c.player, w);
      }),
    );

    socket.on(
      'shape',
      safe((type: unknown, ack: unknown) => {
        const reply = toAck<TransformResult>(ack);
        const c = current();
        if (!c) return reply({ ok: false, error: 'Nisi v sobi.' });
        reply(c.room.handleShape(c.player, type));
      }),
    );

    socket.on(
      'decoy',
      safe((ack: unknown) => {
        const reply = toAck<Result>(ack);
        const c = current();
        if (!c) return reply({ ok: false, error: 'Nisi v sobi.' });
        reply(c.room.handleDecoy(c.player));
      }),
    );

    socket.on(
      'radar',
      safe(() => {
        const c = current();
        if (c) c.room.handleRadar(c.player);
      }),
    );

    socket.on('disconnect', () => {
      const c = current();
      if (c) c.room.onDisconnect(c.player, socket);
    });
  });

  const timer = setInterval(() => manager.tick(), SERVER_TICK_MS);

  await new Promise<void>((resolvePromise, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host ?? '0.0.0.0', () => {
      httpServer.off('error', reject);
      resolvePromise();
    });
  });
  const port = (httpServer.address() as AddressInfo).port;
  if (options.log !== false) console.log(`Skrivalnica: strežnik posluša na vratih ${port}`);

  return {
    port,
    io,
    manager,
    close: () =>
      new Promise<void>((resolvePromise) => {
        clearInterval(timer);
        void io.close(() => resolvePromise());
      }),
  };
}
