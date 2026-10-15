// 맵 편집기 (개발 서버에서 /editor.html). 위에서 내려다본 타일 격자에 지형을 칠하고 몬스터·상점·문·출발점·보스를 놓는다.
// '저장'은 개발 서버를 통해 src/game/maps/world.json을 덮어쓰고, '테스트 플레이'는 저장하지 않은 맵으로 바로 게임을 연다.
import { ELITES, ENEMIES, GATE_KEEPERS, SHOP_TYPES, ZONE_NAMES, ZONE_PALETTE } from '../game/data';
import { SHOP_ORDER, buildLevel } from '../game/level';
import { PROPS, PROP_KINDS, type PropGroup, type PropKind } from '../game/props';

/** 지도 위 상점 칸 글자: 회복 · 공격 · 방어 */
const SHOP_LETTER = { heal: '회', attack: '공', defense: '방' } as const;
import { mapFromLevel, stringifyMap, validateMap, zoneAt, type MapFile, type SpawnType } from '../game/mapfile';
import { DRAFT_KEY } from '../game/world';
import { View3D } from './view3d';

// ─── 도구 ─────────────────────────────────────────────

type TerrainTool = 'grass' | 'road' | 'stone' | 'tree' | 'rock';
type ObjectTool = 'select' | 'erase' | SpawnType | 'shop' | 'gate' | 'start' | 'boss' | 'prop';
type Tool = TerrainTool | ObjectTool;

const TERRAIN: { id: TerrainTool; name: string; key: string; color: string }[] = [
  { id: 'grass', name: '바닥 (풀)', key: '1', color: '#5c9a44' },
  { id: 'road', name: '길', key: '2', color: '#b59866' },
  { id: 'stone', name: '돌바닥', key: '3', color: '#9a9aa4' },
  { id: 'tree', name: '나무 (벽)', key: '4', color: '#2f5a2a' },
  { id: 'rock', name: '바위 (벽)', key: '5', color: '#6b6b70' },
];

const SPAWN_STYLE: Record<SpawnType, { name: string; color: string; letter: string }> = {
  slime: { name: '슬라임', color: '#66dd66', letter: 'S' },
  goblin: { name: '고블린', color: '#3f9a3a', letter: 'G' },
  skeleton: { name: '해골 궁수', color: '#e8e8dc', letter: 'K' },
  orc: { name: '오크 전사', color: '#b8673a', letter: 'O' },
  hound: { name: ENEMIES.hound.name, color: '#d8b890', letter: 'p' },
  thrower: { name: ENEMIES.thrower.name, color: '#8aa050', letter: 't' },
  bandit: { name: ENEMIES.bandit.name, color: '#5070c0', letter: 'b' },
  assassin: { name: ENEMIES.assassin.name, color: '#404048', letter: 'a' },
  raider: { name: ENEMIES.raider.name, color: '#c06040', letter: 'v' },
  iceWitch: { name: ENEMIES.iceWitch.name, color: '#80d0ff', letter: 'w' },
  darkKnight: { name: ENEMIES.darkKnight.name, color: '#707078', letter: 'k' },
  zombie: { name: ENEMIES.zombie.name, color: '#80a070', letter: 'z' },
  flameKnight: { name: ENEMIES.flameKnight.name, color: '#e0b030', letter: 'f' },
  pyromancer: { name: ENEMIES.pyromancer.name, color: '#ff7030', letter: 'm' },
  elite1: { name: '중간보스 1', color: '#ffc040', letter: '1' },
  elite2: { name: '중간보스 2', color: '#ffc040', letter: '2' },
  keeper: { name: '문지기', color: '#ff7a30', letter: '문' },
};

const OBJECTS: { id: ObjectTool; name: string; key: string; color: string }[] = [
  { id: 'select', name: '선택·이동', key: 'V', color: '#ffffff' },
  { id: 'erase', name: '물건 지우기', key: 'X', color: '#ff5050' },
  { id: 'slime', name: '슬라임', key: 'Q', color: SPAWN_STYLE.slime.color },
  { id: 'goblin', name: '고블린', key: 'W', color: SPAWN_STYLE.goblin.color },
  { id: 'skeleton', name: '해골 궁수', key: 'E', color: SPAWN_STYLE.skeleton.color },
  { id: 'orc', name: '오크 전사', key: 'R', color: SPAWN_STYLE.orc.color },
  // 구역별 몬스터 (단축키 없음)
  ...(['hound', 'thrower', 'bandit', 'assassin', 'raider', 'iceWitch', 'darkKnight', 'zombie', 'flameKnight', 'pyromancer'] as const)
    .map((id) => ({ id, name: SPAWN_STYLE[id].name, key: '', color: SPAWN_STYLE[id].color })),
  { id: 'elite1', name: '중간보스 1', key: 'A', color: SPAWN_STYLE.elite1.color },
  { id: 'elite2', name: '중간보스 2', key: 'S', color: SPAWN_STYLE.elite2.color },
  { id: 'keeper', name: '문지기', key: 'D', color: SPAWN_STYLE.keeper.color },
  { id: 'gate', name: '문', key: 'G', color: '#d03030' },
  { id: 'shop', name: '상점 (누르면 종류 바꿈)', key: 'F', color: '#ffcc33' },
  { id: 'prop', name: '장식 (아래에서 고르기)', key: 'H', color: '#c8a070' },
  { id: 'start', name: '출발점', key: 'Z', color: '#40e0ff' },
  { id: 'boss', name: '흑룡', key: 'B', color: '#c01818' },
];



