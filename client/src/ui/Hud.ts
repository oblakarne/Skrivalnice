import { WEAPONS, type Phase, type Role, type WeaponId } from '../../../shared/src/index';
import { $, el, formatTime, show } from './dom';

export type ControlMode = 'hunter' | 'prop' | 'spectate' | 'none';

export class Hud {
  private readonly root = $('hud');
  private readonly badge = $('role-badge');
  private readonly hpFill = $('hp-fill');
  private readonly hpText = $('hp-text');
  private readonly phaseLabel = $('phase-label');
  private readonly timer = $('timer');
  private readonly propsLeft = $('props-left');
  private readonly crosshair = $('crosshair');
  private readonly targetLabel = $('target-label');
  private readonly ammo = $('ammo');
  private readonly banner = $('banner');
  private readonly killfeed = $('killfeed');
  private readonly flash = $('damage-flash');
  private readonly blind = $('blind');
  private readonly blindTimer = $('blind-timer');
  private readonly specBar = $('spectate-bar');
  private readonly specName = $('spectate-name');
  private readonly touch = $('touch-controls');
  private readonly desktopHelp = $('desktop-help');
  private readonly lockBadge = $('lock-badge');
  private readonly scopeOverlay = $('scope-overlay');
  private readonly transformList = $('transform-list');
  private bannerTimer = 0;
  private hitTimer = 0;
  private flashTimer = 0;
  private last = { hp: -1, timer: '', ammo: '', props: '', target: '#init#', blind: '', mode: '' };

  constructor(private readonly touchEnabled: boolean) {}

  setVisible(on: boolean): void {
    show(this.root, on);
  }

  setRole(role: Role, alive: boolean): void {
    const text = !alive || role === 'spectator' ? 'GLEDALEC' : role === 'hunter' ? 'LOVEC' : 'SKRIVALEC';
    if (this.badge.textContent !== text) this.badge.textContent = text;
    this.badge.className = `badge ${alive && role !== 'spectator' ? role : ''}`;
  }

  setHp(hp: number, visible: boolean): void {
    show(this.hpFill.parentElement!, visible);
    if (hp === this.last.hp) return;
    this.last.hp = hp;
    this.hpFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
    this.hpFill.classList.toggle('low', hp <= 30);
    this.hpText.textContent = String(Math.max(0, Math.round(hp)));
  }

  setPhase(phase: Phase, msLeft: number): void {
    const label = phase === 'hiding' ? 'Skrivanje' : phase === 'hunting' ? 'Lov' : phase === 'roundEnd' ? 'Konec runde' : '';
    if (this.phaseLabel.textContent !== label) this.phaseLabel.textContent = label;
    const t = formatTime(msLeft);
    if (t !== this.last.timer) {
      this.last.timer = t;
      this.timer.textContent = t;
    }
  }

  setPropsLeft(alive: number, total: number): void {
    const t = `Skrivalci: ${alive}/${total}`;
    if (t !== this.last.props) {
      this.last.props = t;
      this.propsLeft.textContent = t;
    }
  }

  setAmmo(visible: boolean, ammo: number, reloading: boolean, scoped: boolean, weapon: WeaponId): void {
    show(this.ammo, visible);
    if (!visible) return;
    const w = WEAPONS[weapon];
    const icon = weapon === 'sniper' ? '🎯' : '🔫';
    const range = scoped && w.scope ? `🔭 ${w.scopedRange} m` : `${w.range} m`;
    const t = reloading ? `${icon} Polnim … · ${range}` : `${icon} ${ammo} / ${w.mag} · ${range}`;
    if (t !== this.last.ammo) {
      this.last.ammo = t;
      this.ammo.textContent = t;
    }
  }

  setWeapon(w: WeaponId): void {
    const b = $('btn-weapon');
    // Gumb pokaže orožje, na katerega preklopiš.
    b.firstChild!.textContent = w === 'pistol' ? '🎯' : '🔫';
    b.lastElementChild!.textContent = w === 'pistol' ? 'Ostrostr.' : 'Pištola';
    $('btn-scope').classList.toggle('disabled', w !== 'sniper');
  }

  setDecoys(n: number, enabled: boolean): void {
    const b = $('btn-decoy');
    b.lastElementChild!.textContent = 'Vaba ' + n;
    b.classList.toggle('disabled', !enabled);
  }

  /** Sekunde do radarja (0 = pripravljen, -1 = ni lova). */
  setRadar(sec: number): void {
    const b = $('btn-radar');
    const label = sec > 0 ? sec + 's' : 'Radar';
    if (b.lastElementChild!.textContent !== label) b.lastElementChild!.textContent = label;
    b.classList.toggle('disabled', sec !== 0);
  }

