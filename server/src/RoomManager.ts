import { ROOM_CODE_ALPHABET, ROOM_CODE_LEN } from '../../shared/src/index';
import type { Player } from './Player';
import { Room } from './Room';
import type { GameServer, RoomOptions } from './types';

export class RoomManager {
  readonly rooms = new Map<string, Room>();

  constructor(
    private readonly io: GameServer,
    private readonly opts: RoomOptions,
  ) {}

  private newCode(): string {
    for (let attempt = 0; attempt < 1000; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LEN; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(this.opts.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Ni prostih kod sob.');
  }

  createRoom(): Room {
    const code = this.newCode();
    const room = new Room(code, this.io, this.opts, (r) => this.rooms.delete(r.code));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  findByToken(token: string): { room: Room; player: Player } | null {
    for (const room of this.rooms.values()) {
      for (const player of room.players.values()) {
        if (player.token === token) return { room, player };
      }
    }
    return null;
  }

  tick(): void {
    for (const room of [...this.rooms.values()]) {
      try {
        room.tick();
      } catch (err) {
        console.error(`Napaka v sobi ${room.code}:`, err);
      }
    }
  }
}