// ─── 상태 ─────────────────────────────────────────────

let map: MapFile;
let tiles: string[][] = []; // 편집 중에는 글자 배열로
let ground: string[][] = [];
let savedText = '';
let tool: Tool = 'select';
let brush = 1;
const view = { ox: -20, oy: -20, z: 9 }; // 화면 = 타일 * z - o
let hover = { x: -1, y: -1, fx: 0, fy: 0 };
type Picked = { kind: 'spawn' | 'shop' | 'start' | 'boss' | 'prop'; index: number } | { kind: 'gate'; index: number };
let propKind: PropKind = 'barrel'; // 장식 도구로 놓을 종류
let selected: Picked | null = null;
let dragging: Picked | null = null;
let painting = false;
let panning: { x: number; y: number; ox: number; oy: number } | null = null;
let spaceDown = false;
const undoStack: string[] = [];
const redoStack: string[] = [];

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const cv = $<HTMLCanvasElement>('cv');
const ctx = cv.getContext('2d')!;

// ─── 맵 읽고 쓰기 ──────────────────────────────────────

const DRAFT_BASE_KEY = `${DRAFT_KEY}-base`;

/** 글자의 짧은 지문 (초안이 어느 저장본에서 시작했는지 비교용) */
function textHash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) | 0;
  return `${s.length}:${h >>> 0}`;
}

function setMap(m: MapFile) {
  map = structuredClone(m);
  tiles = map.tiles.map((r) => r.split(''));
  ground = map.ground.map((r) => r.split(''));
  selected = null;
}

function currentMap(): MapFile {
  return { ...map, tiles: tiles.map((r) => r.join('')), ground: ground.map((r) => r.join('')) };
}

function currentText() {
  return stringifyMap(currentMap());
}

/** 바꾸기 직전에 부른다 (되돌리기용) */
function checkpoint() {
  undoStack.push(currentText());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

function restore(text: string) {
  setMap(JSON.parse(text));
  changed();
}

function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(currentText());
  restore(prev);
}

function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(currentText());
  restore(next);
}

let validateTimer = 0;
/** 바뀐 뒤: 다시 그리고, 초안 저장, 검사 */
function changed() {
  draw();
  const text = currentText();
  try {
    localStorage.setItem(DRAFT_KEY, text);
    localStorage.setItem(DRAFT_BASE_KEY, textHash(savedText)); // 이 초안이 어느 저장본에서 시작했는지
  } catch {
    /* 무시 */
  }
  $('saved').textContent = text === savedText ? '저장됨' : '● 저장 안 됨';
  clearTimeout(validateTimer);
  validateTimer = window.setTimeout(showProblems, 150);
  updateCounts();
}

function showProblems() {
  const problems = validateMap(currentMap());
  $('problems').innerHTML = problems.length
    ? problems.map((p) => `<li>⚠ ${p}</li>`).join('')
    : '<li class="ok">✔ 문제 없음</li>';
}

function updateCounts() {
  const zones = map.zoneStartsTx.length;
  const per = Array.from({ length: zones }, () => 0);
  for (const s of map.spawns) per[Math.min(zoneAt(map.zoneStartsTx, Math.floor(s.x + 0.5)), zones) - 1]++;
  $('counts').textContent = '몬스터 ' + per.map((n, i) => `${i + 1}구역 ${n}`).join(' · ');
}

async function save() {
  const text = currentText();
  const res = await fetch('/__editor/save-map', { method: 'POST', body: text }).catch(() => null);
  if (!res?.ok) {
    toast('저장 실패: 개발 서버(npm run dev)에서 열었는지 확인하세요');
    return;
  }
  savedText = text;
  changed();
  const problems = validateMap(currentMap());
  toast(problems.length ? `저장했습니다 (문제 ${problems.length}개가 남아 있습니다)` : '저장했습니다');
}

