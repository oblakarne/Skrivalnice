import {
  collisionYaw,
  insideBounds,
  MOVE_SPEED,
  MOVE_TOLERANCE_FACTOR,
  MOVE_TOLERANCE_SLACK,
  penetrationDepth,
  shapeOf,
  WALL_PENETRATION_TOLERANCE,
  type StateMsg,
  type World,
} from '../../shared/src/index';

export interface MoveCheckInput {
  /** Zadnji sprejeti položaj. */
  x: number;
  z: number;
  model: number;
  /** Sekunde od zadnjega sprejetega položaja. */
  dt: number;
}

export type MoveVerdict = 'ok' | 'too-fast' | 'out-of-bounds' | 'in-wall';

/** Ali je nov položaj, ki ga je poslal odjemalec, verjeten? */
export function checkMove(world: World, prev: MoveCheckInput, s: StateMsg): MoveVerdict {
  const dt = Math.min(Math.max(prev.dt, 0), 2);
  const allowed = MOVE_SPEED * MOVE_TOLERANCE_FACTOR * dt + MOVE_TOLERANCE_SLACK;
  if (Math.hypot(s.x - prev.x, s.z - prev.z) > allowed) return 'too-fast';
  if (!insideBounds(world, s.x, s.y, s.z)) return 'out-of-bounds';
  const shape = shapeOf(prev.model);
  const depth = penetrationDepth(s.x, s.y, s.z, shape, collisionYaw(prev.model, s.yaw), world.staticBoxes);
  if (depth > WALL_PENETRATION_TOLERANCE) return 'in-wall';
  return 'ok';
}
