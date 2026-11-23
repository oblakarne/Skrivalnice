// Skupno stanje vnosa za dotik in tipkovnico/miško.

export type InputAction = 'transform' | 'lock' | 'reload' | 'nextSpec' | 'menu' | 'scope' | 'weapon' | 'weapon1' | 'weapon2' | 'decoy' | 'radar';

export class InputState {
  /** -1..1 (desno pozitivno) */
  moveX = 0;
  /** -1..1 (naprej pozitivno) */
  moveY = 0;
  /** Nakopičen premik pogleda v pikslih (dotik) */
  lookTouchX = 0;
  lookTouchY = 0;
  /** Nakopičen premik pogleda (miška) */
  lookMouseX = 0;
  lookMouseY = 0;
  fireHeld = false;
  /** Desni gumb miške drži merek. */
  scopeHeld = false;
  /** Zapah: kratek dotik/klik vedno sproži vsaj en strel (tudi pri nizkem FPS). */
  private fireTap = false;
  private jumpQueued = false;
  private actions = new Set<InputAction>();

  // Tipkovnica
  keys = new Set<string>();

  queueJump(): void {
    this.jumpQueued = true;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued || this.keys.has('Space');
    this.jumpQueued = false;
    return j;
  }

  queueFire(): void {
    this.fireTap = true;
  }

  consumeFire(): boolean {
    const f = this.fireTap;
    this.fireTap = false;
    return f;
  }

  trigger(a: InputAction): void {
    this.actions.add(a);
  }

  consume(a: InputAction): boolean {
    return this.actions.delete(a);
  }

  /** Smer gibanja iz joysticka ali tipk (dolžina največ 1). */
  movement(): { x: number; y: number } {
    let x = this.moveX;
    let y = this.moveY;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  reset(): void {
    this.moveX = 0;
    this.moveY = 0;
    this.lookTouchX = 0;
    this.lookTouchY = 0;
    this.lookMouseX = 0;
    this.lookMouseY = 0;
    this.fireHeld = false;
    this.scopeHeld = false;
    this.fireTap = false;
    this.jumpQueued = false;
    this.actions.clear();
    this.keys.clear();
  }
}