let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── 편집 동작 ─────────────────────────────────────────

const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < map.w && y < map.h;
const propAt = (x: number, y: number) => (map.props ?? []).findIndex((p) => p.x === x && p.y === y);
/** 막힌 칸: 나무·바위, 또는 길을 막는 장식이 놓인 칸 */
const blocked = (x: number, y: number) => {
  if (!inMap(x, y) || tiles[y][x] !== '.') return true;
  const i = propAt(x, y);
  return i >= 0 && PROPS[map.props![i].t].block;
};

function paint(cx: number, cy: number) {
  const r = brush - 1;
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inMap(x, y) || Math.hypot(x - cx, y - cy) > r + 0.5) continue;
      if (tool === 'tree' || tool === 'rock') {
        // 상점·문 칸은 칠하지 않는다
        if (map.shops.some((s) => s.x === x && s.y === y) || map.gates.some((g) => g.x === x && y >= g.y0 && y <= g.y1)) continue;
        tiles[y][x] = tool === 'tree' ? 'T' : 'R';
        const pi = propAt(x, y); // 벽으로 칠한 칸의 장식은 치운다
        if (pi >= 0) map.props!.splice(pi, 1);
      } else {
        tiles[y][x] = '.';
        ground[y][x] = tool === 'road' ? '=' : tool === 'stone' ? '#' : '.';
      }
    }
}

/** 커서 근처의 물건 (가까운 것 우선) */
function pick(fx: number, fy: number): Picked | null {
  const near = (x: number, y: number, r: number) => Math.hypot(fx - (x + 0.5), fy - (y + 0.5)) <= r;
  if (near(map.boss.x, map.boss.y, 0.9)) return { kind: 'boss', index: 0 };
  if (near(map.start.x, map.start.y, 0.6)) return { kind: 'start', index: 0 };
  let best = -1, bestD = 0.6;
  map.spawns.forEach((s, i) => {
    const d = Math.hypot(fx - (s.x + 0.5), fy - (s.y + 0.5));
    if (d < bestD) [best, bestD] = [i, d];
  });
  if (best >= 0) return { kind: 'spawn', index: best };
  const shop = map.shops.findIndex((s) => Math.floor(fx) === s.x && Math.floor(fy) === s.y);
  if (shop >= 0) return { kind: 'shop', index: shop };
  const prop = propAt(Math.floor(fx), Math.floor(fy));
  if (prop >= 0) return { kind: 'prop', index: prop };
  const gate = map.gates.findIndex((g) => Math.floor(fx) === g.x && fy >= g.y0 && fy < g.y1 + 1);
  if (gate >= 0) return { kind: 'gate', index: gate };
  return null;
}

function remove(p: Picked) {
  if (p.kind === 'spawn') map.spawns.splice(p.index, 1);
  else if (p.kind === 'shop') map.shops.splice(p.index, 1);
  else if (p.kind === 'gate') map.gates.splice(p.index, 1);
  else if (p.kind === 'prop') map.props!.splice(p.index, 1);
  else return false; // 출발점·보스는 지울 수 없다 (옮기기만)
  selected = null;
  return true;
}

/** 문 도구: (x, y)를 지나는 세로 통로(막히지 않은 칸이 이어진 구간)를 막는 문을 만든다. 이미 있으면 없앤다 */
function toggleGate(x: number, y: number) {
  const existing = map.gates.findIndex((g) => g.x === x && y >= g.y0 && y <= g.y1);
  if (existing >= 0) {
    map.gates.splice(existing, 1);
    return;
  }
  if (blocked(x, y)) {
    toast('막힌 칸에는 문을 놓을 수 없습니다. 통로 위를 누르세요');
    return;
  }
  let y0 = y, y1 = y;
  while (!blocked(x, y0 - 1)) y0--;
  while (!blocked(x, y1 + 1)) y1++;
  map.gates.push({ x, y0, y1 });
  map.gates.sort((a, b) => a.x - b.x);
}

