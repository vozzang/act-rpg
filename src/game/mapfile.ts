// 맵 파일: 개발자가 맵 편집기(editor.html)로 만든 맵. 모든 플레이어가 같은 맵(src/game/maps/world.json)을 플레이한다.
// 파일은 사람이 읽고 git으로 비교하기 쉽게 타일을 한 줄씩 문자열로 적는다. 좌표는 모두 타일 단위다.
import { ELITES, GATE_KEEPERS, TILE } from './data';
import { G_GRASS, G_ROAD, G_STONE, T_FLOOR, T_GATE, T_ROCK, T_SHOP, T_TREE, type Gate, type Level, type Spawn } from './level';
import type { EnemyKind } from './types';

/** 맵에 놓는 몬스터. elite1·elite2는 그 구역의 첫째·둘째 중간보스(ELITES), keeper는 그 구역 출구 문지기(GATE_KEEPERS) */
export type SpawnType = Exclude<EnemyKind, 'boss'> | 'elite1' | 'elite2' | 'keeper';
export const SPAWN_TYPES: SpawnType[] = [
  'slime', 'goblin', 'skeleton', 'orc',
  'hound', 'thrower', 'bandit', 'assassin', 'raider', 'iceWitch', 'darkKnight', 'zombie', 'flameKnight', 'pyromancer',
  'elite1', 'elite2', 'keeper',
];

export interface MapFile {
  version: 1;
  w: number;
  h: number;
  /** 지형: 한 줄에 한 행. '.' 바닥, 'T' 나무, 'R' 바위 (상점·문 칸은 아래 목록으로 정한다) */
  tiles: string[];
  /** 바닥 무늬: '.' 풀, '=' 길, '#' 돌바닥 */
  ground: string[];
  zoneStartsTx: number[]; // 구역마다 시작하는 타일 x (구역 수 = 길이)
  arenaTx: number; // 보스 방이 시작하는 타일 x
  start: { x: number; y: number };
  boss: { x: number; y: number }; // 흑룡이 기다리는 곳 (보스 방 가운데쯤)
  shops: { x: number; y: number }[]; // 상점 가판대 칸
  gates: { x: number; y0: number; y1: number }[]; // 구역 출구 문 (x열의 y0~y1칸). 구역마다 하나
  spawns: { t: SpawnType; x: number; y: number }[];
}

const TILE_CH: Record<number, string> = { [T_FLOOR]: '.', [T_TREE]: 'T', [T_ROCK]: 'R', [T_SHOP]: '.', [T_GATE]: '.' };
const CH_TILE: Record<string, number> = { '.': T_FLOOR, T: T_TREE, R: T_ROCK };
const GROUND_CH: Record<number, string> = { [G_GRASS]: '.', [G_ROAD]: '=', [G_STONE]: '#' };
const CH_GROUND: Record<string, number> = { '.': G_GRASS, '=': G_ROAD, '#': G_STONE };

/** 타일 x가 속한 구역 (1부터) */
export function zoneAt(zoneStartsTx: number[], tx: number) {
  let zone = 1;
  zoneStartsTx.forEach((sx, i) => {
    if (tx >= sx) zone = i + 1;
  });
  return zone;
}

/** 자동 생성한 맵(Level)을 맵 파일로 (편집기의 '자동 생성으로 새로 만들기', 처음 world.json 만들기) */
export function mapFromLevel(level: Level): MapFile {
  const { w, h } = level;
  const rows = (arr: Uint8Array, table: Record<number, string>) =>
    Array.from({ length: h }, (_, y) => Array.from(arr.subarray(y * w, y * w + w), (v) => table[v] ?? '.').join(''));
  const tile = (v: number) => Math.round((v / TILE - 0.5) * 2) / 2; // 월드 좌표 → 타일 좌표 (칸 가운데 = 정수)
  const keeperType = (s: Spawn): SpawnType => (s.gate !== undefined ? 'keeper' : s.elite !== undefined ? (s.elite === 0 ? 'elite1' : 'elite2') : (s.kind as SpawnType));
  const boss = level.spawns.find((s) => s.kind === 'boss')!;
  return {
    version: 1, w, h,
    tiles: rows(level.tiles, TILE_CH),
    ground: rows(level.ground, GROUND_CH),
    zoneStartsTx: [...level.zoneStartsTx],
    arenaTx: level.arenaTx,
    start: { x: tile(level.start.x), y: tile(level.start.y) },
    boss: { x: tile(boss.x), y: tile(boss.y) },
    shops: level.shops.map((s) => ({ x: Math.floor(s.x / TILE), y: Math.floor(s.y / TILE) })),
    gates: level.gates.map((g) => ({ x: g.tx, y0: g.ty0, y1: g.ty1 })),
    spawns: level.spawns.filter((s) => s.kind !== 'boss').map((s) => ({ t: keeperType(s), x: tile(s.x), y: tile(s.y) })),
  };
}

