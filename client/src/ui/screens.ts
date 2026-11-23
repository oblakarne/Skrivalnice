import { MIN_PLAYERS, type PlayerInfo, type RoomInfo } from '../../../shared/src/index';
import { $, el, show } from './dom';

export type ScreenName = 'home' | 'lobby' | 'game' | 'gameEnd';

const SCREENS: Record<Exclude<ScreenName, 'game'>, string> = {
  home: 'screen-home',
  lobby: 'screen-lobby',
  gameEnd: 'screen-gameend',
};

export function showScreen(name: ScreenName): void {
  for (const [key, id] of Object.entries(SCREENS)) show($(id), key === name);
  show($('hud'), name === 'game');
  document.body.classList.toggle('in-game', name === 'game');
}

export function showOverlay(id: 'screen-menu' | 'screen-settings' | 'screen-help' | 'screen-roundend', on: boolean): void {
  show($(id), on);
}

function sortedByScore(players: PlayerInfo[]): PlayerInfo[] {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'sl'));
}

export function renderLobby(r: RoomInfo, myId: string): void {
  $('lobby-code').textContent = r.code;
  const list = $('lobby-players');
  list.replaceChildren();
  for (const p of r.players) {
    const li = el('li');
    if (!p.connected) li.classList.add('offline');
    li.appendChild(el('span', p.id === r.hostId ? '👑' : '🙂'));
    li.appendChild(el('span', p.name));
    const tags: string[] = [];
    if (p.id === myId) tags.push('ti');
    if (!p.connected) tags.push('brez povezave');
    if (tags.length) li.appendChild(el('span', tags.join(' · '), 'tag'));
    list.appendChild(li);
  }
  const connected = r.players.filter((p) => p.connected).length;
  $('lobby-count').textContent = `(${r.players.length}/8)`;

  const isHost = r.hostId === myId;
  const selects: [string, string][] = [
    ['set-map', r.settings.map],
    ['set-hide', String(r.settings.hideTime)],
    ['set-hunt', String(r.settings.huntTime)],
    ['set-hunters', String(r.settings.hunters)],
    ['set-rounds', String(r.settings.rounds)],
    ['set-penalty', r.settings.penalty ? '1' : '0'],
  ];
  for (const [id, value] of selects) {
    const s = $<HTMLSelectElement>(id);
    if (document.activeElement !== s) s.value = value;
    s.disabled = !isHost;
  }
  $('settings-note').textContent = isHost ? '' : 'Nastavitve lahko spreminja samo gostitelj.';
  const start = $<HTMLButtonElement>('btn-start');
  show(start, isHost);
  start.disabled = connected < MIN_PLAYERS;
  $('lobby-hint').textContent = isHost
    ? connected < MIN_PLAYERS
      ? 'Pošlji kodo prijateljem – potrebna sta vsaj 2 igralca.'
      : 'Ko so vsi notri, pritisni »Začni igro«.'
    : 'Čakamo, da gostitelj začne igro …';
}

function scoreRows(body: HTMLElement, r: RoomInfo, myId: string, medals: boolean): void {
  body.replaceChildren();
  sortedByScore(r.players).forEach((p, i) => {
    const tr = el('tr');
    if (p.id === myId) tr.classList.add('me');
    const medal = medals ? (['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`) : p.role === 'hunter' ? '🔫' : p.role === 'prop' ? '🪑' : '👀';
    tr.appendChild(el('td', medal));
    tr.appendChild(el('td', p.name));
    tr.appendChild(el('td', p.kills > 0 ? `🎯 ${p.kills}` : '', 'num'));
    tr.appendChild(el('td', `${p.score} t`, 'num'));
    body.appendChild(tr);
  });
}

export function renderRoundEnd(r: RoomInfo, myId: string): void {
  $('roundend-title').textContent =
    r.lastWinner === 'hunters' ? 'Zmagali so lovci! 🎯' : r.lastWinner === 'props' ? 'Zmagali so skrivalci! 🙈' : 'Konec runde';
  $('roundend-sub').textContent = `Runda ${r.round} od ${r.totalRounds}`;
  scoreRows($('roundend-scores'), r, myId, false);
}

export function renderGameEnd(r: RoomInfo, myId: string): void {
  const top = sortedByScore(r.players)[0];
  $('gameend-winner').textContent = top ? `🏆 Zmagovalec: ${top.name} (${top.score} t)` : '';
  scoreRows($('gameend-scores'), r, myId, true);
  const isHost = r.hostId === myId;
  show($('btn-gameend-lobby'), isHost);
  $('gameend-wait').textContent = isHost ? '' : 'Čakamo, da gostitelj vrne vse v čakalnico …';
}
