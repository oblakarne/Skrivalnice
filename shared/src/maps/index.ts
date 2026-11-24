import { CONSTRUCTION } from './construction';
import { HISA } from './hisa';
import type { MapDef } from './types';

export const MAPS: Readonly<Record<string, MapDef>> = Object.freeze({
  [HISA.id]: HISA,
  [CONSTRUCTION.id]: CONSTRUCTION,
});

export const MAP_LIST: readonly { id: string; name: string }[] = [HISA, CONSTRUCTION].map((m) => ({
  id: m.id,
  name: m.name,
}));

export const DEFAULT_MAP_ID = HISA.id;

export function isMapId(v: unknown): v is string {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(MAPS, v);
}

export { HISA, CONSTRUCTION };
export type { MapDef, SolidDef, FloorDef, DecorDef, WorldPropPlacement, MapLighting, ElevatorDef } from './types';
