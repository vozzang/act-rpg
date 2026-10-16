// 로비(방 만들기/참가/직업 선택)와 게임 시작/종료를 관리한다.
import { Sound } from './render/Sound';
import Phaser from 'phaser';
import { ATTR_KEYS, ATTR_NAMES, CLASSES, CLASS_ORDER, VIEW_H, VIEW_W, ZONE_NAMES, deriveStats, passiveGrowthText } from './game/data';
import type { ClassId, LobbyPlayer } from './game/types';
import { ClientNet, HostNet, type ClientMsg, type HostMsg } from './net/net';
import { GameScene } from './render/GameScene';
import type { Session } from './session';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

let role: Session['role'] = 'solo';
let host: HostNet | undefined;
let client: ClientNet | undefined;
let lobby: LobbyPlayer[] = [];
let myId = '';
let game: Phaser.Game | null = null;
let session: Session | null = null;

// ─── 화면 전환 ────────────────────────────────────────

function show(screen: 'menu' | 'room' | 'game') {
  for (const id of ['menu', 'room', 'game']) $(id).classList.toggle('active', id === screen);
}

function menuError(msg: string) {
  $('menu-error').textContent = msg;
  show('menu');
}

function playerName(): string {
  const name = ($<HTMLInputElement>('name').value.trim() || '모험가').slice(0, 10);
  try {
    localStorage.setItem('actrpg-name', name);
  } catch {
    /* 저장 불가 환경은 무시 */
  }
  return name;
}

// ─── 대기실 ──────────────────────────────────────────

function renderRoom() {
  $('room-title').textContent = role === 'solo' ? '혼자 하기' : role === 'host' ? '대기실 (방장)' : '대기실';
  $('room-code-wrap').style.display = role === 'host' ? '' : 'none';
  if (host) $('room-code').textContent = host.code;

  const me = lobby.find((p) => p.id === myId);
  const cards = $('classes');
  cards.innerHTML = '';
  for (const id of CLASS_ORDER) {
    const def = CLASSES[id];
    const owner = lobby.find((p) => p.cls === id);
    const mine = owner?.id === myId;
    const st = deriveStats(id, 1, def.attrs, []);
    const attrs = ATTR_KEYS.map((k) => (k === def.mainAttr ? `<b>${ATTR_NAMES[k]} ${def.attrs[k]}</b>` : `${ATTR_NAMES[k]} ${def.attrs[k]}`)).join(' · ');
    const card = document.createElement('button');
    card.className = 'card' + (mine ? ' mine' : '') + (owner && !mine ? ' taken' : '');
    card.disabled = !!owner && !mine;
    card.innerHTML = `
      <div class="race"><span class="swatch" style="background:${hex(def.color)}"></span>${def.race}</div>
      <div class="name">${def.name}</div>
      <div class="desc">${def.desc}</div>
      <div class="skill">${def.skills.map((sk, i) => `<div>Lv.${sk.unlock} ${i === 3 ? '★' : ''}<b>${sk.name}</b> <span class="mp">MP ${sk.mp}</span></div>`).join('')}<div title="${def.passive.desc}">패시브 <b>${def.passive.name}</b> <span class="mp">${passiveGrowthText(id)}</span></div></div>
      <div class="stats">주 능력치: ${ATTR_NAMES[def.mainAttr]}${def.atkAttr && def.atkAttr !== def.mainAttr ? ` (공격은 ${ATTR_NAMES[def.atkAttr]})` : ''}<br />${attrs}<br />HP ${st.maxHp} · 공격 ${st.atk} · 방어 ${st.def} · 치명 ${Math.round(st.crit * 100)}% · 회피 ${Math.round(st.dodge * 100)}%</div>
      <div class="owner"></div>`;
    (card.querySelector('.owner') as HTMLElement).textContent = owner ? owner.name : '';
    card.onclick = () => pickClass(id);
    cards.appendChild(card);
  }

  const list = $('players');
  list.innerHTML = '';
  for (const p of lobby) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.textContent = `${p.name}${p.id === myId ? ' (나)' : ''}${p.id === 'host' && role !== 'solo' ? ' · 방장' : ''}`;
    const right = document.createElement('span');
    right.textContent = p.cls ? `${CLASSES[p.cls].race} ${CLASSES[p.cls].name}` : '직업 선택 중...';
    right.style.color = p.cls ? hex(CLASSES[p.cls].color) : 'var(--muted)';
    li.append(left, right);
    list.appendChild(li);
  }

  const ready = lobby.every((p) => p.cls);
  const startBtn = $<HTMLButtonElement>('btn-start');
  startBtn.style.display = role === 'client' ? 'none' : '';
  startBtn.disabled = !ready;
  $('room-status').textContent =
    role === 'client'
      ? me?.cls ? '방장이 게임을 시작하기를 기다리는 중...' : '직업을 선택하세요.'
      : ready ? `${lobby.length}명 준비 완료` : '모든 플레이어가 직업을 선택해야 시작할 수 있습니다.';
}