/** 맵 파일 → 게임이 쓰는 Level. 부를 때마다 새 배열을 만든다 (문이 열리면 tiles가 바뀌므로) */
export function levelFromMap(m: MapFile): Level {
  const { w, h } = m;
  const tiles = new Uint8Array(w * h);
  const ground = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      tiles[y * w + x] = CH_TILE[m.tiles[y]?.[x] ?? 'R'] ?? T_ROCK;
      ground[y * w + x] = CH_GROUND[m.ground[y]?.[x] ?? '.'] ?? G_GRASS;
    }
  const zone = (tx: number) => zoneAt(m.zoneStartsTx, tx);
  const world = (t: number) => (t + 0.5) * TILE;

  const gates: Gate[] = [...m.gates].sort((a, b) => a.x - b.x).map((g) => ({ tx: g.x, ty0: g.y0, ty1: g.y1, zone: zone(g.x - 1) }));
  for (const g of gates) for (let y = g.ty0; y <= g.ty1; y++) tiles[y * w + g.tx] = T_GATE;
  for (const s of m.shops) tiles[s.y * w + s.x] = T_SHOP;

  const spawns: Spawn[] = [];
  for (const s of m.spawns) {
    const z = Math.min(zone(Math.floor(s.x)), m.zoneStartsTx.length);
    const base = { x: world(s.x), y: world(s.y), zone: z };
    if (s.t === 'keeper') spawns.push({ ...base, kind: GATE_KEEPERS[z - 1].kind, gate: z - 1 });
    else if (s.t === 'elite1' || s.t === 'elite2') {
      const i = s.t === 'elite1' ? 0 : 1;
      spawns.push({ ...base, kind: ELITES[z - 1][i].kind, elite: i });
    } else spawns.push({ ...base, kind: s.t });
  }
  spawns.push({ kind: 'boss', x: world(m.boss.x), y: world(m.boss.y), zone: m.zoneStartsTx.length });

  // 보스 방 가운데: 보스 방에서 걸을 수 있는 칸들의 평균 (기둥·석상·카메라 기준점)
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++)
    for (let x = m.arenaTx; x < w; x++)
      if (tiles[y * w + x] === T_FLOOR) {
        sx += x + 0.5;
        sy += y + 0.5;
        n++;
      }
  const arenaCenter = n ? { x: (sx / n) * TILE, y: (sy / n) * TILE } : { x: world(m.boss.x), y: world(m.boss.y) };

  return {
    w, h, tiles, ground, spawns, gates,
    zoneStartsTx: [...m.zoneStartsTx],
    arenaTx: m.arenaTx,
    arenaCenter,
    shops: m.shops.map((s) => ({ x: world(s.x), y: world(s.y), zone: zone(s.x) })),
    start: { x: world(m.start.x), y: world(m.start.y) },
  };
}

