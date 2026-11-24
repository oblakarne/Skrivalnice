export type Phase = 'lobby' | 'hiding' | 'hunting' | 'roundEnd' | 'gameEnd';
export type Role = 'hunter' | 'prop' | 'spectator';
export type Team = 'hunters' | 'props';

export interface RoomSettings {
  /** Id mape (glej maps/index.ts). */
  map: string;
  /** Čas skrivanja v sekundah. */
  hideTime: number;
  /** Čas lova v sekundah. */
  huntTime: number;
  /** Število lovcev; 0 = samodejno. */
  hunters: number;
  /** Število rund. */
  rounds: number;
  /** Kazen za strel v napačen predmet. */
  penalty: boolean;
  /** Lovci imajo radar. */
  radar: boolean;
}

export const DEFAULT_SETTINGS: Readonly<RoomSettings> = Object.freeze({
  map: 'hisa',
  hideTime: 30,
  huntTime: 180,
  hunters: 0,
  rounds: 5,
  penalty: true,
  radar: true,
});

export interface PlayerInfo {
  id: string;
  name: string;
  role: Role;
  alive: boolean;
  connected: boolean;
  score: number;
  kills: number;
}

export interface RoomInfo {
  code: string;
  hostId: string;
  /** Mapa trenutne igre (v čakalnici izbrana mapa). */
  mapId: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  settings: RoomSettings;
  players: PlayerInfo[];
  lastWinner: Team | null;
}

/** Model igralca: -1 = lovec, 0 = duh (nespremenjen skrivalec), >0 = predmet iz kataloga. */
export const MODEL_HUNTER = -1;
export const MODEL_GHOST = 0;

/** [id, x, y, z, yaw, pitch, model, alive (0/1), hp] – kompaktno za omrežje. */
export type PlayerSnap = [string, number, number, number, number, number, number, number, number];

export interface OwnState {
  hp: number;
  /** Ms do samodejne spremembe (skrivalec) ali -1. */
  autoShapeIn: number;
  /** Preostale vabe (skrivalec). */
  decoys: number;
}

export interface Snapshot {
  /** Preostali čas trenutne faze v ms. */
  t: number;
  p: PlayerSnap[];
  you: OwnState | null;
  /** Imena skrivalcev so ta trenutek vidna vsem. */
  reveal: boolean;
  /** Ura strežnika (ms v dnevu) – za usklajeno dvigalo. */
  clock: number;
}

/** Točka na radarju: smer (kot kot pri yaw, zaokrožen) in groba oddaljenost 0..1. */
export interface RadarBlip {
  a: number;
  d: number;
}

export interface RadarResult {
  count: number;
  range: number;
  x: number;
  y: number;
  z: number;
  blips: RadarBlip[];
}

export type ShotKind = 'none' | 'wall' | 'prop' | 'player';

export interface ShotEvent {
  by: string;
  ox: number;
  oy: number;
  oz: number;
  hx: number;
  hy: number;
  hz: number;
  kind: ShotKind;
  target: string | null;
}