  setTransformLabel(text: string): void {
    const s = $('btn-transform').lastElementChild!;
    if (s.textContent !== text) s.textContent = text;
  }

  setScope(on: boolean): void {
    show(this.scopeOverlay, on);
    $('btn-scope').classList.toggle('active', on);
  }

  /** Seznam predmetov, v katere se je mogoče spremeniti (null = skrij). */
  setTransformList(text: string | null): void {
    show(this.transformList, text !== null);
    if (text !== null && this.transformList.textContent !== text) this.transformList.textContent = text;
  }

  setCrosshair(kind: 'cross' | 'dot' | 'none', onTarget: boolean): void {
    show(this.crosshair, kind !== 'none');
    this.crosshair.classList.toggle('dot', kind === 'dot');
    this.crosshair.classList.toggle('target', onTarget);
  }

  /** Besedilo pod merkom skrivalca (npr. "Spremeni se v: Stol") ali null. */
  setTarget(text: string | null): void {
    const key = text ?? '';
    if (key === this.last.target) return;
    this.last.target = key;
    show(this.targetLabel, !!text);
    if (text) this.targetLabel.textContent = text;
  }

  showBanner(text: string, ms = 2500): void {
    this.banner.textContent = text;
    show(this.banner, true);
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => show(this.banner, false), ms);
  }

  hideBanner(): void {
    window.clearTimeout(this.bannerTimer);
    show(this.banner, false);
  }

  addKill(text: string): void {
    const d = el('div', text);
    this.killfeed.appendChild(d);
    while (this.killfeed.children.length > 4) this.killfeed.firstElementChild?.remove();
    window.setTimeout(() => d.remove(), 5200);
  }

  hitMarker(): void {
    this.crosshair.classList.add('hit');
    window.clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.crosshair.classList.remove('hit'), 180);
  }

  damageFlash(): void {
    this.flash.classList.add('on');
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => this.flash.classList.remove('on'), 60);
  }

  setBlind(on: boolean, msLeft: number): void {
    show(this.blind, on);
    if (!on) return;
    const t = String(Math.max(0, Math.ceil(msLeft / 1000)));
    if (t !== this.last.blind) {
      this.last.blind = t;
      this.blindTimer.textContent = t;
    }
  }

  setSpectate(name: string | null): void {
    show(this.specBar, name !== null);
    if (name !== null) {
      const t = name ? `Gledaš: ${name}` : 'Gledaš igro';
      if (this.specName.textContent !== t) this.specName.textContent = t;
    }
  }

  setControls(mode: ControlMode, locked: boolean, canTransform: boolean): void {
    const key = `${mode}|${locked}|${canTransform}`;
    if (key === this.last.mode) return;
    this.last.mode = key;
    show(this.touch, this.touchEnabled && mode !== 'none');
    for (const b of this.touch.querySelectorAll<HTMLElement>('.tbtn')) {
      const roles = (b.dataset.for ?? '').split(' ');
      show(b, roles.includes(mode));
    }
    const lock = $('btn-lock');
    lock.classList.toggle('active', locked);
    lock.firstChild!.textContent = locked ? '🔒' : '🔓';
    lock.lastElementChild!.textContent = locked ? 'Odkleni' : 'Zakleni';
    $('btn-transform').classList.toggle('disabled', !canTransform);
    // Zaklenjen skrivalec ne more hoditi in skakati – to pokažemo tudi na gumbih.
    $('btn-jump').classList.toggle('disabled', mode === 'prop' && locked);
    $('joy-base').classList.toggle('disabled', mode === 'prop' && locked);
    show(this.lockBadge, mode === 'prop' && locked);
    if (!this.touchEnabled) {
      show(this.desktopHelp, mode !== 'none');
      this.desktopHelp.textContent =
        mode === 'hunter'
          ? 'WASD hoja · klik strel · 1 pištola · 2 ostrostrelka (X menjava) · desni klik / Z merek · R polni · Esc meni'
          : mode === 'prop'
            ? `WASD hoja · E spremeni se · Q ${locked ? 'odkleni' : 'zakleni (stoj pri miru)'} · presledek skok · Esc meni`
            : mode === 'spectate'
              ? 'Miška: pogled · N: naslednji igralec · Esc meni'
              : '';
    }
  }

  resetCache(): void {
    this.last = { hp: -1, timer: '', ammo: '', props: '', target: '#init#', blind: '', mode: '' };
  }
}
