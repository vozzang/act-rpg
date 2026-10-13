// 시드 기반 맵 생성. 호스트와 클라이언트가 같은 시드로 같은 맵을 만들기 때문에 맵 자체는 전송하지 않는다.
import type { EnemyKind } from './types';

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_PLATFORM = 2; // 위에서만 밟을 수 있는 발판

export const MAP_H = 17;
const START_W = 20;
const ZONE_W = 55;
export const ARENA_W = 30; // 960px = 화면 폭과 정확히 같다
const BASE_GROUND = 14;

export interface Spawn {
  kind: EnemyKind;
  tx: number;
  ty: number; // 발이 닿는 타일 행
  zone: number;
}

export interface Level {
  w: number;
  h: number;
  tiles: Uint8Array;
  spawns: Spawn[];
  zoneStartsTx: number[]; // 각 구역이 시작하는 타일 x (index 0 = 1구역)
  arenaTx: number;
}

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

const ZONE_POOLS: EnemyKind[][] = [
  ['slime', 'slime', 'goblin'],
  ['goblin', 'slime', 'skeleton'],
  ['goblin', 'skeleton', 'skeleton', 'orc'],
  ['skeleton', 'orc', 'goblin', 'goblin'],
];

export function buildLevel(seed: number): Level {
  const rng = mulberry32(seed);
  const zones = ZONE_POOLS.length;
  const w = START_W + zones * ZONE_W + ARENA_W;
  const h = MAP_H;
  const tiles = new Uint8Array(w * h);
  const spawns: Spawn[] = [];
  const zoneStartsTx: number[] = [];
  const ground = new Array<number>(w).fill(BASE_GROUND);

  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = t;
  };

  // 지형 높이: 구역 안에서 6~12칸 단위로 높이가 바뀐다. 시작 지점과 각 구역 경계 부근은 평지.
  let x = START_W;
  for (let z = 0; z < zones; z++) {
    const zoneStart = START_W + z * ZONE_W;
    zoneStartsTx.push(zoneStart);
    const zoneEnd = zoneStart + ZONE_W;
    x = zoneStart + 4;
    let gy = BASE_GROUND;
    while (x < zoneEnd - 6) {
      const segW = 6 + Math.floor(rng() * 7);
      const step = Math.floor(rng() * 5) - 2; // -2 ~ +2
      gy = Math.max(11, Math.min(BASE_GROUND, gy + step));
      for (let i = 0; i < segW && x + i < zoneEnd - 6; i++) ground[x + i] = gy;

      // 떠 있는 발판
      if (rng() < 0.45 && segW >= 6) {
        const pw = 3 + Math.floor(rng() * 3);
        const px = x + 1 + Math.floor(rng() * (segW - pw));
        const py = gy - 4;
        for (let i = 0; i < pw; i++) set(px + i, py, T_PLATFORM);
        if (rng() < 0.5) spawns.push({ kind: pick(rng, ZONE_POOLS[z]), tx: px + 1, ty: py, zone: z + 1 });
      }

      // 지면 위 적 1~2마리
      const n = 1 + (rng() < 0.4 + z * 0.12 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        spawns.push({ kind: pick(rng, ZONE_POOLS[z]), tx: x + 1 + Math.floor(rng() * (segW - 2)), ty: gy, zone: z + 1 });
      }
      x += segW;
    }
    // 구역 끝의 정예 몬스터
    spawns.push({ kind: 'orc', tx: zoneEnd - 4, ty: BASE_GROUND, zone: z + 1 });
  }

  const arenaTx = START_W + zones * ZONE_W;
  spawns.push({ kind: 'boss', tx: arenaTx + ARENA_W - 6, ty: BASE_GROUND, zone: zones });

  for (let tx = 0; tx < w; tx++) {
    for (let ty = ground[tx]; ty < h; ty++) set(tx, ty, T_SOLID);
  }
  // 양 끝 벽
  for (let ty = 0; ty < h; ty++) {
    set(0, ty, T_SOLID);
    set(w - 1, ty, T_SOLID);
  }
  // 보스 방 공중 발판
  for (let i = 0; i < 5; i++) {
    set(arenaTx + 6 + i, 10, T_PLATFORM);
    set(arenaTx + ARENA_W - 11 + i, 10, T_PLATFORM);
  }

  return { w, h, tiles, spawns, zoneStartsTx, arenaTx };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function tileAt(level: Level, tx: number, ty: number): number {
  if (tx < 0 || tx >= level.w) return T_SOLID;
  if (ty < 0 || ty >= level.h) return T_EMPTY;
  return level.tiles[ty * level.w + tx];
}
