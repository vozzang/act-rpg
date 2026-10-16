// 시드 기반 맵 생성. 호스트와 클라이언트가 같은 시드로 같은 맵을 만들기 때문에 맵 자체는 전송하지 않는다.
// 맵은 위에서 내려다본 격자다. 왼쪽(x=0)에서 출발해 오른쪽 끝의 보스 방으로 향한다.
//
// 구역마다 통로 3줄이 위아래로 쌓여 있고, 길은 그 안을 오른쪽 → 왼쪽 → 오른쪽으로 꺾어 지나간다(지그재그).
// 통로 사이는 숲·바위 벽이라 질러갈 수 없다. 구역이 바뀔 때마다 들어오는 줄이 위·아래로 번갈아 바뀐다.
//
//   출발 ━━━━━━━━┓ ┏━━━━━━━━━━━━ ┓ ...
//   ┏━━━━━━━━━━┛ ┗━━━━━━━━━━┓   
//   ┗━━━━━━━━━━━━━━━━━━━━━━━┛   (1구역: 위→아래, 2구역: 아래→위, ...)
import { ELITES, GATE_KEEPERS, TILE } from './data';
import type { PropPlacement } from './props';
import type { EnemyKind, ShopType } from './types';

/** 지점 하나의 가판대 순서(왼쪽부터)와 간격(타일) */
export const SHOP_ORDER: ShopType[] = ['heal', 'attack', 'defense'];
const SHOP_GAP = 4;

// 장애물 (지나갈 수 없음)
export const T_FLOOR = 0;
export const T_TREE = 1;
export const T_ROCK = 2;
export const T_SHOP = 3; // 상점 가판대 (지나갈 수 없고, 그림은 렌더러가 따로 그린다)
export const T_GATE = 4; // 구역 출구의 철문. 그 구역의 문지기를 쓰러뜨리면 바닥(T_FLOOR)으로 바뀐다
export const T_PROP = 5; // 길을 막는 장식 물건(통·천막·울타리 등)이 놓인 칸. 그림은 렌더러가 Level.props로 그린다
export const T_VOID = 6; // 아무것도 없는 막힌 칸 (맵 아래에 붙인 던전 줄의 빈 곳). 그리지 않는다

// 바닥 무늬 (지나갈 수 있음, 그리기 전용)
export const G_GRASS = 0;
export const G_ROAD = 1;
export const G_STONE = 2;

const LANES = 3; // 구역마다 꺾어 지나가는 통로 수
const LANE_H = 7; // 통로 폭(타일)
const WALL_H = 3; // 통로 사이 벽 두께
const BORDER = 2; // 맵 위아래 가장자리 숲
const TURN_W = 7; // 꺾이는 곳 통로 폭
export const MAP_H = BORDER * 2 + LANES * LANE_H + (LANES - 1) * WALL_H;
const START_W = 10;
const ZONE_W = 52; // 구역 하나의 가로 길이(타일). 처음 36에서 1.2배씩 두 번 늘렸다
const ARENA_W = 26;

const laneTop = (i: number) => BORDER + i * (LANE_H + WALL_H);
const laneCenter = (i: number) => laneTop(i) + (LANE_H - 1) / 2;

/** 게임 시작 때 몬스터 하나를 놓을 자리 */
export interface Spawn {
  kind: EnemyKind; // 몬스터 종류 (중간보스·문지기는 그 몬스터 종류의 모양·행동을 따른다)
  x: number; // 월드 좌표
  y: number;
  zone: number; // 놓인 구역
  elite?: number; // 중간보스면 ELITES[zone - 1]의 몇 번째인지
  gate?: number; // 문지기면 지키는 문 번호 (Level.gates)
}

/** 구역 출구를 막는 문. 문지기(GATE_KEEPERS)를 쓰러뜨리면 열린다. */
export interface Gate {
  tx: number; // 문이 있는 타일 열
  ty0: number; // 막는 칸 (ty0 ~ ty1)
  ty1: number;
  zone: number; // 이 문이 출구인 구역 (마지막 구역의 문은 보스 방 입구)
}