function pickClass(cls: ClassId) {
  if (role === 'client') client?.send({ t: 'pick', cls });
  else applyPick(myId, cls);
}

function applyPick(id: string, cls: ClassId) {
  if (lobby.some((p) => p.cls === cls && p.id !== id)) return;
  const p = lobby.find((p) => p.id === id);
  if (p) p.cls = cls;
  syncLobby();
}

/** 방장: 대기실 상태를 모두에게 보내고 내 화면도 갱신한다. */
function syncLobby() {
  if (host) for (const p of lobby) if (p.id !== 'host') host.send(p.id, { t: 'lobby', players: lobby, you: p.id });
  if (!game) renderRoom();
}

// ─── 방 만들기 / 참가 ────────────────────────────────

async function createRoom() {
  const name = playerName();
  $('menu-error').textContent = '방을 만드는 중...';
  try {
    host = await HostNet.create();
  } catch (e) {
    menuError(`방을 만들 수 없습니다: ${(e as Error).message}`);
    return;
  }
  role = 'host';
  myId = 'host';
  lobby = [{ id: 'host', name, cls: null }];
  $('menu-error').textContent = '';

  host.canAccept = () => (game ? '이미 게임이 진행 중입니다.' : lobby.length >= 4 ? '방이 가득 찼습니다. (최대 4명)' : null);
  host.onConnect = (id) => {
    lobby.push({ id, name: '참가자', cls: null });
    syncLobby();
  };
  host.onMessage = (id, msg: ClientMsg) => {
    if (msg.t === 'input') session?.onRemoteInput?.(id, msg.input);
    else if (msg.t === 'alloc') session?.onRemoteAlloc?.(id, msg.attr);
    else if (msg.t === 'buy') session?.onRemoteBuy?.(id, msg.shop, msg.idx);
    else if (msg.t === 'slot') session?.onRemoteSlot?.(id, msg.idx);
    else if (msg.t === 'move') session?.onRemoteMove?.(id, msg.from, msg.idx);
    else if (msg.t === 'dropItem') session?.onRemoteDrop?.(id, msg.from, msg.idx);
    else if (msg.t === 'forge') session?.onRemoteForge?.(id, msg.shop, msg.picks, msg.random);
    else if (game) return;
    else if (msg.t === 'hello') {
      const p = lobby.find((p) => p.id === id);
      if (p) p.name = String(msg.name).slice(0, 10) || '참가자';
      syncLobby();
    } else if (msg.t === 'pick') applyPick(id, msg.cls);
  };
  host.onDisconnect = (id) => {
    lobby = lobby.filter((p) => p.id !== id);
    session?.onPlayerLeft?.(id);
    syncLobby();
  };
  show('room');
  renderRoom();
}

