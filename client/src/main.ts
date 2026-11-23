import './style.css';
import { MAP_LIST, normalizeCode, sanitizeName, type RoomInfo, type RoomSettings } from '../../shared/src/index';
import { GameAudio } from './game/Audio';
import { Game } from './game/Game';
import { InputState } from './input/Input';
import { KeyboardMouse } from './input/KeyboardMouse';
import { TouchControls } from './input/TouchControls';
import { Network } from './net/Network';
import { $, show, toast } from './ui/dom';
import { Hud } from './ui/Hud';
import { renderGameEnd, renderLobby, renderRoundEnd, showOverlay, showScreen } from './ui/screens';
import { enterImmersive, isTouchDevice, preventZoom, setWakeLock } from './util/device';
import { loadSettings, saveSettings } from './util/settings';

const settings = loadSettings();
preventZoom();

const canvas = $<HTMLCanvasElement>('game');
const net = new Network();
const input = new InputState();
const audio = new GameAudio(settings.volume);
const hud = new Hud(isTouchDevice);

let myId = '';
let room: RoomInfo | null = null;
let busy = false;
let welcomedSinceConnect = false;

const unlockAudio = (): void => audio.unlock();
// iOS dovoli zvok šele ob "aktivaciji" (dvig prsta, klik, tipka) – zato poslušamo več dogodkov.
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlockAudio, { passive: true });
}

let game: Game;
try {
  game = new Game(canvas, net, input, hud, audio, settings, {
    toast,
    openMenu: () => openMenu(),
    qualityChanged: (q) => {
      settings.quality = q;
      saveSettings(settings);
      $<HTMLSelectElement>('inp-quality').value = String(q);
    },
  });
} catch (err) {
  console.error(err);
  $('home-error').textContent = 'Tvoja naprava ne podpira 3D grafike (WebGL). Poskusi z drugim brskalnikom.';
  throw err;
}

const touch = isTouchDevice ? new TouchControls(input, unlockAudio) : null;
const km = new KeyboardMouse(input, canvas, unlockAudio);

// ------------------------------------------------------------------ usmerjanje

function goHome(message?: string): void {
  myId = '';
  room = null;
  game.stop();
  game.menuOpen = false;
  km.enabled = false;
  km.releaseLock();
  setWakeLock(false);
  for (const id of ['screen-menu', 'screen-roundend', 'screen-settings', 'screen-help'] as const) showOverlay(id, false);
  showScreen('home');
  if (message) toast(message);
}

function route(r: RoomInfo): void {
  const prev = room;
  room = r;
  game.setRoom(r, myId);
  if (r.phase === 'lobby') {
    game.stop();
    closeMenu(false);
    km.enabled = false;
    km.releaseLock();
    setWakeLock(false);
    showOverlay('screen-roundend', false);
    showScreen('lobby');
    renderLobby(r, myId);
    return;
  }
  if (r.phase === 'gameEnd') {
    game.stop();
    closeMenu(false);
    km.enabled = false;
    km.releaseLock();
    setWakeLock(false);
    showOverlay('screen-roundend', false);
    showScreen('gameEnd');
    renderGameEnd(r, myId);
    return;
  }
  // V rundi
  showScreen('game');
  const starting = !game.isRunning;
  game.start();
  km.enabled = true;
  setWakeLock(true);
  if (r.phase === 'roundEnd') {
    renderRoundEnd(r, myId);
    showOverlay('screen-roundend', true);
  } else {
    showOverlay('screen-roundend', false);
  }
  if (starting && !isTouchDevice && prev?.phase !== r.phase) toast('Klikni v igro, da upravljaš z miško.');
}

// ------------------------------------------------------------------ omrežje

