// Celovit test v pravem brskalniku: dva igralca (PC + emuliran telefon z dotikom).
// Zahteva zgrajen projekt (npm run build) in Edge ali Chrome.
// Uporaba: npm run e2e   (pot do brskalnika lahko nastaviš z BROWSER_PATH)

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
// Mapa za test: E2E_MAP=construction npm run e2e
const MAP = process.env.E2E_MAP || 'hisa';
const OUT = resolve('e2e-screens', MAP);
mkdirSync(OUT, { recursive: true });

const candidates = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));
if (!executablePath) {
  console.error('Ni najdenega brskalnika (Edge/Chrome). Nastavi BROWSER_PATH.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (...a) => console.log('•', ...a);

function fail(msg) {
  throw new Error(msg);
}

async function waitHealth() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      // še ni pripravljen
    }
    await sleep(100);
  }
  fail('Strežnik se ni zagnal.');
}

const server = spawn(process.execPath, ['server/dist/index.js'], {
  env: { ...process.env, PORT: String(PORT), SKR_TIME_SCALE: '0.3', NODE_ENV: 'production', SKR_DEBUG: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (d) => {
  if (String(d).includes('DBG')) console.log(String(d).trim());
  else errors.push(`STREŽNIK: ${d}`);
});

const browsers = [];
async function launch() {
  const b = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'],
  });
  browsers.push(b);
  return b;
}