/** 게임이 쓰는 맵 (맵 파일을 읽거나 자동 생성기로 만든다). 타일 좌표는 칸 번호, 월드 좌표는 px */
export interface Level {
  w: number; // 가로 칸 수
  h: number; // 세로 칸 수
  tiles: Uint8Array; // 칸마다 지형 (T_FLOOR·T_TREE·T_ROCK·T_SHOP·T_GATE·T_PROP), [y * w + x]
  ground: Uint8Array; // 칸마다 바닥 무늬 (G_GRASS·G_ROAD·G_STONE, 그리기 전용)
  spawns: Spawn[]; // 몬스터 자리
  zoneStartsTx: number[]; // 각 구역이 시작하는 타일 x (index 0 = 1구역)
  arenaTx: number; // 보스 방이 시작하는 타일 x
  arenaCenter: { x: number; y: number }; // 보스 방 가운데 (월드 좌표, 기둥·석상·지도 표시용)
  shops: { x: number; y: number; zone: number; type: ShopType }[]; // 상인 위치 (월드 좌표)
  gates: Gate[]; // [z - 1] = z구역 출구
  props: PropPlacement[]; // 맵 편집기로 놓은 장식 (타일 좌표)
  start: { x: number; y: number }; // 출발점 (월드 좌표)
  mapH: number; // 맵 파일의 세로 칸 수 (h는 여기에 아래쪽 던전 줄을 더한 값)
  dungeons: DungeonArena[]; // 던전들 (맵 파일의 던전 문마다 하나, 구역마다 많아야 하나)
}

/**
 * 던전: 맵 아래쪽에 따로 붙인 둥근 투기장. 걸어서는 갈 수 없고 던전 문(portal)으로만 들어간다.
 * 좌표는 모두 월드 좌표(px). 투기장 x는 문이 있는 구역 안이라 구역 판정(배율·배경)은 그 구역을 따른다.
 */
export interface DungeonArena {
  zone: number; // 문이 있는 구역 (설정은 DUNGEONS[zone])
  portal: { x: number; y: number }; // 들어가는 문 (맵 위)
  center: { x: number; y: number }; // 투기장 가운데 (보상 상자 자리)
  radius: number; // 투기장 반지름 (걸을 수 있는 둥근 바닥)
  entry: { x: number; y: number }; // 들어오면 서는 곳 (남쪽 끝)
}

/** 나가는 문 자리: 투기장 북쪽 끝 (들어온 남쪽 끝 반대편). 클리어하면 열린다 */
export function dungeonExit(d: DungeonArena) {
  return { x: d.center.x, y: d.center.y - d.radius + 64 };
}

/** 시드로 같은 난수열을 만드는 간단한 난수 생성기 (0~1) */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 구역마다 나오는 몬스터 (같은 이름이 여러 번 있으면 그만큼 자주 나온다)
const ZONE_POOLS: EnemyKind[][] = [
  ['slime', 'slime', 'goblin', 'hound', 'hound', 'thrower'], // 1 초록 숲
  ['goblin', 'slime', 'skeleton', 'bandit', 'assassin', 'thrower'], // 2 고블린 협곡
  ['goblin', 'skeleton', 'orc', 'raider', 'raider', 'iceWitch'], // 3 얼어붙은 설원
  ['skeleton', 'orc', 'goblin', 'darkKnight', 'zombie', 'zombie'], // 4 오크 요새
  ['orc', 'skeleton', 'goblin', 'flameKnight', 'flameKnight', 'pyromancer'], // 5 불타는 화산
  ['zombie', 'zombie', 'slime', 'assassin', 'thrower', 'iceWitch'], // 6 독기의 늪
  ['bandit', 'assassin', 'skeleton', 'raider', 'thrower', 'bandit'], // 7 사막 유적
  ['iceWitch', 'darkKnight', 'skeleton', 'orc', 'raider', 'iceWitch'], // 8 수정 동굴
  ['zombie', 'skeleton', 'darkKnight', 'pyromancer', 'zombie', 'assassin'], // 9 망령의 묘지
  ['flameKnight', 'darkKnight', 'pyromancer', 'assassin', 'orc', 'flameKnight'], // 10 마왕성
];

/** 구역별 벽 칸 중 바위 비율 (나머지는 나무). 보스 방은 모두 바위 */
const ROCK_CHANCE = [0.12, 0.12, 0.3, 0.6, 1, 0.25, 0.75, 1, 0.45, 1];