net.socket.on('connect', () => {
  show($('conn-status'), false);
  welcomedSinceConnect = false;
  if (myId) {
    // Če soba po ponovni povezavi ne obstaja več (npr. ponovni zagon strežnika), gremo domov.
    window.setTimeout(() => {
      if (myId && !welcomedSinceConnect && net.socket.connected) goHome('Soba ne obstaja več.');
    }, 2500);
  }
});
net.socket.on('disconnect', () => {
  $('conn-status').textContent = 'Povezava prekinjena – povezujem znova …';
  show($('conn-status'), true);
});
net.socket.on('connect_error', () => {
  $('conn-status').textContent = 'Ni povezave s strežnikom – poskušam znova …';
  show($('conn-status'), true);
});
net.socket.on('welcome', (w) => {
  myId = w.playerId;
  welcomedSinceConnect = true;
});
net.socket.on('room', (r) => {
  if (!myId) return; // sporočilo za sobo, ki smo jo že zapustili
  welcomedSinceConnect = true;
  route(r);
});
net.socket.on('snap', (s) => {
  if (game.isRunning) game.onSnapshot(s);
});
net.socket.on('teleport', (t) => game.onTeleport(t));
net.socket.on('shot', (s) => {
  if (game.isRunning) game.onShot(s);
});
net.socket.on('kill', (k) => {
  if (game.isRunning) game.onKill(k);
});
net.socket.on('radar', (r) => {
  if (game.isRunning) game.onRadar(r);
});
net.socket.on('decoyHit', (d) => {
  if (game.isRunning) game.onDecoyHit(d);
});
net.socket.on('toast', (m) => toast(m));
net.socket.on('kicked', (reason) => {
  goHome(reason);
  // Ta zavihek dobi novo identiteto, da lahko normalno igra naprej.
  net.renewIdentity();
});

// ------------------------------------------------------------------ domov

const nameInput = $<HTMLInputElement>('inp-name');
const codeInput = $<HTMLInputElement>('inp-code');
nameInput.value = settings.name;
const urlCode = normalizeCode(new URLSearchParams(location.search).get('soba') ?? '');
if (urlCode) codeInput.value = urlCode;

function readName(): string | null {
  const name = sanitizeName(nameInput.value);
  if (!name) {
    $('home-error').textContent = 'Najprej vpiši svoje ime.';
    nameInput.focus();
    return null;
  }
  settings.name = name;
  saveSettings(settings);
  return name;
}

function setBusy(on: boolean): void {
  busy = on;
  $<HTMLButtonElement>('btn-create').disabled = on;
  $<HTMLButtonElement>('btn-join').disabled = on;
}

async function createRoom(): Promise<void> {
  if (busy) return;
  $('home-error').textContent = '';
  const name = readName();
  if (!name) return;
  enterImmersive();
  setBusy(true);
  const res = await net.createRoom(name);
  setBusy(false);
  if (res.ok) {
    myId = res.playerId;
    history.replaceState(null, '', `?soba=${res.code}`);
  } else {
    $('home-error').textContent = res.error;
  }
}

async function joinRoom(): Promise<void> {
  if (busy) return;
  $('home-error').textContent = '';
  const name = readName();
  if (!name) return;
  const code = normalizeCode(codeInput.value);
  if (!code) {
    $('home-error').textContent = 'Vpiši 4-mestno kodo sobe.';
    codeInput.focus();
    return;
  }
  enterImmersive();
  setBusy(true);
  const res = await net.joinRoom(name, code);
  setBusy(false);
  if (res.ok) {
    myId = res.playerId;
    history.replaceState(null, '', `?soba=${res.code}`);
  } else {
    $('home-error').textContent = res.error;
  }
}

$('btn-create').addEventListener('click', () => void createRoom());
$('btn-join').addEventListener('click', () => void joinRoom());
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void (codeInput.value ? joinRoom() : createRoom());
});
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') void joinRoom();
});
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
});

// ------------------------------------------------------------------ čakalnica

function settingFromSelect(id: string, key: keyof RoomSettings): void {
  const s = $<HTMLSelectElement>(id);
  s.addEventListener('change', () => {
    const v = s.value;
    const patch: Partial<RoomSettings> = key === 'penalty' ? { penalty: v === '1' } : { [key]: Number(v) };
    net.updateSettings(patch);
  });
}
// Izbira mape
const mapSelect = $<HTMLSelectElement>('set-map');
for (const m of MAP_LIST) {
  const o = document.createElement('option');
  o.value = m.id;
  o.textContent = m.name;
  mapSelect.appendChild(o);
}
mapSelect.addEventListener('change', () => net.updateSettings({ map: mapSelect.value }));
settingFromSelect('set-hide', 'hideTime');
settingFromSelect('set-hunt', 'huntTime');
settingFromSelect('set-hunters', 'hunters');
settingFromSelect('set-rounds', 'rounds');
settingFromSelect('set-penalty', 'penalty');

$('btn-start').addEventListener('click', () => {
  enterImmersive();
  void net.startGame().then((r) => {
    if (!r.ok) toast(r.error);
  });
});