function place(x: number, y: number) {
  if (tool === 'gate') return toggleGate(x, y);
  if (tool === 'start' || tool === 'boss') {
    if (blocked(x, y)) return toast('막힌 칸입니다');
    map[tool] = { x, y };
    return;
  }
  if (tool === 'shop') {
    // 빈 칸: 회복 상점을 놓는다. 있는 상점을 누르면 종류가 회복 → 공격 → 방어로 바뀐다 (지우기는 오른쪽 클릭)
    const sh = map.shops.find((s) => s.x === x && s.y === y);
    if (sh) sh.type = SHOP_ORDER[(SHOP_ORDER.indexOf(sh.type ?? 'attack') + 1) % SHOP_ORDER.length];
    else {
      tiles[y][x] = '.';
      map.shops.push({ x, y, type: 'heal' });
    }
    return;
  }
  if (tool === 'prop') {
    // 빈 바닥 칸: 고른 장식을 놓는다. 이미 장식이 있으면 90도씩 돌린다 (지우기는 오른쪽 클릭)
    map.props ??= [];
    const i = propAt(x, y);
    if (i >= 0) {
      map.props[i].r = ((map.props[i].r ?? 0) + 1) % 4;
      return;
    }
    if (tiles[y][x] !== '.' || map.shops.some((s) => s.x === x && s.y === y) || map.gates.some((g) => g.x === x && y >= g.y0 && y <= g.y1)) {
      return toast('바닥 칸에만 장식을 놓을 수 있습니다');
    }
    if (PROPS[propKind].block && map.spawns.some((s) => s.x === x && s.y === y)) return toast('몬스터가 있는 칸에는 길을 막는 장식을 놓을 수 없습니다');
    map.props.push({ t: propKind, x, y });
    return;
  }
  const t = tool as SpawnType;
  if (blocked(x, y)) return toast('막힌 칸에는 몬스터를 놓을 수 없습니다');
  if (map.spawns.some((s) => s.x === x && s.y === y)) return;
  map.spawns.push({ t, x, y });
}

function isTerrain(t: Tool): t is TerrainTool {
  return TERRAIN.some((d) => d.id === t);
}

// ─── 그리기 ────────────────────────────────────────────

