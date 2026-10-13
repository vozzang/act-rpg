// 밸런스 데이터. 수치 조정은 대부분 이 파일에서 하면 된다.
import type { ClassId, EnemyKind, Item, Rarity, Slot, Stats } from './types';

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 544;
export const GRAVITY = 1800;
export const TICK_RATE = 60;
export const SNAPSHOT_EVERY = 3; // 60/3 = 초당 20회 전송
export const REVIVE_TIME = 2;
export const ZONE_NAMES = ['초록 숲', '고블린 협곡', '해골 묘지', '오크 요새'];

// ─── 직업 ────────────────────────────────────────────

export type AttackDef =
  | { kind: 'melee'; cd: number; mult: number; range: number; height: number; knock: number }
  | { kind: 'projectile'; cd: number; mult: number; speed: number; proj: 'arrow' | 'orb'; aoe: number };

export interface SkillDef {
  name: string;
  cd: number;
  desc: string;
}

export interface ClassDef {
  name: string;
  race: string;
  color: number;
  w: number;
  h: number;
  speed: number;
  jump: number;
  aggro: number; // 적이 이 직업을 노릴 때 거리 배율. 작을수록 더 잘 노려진다.
  base: Stats;
  growth: Stats; // 레벨당 상승량
  attack: AttackDef;
  skill: SkillDef;
  weaponNoun: string;
  desc: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  swordsman: {
    name: '검사', race: '휴먼', color: 0x4a90e2, w: 26, h: 50, speed: 230, jump: 640, aggro: 1,
    base: { maxHp: 120, atk: 14, def: 4, crit: 0.08 },
    growth: { maxHp: 14, atk: 3, def: 1, crit: 0.004 },
    attack: { kind: 'melee', cd: 0.32, mult: 1.0, range: 62, height: 54, knock: 200 },
    skill: { name: '돌진 베기', cd: 5, desc: '앞으로 돌진하며 지나가는 적을 벤다. 돌진 중 무적.' },
    weaponNoun: '장검',
    desc: '빠른 연속 베기. 균형 잡힌 능력치.',
  },
  dwarf: {
    name: '수호자', race: '드워프', color: 0xd08040, w: 34, h: 40, speed: 195, jump: 590, aggro: 0.5,
    base: { maxHp: 200, atk: 12, def: 9, crit: 0.03 },
    growth: { maxHp: 26, atk: 2.2, def: 2, crit: 0.002 },
    attack: { kind: 'melee', cd: 0.6, mult: 1.4, range: 56, height: 50, knock: 380 },
    skill: { name: '도발', cd: 12, desc: '주변 적의 시선을 끌고 4초간 받는 피해 60% 감소.' },
    weaponNoun: '전투도끼',
    desc: '튼튼한 몸과 강한 넉백. 적이 우선적으로 노린다.',
  },
  elf: {
    name: '궁수', race: '엘프', color: 0x4caf50, w: 22, h: 56, speed: 245, jump: 680, aggro: 1.2,
    base: { maxHp: 90, atk: 13, def: 2, crit: 0.15 },
    growth: { maxHp: 10, atk: 2.8, def: 0.6, crit: 0.006 },
    attack: { kind: 'projectile', cd: 0.42, mult: 0.9, speed: 760, proj: 'arrow', aoe: 0 },
    skill: { name: '부채 사격', cd: 6, desc: '적을 관통하는 화살 5발을 부채꼴로 쏜다.' },
    weaponNoun: '장궁',
    desc: '멀리 날아가는 화살. 치명타 확률이 높다.',
  },
  gnome: {
    name: '마법사', race: '노움', color: 0x9c5bd6, w: 20, h: 32, speed: 215, jump: 620, aggro: 1.2,
    base: { maxHp: 80, atk: 16, def: 1, crit: 0.06 },
    growth: { maxHp: 9, atk: 3.4, def: 0.5, crit: 0.003 },
    attack: { kind: 'projectile', cd: 0.75, mult: 1.2, speed: 430, proj: 'orb', aoe: 80 },
    skill: { name: '치유의 빛', cd: 14, desc: '주변 동료를 30% 회복하고 쓰러진 동료를 일으킨다.' },
    weaponNoun: '지팡이',
    desc: '터지는 마법 구체로 여러 적에게 피해를 준다.',
  },
};

// 스킬 세부 수치
export const SKILL = {
  dash: { time: 0.22, speed: 950, mult: 2.0 },
  taunt: { radius: 420, time: 4, guard: 4, reduce: 0.6 },
  volley: { arrows: 5, spread: 0.5, mult: 1.1 },
  heal: { radius: 260, ratio: 0.3 },
};

export const CLASS_ORDER: ClassId[] = ['swordsman', 'dwarf', 'elf', 'gnome'];

// ─── 경험치 ──────────────────────────────────────────

export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(level, 1.6));
}

// ─── 적 ──────────────────────────────────────────────

