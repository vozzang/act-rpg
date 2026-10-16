// 장비 규칙: 등급, 드랍 등급 굴리기, 구역 → 장비 단계, 목록(items.ts)의 장비로 실제 장비 만들기, 이름·수치 글.
import type { ClassId, Item, Rarity, WeaponEffect } from '../types';
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
  const it: Item = { id, key: d.key, slot: d.slot, rarity: d.rarity, zone: d.tier * 2 - 1, noun: d.base, title: d.name, stats: { ...d.stats } };
  if (d.effect) it.effect = d.effect;
  if (d.cls) it.cls = d.cls;
  return it;
}

/** 이 직업이 이 장비를 착용(아이템 상자에 넣기)할 수 있는지. 직업 전용 장비가 아니면 누구나 */
export function canEquip(cls: ClassId, item: Item) {
  return !item.cls || item.cls === cls;
}

// ─── 유니크 전설 무기 ─────────────────────────────────

/**
 * 특수 효과 수치. 장비한 사람이 적을 맞힐 때마다(기본 공격·스킬 모두) chance 확률로 생긴다. 지속 피해는 0.5초마다 들어가고 적의 방어가 깎인다.
 *  frost 서리: slow초 동안 이동 50% 느려짐 (흑룡은 절반 시간)
 *  burn 화염: time초 동안 초당 (공격력 × ratio) 피해. 다시 걸리면 시간만 새로
 *  bleed 출혈: time초 동안 겹마다 초당 (공격력 × ratio) 피해, 다시 걸리면 maxStacks까지 겹친다
 *  quake 대지 가르기: 맞은 자리에서 radius 안의 다른 적에게 (공격력 × ratio) 피해와 stun초 기절
 */
export const WEAPON_EFFECTS = {
  frost: { name: '서리', chance: 0.25, slow: 2 },
  burn: { name: '화염', chance: 0.25, time: 3, ratio: 0.3 },
  bleed: { name: '출혈', chance: 0.3, time: 3, ratio: 0.2, maxStacks: 3 },
  quake: { name: '대지 가르기', chance: 0.2, radius: 90, ratio: 0.6, stun: 0.6 },
  aegis: { name: '절대방어', chance: 0.3 }, // 방어구: 맞을 때 이 확률로 피해를 통째로 막는다 (회피와 따로 굴린다)
  undying: { name: '불사', chance: 1, hp: 0.3, cooldown: 60, invuln: 1.5 }, // 장신구: 쓰러질 피해를 받으면 HP hp(비율)로 버틴다. cooldown초에 한 번, 버틴 뒤 invuln초 무적
};

/** 유니크 무기 드랍: fromZone 구역부터 중간보스·문지기를 쓰러뜨리면 chance 확률로 아직 안 나온 유니크 무기 하나 (원래 드랍과 따로) */
export const UNIQUE_DROP = { fromZone: 5, chance: 0.12 };

/** 특수 효과 설명 (장비 설명·아이템 도감) */
export function effectText(effect: WeaponEffect): string {
  const p = (v: number) => `${Math.round(v * 100)}%`;
  switch (effect) {
    case 'frost': {
      const e = WEAPON_EFFECTS.frost;
      return `서리: 맞히면 ${p(e.chance)} 확률로 ${e.slow}초간 적이 느려짐`;
    }
    case 'burn': {
      const e = WEAPON_EFFECTS.burn;
      return `화염: 맞히면 ${p(e.chance)} 확률로 ${e.time}초간 초당 공격력의 ${p(e.ratio)} 피해`;
    }
    case 'bleed': {
      const e = WEAPON_EFFECTS.bleed;
      return `출혈: 맞히면 ${p(e.chance)} 확률로 ${e.time}초간 초당 공격력의 ${p(e.ratio)} 피해 (최대 ${e.maxStacks}겹)`;
    }
    case 'quake': {
      const e = WEAPON_EFFECTS.quake;
      return `대지 가르기: 맞히면 ${p(e.chance)} 확률로 주변 적에게 공격력의 ${p(e.ratio)} 피해와 ${e.stun}초 기절`;
    }
    case 'aegis':
      return `절대방어: 맞을 때 ${p(WEAPON_EFFECTS.aegis.chance)} 확률로 피해를 막는다`;
    case 'undying': {
      const e = WEAPON_EFFECTS.undying;
      return `불사: 쓰러질 피해를 받으면 HP ${p(e.hp)}로 버틴다 (${e.cooldown}초에 한 번)`;
    }
  }
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
  if (item.effect) parts.push(`· ${effectText(item.effect)}`);
  if (item.cls) parts.push(`· ${CLASSES[item.cls].name} 전용`);
  return parts.join(' ');
}
