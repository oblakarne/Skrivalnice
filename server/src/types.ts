import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/src/index';

export interface SocketData {
  token: string;
  code: string | null;
  playerId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

export interface RoomOptions {
  /** Faktor za vse čase (testi uporabljajo npr. 0.02). */
  timeScale: number;
  /** Koliko časa čakamo na ponovno povezavo. */
  graceMs: number;
  now: () => number;
  random: () => number;
}