export function buildLevel(seed: number): Level {
  const rng = mulberry32(seed);
  const zones = ZONE_POOLS.length;
  const w = START_W + zones * ZONE_W + ARENA_W;
  const h = MAP_H;
  const tiles = new Uint8Array(w * h);
  const ground = new Uint8Array(w * h);
  const at = (x: number, y: number) => y * w + x;
  const inMap = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h;
  const setTile = (x: number, y: number, t: number) => {
    if (inMap(x, y)) tiles[at(x, y)] = t;
  };
  const floor = (x: number, y: number) => setTile(x, y, T_FLOOR);
  const arenaTx = START_W + zones * ZONE_W;
  const zoneStartsTx = Array.from({ length: zones }, (_, z) => START_W + z * ZONE_W);
  const zoneOfTxRaw = (tx: number) => zoneStartsTx.reduce((z, sx, i) => (tx >= sx ? i + 1 : z), 1);

  // 1) 전부 막아 두고 길만 판다. 앞쪽 구역은 숲, 뒤쪽 구역(4·5)은 바위가 많다
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      // 구역마다 벽이 나무인지 바위인지 비율이 다르다 (ROCK_CHANCE)
      const zone = zoneOfTxRaw(x);
      const rockChance = x >= arenaTx ? 1 : ROCK_CHANCE[zone - 1] ?? 0.5;
      tiles[at(x, y)] = rng() < rockChance ? T_ROCK : T_TREE;
    }

  // 길을 따라가는 중심점 (몬스터 배치에 쓴다). 구역별로 지나가는 순서대로 쌓인다
  const paths: { x: number; y: number }[][] = Array.from({ length: zones + 1 }, () => []); // [0] = 출발 지점
  let wiggle = 0, wiggleV = 0;
  const roadAt = (x: number, cy: number) => {
    // 길 중심이 통로 안에서 천천히 굽이친다
    wiggleV = Math.max(-0.35, Math.min(0.35, wiggleV + (rng() - 0.5) * 0.3));
    wiggle = Math.max(-1, Math.min(1, wiggle + wiggleV));
    const y = cy + wiggle;
    for (let dy = -1; dy <= 1; dy++) ground[at(x, Math.round(y) + dy)] = G_ROAD;
    return y;
  };

  /** 통로 한 줄을 판다. 가장자리는 군데군데 한 칸씩 더 파서 울퉁불퉁하게 */
  const carveLane = (lane: number, x0: number, x1: number) => {
    const top = laneTop(lane);
    for (let x = x0; x <= x1; x++) {
      for (let y = top; y < top + LANE_H; y++) floor(x, y);
      if (rng() < 0.35) floor(x, top - 1);
      if (rng() < 0.35) floor(x, top + LANE_H);
    }
  };
  /** 길을 따라 x0 → x1 방향으로 걷는다 (도로 표시 + 경로 기록) */
  const walkLane = (lane: number, x0: number, x1: number, path: { x: number; y: number }[]) => {
    const step = x1 >= x0 ? 1 : -1;
    for (let x = x0; x !== x1 + step; x += step) path.push({ x, y: roadAt(x, laneCenter(lane)) });
  };
  /** 통로 a와 b 사이 벽을 뚫어 U자로 꺾는다 (x0~x0+TURN_W-1 열). 꺾이는 곳 가운데를 돌려준다 */
  const carveTurn = (a: number, b: number, x0: number, path: { x: number; y: number }[]) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    for (let x = x0; x < x0 + TURN_W; x++) for (let y = laneTop(lo); y < laneTop(hi) + LANE_H; y++) floor(x, y);
    const cx = x0 + (TURN_W - 1) / 2;
    const ya = laneCenter(a), yb = laneCenter(b);
    const dir = yb > ya ? 1 : -1;
    for (let y = ya; dir > 0 ? y <= yb : y >= yb; y += dir) {
      for (let dx = -1; dx <= 1; dx++) ground[at(Math.round(cx) + dx, y)] = G_ROAD;
      path.push({ x: cx, y });
    }
    wiggle = 0;
    return { x: cx, y: (ya + yb) / 2 };
  };

  // 2) 출발 지점: 1구역 첫 줄(맨 위)로 이어진다
  carveLane(0, 1, START_W - 1);
  walkLane(0, 1, START_W - 1, paths[0]);

  // 3) 구역마다 지그재그 통로
  const turns: { x: number; y: number }[][] = Array.from({ length: zones }, () => []); // 구역별 꺾이는 곳 (중간보스 자리)
  for (let z = 0; z < zones; z++) {
    const zs = zoneStartsTx[z], ze = zs + ZONE_W - 1;
    const order = z % 2 === 0 ? [0, 1, 2] : [2, 1, 0]; // 짝수 구역은 위에서, 홀수 구역은 아래에서 들어온다
    const path = paths[z + 1];
    order.forEach((lane, k) => {
      carveLane(lane, k === 0 ? zs : zs + 1, ze);
      if (k % 2 === 0) walkLane(lane, k === 0 ? zs : zs + 1, k === 2 ? ze : ze - TURN_W, path);
      else walkLane(lane, ze - TURN_W, zs + TURN_W + 1, path);
      if (k === 0) turns[z].push(carveTurn(lane, order[1], ze - TURN_W + 1, path));
      if (k === 1) turns[z].push(carveTurn(lane, order[2], zs + 1, path));
    });
    // 구역 경계: 들어오는 줄만 뚫린 무너진 성벽 (렌더러가 경계 열의 바위를 성벽으로 그린다)
    if (z > 0) {
      const entry = order[0];
      for (let y = 0; y < h; y++) {
        const open = y >= laneTop(entry) && y < laneTop(entry) + LANE_H;
        if (!open) setTile(zs, y, T_ROCK);
      }
    }
    // 통로 안의 나무·바위 덤불 (길에서 떨어진 곳에만)
    const blockType = (ROCK_CHANCE[z] ?? 0.5) >= 0.5 ? T_ROCK : T_TREE; // 바위가 많은 구역은 바위 덤불
    for (let c = 0; c < 10 + z * 2; c++) {
      const lane = Math.floor(rng() * LANES);
      const cx = zs + 2 + Math.floor(rng() * (ZONE_W - 4));
      const cy = laneTop(lane) + (rng() < 0.5 ? 0 : LANE_H - 1);
      const rad = 0.8 + rng() * 1.2;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx, y = cy + dy;
          if (inMap(x, y) && ground[at(x, y)] !== G_ROAD && Math.hypot(dx, dy) <= rad && rng() < 0.8) setTile(x, y, blockType);
        }
    }
  }

  // 4) 보스 방: 마지막 구역의 마지막 줄 끝에서 들어가는 타원형 공터
  const exitLane = (zones - 1) % 2 === 0 ? 2 : 0;
  const acx = arenaTx + ARENA_W / 2, acy = h / 2;
  for (let x = arenaTx; x < w - 1; x++)
    for (let y = 0; y < h; y++) {
      const d = Math.hypot((x + 0.5 - acx) / (ARENA_W / 2 - 1), (y + 0.5 - acy) / (h / 2 - 2));
      const entrance = x < arenaTx + 6 && y >= laneTop(exitLane) && y < laneTop(exitLane) + LANE_H;
      if (d < 1 || entrance) {
        floor(x, y);
        ground[at(x, y)] = G_STONE;
      }
    }

  // 5) 상점: 출발 지점과 2구역부터 각 구역 입구 통로의 위쪽 가장자리
  const shops: Level['shops'] = [];
  const shopSpots = [{ tx: START_W - 4, lane: 0 }, ...zoneStartsTx.slice(1).map((zs, i) => ({ tx: zs + 4, lane: (i + 1) % 2 === 0 ? 0 : 2 }))];
  // 지점마다 가판대 셋을 4칸 간격으로 나란히 놓는다: 회복 · 공격 · 방어
  for (const { tx: x0, lane } of shopSpots) {
    const ty = laneTop(lane);
    SHOP_ORDER.forEach((type, k) => {
      const tx = x0 + k * SHOP_GAP;
      for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) floor(tx + dx, ty + dy);
      setTile(tx, ty, T_SHOP);
      shops.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, zone: zoneOfTxRaw(tx), type });
    });
    // 짝수 구역 입구에는 방어 상점 오른쪽에 대장간
    if (zoneOfTxRaw(x0) % 2 === 0) {
      const tx = x0 + SHOP_ORDER.length * SHOP_GAP;
      for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) floor(tx + dx, ty + dy);
      setTile(tx, ty, T_SHOP);
      shops.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, zone: zoneOfTxRaw(tx), type: 'forge' });
    }
  }

  // 6) 문: 구역마다 출구(다음 구역 입구, 마지막 구역은 보스 방 입구)를 막는다. 막는 칸은 맨 끝(8단계)에 채운다
  const gates: Gate[] = Array.from({ length: zones }, (_, i) => {
    const tx = i + 1 < zones ? zoneStartsTx[i + 1] : arenaTx;
    const lane = i + 1 < zones ? ((i + 1) % 2 === 0 ? 0 : 2) : exitLane; // 다음 구역이 들어오는 줄
    return { tx, ty0: laneTop(lane), ty1: laneTop(lane) + LANE_H - 1, zone: i + 1 };
  });

  // 7) 몬스터 무리: 구역마다 길을 따라 고르게 (들어오자마자는 비워 둔다)
  const spawns: Spawn[] = [];
  const free = (x: number, y: number) => inMap(x, y) && tiles[at(x, y)] === T_FLOOR;
  const world = (t: number) => (t + 0.5) * TILE;
  for (let z = 1; z <= zones; z++) {
    const path = paths[z];
    const packs = Math.round((16 + z) * 1.44); // 1구역 24무리 ~ 10구역 37무리 (구역이 처음보다 1.44배 길어진 만큼)
    const skip = 10;
    for (let k = 0; k < packs; k++) {
      const p = path[Math.floor(skip + ((k + rng() * 0.6) / packs) * (path.length - skip - 4))];
      const px = Math.round(p.x);
      let py = Math.round(p.y + (rng() - 0.5) * 4);
      if (!free(px, py)) py = Math.round(p.y);
      const n = 3 + Math.floor(rng() * (z >= 3 ? 3 : 2)); // 무리당 3~4마리 (3구역부터 3~5마리)
      for (let i = 0; i < n; i++) {
        const sx = px + Math.round((rng() - 0.5) * 3);
        const sy = py + Math.round((rng() - 0.5) * 3);
        const [tx, ty] = free(sx, sy) ? [sx, sy] : [px, py];
        spawns.push({ kind: pick(rng, ZONE_POOLS[z - 1]), x: world(tx), y: world(ty), zone: z });
      }
    }
    // 구역 출구의 문 앞을 지키는 문지기
    const g = gates[z - 1];
    spawns.push({ kind: GATE_KEEPERS[z - 1].kind, gate: z - 1, x: world(g.tx - 5), y: world(Math.round((g.ty0 + g.ty1) / 2)), zone: z });
    // 꺾이는 두 곳을 지키는 중간보스
    turns[z - 1].forEach((t, i) => {
      spawns.push({ kind: ELITES[z - 1][i].kind, elite: i, x: world(Math.round(t.x)), y: world(Math.round(t.y)), zone: z });
    });
  }

  // 8) 덤불에 갇힌 곳에 생긴 몬스터는 같은 구역의 가장 가까운 길 위로 옮긴다
  const startTile = { x: 3, y: Math.round(laneCenter(0)) };
  const reach = reachable(tiles, w, h, startTile.x, startTile.y);
  for (const s of spawns) {
    const tx = Math.floor(s.x / TILE), ty = Math.floor(s.y / TILE);
    if (reach[at(tx, ty)]) continue;
    const near = paths[s.zone].reduce((a, b) => (Math.hypot(b.x - tx, b.y - ty) < Math.hypot(a.x - tx, a.y - ty) ? b : a));
    s.x = world(Math.round(near.x));
    s.y = world(Math.round(near.y));
  }

  // 9) 문 닫기 (닿을 수 있는 곳 계산은 문이 열린 상태로 했다)
  for (const g of gates) for (let y = g.ty0; y <= g.ty1; y++) setTile(g.tx, y, T_GATE);

  const arenaCenter = { x: acx * TILE, y: acy * TILE };
  spawns.push({ kind: 'boss', x: arenaCenter.x + TILE * 4, y: arenaCenter.y, zone: zones });

  return {
    w, h, mapH: h, dungeons: [], tiles, ground, spawns, zoneStartsTx, arenaTx, arenaCenter, shops, gates, props: [],
    start: { x: world(startTile.x), y: world(startTile.y) },
  };
}

