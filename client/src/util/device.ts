// Funkcije telefona: zaslon vedno prižgan, celozaslonski način, zaklep orientacije.

export const isTouchDevice: boolean =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches === true || 'ontouchstart' in window || navigator.maxTouchPoints > 0);

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', cb: () => void) => void;
}

let wakeLock: WakeLockSentinelLike | null = null;
let wantWakeLock = false;

async function acquireWakeLock(): Promise<void> {
  const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
  if (!nav.wakeLock || wakeLock || document.visibilityState !== 'visible') return;
  try {
    const lock = await nav.wakeLock.request('screen');
    wakeLock = lock;
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
  } catch {
    // Ni podprto ali zavrnjeno (npr. brez HTTPS) – igra deluje naprej.
  }
}

export function setWakeLock(on: boolean): void {
  wantWakeLock = on;
  if (on) {
    void acquireWakeLock();
  } else if (wakeLock) {
    const l = wakeLock;
    wakeLock = null;
    l.release().catch(() => undefined);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wantWakeLock) void acquireWakeLock();
});

/** Na telefonu poskusi celozaslonski način in ležečo orientacijo (tiho, če ne gre). */
export function enterImmersive(): void {
  if (!isTouchDevice) return;
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => lockLandscape())
        .catch(() => undefined);
    } else {
      lockLandscape();
    }
  } catch {
    // ignoriraj
  }
}

function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  try {
    o?.lock?.('landscape').catch(() => undefined);
  } catch {
    // ignoriraj
  }
}

/**
 * Prepreči zoom z dvema prstoma na iOS. Dvojni dotik za povečavo že onemogoča CSS
 * `touch-action` (none/manipulation), zato hitrih zaporednih dotikov ne blokiramo.
 */
export function preventZoom(): void {
  const block = (e: Event): void => e.preventDefault();
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
