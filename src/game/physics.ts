import { TILE } from './data';
import { blockedAt, type Level } from './level';
import type { Body } from './types';

/** 장애물 타일과 충돌하며 몸체를 이동시킨다. 몸체는 한 변이 2r인 사각형으로 취급한다. 막혔으면 true. */
export function moveBody(level: Level, b: Body, dt: number): boolean {
  let blocked = false;
  const r = b.r;

  b.x += b.vx * dt;
  const top = Math.floor((b.y - r) / TILE);
  const bottom = Math.floor((b.y + r - 0.01) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + r) / TILE);
    for (let ty = top; ty <= bottom; ty++)
      if (blockedAt(level, tx, ty)) {
        b.x = tx * TILE - r - 0.01;
        blocked = true;
        break;
      }
  } else if (b.vx < 0) {
    const tx = Math.floor((b.x - r) / TILE);
    for (let ty = top; ty <= bottom; ty++)
      if (blockedAt(level, tx, ty)) {
        b.x = (tx + 1) * TILE + r + 0.01;
        blocked = true;
        break;
      }
  }

  b.y += b.vy * dt;
  const left = Math.floor((b.x - r) / TILE);
  const right = Math.floor((b.x + r - 0.01) / TILE);
  if (b.vy > 0) {
    const ty = Math.floor((b.y + r) / TILE);
    for (let tx = left; tx <= right; tx++)
      if (blockedAt(level, tx, ty)) {
        b.y = ty * TILE - r - 0.01;
        blocked = true;
        break;
      }
  } else if (b.vy < 0) {
    const ty = Math.floor((b.y - r) / TILE);
    for (let tx = left; tx <= right; tx++)
      if (blockedAt(level, tx, ty)) {
        b.y = (ty + 1) * TILE + r + 0.01;
        blocked = true;
        break;
      }
  }
  return blocked;
}

/** 몸을 (dx, dy)만큼 밀되 벽은 뚫지 않는다 (서로 밀어내기처럼 속도가 아닌 위치를 옮길 때) */
export function pushBody(level: Level, b: Body, dx: number, dy: number) {
  const vx = b.vx, vy = b.vy;
  b.vx = dx;
  b.vy = dy;
  moveBody(level, b, 1);
  b.vx = vx;
  b.vy = vy;
}

export function pointBlocked(level: Level, x: number, y: number): boolean {
  return blockedAt(level, Math.floor(x / TILE), Math.floor(y / TILE));
}

/**
 * 두 지점 사이에 장애물이 없는지. 선이 지나는 모든 타일을 검사하고(격자 순회),
 * 타일 모서리를 정확히 지날 때는 양옆 타일을 모두 본다. 투사체가 모서리에 걸리는 경우와 판정을 맞추기 위함.
 */
export function lineOfSight(level: Level, ax: number, ay: number, bx: number, by: number): boolean {
  let tx = Math.floor(ax / TILE), ty = Math.floor(ay / TILE);
  const ex = Math.floor(bx / TILE), ey = Math.floor(by / TILE);
  const dx = bx - ax, dy = by - ay;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const tDeltaX = stepX ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = stepY ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = stepX ? ((stepX > 0 ? (tx + 1) * TILE : tx * TILE) - ax) / dx : Infinity;
  let tMaxY = stepY ? ((stepY > 0 ? (ty + 1) * TILE : ty * TILE) - ay) / dy : Infinity;
  for (let guard = 0; guard < 1000; guard++) {
    if (tx === ex && ty === ey) return true;
    if (Math.abs(tMaxX - tMaxY) < 1e-9) {
      // 모서리 통과: 옆의 두 칸도 막혀 있으면 안 된다
      if (blockedAt(level, tx + stepX, ty) || blockedAt(level, tx, ty + stepY)) return false;
      tx += stepX;
      ty += stepY;
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
    } else if (tMaxX < tMaxY) {
      tx += stepX;
      tMaxX += tDeltaX;
    } else {
      ty += stepY;
      tMaxY += tDeltaY;
    }
    if (tMaxX > 1 + tDeltaX && tMaxY > 1 + tDeltaY) return true;
    if (blockedAt(level, tx, ty)) return false;
  }
  return true;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** 두 각도의 차이 (-π ~ π) */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

// ─── 길찾기 ─────────────────────────────────────────

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * 한 지점까지의 타일 거리 지도 (BFS). 적은 자기 타일 주변에서 값이 가장 작은 칸으로 움직이면
 * 장애물을 돌아 목표에 다가간다. 플레이어마다 하나씩 주기적으로 다시 계산한다.
 */
export class NavField {
  readonly dist: Uint16Array;
  originTx = -1;
  originTy = -1;

  constructor(private level: Level, private maxDist = 40) {
    this.dist = new Uint16Array(level.w * level.h);
  }

  compute(x: number, y: number) {
    const { w, h } = this.level;
    const ox = Math.floor(x / TILE), oy = Math.floor(y / TILE);
    if (ox === this.originTx && oy === this.originTy) return;
    this.originTx = ox;
    this.originTy = oy;
    this.dist.fill(0xffff);
    if (blockedAt(this.level, ox, oy)) return;
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    this.dist[oy * w + ox] = 0;
    queue[tail++] = oy * w + ox;
    while (head < tail) {
      const cur = queue[head++];
      const cx = cur % w, cy = (cur - cx) / w;
      const d = this.dist[cur];
      if (d >= this.maxDist) continue;
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || blockedAt(this.level, nx, ny)) continue;
        // 대각선은 양옆이 비어 있어야 지나갈 수 있다
        if (dx && dy && (blockedAt(this.level, cx + dx, cy) || blockedAt(this.level, cx, cy + dy))) continue;
        const ni = ny * w + nx;
        if (this.dist[ni] !== 0xffff) continue;
        this.dist[ni] = d + 1;
        queue[tail++] = ni;
      }
    }
  }

  /** (x, y)에서 목표 쪽으로 가는 방향. 경로가 없으면 null. */
  direction(x: number, y: number): { x: number; y: number } | null {
    const { w } = this.level;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const here = this.dist[ty * w + tx];
    if (here === 0xffff || here === undefined) return null;
    let best = here, bx = 0, by = 0;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= this.level.h) continue;
      if (dx && dy && (blockedAt(this.level, tx + dx, ty) || blockedAt(this.level, tx, ty + dy))) continue;
      const d = this.dist[ny * w + nx];
      if (d < best) {
        best = d;
        bx = dx;
        by = dy;
      }
    }
    if (best === here) return null;
    // 다음 칸의 중심을 향한다
    const gx = (tx + bx + 0.5) * TILE - x, gy = (ty + by + 0.5) * TILE - y;
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  }
}