/** (sx, sy)에서 걸어서 갈 수 있는 칸 표시 */
function reachable(tiles: Uint8Array, w: number, h: number, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack = [sy * w + sx];
  seen[sy * w + sx] = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    const x = cur % w, y = (cur - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (seen[ni] || tiles[ni] !== T_FLOOR) continue;
      seen[ni] = 1;
      stack.push(ni);
    }
  }
  return seen;
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 문을 연다 (막던 칸을 바닥으로). 호스트와 참가자가 각자 자기 맵에 적용한다 */
export function openGate(level: Level, index: number) {
  const g = level.gates[index];
  for (let y = g.ty0; y <= g.ty1; y++) if (level.tiles[y * level.w + g.tx] === T_GATE) level.tiles[y * level.w + g.tx] = T_FLOOR;
}

export function tileAt(level: Level, tx: number, ty: number): number {
  if (tx < 0 || tx >= level.w || ty < 0 || ty >= level.h) return T_ROCK;
  return level.tiles[ty * level.w + tx];
}

export function blockedAt(level: Level, tx: number, ty: number): boolean {
  return tileAt(level, tx, ty) !== T_FLOOR;
}

/** 타일 x가 속한 구역 (1부터). 시작 지점은 1, 보스 방은 마지막 구역. */
export function zoneOfTx(level: Level, tx: number): number {
  let zone = 1;
  level.zoneStartsTx.forEach((sx, i) => {
    if (tx >= sx) zone = i + 1;
  });
  return zone;
}