function resize() {
  const main = $('main');
  const dpr = window.devicePixelRatio || 1;
  cv.width = main.clientWidth * dpr;
  cv.height = main.clientHeight * dpr;
  cv.style.width = `${main.clientWidth}px`;
  cv.style.height = `${main.clientHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

/** 칸 색: 구역 색(ZONE_PALETTE)을 쓰고, 나무는 어둡게, 바위는 벽 색을 밝게 해서 구분한다 */
function tileColor(x: number, y: number) {
  const pal = ZONE_PALETTE[Math.min(zoneAt(map.zoneStartsTx, x), ZONE_PALETTE.length) - 1];
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  const mix = (c: number, to: number, k: number) => {
    const ch = (s: number) => Math.round(((c >> s) & 255) * (1 - k) + ((to >> s) & 255) * k);
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  };
  const t = tiles[y][x];
  if (t === 'T') return hex(mix(pal.ground, 0x000000, 0.45));
  if (t === 'R') return hex(mix(pal.wall, 0x9a9aa0, 0.45));
  const g = ground[y][x];
  if (g === '=') return hex(pal.road);
  if (g === '#') return '#9a9aa4';
  return hex(pal.ground);
}

function draw() {
  if (!map) return;
  const W = cv.clientWidth, H = cv.clientHeight, z = view.z;
  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(0, 0, W, H);
  const x0 = Math.max(0, Math.floor(view.ox / z)), y0 = Math.max(0, Math.floor(view.oy / z));
  const x1 = Math.min(map.w - 1, Math.ceil((view.ox + W) / z)), y1 = Math.min(map.h - 1, Math.ceil((view.oy + H) / z));
  const sx = (x: number) => x * z - view.ox, sy = (y: number) => y * z - view.oy;

  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      ctx.fillStyle = tileColor(x, y);
      ctx.fillRect(sx(x), sy(y), z + 0.5, z + 0.5);
    }
  if (z >= 12) {
    ctx.strokeStyle = '#00000022';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) ctx.moveTo(sx(x), sy(y0)), ctx.lineTo(sx(x), sy(y1 + 1));
    for (let y = y0; y <= y1 + 1; y++) ctx.moveTo(sx(x0), sy(y)), ctx.lineTo(sx(x1 + 1), sy(y));
    ctx.stroke();
  }

  // 구역 경계와 이름
  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'bottom';
  const lines = [...map.zoneStartsTx.map((tx, i) => ({ tx, label: `${i + 1}구역 ${ZONE_NAMES[i] ?? ''}`, color: '#ffd040' })), { tx: map.arenaTx, label: '보스 방', color: '#ff5050' }];
  for (const l of lines) {
    ctx.strokeStyle = l.color;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(sx(l.tx), sy(0) - 18);
    ctx.lineTo(sx(l.tx), sy(map.h));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = l.color;
    ctx.fillText(l.label, sx(l.tx) + 4, sy(0) - 4);
  }

  // 문
  map.gates.forEach((g, i) => {
    const sel = selected?.kind === 'gate' && selected.index === i;
    ctx.fillStyle = '#d03030';
    ctx.fillRect(sx(g.x) + z * 0.25, sy(g.y0), z * 0.5, (g.y1 - g.y0 + 1) * z);
    ctx.strokeStyle = sel ? '#fff' : '#000';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(sx(g.x) + z * 0.25, sy(g.y0), z * 0.5, (g.y1 - g.y0 + 1) * z);
  });

  // 장식: 작은 네모 + 이름 첫 글자 (길을 막지 않는 장식은 테두리만)
  (map.props ?? []).forEach((p, i) => {
    const def = PROPS[p.t];
    if (!def) return;
    const x = sx(p.x), y = sy(p.y), sel = selected?.kind === 'prop' && selected.index === i;
    const pad = z * 0.12;
    ctx.fillStyle = def.color;
    ctx.globalAlpha = def.block ? 1 : 0.55;
    ctx.fillRect(x + pad, y + pad, z - pad * 2, z - pad * 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sel ? '#fff' : '#00000088';
    ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(x + pad, y + pad, z - pad * 2, z - pad * 2);
    if (z >= 12) label(def.name[0], x + z / 2, y + z / 2, Math.max(8, z * 0.5), '#111');
  });

  // 상점
  map.shops.forEach((s, i) => {
    const type = s.type ?? 'attack';
    box(sx(s.x), sy(s.y), z, `#${SHOP_TYPES[type].color.toString(16).padStart(6, '0')}`, SHOP_LETTER[type], selected?.kind === 'shop' && selected.index === i);
  });

  // 몬스터
  map.spawns.forEach((s, i) => {
    const st = SPAWN_STYLE[s.t];
    const big = s.t === 'elite1' || s.t === 'elite2' || s.t === 'keeper';
    const cx = sx(s.x + 0.5), cy = sy(s.y + 0.5), r = z * (big ? 0.55 : 0.36);
    ctx.fillStyle = st.color;
    ctx.beginPath();
    if (s.t === 'keeper') ctx.rect(cx - r, cy - r, r * 2, r * 2);
    else ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const sel = selected?.kind === 'spawn' && selected.index === i;
    ctx.strokeStyle = sel ? '#ffffff' : big ? '#7a4a00' : '#00000088';
    ctx.lineWidth = sel ? 2.5 : big ? 2 : 1;
    ctx.stroke();
    if (z >= 10 || big) label(st.letter, cx, cy, Math.max(9, r * 1.2), '#111');
  });

  // 출발점, 흑룡
  const st = { cx: sx(map.start.x + 0.5), cy: sy(map.start.y + 0.5) };
  ctx.fillStyle = '#40e0ff';
  ctx.beginPath();
  ctx.moveTo(st.cx, st.cy - z * 0.8);
  ctx.lineTo(st.cx + z * 0.7, st.cy + z * 0.5);
  ctx.lineTo(st.cx - z * 0.7, st.cy + z * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = selected?.kind === 'start' ? '#fff' : '#003040';
  ctx.lineWidth = 2;
  ctx.stroke();
  label('출발', st.cx, st.cy - z * 1.2, 11, '#40e0ff', true);
  const bx = sx(map.boss.x + 0.5), by = sy(map.boss.y + 0.5);
  ctx.fillStyle = '#c01818';
  ctx.beginPath();
  ctx.arc(bx, by, z * 0.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = selected?.kind === 'boss' ? '#fff' : '#ffd040';
  ctx.lineWidth = 2;
  ctx.stroke();
  label('흑룡', bx, by, Math.max(10, z * 0.7), '#fff');

  // 커서: 칠하기 도구는 붓 크기, 나머지는 칸 하나
  if (inMap(hover.x, hover.y) && !panning) {
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 1.5;
    if (isTerrain(tool)) {
      const r = brush - 1;
      ctx.beginPath();
      ctx.arc(sx(hover.x + 0.5), sy(hover.y + 0.5), (r + 0.5) * z, 0, Math.PI * 2);
      ctx.stroke();
    } else ctx.strokeRect(sx(hover.x), sy(hover.y), z, z);
  }
}

function box(x: number, y: number, z: number, color: string, text: string, sel: boolean) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, z - 2, z - 2);
  ctx.strokeStyle = sel ? '#fff' : '#6a4a00';
  ctx.lineWidth = sel ? 2.5 : 1.5;
  ctx.strokeRect(x + 1, y + 1, z - 2, z - 2);
  label(text, x + z / 2, y + z / 2, Math.max(9, z * 0.7), '#3a2600');
}

