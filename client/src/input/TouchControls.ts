// Kontrole na dotik: levo joystick (pojavi se pod prstom), desno vlečenje za pogled, gumbi.

import { $ } from '../ui/dom';
import type { InputAction, InputState } from './Input';

const JOY_RADIUS = 55;

export class TouchControls {
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private fireId: number | null = null;
  private fireLast = { x: 0, y: 0 };
  private readonly base = $('joy-base');
  private readonly knob = $('joy-knob');

  constructor(
    private readonly input: InputState,
    onAnyTouch: () => void,
  ) {
    const layer = $('touch-layer');
    layer.addEventListener('pointerdown', (e) => {
      onAnyTouch();
      this.onLayerDown(e, layer);
    });
    layer.addEventListener('pointermove', (e) => this.onMove(e));
    layer.addEventListener('pointerup', (e) => this.onUp(e));
    layer.addEventListener('pointercancel', (e) => this.onUp(e));
    layer.addEventListener('lostpointercapture', (e) => this.onUp(e));

    // Strel: drži za streljanje, vleci za merjenje.
    const fire = $('btn-fire');
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onAnyTouch();
      this.fireId = e.pointerId;
      this.fireLast = { x: e.clientX, y: e.clientY };
      this.input.fireHeld = true;
      this.input.queueFire();
      fire.classList.add('active');
      try {
        fire.setPointerCapture(e.pointerId);
      } catch {
        // ignoriraj
      }
    });
    fire.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.fireId) return;
      this.input.lookTouchX += e.clientX - this.fireLast.x;
      this.input.lookTouchY += e.clientY - this.fireLast.y;
      this.fireLast = { x: e.clientX, y: e.clientY };
    });
    const fireUp = (e: PointerEvent): void => {
      if (e.pointerId !== this.fireId) return;
      this.fireId = null;
      this.input.fireHeld = false;
      fire.classList.remove('active');
    };
    fire.addEventListener('pointerup', fireUp);
    fire.addEventListener('pointercancel', fireUp);
    fire.addEventListener('lostpointercapture', fireUp);

    const bind = (id: string, action: InputAction | 'jump'): void => {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onAnyTouch();
        if (action === 'jump') this.input.queueJump();
        else this.input.trigger(action);
      });
    };
    bind('btn-jump', 'jump');
    bind('btn-transform', 'transform');
    bind('btn-reload', 'reload');
    bind('btn-lock', 'lock');
    bind('btn-scope', 'scope');
    bind('btn-weapon', 'weapon');
    bind('btn-decoy', 'decoy');
    bind('btn-radar', 'radar');
  }

  private onLayerDown(e: PointerEvent, layer: HTMLElement): void {
    e.preventDefault();
    const leftSide = e.clientX < window.innerWidth * 0.42;
    if (leftSide && this.joyId === null) {
      this.joyId = e.pointerId;
      this.joyOrigin = { x: e.clientX, y: e.clientY };
      this.base.classList.remove('idle');
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.knob.style.transform = 'translate(0px, 0px)';
    } else if (!leftSide && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    try {
      layer.setPointerCapture(e.pointerId);
    } catch {
      // ignoriraj
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      // Mrtva cona 12 %
      const nx = dx / JOY_RADIUS;
      const ny = -dy / JOY_RADIUS;
      const mag = Math.hypot(nx, ny);
      if (mag < 0.12) {
        this.input.moveX = 0;
        this.input.moveY = 0;
      } else {
        const scale = Math.min(1, (mag - 0.12) / 0.88) / mag;
        this.input.moveX = nx * scale;
        this.input.moveY = ny * scale;
      }
    } else if (e.pointerId === this.lookId) {
      this.input.lookTouchX += e.clientX - this.lookLast.x;
      this.input.lookTouchY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.input.moveX = 0;
      this.input.moveY = 0;
      this.idleJoystick();
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  /** Palica se vrne na privzeto mesto spodaj levo. */
  private idleJoystick(): void {
    this.base.style.left = '';
    this.base.style.top = '';
    this.knob.style.transform = 'translate(0px, 0px)';
    this.base.classList.add('idle');
  }

  /** Ponastavi vse dotike (npr. ob odprtju menija). */
  reset(): void {
    this.joyId = null;
    this.lookId = null;
    this.fireId = null;
    this.idleJoystick();
    $('btn-fire').classList.remove('active');
  }
}
