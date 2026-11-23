// Nastavitve igralca, shranjene v brskalniku (vse v try/catch – zasebni način ipd.).

export interface UserSettings {
  name: string;
  sensitivity: number;
  volume: number;
  /** 0 = nizka, 1 = srednja, 2 = visoka */
  quality: number;
  invertY: boolean;
}

const KEY = 'skrivalnica.settings.v1';

const DEFAULTS: UserSettings = {
  name: '',
  sensitivity: 1,
  volume: 0.8,
  quality: 1,
  invertY: false,
};

function clamp(v: unknown, min: number, max: number, def: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

export function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Record<keyof UserSettings, unknown>>;
    return {
      name: typeof p.name === 'string' ? p.name.slice(0, 16) : '',
      sensitivity: clamp(p.sensitivity, 0.2, 3, DEFAULTS.sensitivity),
      volume: clamp(p.volume, 0, 1, DEFAULTS.volume),
      quality: Math.round(clamp(p.quality, 0, 2, DEFAULTS.quality)),
      invertY: p.invertY === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: UserSettings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ni shranjevanja – ni težav
  }
}

/** Žeton seje: v sessionStorage, da ima vsak zavihek svojega (ponovna povezava po osvežitvi). */
export function sessionToken(forceNew = false): string {
  const key = 'skrivalnica.token';
  try {
    const existing = window.sessionStorage.getItem(key);
    if (!forceNew && existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  } catch {
    // ignoriraj
  }
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let token = '';
  for (const b of bytes) token += alphabet[b % 64];
  try {
    window.sessionStorage.setItem(key, token);
  } catch {
    // ignoriraj
  }
  return token;
}