function label(text: string, x: number, y: number, size: number, color: string, outline = false) {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (outline) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'start';
}

// ─── 입력 ─────────────────────────────────────────────

function toTile(e: MouseEvent) {
  const r = cv.getBoundingClientRect();
  const fx = (e.clientX - r.left + view.ox) / view.z, fy = (e.clientY - r.top + view.oy) / view.z;
  return { fx, fy, x: Math.floor(fx), y: Math.floor(fy) };
}

function describe(p: Picked | null): string {
  if (!p) return '';
  if (p.kind === 'spawn') {
    const s = map.spawns[p.index];
    const zone = Math.min(zoneAt(map.zoneStartsTx, Math.floor(s.x + 0.5)), map.zoneStartsTx.length);
    if (s.t === 'keeper') return `${GATE_KEEPERS[zone - 1].name} (${zone}구역 출구 문지기)`;
    if (s.t === 'elite1' || s.t === 'elite2') return `${ELITES[zone - 1][s.t === 'elite1' ? 0 : 1].name} (${zone}구역 중간보스)`;
    return SPAWN_STYLE[s.t].name;
  }
  if (p.kind === 'shop') return SHOP_TYPES[map.shops[p.index].type ?? 'attack'].name;
  if (p.kind === 'prop') {
    const pr = map.props![p.index];
    return `장식: ${PROPS[pr.t].name}${PROPS[pr.t].block ? ' (길 막음)' : ''}`;
  }
  return { gate: '문', start: '출발점', boss: '흑룡' }[p.kind];
}

cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('mousedown', (e) => {
  const t = toTile(e);
  if (e.button === 1 || (e.button === 0 && spaceDown)) {
    panning = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy };
    return;
  }
  if (!inMap(t.x, t.y)) return;
  if (e.button === 2) {
    // 오른쪽 클릭: 그 자리 물건 지우기
    const p = pick(t.fx, t.fy);
    if (p && p.kind !== 'start' && p.kind !== 'boss') {
      checkpoint();
      remove(p);
      changed();
    }
    return;
  }
  if (e.button !== 0) return;
  if (tool === 'select') {
    selected = pick(t.fx, t.fy);
    if (selected && selected.kind !== 'gate') {
      checkpoint();
      dragging = selected;
    } else if (!selected) panning = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }; // 빈 곳을 끌면 화면 이동
    draw();
    return;
  }
  checkpoint();
  if (tool === 'erase') {
    const p = pick(t.fx, t.fy);
    if (p) remove(p);
    painting = true;
  } else if (isTerrain(tool)) {
    paint(t.x, t.y);
    painting = true;
  } else place(t.x, t.y);
  changed();
});

window.addEventListener('mousemove', (e) => {
  if (!map || view3d.isOpen) return;
  const t = toTile(e);
  hover = t;
  if (panning) {
    view.ox = panning.ox - (e.clientX - panning.x);
    view.oy = panning.oy - (e.clientY - panning.y);
    draw();
    return;
  }
  if (painting && inMap(t.x, t.y)) {
    if (tool === 'erase') {
      const p = pick(t.fx, t.fy);
      if (p) remove(p);
    } else paint(t.x, t.y);
    changed();
  } else if (dragging && inMap(t.x, t.y) && !blocked(t.x, t.y)) {
    const d = dragging;
    if (d.kind === 'spawn') Object.assign(map.spawns[d.index], { x: t.x, y: t.y });
    else if (d.kind === 'shop') Object.assign(map.shops[d.index], { x: t.x, y: t.y });
    else if (d.kind === 'prop' && propAt(t.x, t.y) < 0) Object.assign(map.props![d.index], { x: t.x, y: t.y });
    else if (d.kind === 'start' || d.kind === 'boss') map[d.kind] = { x: t.x, y: t.y };
    changed();
  } else draw();
  const zone = inMap(t.x, t.y) ? (t.x >= map.arenaTx ? '보스 방' : `${zoneAt(map.zoneStartsTx, t.x)}구역`) : '';
  const under = describe(pick(t.fx, t.fy));
  $('pos').textContent = inMap(t.x, t.y) ? `(${t.x}, ${t.y}) ${zone}${under ? ' · ' + under : ''}` : '';
});

window.addEventListener('mouseup', () => {
  if (dragging) {
    // 움직이지 않았으면 되돌리기 기록을 지운다
    if (undoStack[undoStack.length - 1] === currentText()) undoStack.pop();
  }
  painting = false;
  dragging = null;
  panning = null;
});