/** 맵에 문제가 없는지 검사한다. 문제 설명 목록 (비어 있으면 통과) */
export function validateMap(m: MapFile): string[] {
  const out: string[] = [];
  const zones = m.zoneStartsTx.length;
  const blocked = (x: number, y: number) => x < 0 || y < 0 || x >= m.w || y >= m.h || (m.tiles[y][x] ?? 'R') !== '.';
  const at = (p: { x: number; y: number }) => [Math.floor(p.x + 0.5), Math.floor(p.y + 0.5)] as const;
  const zone = (tx: number) => zoneAt(m.zoneStartsTx, tx);

  if (blocked(...at(m.start))) out.push('출발점이 막힌 칸에 있습니다');
  if (blocked(...at(m.boss))) out.push('흑룡 위치가 막힌 칸에 있습니다');
  if (m.boss.x < m.arenaTx) out.push('흑룡이 보스 방 밖에 있습니다');

  // 문: 구역마다 정확히 하나 (마지막 구역의 문은 보스 방 입구)
  const perZone = Array.from({ length: zones }, () => 0);
  for (const g of m.gates) {
    const z = zone(g.x - 1);
    perZone[z - 1]++;
    for (let y = g.y0; y <= g.y1; y++) if (blocked(g.x, y)) out.push(`문(${g.x}, ${y})이 막힌 칸 위에 있습니다`);
  }
  perZone.forEach((n, i) => n !== 1 && out.push(`${i + 1}구역 출구 문이 ${n}개입니다 (1개여야 합니다)`));

  // 문지기: 구역마다 하나 이상 (모두 쓰러뜨려야 문이 열린다)
  const keepers = Array.from({ length: zones }, () => 0);
  for (const s of m.spawns) {
    const [x, y] = at(s);
    if (blocked(x, y)) out.push(`몬스터(${s.t})가 막힌 칸 (${x}, ${y})에 있습니다`);
    if (s.t === 'keeper') keepers[Math.min(zone(x), zones) - 1]++;
    if (x >= m.arenaTx) out.push(`보스 방 안에 몬스터(${s.t})가 있습니다 (${x}, ${y})`);
  }
  keepers.forEach((n, i) => n === 0 && out.push(`${i + 1}구역에 문지기가 없습니다 (문이 열리지 않습니다)`));

  for (const s of m.shops) if (s.y > 0 && blocked(s.x, s.y + 1)) out.push(`상점(${s.x}, ${s.y}) 앞(아래 칸)이 막혀 있습니다`);

  // 출발점에서 흑룡까지 걸어갈 수 있는지 (문은 열린 것으로 친다)
  const seen = new Uint8Array(m.w * m.h);
  const [sx, sy] = at(m.start);
  const stack = blocked(sx, sy) ? [] : [sy * m.w + sx];
  if (stack.length) seen[stack[0]] = 1;
  const shopAt = new Set(m.shops.map((s) => s.y * m.w + s.x));
  while (stack.length) {
    const cur = stack.pop()!;
    const x = cur % m.w, y = (cur - x) / m.w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, ni = ny * m.w + nx;
      if (blocked(nx, ny) || shopAt.has(ni) || seen[ni]) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  const [bx, by] = at(m.boss);
  if (!blocked(bx, by) && !seen[by * m.w + bx]) out.push('출발점에서 흑룡까지 길이 이어지지 않습니다');
  const lost = m.spawns.filter((s) => {
    const [x, y] = at(s);
    return !blocked(x, y) && !seen[y * m.w + x];
  }).length;
  if (lost) out.push(`갈 수 없는 곳에 있는 몬스터가 ${lost}마리 있습니다`);
  return out;
}

/** 맵 파일을 저장용 글자로: 타일은 한 줄에 한 행, 몬스터는 한 줄에 하나 (git에서 바뀐 곳을 보기 쉽게) */
export function stringifyMap(m: MapFile): string {
  const line = (v: unknown) => JSON.stringify(v);
  const list = (arr: unknown[]) => (arr.length ? `[\n${arr.map((v) => `    ${line(v)}`).join(',\n')}\n  ]` : '[]');
  return `{
  "version": ${m.version},
  "w": ${m.w},
  "h": ${m.h},
  "zoneStartsTx": ${line(m.zoneStartsTx)},
  "arenaTx": ${m.arenaTx},
  "start": ${line(m.start)},
  "boss": ${line(m.boss)},
  "shops": ${list(m.shops)},
  "gates": ${list(m.gates)},
  "spawns": ${list(m.spawns)},
  "tiles": ${list(m.tiles)},
  "ground": ${list(m.ground)}
}
`;
}