async function joinRoom() {
  const code = $<HTMLInputElement>('code').value.trim().toUpperCase();
  if (code.length < 4) return menuError('방 코드를 입력하세요.');
  const name = playerName();
  $('menu-error').textContent = '접속 중...';
  try {
    client = await ClientNet.join(code);
  } catch (e) {
    client = undefined;
    menuError((e as Error).message);
    return;
  }
  role = 'client';
  myId = client.id;
  $('menu-error').textContent = '';

  client.onMessage = (msg: HostMsg) => {
    switch (msg.t) {
      case 'lobby':
        lobby = msg.players;
        myId = msg.you;
        if (!game) {
          show('room');
          renderRoom();
        }
        break;
      case 'start':
        startGame(msg.seed, msg.players);
        break;
      case 'snap':
        session?.onSnap?.(msg.s);
        break;
      case 'toLobby':
        endGame();
        show('room');
        renderRoom();
        break;
      case 'reject':
        leave();
        menuError(msg.reason);
        break;
    }
  };
  client.onClose = () => {
    if (!client) return;
    // 게임 중이면 마지막 기록으로 결과 화면을 보여 준다 (메뉴로는 그 화면에서 나간다)
    if (session?.onHostLost?.()) {
      client = undefined;
      return;
    }
    leave();
    menuError('방장과의 연결이 끊어졌습니다.');
  };
  client.send({ t: 'hello', name });
}

function startSolo() {
  role = 'solo';
  myId = 'host';
  lobby = [{ id: 'host', name: playerName(), cls: null }];
  show('room');
  renderRoom();
}

function leave() {
  endGame();
  const c = client;
  client = undefined;
  c?.destroy();
  host?.destroy();
  host = undefined;
  lobby = [];
  show('menu');
}

// ─── 게임 시작 / 종료 ────────────────────────────────

function hostStart() {
  if (!lobby.every((p) => p.cls)) return;
  const seed = Math.floor(Math.random() * 2 ** 31);
  host?.broadcast({ t: 'start', seed, players: lobby });
  startGame(seed, lobby);
}

/** 모바일: 게임 화면을 전체 화면·가로 고정으로 (지원하는 브라우저에서만, 실패해도 그냥 진행) */
function enterMobileFullscreen() {
  if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
  document.documentElement.requestFullscreen?.()
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => {});
}

function startGame(seed: number, players: LobbyPlayer[]) {
  endGame();
  document.body.classList.add('playing');
  enterMobileFullscreen();
  session = {
    role, myId, seed, players: players.map((p) => ({ ...p })), host, client,
    skipStory: $<HTMLInputElement>('skip-story').checked,
    startLevel: import.meta.env.DEV ? Number($<HTMLInputElement>('dev-level').value) || 1 : undefined,
    startZone: import.meta.env.DEV ? Number($<HTMLSelectElement>('dev-zone').value) || 1 : undefined,
    backToLobby: () => {
      host?.broadcast({ t: 'toLobby' });
      endGame();
      show('room');
      renderRoom();
    },
    disconnect: () => {
      const c = client;
      client = undefined; // onClose에서 '연결이 끊겼다' 처리를 하지 않게 먼저 비운다
      c?.destroy();
    },
    leaveToMenu: () => leave(),
  };
  show('game');
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#0f1522',
    transparent: true, // HUD만 그리는 Phaser 화면 아래로 3D 캔버스(World3D)가 비쳐 보이도록
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { gamepad: true },
    scene: [],
  });
  game.scene.add('game', GameScene, true, session);
}

function endGame() {
  document.body.classList.remove('playing');
  game?.destroy(true);
  game = null;
  session = null;
}

// ─── 초기화 ──────────────────────────────────────────

