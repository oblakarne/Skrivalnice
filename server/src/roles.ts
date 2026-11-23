/** Koliko lovcev glede na število igralcev in nastavitev (0 = samodejno). */
export function hunterCount(players: number, setting: number): number {
  const wanted = setting > 0 ? setting : Math.max(1, Math.floor(players / 3));
  return Math.max(1, Math.min(wanted, players - 1));
}

export interface HunterCandidate {
  id: string;
  timesHunter: number;
}

/**
 * Pravična izbira lovcev: najprej tisti, ki so bili najmanjkrat lovci,
 * pri izenačenju naključno.
 */
export function chooseHunters(players: readonly HunterCandidate[], count: number, random: () => number): Set<string> {
  const keyed = players.map((p) => ({ p, key: random() }));
  keyed.sort((a, b) => a.p.timesHunter - b.p.timesHunter || a.key - b.key);
  return new Set(keyed.slice(0, count).map((k) => k.p.id));
}

/** Fisher-Yates premešanje (vrne novo tabelo). */
export function shuffle<T>(arr: readonly T[], random: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