function leaveRoom(): void {
  net.leaveRoom();
  history.replaceState(null, '', location.pathname);
  goHome();
}
$('btn-leave').addEventListener('click', leaveRoom);
$('btn-gameend-leave').addEventListener('click', leaveRoom);
$('btn-gameend-lobby').addEventListener('click', () => net.backToLobby());

$('btn-share').addEventListener('click', () => {
  if (!room) return;
  const url = `${location.origin}${location.pathname}?soba=${room.code}`;
  const text = `Pridruži se mi v Skrivalnici! Koda sobe: ${room.code}`;
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (nav.share) {
    nav.share({ title: 'Skrivalnica', text, url }).catch(() => undefined);
  } else if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => toast('Povezava kopirana!'),
      () => toast(url),
    );
  } else {
    toast(url);
  }
});

// ------------------------------------------------------------------ meni, nastavitve, pomoč

function openMenu(): void {
  if (!game.isRunning) return;
  game.menuOpen = true;
  input.reset();
  touch?.reset();
  km.releaseLock();
  showOverlay('screen-menu', true);
}

function closeMenu(relock = true): void {
  game.menuOpen = false;
  showOverlay('screen-menu', false);
  if (relock && !isTouchDevice && game.isRunning) km.requestLock();
}

$('btn-menu').addEventListener('click', openMenu);
$('btn-resume').addEventListener('click', () => closeMenu(true));
$('btn-quit').addEventListener('click', () => {
  closeMenu(false);
  leaveRoom();
});
$('btn-next-spec').addEventListener('click', () => input.trigger('nextSpec'));

document.addEventListener('pointerlockchange', () => {
  if (!km.locked && game.isRunning && !game.menuOpen && !isTouchDevice && km.enabled) openMenu();
});

const sens = $<HTMLInputElement>('inp-sens');
const vol = $<HTMLInputElement>('inp-vol');
const quality = $<HTMLSelectElement>('inp-quality');
const invert = $<HTMLSelectElement>('inp-invert');

function syncSettingsUi(): void {
  sens.value = String(settings.sensitivity);
  vol.value = String(settings.volume);
  quality.value = String(settings.quality);
  invert.value = settings.invertY ? '1' : '0';
  $('sens-val').textContent = settings.sensitivity.toFixed(1);
  $('vol-val').textContent = `${Math.round(settings.volume * 100)} %`;
}
syncSettingsUi();

sens.addEventListener('input', () => {
  settings.sensitivity = Number(sens.value);
  syncSettingsUi();
  saveSettings(settings);
});
vol.addEventListener('input', () => {
  settings.volume = Number(vol.value);
  audio.setVolume(settings.volume);
  syncSettingsUi();
  saveSettings(settings);
});
quality.addEventListener('change', () => {
  settings.quality = Number(quality.value);
  game.applyQuality();
  saveSettings(settings);
});
invert.addEventListener('change', () => {
  settings.invertY = invert.value === '1';
  saveSettings(settings);
});

let settingsFromMenu = false;
function openSettings(fromMenu: boolean): void {
  settingsFromMenu = fromMenu;
  syncSettingsUi();
  if (fromMenu) showOverlay('screen-menu', false);
  showOverlay('screen-settings', true);
}
$('btn-settings-home').addEventListener('click', () => openSettings(false));
$('btn-settings-game').addEventListener('click', () => openSettings(true));
$('btn-settings-close').addEventListener('click', () => {
  showOverlay('screen-settings', false);
  if (settingsFromMenu && game.isRunning) showOverlay('screen-menu', true);
});

let helpFromMenu = false;
$('btn-help').addEventListener('click', () => {
  helpFromMenu = false;
  showOverlay('screen-help', true);
});
$('btn-help-game').addEventListener('click', () => {
  helpFromMenu = true;
  showOverlay('screen-menu', false);
  showOverlay('screen-help', true);
});
$('btn-help-close').addEventListener('click', () => {
  showOverlay('screen-help', false);
  if (helpFromMenu && game.isRunning) showOverlay('screen-menu', true);
});

// Kavelj za avtomatske teste v brskalniku (samo z ?debug v naslovu).
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __skr: unknown }).__skr = {
    game,
    input,
    net,
    getWorld: () => game.world,
    getRoom: () => room,
    getId: () => myId,
  };
}

// Začetni zaslon
showScreen('home');
