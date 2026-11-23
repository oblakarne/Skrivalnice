import { HP_MAX, MODEL_GHOST, WEAPONS, type PlayerInfo, type Role, type WeaponId } from '../../shared/src/index';
import type { GameSocket } from './types';

export class Player {
  socket: GameSocket | null = null;
  connected = true;
  disconnectedAt = 0;

  role: Role = 'spectator';
  alive = false;
  score = 0;
  kills = 0;
  timesHunter = 0;

  // Položaj (zadnji sprejeti)
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  model = MODEL_GHOST;
  lastMoveAt = 0;
  /** Zaporedna številka teleporta; stanja s staro številko zavržemo. */
  seq = 0;

  hp = HP_MAX;
  weapon: WeaponId = 'pistol';
  ammoBy: Record<WeaponId, number> = { pistol: WEAPONS.pistol.mag, sniper: WEAPONS.sniper.mag };
  reloadWeapon: WeaponId = 'pistol';
  reloadUntil = 0;
  lastShotAt = 0;
  /** Lovec gleda skozi merek (daljši doseg strela). */
  scoped = false;

  transformReadyAt = 0;
  decoysLeft = 0;
  radarReadyAt = 0;
  surviveAccum = 0;
  /** Skrivalci, ki jih je ta lovec v tej rundi že zadel (pomoč pri merjenju). */
  readonly marked = new Set<string>();

  constructor(
    readonly id: string,
    readonly token: string,
    public name: string,
  ) {}

  info(): PlayerInfo {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      alive: this.alive,
      connected: this.connected,
      score: this.score,
      kills: this.kills,
    };
  }
}
