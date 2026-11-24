// Tipkovnica in miška (za računalnik): WASD, miška s pointer lock, klik = strel.

import type { InputState } from './Input';

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'KeyE',
  'KeyQ',
  'KeyN',
  'KeyG',
  'KeyF',
]);

export class KeyboardMouse {
  enabled = false;

  constructor(
    private readonly input: InputState,
    private readonly canvas: HTMLCanvasElement,
    private readonly onAnyInput: () => void,
  ) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.input.keys.clear();
      this.input.fireHeld = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.onAnyInput();
      if (document.pointerLockElement !== canvas) {
        this.requestLock();
        return;
      }
      this.input.fireHeld = true;
      this.input.queueFire();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fireHeld = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== canvas) return;
      this.input.lookMouseX += e.movementX;
      this.input.lookMouseY += e.movementY;
    });
  }

  requestLock(): void {
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      // ignoriraj
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    if (e.code === 'Escape' && down) {
      this.input.trigger('menu');
      return;
    }
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    this.onAnyInput();
    if (down) {
      if (e.repeat) return;
      this.input.keys.add(e.code);
      if (e.code === 'Space') this.input.queueJump();
      if (e.code === 'KeyE') this.input.trigger('transform');
      if (e.code === 'KeyQ') this.input.trigger('lock');
      if (e.code === 'KeyN') this.input.trigger('nextSpec');
      if (e.code === 'KeyG') this.input.trigger('decoy');
      if (e.code === 'KeyF') this.input.trigger('radar');
    } else {
      this.input.keys.delete(e.code);
    }
  }
}