export interface EnemyDef {
  name: string;
  w: number;
  h: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  xp: number;
  color: number;
  dropRate: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { name: '슬라임', w: 30, h: 22, hp: 30, atk: 7, def: 0, speed: 70, xp: 12, color: 0x66cc66, dropRate: 0.15 },
  goblin: { name: '고블린', w: 24, h: 36, hp: 48, atk: 10, def: 2, speed: 135, xp: 20, color: 0x8fae3a, dropRate: 0.22 },
  skeleton: { name: '해골 궁수', w: 24, h: 46, hp: 40, atk: 9, def: 1, speed: 60, xp: 26, color: 0xe0e0d0, dropRate: 0.28 },
  orc: { name: '오크 전사', w: 40, h: 56, hp: 160, atk: 16, def: 6, speed: 85, xp: 60, color: 0x4d7a3a, dropRate: 0.75 },
  boss: { name: '오우거 군주', w: 90, h: 110, hp: 2200, atk: 24, def: 8, speed: 110, xp: 0, color: 0x8a2a2a, dropRate: 1 },
};

/** 구역이 깊어질수록 적이 강해진다. */
export function zoneScale(zone: number) {
  return { hp: 1 + 0.45 * (zone - 1), atk: 1 + 0.35 * (zone - 1), def: zone - 1, xp: 1 + 0.5 * (zone - 1) };
}

/** 인원수가 많을수록 적 체력이 늘어난다. */
export function partyHpScale(players: number) {
  return 1 + 0.6 * (players - 1);
}

// ─── 장비 ────────────────────────────────────────────

export const RARITY: Record<Rarity, { name: string; color: string; mult: number; weight: number }> = {
  common: { name: '일반', color: '#d8d8d8', mult: 1, weight: 60 },
  rare: { name: '희귀', color: '#4aa3ff', mult: 1.6, weight: 28 },
  epic: { name: '영웅', color: '#c061ff', mult: 2.4, weight: 10 },
  legendary: { name: '전설', color: '#ffa020', mult: 3.6, weight: 2 },
};

const MATERIALS = ['낡은', '강철', '미스릴', '용비늘', '군주의'];
const ACCESSORY_NOUNS = ['반지', '부적', '목걸이'];

export function rollRarity(rng: () => number, boss: boolean): Rarity {
  if (boss) return rng() < 0.5 ? 'epic' : 'legendary';
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const total = order.reduce((s, r) => s + RARITY[r].weight, 0);
  let roll = rng() * total;
  for (const r of order) {
    roll -= RARITY[r].weight;
    if (roll < 0) return r;
  }
  return 'common';
}

export function makeItem(id: number, zone: number, rng: () => number, boss = false): Item {
  const slots: Slot[] = ['weapon', 'armor', 'accessory'];
  const slot = slots[Math.floor(rng() * slots.length)];
  const rarity = rollRarity(rng, boss);
  const m = RARITY[rarity].mult;
  const v = () => 0.85 + rng() * 0.3;
  const stats: Partial<Stats> = {};
  let noun: string | undefined;

  if (slot === 'weapon') {
    stats.atk = Math.round((3 + zone * 4) * m * v());
    if (rarity === 'legendary') stats.crit = 0.05;
  } else if (slot === 'armor') {
    stats.def = Math.round((1.5 + zone * 2) * m * v());
    stats.maxHp = Math.round((8 + zone * 12) * m * v());
    noun = '갑옷';
  } else {
    stats.crit = Math.round((0.02 + 0.01 * zone) * m * v() * 100) / 100;
    if (rng() < 0.5) stats.atk = Math.round((1 + zone * 1.5) * m * v());
    else stats.maxHp = Math.round((5 + zone * 8) * m * v());
    noun = ACCESSORY_NOUNS[Math.floor(rng() * ACCESSORY_NOUNS.length)];
  }
  return { id, slot, rarity, zone, noun, stats };
}

export function itemName(item: Item, cls: ClassId): string {
  const mat = MATERIALS[Math.min(item.zone, MATERIALS.length) - 1];
  return `${mat} ${item.noun ?? CLASSES[cls].weaponNoun}`;
}

export function itemStatText(item: Item): string {
  const s = item.stats;
  const parts: string[] = [];
  if (s.atk) parts.push(`공격 +${s.atk}`);
  if (s.def) parts.push(`방어 +${s.def}`);
  if (s.maxHp) parts.push(`체력 +${s.maxHp}`);
  if (s.crit) parts.push(`치명 +${Math.round(s.crit * 100)}%`);
  return parts.join(' ');
}

/** 장비 비교용 대략적인 점수. */
export function itemScore(item: Item | undefined): number {
  if (!item) return 0;
  const s = item.stats;
  return (s.atk ?? 0) * 3 + (s.def ?? 0) * 2.5 + (s.maxHp ?? 0) * 0.3 + (s.crit ?? 0) * 300;
}

export const SLOT_NAMES: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
