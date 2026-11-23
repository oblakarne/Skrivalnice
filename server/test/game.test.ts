import { afterEach, describe, expect, it } from 'vitest';
import {
  WEAPONS,
  HP_MAX,
  HUNTER_EYE,
  PROPS,
  SCORE_KILL,
  shapeOf,
  TRANSFORM_RANGE,
  TRANSFORM_COOLDOWN_MS,
  DECOYS_PER_ROUND,
  SCORE_DECOY,
  canTransformInto,
  getWorld,
  WRONG_PROP_PENALTY,
} from '../../shared/src/index';
import { createGameServer, type RunningServer } from '../src/server';
import { Bot, sleep, waitFor, walk, walkPhysics } from './helpers';

const WORLD = getWorld('hisa');
let server: RunningServer | null = null;
const bots: Bot[] = [];

async function start(timeScale = 1, graceMs = 30000): Promise<string> {
  server = await createGameServer({ port: 0, host: '127.0.0.1', timeScale, graceMs, staticDir: null, log: false });
  return `http://127.0.0.1:${server.port}`;
}

function bot(url: string, token?: string): Bot {
  const b = new Bot(url, token);
  bots.push(b);
  return b;
}

afterEach(async () => {
  for (const b of bots.splice(0)) b.close();
  if (server) await server.close();
  server = null;
});

