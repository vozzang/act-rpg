// 장비 규칙: 등급, 드랍 등급 굴리기, 구역 → 장비 단계, 목록(items.ts)의 장비로 실제 장비 만들기, 이름·수치 글.
import type { ClassId, Item, Rarity } from '../types';
import { CLASSES } from './classes';
import { ITEM_LIST, type ItemDef } from './items';
import { ATTR_KEYS, ATTR_NAMES } from './stats';

/** 일반 몬스터의 장비 드랍 확률(ENEMIES의 dropRate)에 곱하는 값. 전체 드랍량을 한 번에 조절한다 */
export const ITEM_DROP_MULT = 0.6;

/** 장비 등급별 이름 · 글자 색 · 수치 배율(목록의 처음 수치를 만들 때 쓴 값) · 몬스터 드랍 등급 확률 가중치 */
export const RARITY: Record<Rarity, { name: string; color: string; mult: number; weight: number }> = {
  common: { name: '일반', color: '#d8d8d8', mult: 1, weight: 60 },
  rare: { name: '희귀', color: '#4aa3ff', mult: 1.6, weight: 28 },
  epic: { name: '영웅', color: '#c061ff', mult: 2.4, weight: 10 },
  legendary: { name: '전설', color: '#ffa020', mult: 3.6, weight: 0.5 }, // 몬스터 드랍에서 약 0.5%
};

export function rollRarity(rng: () => number, weights: Record<Rarity, number> = DROP_WEIGHTS): Rarity {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const total = order.reduce((s, r) => s + weights[r], 0);
  let roll = rng() * total;
  for (const r of order) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return 'common';
}

const DROP_WEIGHTS = Object.fromEntries(Object.entries(RARITY).map(([k, v]) => [k, v.weight])) as Record<Rarity, number>;

/** 구역 → 아이템 단계 (1·2구역 1단계 … 9·10구역 5단계) */
export function zoneTier(zone: number) {
  return Math.max(1, Math.min(5, Math.ceil(zone / 2)));
}

const ITEM_BY_KEY = new Map(ITEM_LIST.map((d) => [d.key, d]));
export function itemDef(key: string): ItemDef | undefined {
  return ITEM_BY_KEY.get(key);
}

/** 목록의 장비 정의로 실제 장비 하나를 만든다 (수치는 복사) */
export function itemFromDef(d: ItemDef, id: number): Item {
  return { id, key: d.key, slot: d.slot, rarity: d.rarity, zone: d.tier * 2 - 1, noun: d.base, title: d.name, stats: { ...d.stats } };
}

/**
 * 몬스터가 떨어뜨리는 장비(랜덤 조합 결과도): 그 구역 단계의 '드랍' 장비 중에서 등급을 굴려 고른다.
 * 굴린 등급의 장비가 없으면 한 단계씩 낮춰 찾는다.
 */
export function makeItem(id: number, zone: number, rng: () => number, weights?: Record<Rarity, number>): Item {
  const tier = zoneTier(zone);
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  let r = order.indexOf(rollRarity(rng, weights));
  for (; r >= 0; r--) {
    const pool = ITEM_LIST.filter((d) => d.tier === tier && d.rarity === order[r] && d.from.includes('drop'));
    if (pool.length) return itemFromDef(pool[Math.floor(rng() * pool.length)], id);
  }
  return itemFromDef(ITEM_LIST.find((d) => d.tier === tier)!, id);
}

export function itemName(item: Item, cls: ClassId): string {
  if (item.title) return item.title;
  return `${item.noun ?? CLASSES[cls].weaponNoun}`; // 목록이 생기기 전 장비 (모든 장비에는 이름이 있다)
}

export function itemStatText(item: Item): string {
  const s = item.stats;
  const parts: string[] = [];
  if (s.atk) parts.push(`공격 +${s.atk}`);
  if (s.def) parts.push(`방어 +${s.def}`);
  if (s.maxHp) parts.push(`최대 HP +${s.maxHp}`);
  if (s.crit) parts.push(`치명 +${Math.round(s.crit * 100)}%`);
  for (const k of ATTR_KEYS) if (s[k]) parts.push(`${ATTR_NAMES[k]} +${s[k]}`);
  return parts.join(' ');
}
