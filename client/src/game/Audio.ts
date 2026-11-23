// Vsi zvoki so sintetizirani z WebAudio – ni zvočnih datotek.

export interface Vec {
  x: number;
  y: number;
  z: number;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume: number;

  constructor(volume: number) {
    this.volume = volume;
  }

  /** Mora se poklicati ob dotiku/kliku (iOS zahteva uporabnikovo dejanje). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 0.25);
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos: Vec, forward: Vec): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    try {
      if (l.positionX) {
        const t = ctx.currentTime;
        l.positionX.setValueAtTime(pos.x, t);
        l.positionY.setValueAtTime(pos.y, t);
        l.positionZ.setValueAtTime(pos.z, t);
        l.forwardX.setValueAtTime(forward.x, t);
        l.forwardY.setValueAtTime(forward.y, t);
        l.forwardZ.setValueAtTime(forward.z, t);
        l.upX.setValueAtTime(0, t);
        l.upY.setValueAtTime(1, t);
        l.upZ.setValueAtTime(0, t);
      } else {
        const legacy = l as unknown as {
          setPosition: (x: number, y: number, z: number) => void;
          setOrientation: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
        };
        legacy.setPosition(pos.x, pos.y, pos.z);
        legacy.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
      }
    } catch {
      // ignoriraj
    }
  }

  /** Izhodna veriga: po želji 3D panner, nato glavna glasnost. */
  private out(pos: Vec | null): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return null;
    if (!pos) return this.master;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 2;
    p.maxDistance = 50;
    p.rolloffFactor = 1.1;
    try {
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else {
        (p as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.x, pos.y, pos.z);
      }
    } catch {
      // ignoriraj
    }
    p.connect(this.master);
    return p;
  }

  private tone(
    type: OscillatorType,
    freqs: [number, number][],
    dur: number,
    gain: number,
    pos: Vec | null = null,
  ): void {
    const ctx = this.ctx;
    const dest = this.out(pos);
    if (!ctx || !dest) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(freqs[0]![1], t);
    for (const [at, f] of freqs) osc.frequency.linearRampToValueAtTime(f, t + at);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + Math.max(0.02, dur - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(pos: Vec | null): void {
    const ctx = this.ctx;
    const dest = this.out(pos);
    if (!ctx || !dest || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.2);
  }

  hit(): void {
    this.tone('square', [[0, 1200]], 0.07, 0.18);
  }

  hurt(): void {
    this.tone('sawtooth', [
      [0, 300],
      [0.15, 120],
    ], 0.18, 0.25);
  }

  pop(pos: Vec | null): void {
    this.tone('sine', [
      [0, 300],
      [0.1, 900],
    ], 0.14, 0.4, pos);
  }

  kill(): void {
    this.tone('triangle', [
      [0, 660],
      [0.08, 660],
      [0.09, 990],
    ], 0.25, 0.35);
  }

  beep(high = false): void {
    this.tone('sine', [[0, high ? 990 : 660]], 0.12, 0.3);
  }

  click(): void {
    this.tone('sine', [[0, 1400]], 0.04, 0.15);
  }

  empty(): void {
    this.tone('square', [[0, 220]], 0.05, 0.12);
  }
}