// 휠·트랙패드: 화면 이동 (Shift+휠은 가로), Ctrl(⌘)+휠·트랙패드 집기: 확대·축소
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const r = cv.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)));
  } else {
    const line = e.deltaMode ? 30 : 1; // 줄 단위로 오는 마우스 휠
    const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
    view.ox += dx * line;
    view.oy += dy * line;
    clampView();
    draw();
  }
}, { passive: false });

function zoomAt(mx: number, my: number, f: number) {
  const fx = (mx + view.ox) / view.z, fy = (my + view.oy) / view.z;
  view.z = Math.max(3, Math.min(48, view.z * f));
  view.ox = fx * view.z - mx;
  view.oy = fy * view.z - my;
  clampView();
  draw();
}

/** 맵이 화면 밖으로 다 나가지 않게 */
function clampView() {
  const W = cv.clientWidth, H = cv.clientHeight, margin = 80;
  view.ox = Math.max(-W + margin, Math.min(map.w * view.z - margin, view.ox));
  view.oy = Math.max(-H + margin, Math.min(map.h * view.z - margin, view.oy));
}

// 더블클릭: 그 자리를 3D로 보기
cv.addEventListener('dblclick', (e) => {
  const t = toTile(e);
  if (inMap(t.x, t.y)) open3d(t.x, t.y);
});

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Tab' || (e.key === 'Escape' && view3d.isOpen)) {
    e.preventDefault();
    toggle3d();
    return;
  }
  if (view3d.isOpen) return; // 3D 보기에서는 키를 카메라 이동에 쓴다
  if (e.key.startsWith('Arrow')) {
    const step = 120;
    view.ox += e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    view.oy += e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    clampView();
    draw();
    e.preventDefault();
    return;
  }
  if (e.key === '=' || e.key === '+' || e.key === '-') {
    zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, e.key === '-' ? 1 / 1.25 : 1.25);
    return;
  }
  if (e.code === 'Space') {
    spaceDown = true;
    cv.style.cursor = 'grab';
    e.preventDefault();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
    return;
  }
  if (mod) return;
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
    checkpoint();
    if (remove(selected)) changed();
    else undoStack.pop();
    return;
  }
  if (e.key === '[' || e.key === ']') {
    setBrush(brush + (e.key === ']' ? 1 : -1));
    return;
  }
  const all = [...TERRAIN, ...OBJECTS];
  const hit = all.find((d) => d.key.toLowerCase() === e.key.toLowerCase());
  if (hit) setTool(hit.id);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spaceDown = false;
    cv.style.cursor = '';
  }
});

// ─── 옆 칸 ─────────────────────────────────────────────

function toolButtons(el: HTMLElement, defs: { id: Tool; name: string; key: string; color: string }[]) {
  for (const d of defs) {
    const b = document.createElement('button');
    b.dataset.tool = d.id;
    b.innerHTML = `<span class="sw" style="background:${d.color}"></span>${d.name}<span class="key">${d.key}</span>`;
    b.onclick = () => setTool(d.id);
    el.appendChild(b);
  }
}

function setTool(t: Tool) {
  tool = t;
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
  document.querySelectorAll<HTMLButtonElement>('[data-prop]').forEach((b) => b.classList.toggle('on', t === 'prop' && b.dataset.prop === propKind));
  draw();
}

/** 장식 고르는 목록: 묶음(자연·야영지·물자·구조물·설원)마다 버튼. 길을 막지 않는 장식은 '통과'로 표시 */
function propButtons(el: HTMLElement) {
  const groups = new Map<PropGroup, PropKind[]>();
  for (const k of PROP_KINDS) {
    const g = PROPS[k].group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(k);
  }
  for (const [g, kinds] of groups) {
    const head = document.createElement('div');
    head.className = 'group';
    head.textContent = g;
    const box = document.createElement('div');
    box.className = 'tools';
    for (const k of kinds) {
      const d = PROPS[k];
      const b = document.createElement('button');
      b.dataset.prop = k;
      b.innerHTML = `<span class="sw" style="background:${d.color}"></span>${d.name}${d.block ? '' : '<span class="pass">통과</span>'}`;
      b.onclick = () => {
        propKind = k;
        setTool('prop');
      };
      box.appendChild(b);
    }
    el.append(head, box);
  }
}

function setBrush(n: number) {
  brush = Math.max(1, Math.min(7, n));
  $<HTMLInputElement>('brush').value = String(brush);
  $('brush-v').textContent = String(brush);
  draw();
}