try {
  $<HTMLInputElement>('name').value = localStorage.getItem('actrpg-name') ?? '';
} catch {
  /* 무시 */
}
// 스토리 건너뛰기: 이 브라우저에 기억한다 (바로 시작(autostart)보다 먼저 읽어 둔다)
try {
  $<HTMLInputElement>('skip-story').checked = localStorage.getItem('actrpg-skip-story') === '1';
} catch {
  /* 무시 */
}
// 효과음 크기 (0~100%, 이 브라우저에 기억. 바꾸면 다음 게임부터 적용)
{
  const vol = $<HTMLInputElement>('volume');
  const show = () => ($('volume-v').textContent = vol.value === '0' ? '끔' : `${vol.value}%`);
  vol.value = String(Math.round(Sound.volume * 100));
  show();
  vol.oninput = () => {
    Sound.volume = Number(vol.value) / 100;
    show();
  };
}
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if (roomParam) $<HTMLInputElement>('code').value = roomParam.toUpperCase();

// 개발 중에만: 로비의 '시작 레벨'·'시작 구역' (이 브라우저에 기억). ?level=10 · ?zone=5 로도 정할 수 있다
if (import.meta.env.DEV) {
  const zs = $<HTMLSelectElement>('dev-zone');
  $('dev-zone-row').hidden = false;
  ZONE_NAMES.forEach((n, i) => zs.add(new Option(`${i + 1}구역 ${n}`, String(i + 1))));
  try {
    zs.value = params.get('zone') ?? localStorage.getItem('actrpg-dev-zone') ?? '1';
  } catch {
    /* 무시 */
  }
  zs.onchange = () => {
    try {
      localStorage.setItem('actrpg-dev-zone', zs.value);
    } catch {
      /* 무시 */
    }
  };
  const lv = $<HTMLInputElement>('dev-level');
  $('dev-level-row').hidden = false;
  try {
    lv.value = params.get('level') ?? localStorage.getItem('actrpg-dev-level') ?? '1';
  } catch {
    /* 무시 */
  }
  lv.onchange = () => {
    try {
      localStorage.setItem('actrpg-dev-level', lv.value);
    } catch {
      /* 무시 */
    }
  };
}

// 개발 중에만: ?autostart=elf&seed=1 로 로비를 건너뛰고 바로 혼자 시작한다 (&level=10 을 붙이면 10레벨로, &zone=5 면 5구역에서).
const autostart = params.get('autostart') as ClassId | null;
if (import.meta.env.DEV && autostart && autostart in CLASSES) {
  role = 'solo';
  myId = 'host';
  lobby = [{ id: 'host', name: '테스트', cls: autostart }];
  startGame(Number(params.get('seed') ?? 1), lobby);
}

$('btn-create').onclick = createRoom;
$('btn-join').onclick = joinRoom;
$('btn-solo').onclick = startSolo;
// 개발 중에만: 로비에 맵 편집기 링크 (배포된 사이트에는 편집기가 없다)
if (import.meta.env.DEV) {
  const link = document.createElement('a');
  link.href = './editor.html';
  link.textContent = '🛠 맵 편집기 (개발용)';
  link.className = 'hint';
  link.style.display = 'block';
  $('menu-error').after(link);
}
$('btn-leave').onclick = leave;
$<HTMLInputElement>('skip-story').onchange = (e) => {
  try {
    localStorage.setItem('actrpg-skip-story', (e.target as HTMLInputElement).checked ? '1' : '0');
  } catch {
    /* 무시 */
  }
};
// 참가자는 게임이 네트워크 메시지로 시작돼 자동 전체 화면이 막히므로, 대기실에서 미리 누를 수 있게 한다
$('btn-fullscreen').onclick = () => document.documentElement.requestFullscreen?.().catch(() => {});
$('btn-start').onclick = hostStart;
$('btn-copy').onclick = async () => {
  if (!host) return;
  const url = `${location.origin}${location.pathname}?room=${host.code}`;
  try {
    await navigator.clipboard.writeText(url);
    $('btn-copy').textContent = '복사됨!';
  } catch {
    prompt('이 링크를 친구에게 보내세요', url);
  }
};
$('code').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') joinRoom();
});
