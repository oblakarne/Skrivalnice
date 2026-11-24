import type { RadarResult, RoomInfo, RoomSettings, ShotEvent, Snapshot } from './types';

/** Stanje, ki ga odjemalec pošilja 20x na sekundo. */
export interface StateMsg {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Zadnja prejeta zaporedna številka teleporta. */
  seq: number;
}

export interface ShootMsg {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export interface TeleportMsg {
  x: number;
  y: number;
  z: number;
  yaw: number;
  seq: number;
}

export type Result = { ok: true } | { ok: false; error: string };
export type JoinResult = { ok: true; code: string; playerId: string } | { ok: false; error: string };
export type TransformResult = { ok: true; model: number } | { ok: false; error: string };

export interface ClientToServerEvents {
  createRoom: (data: { name: string }, ack: (r: JoinResult) => void) => void;
  joinRoom: (data: { name: string; code: string }, ack: (r: JoinResult) => void) => void;
  leaveRoom: () => void;
  updateSettings: (s: Partial<RoomSettings>) => void;
  startGame: (ack: (r: Result) => void) => void;
  backToLobby: () => void;
  state: (s: StateMsg) => void;
  transform: (propIndex: number, ack: (r: TransformResult) => void) => void;
  /** Zamah z lopato (žarek iz kamere). */
  shoot: (s: ShootMsg) => void;
  /** Skrivalec se spremeni v obliko iz nabora mape (brez merjenja; npr. Construction). */
  shape: (type: number, ack: (r: TransformResult) => void) => void;
  /** Skrivalec pusti vabo (lažno kopijo sebe). */
  decoy: (ack: (r: Result) => void) => void;
  /** Lovec uporabi radar. */
  radar: () => void;
}

export interface ServerToClientEvents {
  /** Pošlje se ob ponovni povezavi v obstoječo sobo. */
  welcome: (d: { playerId: string; code: string }) => void;
  room: (r: RoomInfo) => void;
  snap: (s: Snapshot) => void;
  teleport: (t: TeleportMsg) => void;
  shot: (s: ShotEvent) => void;
  kill: (k: { killer: string | null; victim: string }) => void;
  toast: (msg: string) => void;
  /** Rezultat radarja: število pravih skrivalcev v dosegu. */
  radar: (r: RadarResult) => void;
  /** Lovec je zadel vabo (vsem – za učinek in sporočilo). */
  decoyHit: (d: { id: string; owner: string; by: string }) => void;
  kicked: (reason: string) => void;
}
