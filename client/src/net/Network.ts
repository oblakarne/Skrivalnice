import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  JoinResult,
  Result,
  RoomSettings,
  ServerToClientEvents,
  ShootMsg,
  StateMsg,
  TransformResult,
} from '../../../shared/src/index';
import { sessionToken } from '../util/settings';

export type GameClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const ACK_TIMEOUT_MS = 6000;

export class Network {
  readonly socket: GameClientSocket;
  token: string;

  /** Nov žeton in nova povezava (npr. ko je isti zavihek odprt dvakrat). */
  renewIdentity(): void {
    this.token = sessionToken(true);
    this.socket.auth = { token: this.token };
    window.setTimeout(() => {
      if (!this.socket.connected) this.socket.connect();
    }, 300);
  }

  constructor() {
    this.token = sessionToken();
    this.socket = io({
      auth: { token: this.token },
      reconnection: true,
      reconnectionDelay: 400,
      reconnectionDelayMax: 3000,
      timeout: 10000,
    });
  }

  private async ack<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }

  createRoom(name: string): Promise<JoinResult> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('createRoom', { name }), {
      ok: false,
      error: 'Strežnik se ne odziva. Poskusi znova.',
    });
  }

  joinRoom(name: string, code: string): Promise<JoinResult> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('joinRoom', { name, code }), {
      ok: false,
      error: 'Strežnik se ne odziva. Poskusi znova.',
    });
  }

  startGame(): Promise<Result> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('startGame'), {
      ok: false,
      error: 'Strežnik se ne odziva.',
    });
  }

  transform(index: number): Promise<TransformResult> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('transform', index), {
      ok: false,
      error: 'Ni odziva – poskusi znova.',
    });
  }

  leaveRoom(): void {
    this.socket.emit('leaveRoom');
  }

  updateSettings(s: Partial<RoomSettings>): void {
    this.socket.emit('updateSettings', s);
  }

  backToLobby(): void {
    this.socket.emit('backToLobby');
  }

  state(s: StateMsg): void {
    if (this.socket.connected) this.socket.volatile.emit('state', s);
  }

  shoot(s: ShootMsg): void {
    this.socket.emit('shoot', s);
  }

  reload(): void {
    this.socket.emit('reload');
  }

  weapon(w: 'pistol' | 'sniper'): void {
    this.socket.emit('weapon', w);
  }

  shape(type: number): Promise<TransformResult> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('shape', type), {
      ok: false,
      error: 'Ni odziva – poskusi znova.',
    });
  }

  decoy(): Promise<Result> {
    return this.ack(() => this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck('decoy'), { ok: false, error: 'Ni odziva.' });
  }

  radar(): void {
    this.socket.emit('radar');
  }

  scope(on: boolean): void {
    this.socket.emit('scope', on);
  }

}