async function lowQuality(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('skrivalnica.settings.v1', JSON.stringify({ quality: 0, volume: 0 }));
    } catch {
      // ignoriraj
    }
  });
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${label} konzola: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label} napaka: ${e.message}`));
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
  log('posnetek', name);
}

const visible = (id) => `!document.getElementById('${id}').classList.contains('hidden')`;

try {
  await waitHealth();
  log('strežnik teče, brskalnik:', executablePath);

  // ---------- Igralec A: računalnik
  const bA = await launch();
  const a = await bA.newPage();
  await a.setViewport({ width: 960, height: 540 });
  watch(a, 'PC');
  await lowQuality(a);
  await a.goto(`${BASE}/?debug=1`, { waitUntil: 'networkidle0' });
  await shot(a, '01-domov-pc');
  await a.type('#inp-name', 'Ana');
  await a.click('#btn-create');
  await a.waitForFunction(visible('screen-lobby'), { timeout: 8000 });
  const code = await a.$eval('#lobby-code', (e) => e.textContent);
  log('soba ustvarjena:', code);

  // ---------- Igralec B: telefon (ležeče, dotik)
  const bB = await launch();
  const b = await bB.newPage();
  await b.setUserAgent(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  );
  await b.setViewport({ width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true, isLandscape: true });
  watch(b, 'TELEFON');
  await lowQuality(b);
  await b.goto(`${BASE}/?debug=1&soba=${code}`, { waitUntil: 'networkidle0' });
  const prefilled = await b.$eval('#inp-code', (e) => e.value);
  if (prefilled !== code) fail(`Koda iz povezave ni izpolnjena (${prefilled})`);
  await shot(b, '02-domov-telefon');
  await b.type('#inp-name', 'Bor');
  await b.tap('#btn-join');
  await b.waitForFunction(visible('screen-lobby'), { timeout: 8000 });
  await a.waitForFunction(() => document.querySelectorAll('#lobby-players li').length === 2, { timeout: 8000 });
  await shot(b, '03-cakalnica-telefon');
  await shot(a, '03-cakalnica-pc');

  // Nastavitve in začetek
  await a.select('#set-map', MAP);
  await b.waitForFunction((m) => document.getElementById('set-map').value === m, { timeout: 5000 }, MAP);
  await a.select('#set-hide', '20');
  await a.select('#set-hunt', '120');
  await b.waitForFunction(() => document.getElementById('set-hide').value === '20', { timeout: 5000 });
  const disabledForGuest = await b.$eval('#set-hide', (e) => e.disabled);
  if (!disabledForGuest) fail('Gost lahko spreminja nastavitve');
  // Dnevnik sprememb sobe (faza, runda, moja vloga, zmagovalec) na PC strani.
  await a.evaluate(() => {
    window.__roundLog = [];
    window.__skr.net.socket.on('room', (r) => {
      const me = r.players.find((p) => p.id === window.__skr.getId());
      const last = window.__roundLog[window.__roundLog.length - 1];
      if (!last || last.phase !== r.phase || last.round !== r.round) {
        window.__roundLog.push({ phase: r.phase, round: r.round, role: me?.role, winner: r.lastWinner });
      }
    });
  });
  await a.click('#btn-start');
  await a.waitForFunction(visible('hud'), { timeout: 8000 });
  await b.waitForFunction(visible('hud'), { timeout: 8000 });
  await sleep(700);

  const roleA = await a.evaluate(() => window.__skr.game.role);
  const roleB = await b.evaluate(() => window.__skr.game.role);
  log('vlogi:', 'PC =', roleA, '| telefon =', roleB);
  for (const pg of [a, b]) {
    const id = await pg.evaluate(() => window.__skr.getWorld().map.id);
    if (id !== MAP) fail(`Napačna mapa: ${id}`);
  }
  const fps = await Promise.all(
    [a, b].map((pg) =>
      pg.evaluate(
        () =>
          new Promise((res) => {
            let n = 0;
            const t0 = performance.now();
            const tick = () => {
              n++;
              if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
              else res(Math.round((n * 1000) / (performance.now() - t0)));
            };
            requestAnimationFrame(tick);
          }),
      ),
    ),
  );
  log('mapa:', MAP, '| FPS (programsko upodabljanje): PC', fps[0], ', telefon', fps[1]);
  if (new Set([roleA, roleB]).size !== 2) fail('Vlogi nista pravilno razdeljeni');
  const hunter = roleA === 'hunter' ? a : b;
  const prop = hunter === a ? b : a;
  const propIsPhone = prop === b;

  if (!(await hunter.evaluate(visible('blind')))) fail('Lovec med skrivanjem ni zatemnjen');
  await shot(hunter, '04-lovec-skrivanje');
  await shot(prop, '05-skrivalec-skrivanje');

  // Telefon: preveri, da so gumbi za dotik vidni.
  const touchVisible = await b.evaluate(visible('touch-controls'));
  if (roleB === 'prop') {
    if (!touchVisible) fail('Na telefonu ni kontrol za dotik');
    // Skrivalec ima vidno igralno palico in gumbe za skok, spremembo in zaklep.
    const ctrl = await b.evaluate(() =>
      ['joy-base', 'btn-jump', 'btn-transform', 'btn-lock'].map((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        return { id, ok: r.width > 0 && !el.closest('.hidden') };
      }),
    );
    const missing = ctrl.filter((c) => !c.ok).map((c) => c.id);
    if (missing.length) fail(`Na telefonu manjkajo kontrole: ${missing.join(', ')}`);
  }

  // Na mapi z omejeno izbiro skrivalec med skrivanjem vidi seznam predmetov.
  if (MAP === 'construction') {
    await prop.waitForFunction(visible('transform-list'), { timeout: 4000, polling: 100 });
    log('seznam predmetov:', await prop.$eval('#transform-list', (e) => e.textContent));
  }

  // Skrivalec: premik z joystickom (če je telefon) ali tipkovnico.
  const before = await prop.evaluate(() => ({ x: window.__skr.game.body.x, z: window.__skr.game.body.z }));
  if (propIsPhone) {
    await b.touchscreen.touchStart(150, 260);
    for (let i = 1; i <= 6; i++) await b.touchscreen.touchMove(150, 260 - i * 10);
    await sleep(600);
    await b.touchscreen.touchEnd();
  } else {
    await a.keyboard.down('KeyW');
    await sleep(600);
    await a.keyboard.up('KeyW');
  }
  await sleep(200);
  const after = await prop.evaluate(() => ({ x: window.__skr.game.body.x, z: window.__skr.game.body.z }));
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  log('premik skrivalca:', moved.toFixed(2), 'm');
  if (moved < 0.3) fail('Skrivalec se ni premaknil');

  // Skrivalec: pomeri v najbližji predmet in se spremeni.
  const tr = await prop.evaluate(async () => {
    const { game, input } = window.__skr;
    const world = window.__skr.getWorld();
    if (world.transformable) {
      // Nabor oblik: gumb Zamenjaj brez merjenja.
      input.trigger('transform');
      for (let i = 0; i < 60 && game.model === 0; i++) await new Promise((r) => setTimeout(r, 100));
      const label = document.getElementById('transform-list').textContent;
      const toasts = [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
      const b = game.body;
      return { ok: world.transformable.has(game.model), model: game.model, label, toasts, pos: [b.x, b.y, b.z] };
    }
    const bx = game.body.x;
    const bz = game.body.z;
    const order = world.map.props
      .map((p, i) => ({ i, d: Math.hypot(p.x - bx, p.z - bz), p }))
      .filter((e) => e.p.y < 1 && (!world.transformable || world.transformable.has(e.p.type)))
      .sort((u, v) => u.d - v.d)
      .slice(0, 4);
    for (const { i } of order) {
      const p = world.map.props[i];
      const yaw = Math.atan2(-(p.x - bx), -(p.z - bz));
      for (const pitch of [-0.35, -0.2, -0.5, -0.1, -0.7]) {
        game.camYaw = yaw;
        game.camPitch = pitch;
        await new Promise((r) => setTimeout(r, 350));
        if (game.target >= 0) break;
      }
      if (game.target >= 0) break;
    }
    if (game.target < 0) return { ok: false };
    const label = document.getElementById('target-label').textContent;
    window.__dbgTrig = Date.now();
    input.trigger('transform');
    const t0 = performance.now();
    for (let i = 0; i < 70 && game.model === 0; i++) await new Promise((r) => setTimeout(r, 100));
    window.__transformMs = performance.now() - t0;
    const toasts = [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent);
    return { ok: game.model > 0, model: game.model, label, toasts, target: game.target, pending: game.transformPending, readyIn: game.transformReadyAt - performance.now(), connected: window.__skr.net.socket.connected, phase: game.phase, ms: Math.round(window.__transformMs), transport: window.__skr.net.socket.io.engine.transport.name, trig: window.__dbgTrig, consumed: window.__dbgC, emitted: window.__dbgT };
  });
  log('sprememba:', JSON.stringify(tr));
  if (!tr.ok) fail('Skrivalec se ni spremenil v predmet');
  await shot(prop, '06-skrivalec-spremenjen');

  // Zaklep: skrivalec stoji pri miru, kamera se lahko obrača.
  await prop.evaluate(() => window.__skr.input.trigger('lock'));
  await prop.waitForFunction(() => window.__skr.game.locked === true, { timeout: 3000, polling: 100 });
  await prop.waitForFunction(visible('lock-badge'), { timeout: 3000, polling: 100 });
  const lockStart = await prop.evaluate(() => ({
    x: window.__skr.game.body.x,
    z: window.__skr.game.body.z,
    yaw: window.__skr.game.modelYaw,
  }));
  if (propIsPhone) {
    await b.touchscreen.touchStart(150, 260);
    for (let i = 1; i <= 6; i++) await b.touchscreen.touchMove(150, 260 - i * 10);
    await sleep(700);
    await b.touchscreen.touchEnd();
  } else {
    await a.keyboard.down('KeyW');
    await sleep(700);
    await a.keyboard.up('KeyW');
  }
  await prop.evaluate(() => {
    window.__skr.game.camYaw += 1.2; // obrni kamero
  });
  await sleep(300);
  const lockEnd = await prop.evaluate(() => ({
    x: window.__skr.game.body.x,
    z: window.__skr.game.body.z,
    yaw: window.__skr.game.modelYaw,
  }));
  const roundNow = await prop.evaluate(() => window.__skr.game.round);
  if (roundNow !== 1) fail('Test je bil prepočasen – runda se je medtem zamenjala (ni napaka igre).');
  const lockMoved = Math.hypot(lockEnd.x - lockStart.x, lockEnd.z - lockStart.z);
  log('zaklenjen skrivalec – premik:', lockMoved.toFixed(3), 'm, sprememba smeri:', Math.abs(lockEnd.yaw - lockStart.yaw).toFixed(3));
  if (lockMoved > 0.02) fail('Zaklenjen skrivalec se je premaknil');
  if (Math.abs(lockEnd.yaw - lockStart.yaw) > 1e-6) fail('Zaklenjen skrivalec se je zasukal');
  await shot(prop, '06b-skrivalec-zaklenjen');

  // Vaba: kopija skrivalca, odšteje se od 2.
  if (propIsPhone) await b.tap('#btn-decoy');
  else await a.evaluate(() => window.__skr.input.trigger('decoy'));
  await prop.waitForFunction(() => window.__skr.game.decoysLeft === 1, { timeout: 6000, polling: 100 });
  await hunter.waitForFunction(() => [...window.__skr.game.remotes.map.keys()].some((id) => id.startsWith('d')) || window.__skr.game.phase === 'hiding', { timeout: 6000, polling: 100 });
  log('vaba postavljena')

  // Lov
  await hunter.waitForFunction(() => window.__skr.game.phase === 'hunting', { timeout: 15000, polling: 100 });
  await sleep(400);
  if (await hunter.evaluate(visible('blind'))) fail('Lovec je med lovom še vedno zatemnjen');
  await shot(hunter, '07-lovec-lov');

  // Ostrostrelka in merek: približan pogled (manjši zorni kot), nato nazaj.
  if (hunter === b) await b.tap('#btn-weapon');
  else await a.evaluate(() => window.__skr.input.trigger('weapon2'));
  await hunter.waitForFunction(() => window.__skr.game.weapon === 'sniper', { timeout: 5000, polling: 100 });
  await sleep(400);
  if (hunter === b) await b.tap('#btn-scope');
  else await a.evaluate(() => window.__skr.input.trigger('scope'));
  await hunter.waitForFunction(() => window.__skr.game.camera.fov < 40, { timeout: 5000, polling: 100 });
  if (!(await hunter.evaluate(visible('scope-overlay')))) fail('Merek se ne prikaže');
  await shot(hunter, '07b-lovec-merek');
  if (hunter === b) await b.tap('#btn-scope');
  else await a.evaluate(() => window.__skr.input.trigger('scope'));
  await hunter.waitForFunction(() => window.__skr.game.camera.fov > 60, { timeout: 5000, polling: 100 });
  log('merek deluje (zoom in nazaj)');

  // Radar
  if (hunter === b) await b.tap('#btn-radar');
  else await a.evaluate(() => window.__skr.input.trigger('radar'));
  await hunter.waitForFunction(() => document.getElementById('banner').textContent.includes('Radar'), { timeout: 6000, polling: 100 });
  log('radar:', await hunter.$eval('#banner', (e) => e.textContent));

  // Strel (dotik na telefonu ali miška/kavelj na PC)
  if (hunter === b) {
    const box = await b.$eval('#btn-fire', (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await b.touchscreen.touchStart(box.x, box.y);
    await sleep(1200);
    await b.touchscreen.touchEnd();
  } else {
    await a.evaluate(() => (window.__skr.input.fireHeld = true));
    await sleep(1200);
    await a.evaluate(() => (window.__skr.input.fireHeld = false));
  }
  await sleep(500);
  const ammo = await hunter.evaluate(() => window.__skr.game.ammo);
  log('naboji po streljanju:', ammo);
  if (ammo >= 12) fail('Lovec ni ustrelil');
  await shot(hunter, '08-lovec-strel');

  // Konec runde (skrivalec preživi). Okno je kratko (pospešen čas), zato beležimo
  // dogodke sobe namesto lovljenja okna – programsko upodabljanje je lahko zelo počasno.
  await a.waitForFunction(() => window.__roundLog.some((e) => e.phase === 'roundEnd' && e.round === 1), {
    timeout: 70000,
    polling: 100,
  });
  if (await a.evaluate(visible('screen-roundend'))) await shot(a, '09-konec-runde-pc');
  const end1 = await a.evaluate(() => window.__roundLog.find((e) => e.phase === 'roundEnd' && e.round === 1));
  log('konec 1. runde, zmagovalec:', end1.winner);
  if (end1.winner !== 'props') fail(`Napačen zmagovalec: ${end1.winner}`);
  const title = await a.$eval('#roundend-title', (e) => e.textContent);
  if (!title) fail('Okno za konec runde nima naslova');

  // Runda 2: vlogi se zamenjata
  await a.waitForFunction(() => window.__roundLog.some((e) => e.phase === 'hiding' && e.round === 2), {
    timeout: 20000,
    polling: 100,
  });
  const roleA2 = await a.evaluate(() => window.__roundLog.find((e) => e.phase === 'hiding' && e.round === 2).role);
  log('runda 2, PC =', roleA2);
  if (roleA2 === roleA) fail('Vlogi se v 2. rundi nista zamenjali');
  await shot(b, '10-runda2-telefon');

  // Telefon: vsi vidni gumbi morajo biti dosegljivi z dotikom (nič jih ne prekriva).
  const blocked = await b.evaluate(() => {
    const out = [];
    for (const btn of document.querySelectorAll('#hud button')) {
      const r = btn.getBoundingClientRect();
      if (r.width === 0 || btn.closest('.hidden')) continue;
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top || !(top === btn || btn.contains(top))) out.push(`${btn.id} prekriva ${top ? top.id || top.className : 'nič'}`);
    }
    return out;
  });
  if (blocked.length) fail(`Prekriti gumbi na telefonu: ${blocked.join(', ')}`);
  await b.tap('#btn-menu');
  await b.waitForFunction(visible('screen-menu'), { timeout: 3000 });
  await shot(b, '10b-meni-telefon');
  await b.tap('#btn-resume');
  await b.waitForFunction(`!(${visible('screen-menu')})`, { timeout: 3000 });
  log('meni na telefonu deluje z dotikom');

  // Meni in izhod
  await a.evaluate(() => window.__skr.input.trigger('menu'));
  await a.waitForFunction(visible('screen-menu'), { timeout: 5000, polling: 100 }).catch(() => fail('Meni se ni odprl'));
  await a.click('#btn-quit');
  await a.waitForFunction(visible('screen-home'), { timeout: 5000 });
  // Telefon ostane sam -> nazaj v čakalnico
  await b.waitForFunction(visible('screen-lobby'), { timeout: 8000 });
  await shot(b, '11-telefon-nazaj-v-cakalnici');

  const real = errors.filter((e) => !/favicon|WebGL|GPU stall|swiftshader|AudioContext/i.test(e));
  if (real.length) {
    console.error('\nNAPAKE V BRSKALNIKU:\n' + real.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('\n✅ E2E test uspešen – brez napak v brskalniku. Posnetki:', OUT);
  }
} catch (err) {
  console.error('\n❌ E2E test ni uspel:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  // Diagnostika: stanje sobe na vseh odprtih straneh
  for (const br of browsers) {
    for (const pg of await br.pages().catch(() => [])) {
      const st = await pg
        .evaluate(() => {
          const r = window.__skr?.getRoom();
          const g = window.__skr?.game;
          return r
            ? {
                phase: r.phase,
                round: r.round,
                total: r.totalRounds,
                players: r.players.map((p) => `${p.name}:${p.role}:${p.connected ? 'on' : 'off'}`),
                gameRound: g?.round,
                gamePhase: g?.phase,
                connected: window.__skr.net.socket.connected,
              }
            : null;
        })
        .catch((e) => `napaka: ${e.message}`);
      console.error('stanje:', JSON.stringify(st));
    }
  }
  process.exitCode = 1;
} finally {
  for (const b of browsers) await b.close().catch(() => undefined);
  server.kill();
}
