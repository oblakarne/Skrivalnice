import { RADAR_SHOW_MS, type RadarBlip } from '../../../shared/src/index';

const SWEEP_PERIOD_MS = 1400;
const PULSE_PERIOD_MS = 1000;
const TAU = Math.PI * 2;

/**
 * Radarski zaslon lovca: zelen krog z vrtečim se žarkom in valovi iz sredine.
 * Pike kažejo smer skrivalcev glede na smer pogleda (zgoraj = naprej). Viden je nekaj sekund.
 */
export class RadarView {
  private readonly wrap: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly label: HTMLDivElement;
  private blips: RadarBlip[] = [];
  private startedAt = 0;
  private raf = 0;
  private size = 0;

  constructor(
    parent: HTMLElement,
    private readonly getYaw: () => number,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.id = 'radar-view';
    this.wrap.className = 'hidden';
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.label = document.createElement('div');
    this.label.className = 'radar-label';
    this.wrap.append(this.canvas, this.label);
    parent.appendChild(this.wrap);
  }

  get visible(): boolean {
    return this.raf !== 0;
  }

  show(blips: RadarBlip[], text: string): void {
    this.blips = blips;
    this.label.textContent = text;
    this.startedAt = performance.now();
    this.wrap.classList.remove('hidden');
    if (!this.raf) this.raf = requestAnimationFrame(this.draw);
  }

  hide(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.wrap.classList.add('hidden');
  }

  private resize(): number {
    const css = this.wrap.clientWidth || 160;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(css * dpr);
    if (px !== this.size) {
      this.size = px;
      this.canvas.width = px;
      this.canvas.height = px;
    }
    return px;
  }

  private readonly draw = (): void => {
    const now = performance.now();
    const age = now - this.startedAt;
    if (age >= RADAR_SHOW_MS) {
      this.hide();
      return;
    }
    this.raf = requestAnimationFrame(this.draw);
    const ctx = this.ctx;
    if (!ctx) return;
    const px = this.resize();
    const c = px / 2;
    const R = c * 0.94;
    // Ob koncu zbledi.
    const fade = Math.min(1, (RADAR_SHOW_MS - age) / 500, age / 200);
    this.wrap.style.opacity = String(fade);

    ctx.clearRect(0, 0, px, px);
    // Ozadje
    const bg = ctx.createRadialGradient(c, c, 0, c, c, R);
    bg.addColorStop(0, 'rgba(10, 60, 30, 0.85)');
    bg.addColorStop(1, 'rgba(4, 30, 14, 0.9)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.fill();

    // Obroči in križ
    ctx.strokeStyle = 'rgba(94, 224, 138, 0.35)';
    ctx.lineWidth = Math.max(1, px / 160);
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(c, c, (R * i) / 3, 0, TAU);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c - R, c);
    ctx.lineTo(c + R, c);
    ctx.moveTo(c, c - R);
    ctx.lineTo(c, c + R);
    ctx.stroke();

    // Valovi iz sredine navzven
    for (let k = 0; k < 2; k++) {
      const p = ((age + k * (PULSE_PERIOD_MS / 2)) % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
      ctx.strokeStyle = `rgba(120, 255, 160, ${(1 - p) * 0.7})`;
      ctx.lineWidth = Math.max(1.5, px / 90);
      ctx.beginPath();
      ctx.arc(c, c, R * p, 0, TAU);
      ctx.stroke();
    }

    // Vrteči se žarek (v smeri urinega kazalca, 0 = gor) s sledjo
    const sweep = ((age % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * TAU;
    const trail = 1.1;
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const a1 = sweep - (trail * i) / steps;
      const a0 = sweep - (trail * (i + 1)) / steps;
      ctx.fillStyle = `rgba(94, 224, 138, ${0.35 * (1 - i / steps)})`;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, a0 - Math.PI / 2, a1 - Math.PI / 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(170, 255, 190, 0.95)';
    ctx.lineWidth = Math.max(1.5, px / 80);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.sin(sweep) * R, c - Math.cos(sweep) * R);
    ctx.stroke();

    // Pike skrivalcev: zasvetijo, ko čez njih gre žarek, nato počasi ugasnejo.
    const yaw = this.getYaw();
    for (const b of this.blips) {
      const rel = b.a - yaw;
      const x = c - Math.sin(rel) * b.d * R * 0.92;
      const y = c - Math.cos(rel) * b.d * R * 0.92;
      const screenA = (Math.atan2(x - c, c - y) + TAU) % TAU;
      const since = (sweep - screenA + TAU) % TAU;
      // Pred prvim prehodom žarka pika še ni vidna.
      if (age < (screenA / TAU) * SWEEP_PERIOD_MS) continue;
      const glow = 0.25 + 0.75 * (1 - since / TAU);
      const r = Math.max(4, px / 22);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, `rgba(200, 255, 120, ${glow})`);
      g.addColorStop(1, 'rgba(200, 255, 120, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(230, 255, 170, ${glow})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.fill();
    }

    // Lovec v sredini (puščica kaže naprej)
    const s = Math.max(5, px / 18);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(c, c - s);
    ctx.lineTo(c + s * 0.7, c + s * 0.7);
    ctx.lineTo(c, c + s * 0.3);
    ctx.lineTo(c - s * 0.7, c + s * 0.7);
    ctx.closePath();
    ctx.fill();

    // Rob
    ctx.strokeStyle = 'rgba(120, 255, 160, 0.9)';
    ctx.lineWidth = Math.max(2, px / 60);
    ctx.beginPath();
    ctx.arc(c, c, R, 0, TAU);
    ctx.stroke();
  };
}