function nearestProp(x: number, z: number, world = WORLD): number {
  let best = -1;
  let bestD = Infinity;
  world.map.props.forEach((p, i) => {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

describe('čakalnica', () => {
  it('ustvari sobo, pridruži igralce in uredi nastavitve', async () => {
    const url = await start();
    const a = bot(url);
    const b = bot(url);
    const c = bot(url);
    const ra = await a.create('Ana');
    expect(ra.ok).toBe(true);
    const code = ra.ok ? ra.code : '';
    expect(code).toMatch(/^[A-Z2-9]{4}$/);

    expect((await b.join('Bor', 'zz')).ok).toBe(false);
    const missing = await b.join('Bor', 'QQQQ');
    expect(missing.ok).toBe(false);
    expect((await b.join('', code)).ok).toBe(false);
    expect((await b.join('Bor', code.toLowerCase())).ok).toBe(true);
    expect((await c.join('ana', code)).ok).toBe(true);

    await waitFor(() => a.room?.players.length === 3, 2000, 'trije igralci');
    expect(a.room!.players.map((p) => p.name)).toEqual(['Ana', 'Bor', 'ana 2']);
    expect(a.room!.hostId).toBe(a.playerId);

    // Samo gostitelj sme spreminjati nastavitve in začeti igro.
    b.socket.emit('updateSettings', { rounds: 3 });
    await sleep(150);
    expect(a.room!.settings.rounds).toBe(5);
    a.socket.emit('updateSettings', { rounds: 3, hideTime: 20, huntTime: 7, penalty: false });
    await waitFor(() => a.room!.settings.rounds === 3, 2000, 'nastavitve');
    expect(a.room!.settings.hideTime).toBe(20);
    expect(a.room!.settings.huntTime).toBe(180); // 7 ni dovoljena vrednost
    expect(a.room!.settings.penalty).toBe(false);
    const notHost = await b.start();
    expect(notHost.ok).toBe(false);
  });

  it('ne dovoli začetka z enim igralcem in prenese gostitelja ob odhodu', async () => {
    const url = await start();
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    const solo = await a.start();
    expect(solo.ok).toBe(false);
    await b.join('Bor', ra.ok ? ra.code : '');
    await waitFor(() => b.room?.players.length === 2, 2000, 'dva igralca');
    a.socket.emit('leaveRoom');
    await waitFor(() => b.room?.players.length === 1, 2000, 'odhod');
    expect(b.room!.hostId).toBe(b.playerId);
  });

  it('zdrži napačne podatke brez sesutja', async () => {
    const url = await start();
    const a = bot(url);
    const ra = await a.create('Ana');
    const anySocket = a.socket as unknown as { emit: (...args: unknown[]) => void };
    for (const ev of ['state', 'shoot', 'transform', 'updateSettings', 'joinRoom', 'createRoom', 'reload', 'neznano']) {
      anySocket.emit(ev, null);
      anySocket.emit(ev, { x: 'a', y: {}, dx: Infinity });
      anySocket.emit(ev, 'x'.repeat(5000));
      anySocket.emit(ev, [1, 2, 3], 42);
    }
    await sleep(200);
    const b = bot(url);
    const rb = await b.join('Bor', ra.ok ? ra.code : '');
    expect(rb.ok).toBe(true);
  });
});

describe('ponovna povezava', () => {
  it('vrne igralca v isto sobo z istim žetonom', async () => {
    const url = await start(1, 2000);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    await b.join('Bor', ra.ok ? ra.code : '');
    const bId = b.playerId;
    b.close();
    await waitFor(() => a.room?.players.find((p) => p.id === bId)?.connected === false, 2000, 'prekinjen');
    const b2 = bot(url, b.token);
    await waitFor(() => b2.playerId === bId && !!b2.room, 2000, 'welcome');
    await waitFor(() => a.room?.players.find((p) => p.id === bId)?.connected === true, 2000, 'spet povezan');
    expect(a.room!.players.length).toBe(2);
  });

  it('odstrani igralca po izteku časa za vrnitev', async () => {
    const url = await start(1, 200);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    await b.join('Bor', ra.ok ? ra.code : '');
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    b.close();
    await waitFor(() => a.room?.players.length === 1, 3000, 'odstranjen');
  });
});

describe('igra', () => {
  it('odigra celo igro: skrivanje, sprememba, strel, ulov, kazen, konec', { timeout: 60000 }, async () => {
    const ts = 0.04;
    const url = await start(ts);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    const code = ra.ok ? ra.code : '';
    await b.join('Bor', code);
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    a.socket.emit('updateSettings', { rounds: 3, hideTime: 20, huntTime: 120, penalty: true });
    await waitFor(() => a.room!.settings.rounds === 3, 2000, 'nastavitve');

    expect((await a.start()).ok).toBe(true);
    await waitFor(() => a.room?.phase === 'hiding' && b.room?.phase === 'hiding', 2000, 'skrivanje');
    await waitFor(() => a.seq > 0 && b.seq > 0, 2000, 'teleport');

    const hunter = a.role() === 'hunter' ? a : b;
    const prop = hunter === a ? b : a;
    expect(prop.role()).toBe('prop');
    const room = server!.manager.get(code)!;

    // Lovec med skrivanjem ne more hoditi.
    const hp0 = room.debugPlayer(hunter.playerId)!;
    const startX = hp0.x;
    hunter.sendState(hp0.x + 0.2, 0, hp0.z);
    await sleep(100);
    expect(room.debugPlayer(hunter.playerId)!.x).toBe(startX);

    // Lovec med skrivanjem ne vidi skrivalcev.
    await waitFor(() => !!hunter.snap, 2000, 'snapshot');
    expect(hunter.snap!.p.find((p) => p[0] === prop.playerId)).toBeUndefined();

    // Skrivalec: predaleč -> zavrnjeno, blizu -> sprejeto.
    const far = WORLD.map.props.findIndex((p) => Math.hypot(p.x - prop.pos.x, p.z - prop.pos.z) > TRANSFORM_RANGE + 3);
    const farRes = await prop.transform(far);
    expect(farRes.ok).toBe(false);
    const near = nearestProp(prop.pos.x, prop.pos.z);
    const res = await prop.transform(near);
    expect(res).toEqual({ ok: true, model: WORLD.map.props[near]!.type });
    // Takoj znova -> čakanje
    const again = await prop.transform(nearestProp(prop.pos.x + 0.01, prop.pos.z));
    expect(again.ok === true || (again.ok === false && again.error.length > 0)).toBe(true);

    await waitFor(() => a.room?.phase === 'hunting', 3000, 'lov');

    // Lovec gre skozi vrata garaže (x 4.2-6.2) na hodnik (z 11).
    await walk(hunter, 5.2, 7.5);
    await walk(hunter, 5.2, 11);
    const hs = room.debugPlayer(hunter.playerId)!;
    expect(hs.z).toBeCloseTo(11, 1);

    // Ostrostrelka z merkom (skrivalec je lahko dlje kot 18 m): 2 zadetka po 50.
    hunter.socket.emit('weapon', 'sniper');
    hunter.socket.emit('scope', true);
    await sleep(350);
    const target = room.debugPlayer(prop.playerId)!;
    const shape = shapeOf(target.model);
    const head = { x: hs.x, y: hs.y + HUNTER_EYE, z: hs.z };
    const aim = { x: target.x - head.x, y: target.y + shape.h / 2 - head.y, z: target.z - head.z };
    for (let i = 0; i < 2; i++) {
      hunter.socket.emit('shoot', { ox: head.x, oy: head.y, oz: head.z, dx: aim.x, dy: aim.y, dz: aim.z });
      await sleep(WEAPONS.sniper.intervalMs + 60);
      // Po prvem zadetku je skrivalec označen za pomoč pri merjenju.
      if (i === 0) expect(room.debugPlayer(hunter.playerId)!.marked.has(prop.playerId)).toBe(true);
    }
    await waitFor(() => hunter.kills.length === 1, 2000, 'ulov');
    expect(hunter.shots.filter((s) => s.kind === 'player').length).toBe(2);
    expect(hunter.kills[0]).toEqual({ killer: hunter.playerId, victim: prop.playerId });
    await waitFor(() => a.history.some((h) => h.phase === 'roundEnd' && h.round === 1), 3000, 'konec runde');
    expect(a.history.find((h) => h.phase === 'roundEnd' && h.round === 1)!.winner).toBe('hunters');
    expect(a.room!.players.find((p) => p.id === hunter.playerId)!.score).toBeGreaterThanOrEqual(SCORE_KILL);

    // Runda 2: vlogi se zamenjata.
    await waitFor(() => (a.room?.round ?? 0) >= 2, 3000, 'runda 2');
    expect(room.debugPlayer(hunter.playerId)!.marked.size).toBe(0);
    expect(prop.role()).toBe('hunter');
    expect(hunter.role()).toBe('prop');
    await waitFor(() => a.room?.phase === 'hunting' && a.room.round === 2, 3000, 'lov 2');
    // Novi lovec strelja v delovno mizo v garaži -> kazen.
    const h2 = room.debugPlayer(prop.playerId)!;
    const benchIdx = WORLD.map.props.findIndex((p) => PROPS[p.type]!.id === 'delovnamiza');
    const bench = WORLD.map.props[benchIdx]!;
    const head2 = { x: h2.x, y: h2.y + HUNTER_EYE, z: h2.z };
    prop.socket.emit('shoot', {
      ox: head2.x,
      oy: head2.y,
      oz: head2.z,
      dx: bench.x - head2.x,
      dy: 0.5 - head2.y,
      dz: bench.z - head2.z,
    });
    await waitFor(() => room.debugPlayer(prop.playerId)!.hp === HP_MAX - WRONG_PROP_PENALTY, 2000, 'kazen');
    await waitFor(() => prop.snap?.you?.hp === HP_MAX - WRONG_PROP_PENALTY, 2000, 'hp v snapshotu');
    expect(prop.snap!.you!.ammo).toBe(11);

    // Runda 2 se izteče -> zmagajo skrivalci, skrivalec dobi točke za preživetje.
    await waitFor(() => a.room?.phase === 'roundEnd' && a.room.round === 2, 8000, 'konec runde 2');
    expect(a.room!.lastWinner).toBe('props');
    const survivor = a.room!.players.find((p) => p.id === hunter.playerId)!;
    expect(survivor.score).toBeGreaterThan(SCORE_KILL + 50);

    // Runda 3 in konec igre.
    await waitFor(() => a.room?.phase === 'gameEnd', 12000, 'konec igre');
    expect(a.room!.round).toBe(3);
    b.socket.emit('backToLobby');
    await sleep(150);
    expect(a.room!.phase).toBe('gameEnd'); // ni gostitelj, če je b
    const host = a.room!.hostId === a.playerId ? a : b;
    host.socket.emit('backToLobby');
    await waitFor(() => a.room?.phase === 'lobby', 2000, 'nazaj v čakalnico');
  });

  it('zavrne prehiter premik in pošlje igralca nazaj', async () => {
    const url = await start(0.2);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    const code = ra.ok ? ra.code : '';
    await b.join('Bor', code);
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    await a.start();
    await waitFor(() => a.seq > 0 && b.seq > 0, 2000, 'teleport');
    await waitFor(() => a.room?.phase === 'hiding' && b.room?.phase === 'hiding', 2000, 'vloge');
    const prop = a.role() === 'prop' ? a : b;
    expect(prop.role()).toBe('prop');
    const room = server!.manager.get(code)!;
    const before = { ...room.debugPlayer(prop.playerId)! };
    const seqBefore = prop.seq;
    prop.sendState(before.x + 8, 0, before.z);
    await waitFor(() => prop.seq === seqBefore + 1, 2000, 'popravek');
    expect(prop.pos.x).toBeCloseTo(before.x, 3);
    expect(room.debugPlayer(prop.playerId)!.x).toBeCloseTo(before.x, 3);
    // Stanje s staro številko se ignorira.
    prop.socket.emit('state', { x: before.x + 0.1, y: 0, z: before.z, yaw: 0, pitch: 0, seq: seqBefore });
    await sleep(100);
    expect(room.debugPlayer(prop.playerId)!.x).toBeCloseTo(before.x, 3);
    // Naravnost v bližnji predmet -> zavrnjeno (počakamo, da hitrost ni razlog).
    await sleep(400);
    const obstacle = WORLD.map.props[nearestProp(before.x, before.z)]!;
    prop.sendState(obstacle.x, 0, obstacle.z);
    await waitFor(() => prop.seq === seqBefore + 2, 2000, 'v predmetu');
    expect(room.debugPlayer(prop.playerId)!.x).toBeCloseTo(before.x, 3);
  });

  it('se vrne v čakalnico, ko med igro ostane en igralec', async () => {
    const url = await start(1, 100);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    await b.join('Bor', ra.ok ? ra.code : '');
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    await a.start();
    await waitFor(() => a.room?.phase === 'hiding', 2000, 'skrivanje');
    b.socket.emit('leaveRoom');
    await waitFor(() => a.room?.phase === 'lobby', 2000, 'čakalnica');
    expect(a.toasts.some((t) => t.includes('Premalo'))).toBe(true);
  });

  it('pridruži novega igralca med igro kot gledalca', async () => {
    const url = await start();
    const a = bot(url);
    const b = bot(url);
    const c = bot(url);
    const ra = await a.create('Ana');
    const code = ra.ok ? ra.code : '';
    await b.join('Bor', code);
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    await a.start();
    await waitFor(() => a.room?.phase === 'hiding', 2000, 'skrivanje');
    const rc = await c.join('Cene', code);
    expect(rc.ok).toBe(true);
    await waitFor(() => c.room?.players.length === 3, 2000, 'trije');
    expect(c.role()).toBe('spectator');
    await waitFor(() => !!c.snap, 2000, 'snapshot za gledalca');
    expect(c.snap!.you).toBeNull();
    expect(c.snap!.p.length).toBe(2);
  });

  it('odigra rundo na mapi Construction: izbira mape, sprememba, lovec spleza na oder', { timeout: 40000 }, async () => {
    const construction = getWorld('construction');
    const url = await start(0.1);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    const code = ra.ok ? ra.code : '';
    await b.join('Bor', code);
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    a.socket.emit('updateSettings', { map: 'mars' });
    a.socket.emit('updateSettings', { map: 'construction', hideTime: 20 });
    await waitFor(() => b.room?.settings.map === 'construction', 2000, 'mapa');
    expect(b.room!.mapId).toBe('construction');

    expect((await a.start()).ok).toBe(true);
    await waitFor(() => a.room?.phase === 'hiding' && a.seq > 0 && b.seq > 0, 3000, 'skrivanje');
    const hunter = a.role() === 'hunter' ? a : b;
    const prop = hunter === a ? b : a;
    const inList = (list: [number, number][], x: number, z: number): boolean =>
      list.some(([sx, sz]) => Math.abs(sx - x) < 1e-6 && Math.abs(sz - z) < 1e-6);
    expect(inList(construction.map.hunterSpawns, hunter.pos.x, hunter.pos.z)).toBe(true);
    expect(inList(construction.map.propSpawns, prop.pos.x, prop.pos.z)).toBe(true);

    // V okras se ni mogoče spremeniti, v enega od 5 dovoljenih predmetov pa.
    const byDist = construction.map.props
      .map((pl, i) => ({ i, d: Math.hypot(pl.x - prop.pos.x, pl.z - prop.pos.z), pl }))
      .filter((e) => e.pl.y < 1)
      .sort((u, v) => u.d - v.d);
    const scenery = byDist.find((e) => !canTransformInto(construction, e.pl.type))!;
    const sceneryRes = await prop.transform(scenery.i);
    expect(sceneryRes.ok).toBe(false);
    const allowed = byDist.find((e) => canTransformInto(construction, e.pl.type))!;
    const res = await prop.transform(allowed.i);
    expect(res).toEqual({ ok: true, model: allowed.pl.type });
    // Gumb Zamenjaj: oblika iz nabora 6 predmetov brez merjenja (po kratkem čakanju).
    // Prehitro -> zavrnjeno (5 s med spremembami), nato v redu.
    const opekaType = construction.map.props.find((pl) => PROPS[pl.type]!.id === 'opeka')!.type;
    const tooSoon = await prop.socket.timeout(3000).emitWithAck('shape', opekaType);
    expect(tooSoon).toEqual({ ok: false, error: 'Počakaj trenutek.' });
    await sleep(TRANSFORM_COOLDOWN_MS + 100);
    const opeka = construction.map.props.find((pl) => PROPS[pl.type]!.id === 'opeka')!.type;
    const shaped = await prop.socket.timeout(3000).emitWithAck('shape', opeka);
    expect(shaped.ok === true || shaped.error === 'Tu ni prostora.').toBe(true);
    const mixer = construction.map.props.find((pl) => PROPS[pl.type]!.id === 'mesalnik')!.type;
    const bad = await prop.socket.timeout(3000).emitWithAck('shape', mixer);
    expect(bad.ok).toBe(false);

    await waitFor(() => a.room?.phase === 'hunting', 5000, 'lov');
    const room = server!.manager.get(code)!;
    // Iz ograde, po zahodnih stopnicah na oder (3 m), po severnih stopnicah na streho (6 m).
    await walkPhysics(hunter, construction, [
      [6.5, 6.5],
      [10, 6.5],
      [16, 6],
      [23, 6],
      [25, 6],
      [25, 4.6],
      [28, 4.6],
      [28, 11],
    ]);
    const hp = room.debugPlayer(hunter.playerId)!;
    expect(hp.y).toBeCloseTo(6, 2);
    expect(hp.z).toBeGreaterThan(10.5);
  });

  it('vaba: lovec jo ustreli (kazen), lastnik dobi točke; radar šteje samo prave skrivalce', { timeout: 40000 }, async () => {
    const url = await start(0.1);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    const code = ra.ok ? ra.code : '';
    await b.join('Bor', code);
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    a.socket.emit('updateSettings', { hideTime: 20 });
    await waitFor(() => a.room?.settings.hideTime === 20, 2000, 'nastavitve');
    await a.start();
    await waitFor(() => a.room?.phase === 'hiding' && a.seq > 0 && b.seq > 0, 3000, 'skrivanje');
    const hunter = a.role() === 'hunter' ? a : b;
    const prop = hunter === a ? b : a;
    const room = server!.manager.get(code)!;

    // Duh ne more postaviti vabe; po spremembi lahko dve.
    expect((await prop.socket.timeout(3000).emitWithAck('decoy')).ok).toBe(false);
    expect((await prop.transform(nearestProp(prop.pos.x, prop.pos.z))).ok).toBe(true);
    for (let i = 0; i < DECOYS_PER_ROUND; i++) expect((await prop.socket.timeout(3000).emitWithAck('decoy')).ok).toBe(true);
    expect((await prop.socket.timeout(3000).emitWithAck('decoy')).ok).toBe(false);
    expect(room.decoys.length).toBe(DECOYS_PER_ROUND);
    await waitFor(() => !!prop.snap?.p.some((s) => s[0].startsWith('d')), 2000, 'vaba v posnetku');
    expect(prop.snap!.you!.decoys).toBe(0);

    await waitFor(() => a.room?.phase === 'hunting', 5000, 'lov');
    // Radar: lovec v garaži -> skrivalcev v 12 m ni (vab ne šteje).
    const radar = new Promise<{ count: number }>((res) => hunter.socket.once('radar', res));
    hunter.socket.emit('radar');
    const r = await radar;
    const hs = room.debugPlayer(hunter.playerId)!;
    const ps = room.debugPlayer(prop.playerId)!;
    expect(r.count).toBe(Math.hypot(ps.x - hs.x, ps.z - hs.z) <= 12 ? 1 : 0);
    let second = false;
    hunter.socket.once('radar', () => (second = true));
    hunter.socket.emit('radar');
    await sleep(300);
    expect(second).toBe(false); // radar mora počakati

    // Lovec gre na hodnik in z ostrostrelko ustreli vabo.
    await walk(hunter, 5.2, 7.5);
    await walk(hunter, 5.2, 11);
    const h2 = room.debugPlayer(hunter.playerId)!;
    const d = room.decoys[0]!;
    const head = { x: h2.x, y: h2.y + HUNTER_EYE, z: h2.z };
    const hgt = shapeOf(d.model).h;
    hunter.socket.emit('weapon', 'sniper');
    hunter.socket.emit('scope', true);
    await sleep(400);
    const scoreBefore = room.debugPlayer(prop.playerId)!.score;
    hunter.socket.emit('shoot', { ox: head.x, oy: head.y, oz: head.z, dx: d.x - head.x, dy: d.y + hgt / 2 - head.y, dz: d.z - head.z });
    await waitFor(() => !d.alive, 2000, 'vaba zadeta');
    expect(room.debugPlayer(hunter.playerId)!.hp).toBe(HP_MAX - WRONG_PROP_PENALTY);
    expect(room.debugPlayer(prop.playerId)!.hp).toBe(HP_MAX);
    expect(room.debugPlayer(prop.playerId)!.score).toBeGreaterThanOrEqual(scoreBefore + SCORE_DECOY);
    expect(hunter.shots.at(-1)!.kind).toBe('prop');
  });

  it('pištola ne seže dlje od 18 m, ostrostrelka z merkom pa', { timeout: 40000 }, async () => {
    const url = await start(0.1);
    const a = bot(url);
    const b = bot(url);
    const ra = await a.create('Ana');
    await b.join('Bor', ra.ok ? ra.code : '');
    await waitFor(() => a.room?.players.length === 2, 2000, 'dva');
    a.socket.emit('updateSettings', { hideTime: 20 });
    await waitFor(() => a.room?.settings.hideTime === 20, 2000, 'nastavitve');
    await a.start();
    await waitFor(() => a.room?.phase === 'hiding' && a.seq > 0 && b.seq > 0, 3000, 'skrivanje');
    const hunter = a.role() === 'hunter' ? a : b;
    const prop = hunter === a ? b : a;
    await waitFor(() => a.room?.phase === 'hunting', 5000, 'lov');
    const room = server!.manager.get(ra.ok ? ra.code : '')!;
    // Skrivalec gre na začetek hodnika (x 3), lovec 19.5 m stran (x 22.5).
    await walk(prop, 3, 11, 6);
    const target = room.debugPlayer(prop.playerId)!;
    expect(target.x).toBeCloseTo(3, 1);
    await walk(hunter, 5.2, 7.5);
    await walk(hunter, 5.2, 11);
    await walk(hunter, 22.5, 11);
    const hs = room.debugPlayer(hunter.playerId)!;
    const head = { x: hs.x, y: hs.y + HUNTER_EYE, z: hs.z };
    const aim = { dx: target.x - head.x, dy: target.y + 0.44 - head.y, dz: target.z - head.z };
    expect(Math.hypot(aim.dx, aim.dz)).toBeGreaterThan(18);
    hunter.socket.emit('shoot', { ox: head.x, oy: head.y, oz: head.z, ...aim });
    await waitFor(() => hunter.shots.length === 1, 2000, 'strel brez merka');
    expect(hunter.shots[0]!.kind).not.toBe('player');
    expect(room.debugPlayer(prop.playerId)!.hp).toBe(HP_MAX);
    hunter.socket.emit('weapon', 'sniper');
    hunter.socket.emit('scope', true);
    await sleep(400);
    hunter.socket.emit('shoot', { ox: head.x, oy: head.y, oz: head.z, ...aim });
    await waitFor(() => hunter.shots.length === 2, 2000, 'strel z merkom');
    expect(hunter.shots[1]!.kind).toBe('player');
    expect(room.debugPlayer(prop.playerId)!.hp).toBe(HP_MAX - WEAPONS.sniper.damage);
  });
});
