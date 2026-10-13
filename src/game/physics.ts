import { TILE } from './data';
import { T_PLATFORM, T_SOLID, tileAt, type Level } from './level';
import type { Body } from './types';

const MAX_FALL = 900;

/** 타일맵과 충돌하며 몸체를 이동시킨다. 벽에 막혔으면 true. */
export function moveBody(level: Level, b: Body, dt: number): boolean {
  if (b.vy > MAX_FALL) b.vy = MAX_FALL;
  let hitWall = false;

  b.x += b.vx * dt;
  const top = Math.floor(b.y / TILE);
  const bottom = Math.floor((b.y + b.h - 0.01) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + b.w) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (tileAt(level, tx, ty) === T_SOLID) {
        b.x = tx * TILE - b.w - 0.01;
        hitWall = true;
        break;
      }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      if (tileAt(level, tx, ty) === T_SOLID) {
        b.x = (tx + 1) * TILE + 0.01;
        hitWall = true;
        break;
      }
    }
  }

  const prevBottom = b.y + b.h;
  b.y += b.vy * dt;
  b.onGround = false;
  const left = Math.floor(b.x / TILE);
  const right = Math.floor((b.x + b.w - 0.01) / TILE);
  if (b.vy > 0) {
    const ty = Math.floor((b.y + b.h) / TILE);
    for (let tx = left; tx <= right; tx++) {
      const t = tileAt(level, tx, ty);
      if (t === T_SOLID || (t === T_PLATFORM && prevBottom <= ty * TILE + 0.5)) {
        b.y = ty * TILE - b.h;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = left; tx <= right; tx++) {
      if (tileAt(level, tx, ty) === T_SOLID) {
        b.y = (ty + 1) * TILE;
        b.vy = 0;
        break;
      }
    }
  }
  return hitWall;
}

export function overlapsSolid(level: Level, b: Body): boolean {
  const l = Math.floor(b.x / TILE), r = Math.floor((b.x + b.w - 0.01) / TILE);
  const t = Math.floor(b.y / TILE), btm = Math.floor((b.y + b.h - 0.01) / TILE);
  for (let ty = t; ty <= btm; ty++)
    for (let tx = l; tx <= r; tx++) if (tileAt(level, tx, ty) === T_SOLID) return true;
  return false;
}

/** 카메라 경계에 밀려 벽에 박힌 몸체를 위로 빼낸다. */
export function unstick(level: Level, b: Body) {
  for (let i = 0; i < 40 && overlapsSolid(level, b); i++) b.y -= 4;
}

export function rectsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function approach(v: number, target: number, delta: number): number {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}