toolButtons($('terrain-tools'), TERRAIN);
toolButtons($('object-tools'), OBJECTS);
propButtons($('prop-list'));
$<HTMLInputElement>('brush').oninput = (e) => setBrush(Number((e.target as HTMLInputElement).value));
$('save').onclick = save;
$('undo').onclick = undo;
$('redo').onclick = redo;
$('play').onclick = () => {
  localStorage.setItem(DRAFT_KEY, currentText());
  window.open(`./?autostart=${$<HTMLSelectElement>('cls').value}&draft=1`, '_blank');
};
$('download').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([currentText()], { type: 'application/json' }));
  a.download = 'world.json';
  a.click();
};
$('upload').onclick = () => $('file').click();
$<HTMLInputElement>('file').onchange = async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  try {
    const m = JSON.parse(await f.text()) as MapFile;
    if (m.version !== 1) throw new Error();
    checkpoint();
    setMap(m);
    changed();
    toast('불러왔습니다 (저장해야 게임에 반영됩니다)');
  } catch {
    toast('맵 파일이 아닙니다');
  }
};
$('generate').onclick = () => {
  const seed = Number($<HTMLInputElement>('seed').value) || 1;
  if (!confirm(`시드 ${seed}로 자동 생성한 맵으로 바꿀까요? (되돌리기로 돌아올 수 있습니다)`)) return;
  checkpoint();
  setMap(mapFromLevel(buildLevel(seed)));
  changed();
};
$('revert').onclick = () => {
  if (!confirm('저장된 맵으로 되돌릴까요? (되돌리기로 돌아올 수 있습니다)')) return;
  checkpoint();
  setMap(JSON.parse(savedText));
  changed();
};
window.addEventListener('resize', resize);

// ─── 3D 보기 ───────────────────────────────────────────

const view3d = new View3D($('main'), (text) => {
  if (view3d.isOpen) $('pos').textContent = text;
});

/** (tx, ty) 타일 근처를 3D로 연다. 지금 편집 중인 맵(저장 전 포함)으로 만든다 */
function open3d(tx: number, ty: number) {
  $('view3d').textContent = '2D로 돌아가기 (Tab)';
  $('counts').style.display = 'none';
  view3d.open(currentMap(), tx, ty);
}

function toggle3d() {
  if (view3d.isOpen) {
    const at = view3d.close();
    $('view3d').textContent = '3D로 보기 (Tab)';
    $('counts').style.display = '';
    $('pos').textContent = '';
    if (at) {
      // 3D에서 보던 곳을 2D 화면 가운데로
      view.ox = at.x * view.z - cv.clientWidth / 2;
      view.oy = at.y * view.z - cv.clientHeight / 2;
      clampView();
    }
    draw();
  } else {
    // 2D 화면 가운데를 3D로
    const cx = Math.floor((view.ox + cv.clientWidth / 2) / view.z), cy = Math.floor((view.oy + cv.clientHeight / 2) / view.z);
    open3d(Math.max(0, Math.min(map.w - 1, cx)), Math.max(0, Math.min(map.h - 1, cy)));
  }
}
$('view3d').onclick = toggle3d;
window.addEventListener('beforeunload', (e) => {
  if (map && currentText() !== savedText) e.preventDefault();
});

// ─── 시작 ─────────────────────────────────────────────

async function init() {
  // world.json을 모듈로 불러오면 저장할 때마다 페이지가 새로 고쳐지므로 파일 그대로 읽는다
  const res = await fetch('/src/game/maps/world.json', { cache: 'no-store' });
  savedText = stringifyMap(JSON.parse(await res.text()));
  let start = savedText;
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    const base = localStorage.getItem(DRAFT_BASE_KEY);
    if (draft && draft !== savedText) {
      if (base === textHash(savedText)) {
        if (confirm('저장하지 않은 편집 내용이 있습니다. 이어서 할까요? (취소하면 저장된 맵을 엽니다)')) start = draft;
      } else {
        // 초안을 만든 뒤에 저장된 맵이 바뀌었다(다른 곳에서 저장했거나 코드로 다시 만듦). 예전 초안을 이어서 저장하면 새 내용이 사라지므로 묻지 않고 저장본을 연다
        localStorage.setItem(`${DRAFT_KEY}-old`, draft);
        setTimeout(() => toast('저장된 맵이 바뀌어서 예전 편집 초안 대신 저장된 맵을 열었습니다'), 300);
      }
    }
  } catch {
    /* 무시 */
  }
  setMap(JSON.parse(start));
  setTool('select');
  resize();
  // 처음에는 맵 전체가 가로로 들어오게
  view.z = Math.max(3, Math.min(20, (cv.clientWidth - 40) / map.w));
  view.ox = -20;
  view.oy = -40;
  changed();
}
init();
