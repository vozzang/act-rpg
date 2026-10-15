// 밸런스 데이터. 수치 조정은 대부분 이 파일에서 하면 된다.
// 거리·속도는 월드 좌표(px) 기준이다. 타일 한 칸(TILE = 32)이 3D 화면에서 1칸 크기의 블록이 된다.
import type { AttrKey, Attrs, ClassId, EnemyKind, Item, ItemStats, Rarity, ShopEntry, ShopType, Slot, Stats } from './types';

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 544;
export const TICK_RATE = 60;
export const SNAPSHOT_EVERY = 3; // 60/3 = 초당 20회 전송
export const REVIVE_TIME = 2;
export const ZONE_NAMES = ['초록 숲', '고블린 협곡', '얼어붙은 설원', '오크 요새', '불타는 화산', '독기의 늪', '사막 유적', '수정 동굴', '망령의 묘지', '마왕성'];

/** 구역별 색: ground 바닥(풀), road 길, wall 지도에서 벽(나무·바위) 색. 3D 바닥·미니맵·맵 편집기가 함께 쓴다 */
export const ZONE_PALETTE: { ground: number; road: number; wall: number }[] = [
  { ground: 0x5c9a44, road: 0xb59866, wall: 0x24301e }, // 1 초록 숲
  { ground: 0x8a9448, road: 0xb59866, wall: 0x24301e }, // 2 고블린 협곡
  { ground: 0xe4ebf2, road: 0xaebccb, wall: 0x6a7680 }, // 3 얼어붙은 설원
  { ground: 0x8a7450, road: 0xb59866, wall: 0x2e2a22 }, // 4 오크 요새
  { ground: 0x4a3c36, road: 0x7a4630, wall: 0x2a1c18 }, // 5 불타는 화산
  { ground: 0x3e5a3a, road: 0x5e5236, wall: 0x1c2a1a }, // 6 독기의 늪
  { ground: 0xd8bc80, road: 0xc8a060, wall: 0x8a6a40 }, // 7 사막 유적
  { ground: 0x3a3450, road: 0x5a5070, wall: 0x1e1a2c }, // 8 수정 동굴
  { ground: 0x5a5e60, road: 0x707070, wall: 0x2a2c2e }, // 9 망령의 묘지
  { ground: 0x40302e, road: 0x5a4a48, wall: 0x1a1212 }, // 10 마왕성
];

// ─── 직업 ────────────────────────────────────────────

export type AttackDef =
  | {
      kind: 'melee'; cd: number; mult: number;
      range: number; // 몸 중심에서 닿는 거리
      arc: number; // 조준 방향 기준 좌우 각도(라디안)
      knock: number;
    }
  | {
      kind: 'projectile'; cd: number; mult: number; speed: number; proj: 'arrow' | 'orb';
      range: number; // 최대 비행 거리
      aoe: number; // 0보다 크면 터지면서 범위 피해
      arcHeight: number; // 포물선 최고 높이 (보이는 효과)
    };

export interface SkillDef {
  name: string;
  cd: number; // 재사용 대기시간(초)
  mp: number; // 소모 MP. 위력이 클수록 많이 든다
  unlock: number; // 배우는 레벨
  desc: string;
}

/** 스킬을 배우는 레벨. 마지막이 최종 스킬. */
export const SKILL_UNLOCKS = [1, 4, 7, 10];

export interface ClassDef {
  name: string;
  race: string;
  color: number;
  r: number; // 충돌 반지름
  height: number; // 키 (머리 위 이름표 위치 기준, 월드 px)
  speed: number;
  aggro: number; // 적이 이 직업을 노릴 때 거리 배율. 작을수록 더 잘 노려진다.
  mainAttr: AttrKey; // 공격력이 오르는 주 능력치
  attrs: Attrs; // 1레벨 능력치
  attrGrowth: Attrs; // 레벨업마다 자동으로 오르는 능력치
  bonus: { hp: number; atk: number; def: number; crit: number; mp: number; mpLv: number; mpRegen: number }; // 능력치와 별개인 직업 기본값
  attack: AttackDef;
  skills: SkillDef[]; // 4개, SKILL_UNLOCKS 레벨에 하나씩 배운다
  weaponNoun: string;
  desc: string;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  swordsman: {
    name: '검사', race: '휴먼', color: 0x4a90e2, r: 12, height: 50, speed: 170, aggro: 1,
    mainAttr: 'str',
    attrs: { str: 10, dex: 5, int: 3, vit: 7 },
    attrGrowth: { str: 1.25, dex: 0.5, int: 0, vit: 0.75 },
    bonus: { hp: 56, atk: 6, def: 0.5, crit: 0.056, mp: 50, mpLv: 4, mpRegen: 2.5 },
    attack: { kind: 'melee', cd: 0.32, mult: 1.0, range: 62, arc: 1.0, knock: 200 },
    skills: [
      { name: '돌진 베기', cd: 5, mp: 10, unlock: 1, desc: '조준 방향으로 돌진하며 지나가는 적을 벤다. 돌진 중 무적.' },
      { name: '회오리 베기', cd: 7, mp: 20, unlock: 4, desc: '제자리에서 회전하며 주변의 모든 적을 벤다.' },
      { name: '전투 함성', cd: 18, mp: 30, unlock: 7, desc: '주변 동료와 자신의 공격력을 8초간 25% 올린다.' },
      { name: '검기 폭풍', cd: 20, mp: 60, unlock: 10, desc: '거대한 검기를 날려 일직선의 모든 적을 베어 버린다.' },
    ],
    weaponNoun: '장검',
    desc: '빠른 연속 베기. 균형 잡힌 능력치.',
  },
  dwarf: {
    name: '수호자', race: '드워프', color: 0xd08040, r: 15, height: 40, speed: 150, aggro: 0.5,
    mainAttr: 'str',
    attrs: { str: 9, dex: 2, int: 2, vit: 12 },
    attrGrowth: { str: 0.75, dex: 0.25, int: 0.25, vit: 1.25 },
    bonus: { hp: 104, atk: 4.8, def: 4.65, crit: 0.018, mp: 60, mpLv: 4, mpRegen: 2.5 },
    attack: { kind: 'melee', cd: 0.6, mult: 1.4, range: 58, arc: 1.3, knock: 380 },
    skills: [
      { name: '도발', cd: 12, mp: 15, unlock: 1, desc: '주변 적의 시선을 끌고 4초간 받는 피해 60% 감소.' },
      { name: '대지 강타', cd: 8, mp: 20, unlock: 4, desc: '땅을 내리쳐 주변 적에게 피해를 주고 기절시킨다.' },
      { name: '방패 돌진', cd: 9, mp: 25, unlock: 7, desc: '방패를 앞세워 돌진하며 부딪힌 적을 날려 보내고 기절시킨다.' },
      { name: '산의 수호', cd: 30, mp: 70, unlock: 10, desc: '주변 동료가 6초간 받는 피해를 절반으로 줄이고 체력을 20% 회복시킨다.' },
    ],
    weaponNoun: '전투도끼',
    desc: '튼튼한 몸과 강한 넉백. 적이 우선적으로 노린다.',
  },
  elf: {
    name: '궁수', race: '엘프', color: 0x4caf50, r: 11, height: 56, speed: 180, aggro: 1.2,
    mainAttr: 'dex',
    attrs: { str: 4, dex: 12, int: 4, vit: 5 },
    attrGrowth: { str: 0.25, dex: 1.75, int: 0.25, vit: 0.25 },
    bonus: { hp: 42, atk: 4.2, def: 0, crit: 0.106, mp: 55, mpLv: 5, mpRegen: 3 },
    attack: { kind: 'projectile', cd: 0.42, mult: 0.9, speed: 520, proj: 'arrow', range: 480, aoe: 0, arcHeight: 60 },
    skills: [
      { name: '부채 사격', cd: 6, mp: 12, unlock: 1, desc: '적을 관통하는 화살 5발을 부채꼴로 쏜다.' },
      { name: '저격', cd: 6, mp: 18, unlock: 4, desc: '멀리까지 꿰뚫는 강력한 화살 한 발. 공격력 3배.' },
      { name: '화살비', cd: 12, mp: 35, unlock: 7, desc: '조준한 곳에 화살을 비처럼 쏟아붓는다.' },
      { name: '폭풍의 화살', cd: 20, mp: 60, unlock: 10, desc: '사방으로 관통하는 화살 16발을 동시에 쏜다.' },
    ],
    weaponNoun: '장궁',
    desc: '포물선을 그리며 멀리 날아가는 화살. 치명타 확률이 높다.',
  },
  gnome: {
    name: '마법사', race: '노움', color: 0x9c5bd6, r: 10, height: 32, speed: 160, aggro: 1.2,
    mainAttr: 'int',
    attrs: { str: 3, dex: 4, int: 13, vit: 5 },
    attrGrowth: { str: 0, dex: 0, int: 2.75, vit: 0.25 },
    bonus: { hp: 40, atk: 6.4, def: 0, crit: 0.044, mp: 40, mpLv: 6, mpRegen: 3 },
    attack: { kind: 'projectile', cd: 0.75, mult: 1.2, speed: 340, proj: 'orb', range: 340, aoe: 70, arcHeight: 0 },
    skills: [
      { name: '치유의 빛', cd: 14, mp: 25, unlock: 1, desc: '주변 동료를 30% 회복하고 쓰러진 동료를 일으킨다.' },
      { name: '냉기 파동', cd: 8, mp: 20, unlock: 4, desc: '주변에 냉기를 퍼뜨려 피해를 주고 3초간 느리게 만든다.' },
      { name: '화염구', cd: 6, mp: 30, unlock: 7, desc: '크게 폭발하는 불덩이를 던진다. 공격력 2.5배.' },
      { name: '메테오', cd: 25, mp: 80, unlock: 10, desc: '조준한 곳에 거대한 운석을 떨어뜨린다. 공격력 5배.' },
    ],
    weaponNoun: '지팡이',
    desc: '터지는 마법 구체로 여러 적에게 피해를 준다.',
  },
};

// ─── 능력치 ──────────────────────────────────────────

export const ATTR_KEYS: AttrKey[] = ['str', 'dex', 'int', 'vit'];
export const ATTR_NAMES: Record<AttrKey, string> = { str: '힘', dex: '민첩', int: '지능', vit: '체력' };
export const POINTS_PER_LEVEL = 3;

/** 능력치 1당 효과. 여기만 바꾸면 전체 밸런스가 바뀐다. */
export const ATTR_EFFECT = {
  mainAtk: 0.5, // 주 능력치 1당 공격력
  vitHp: 5, // 체력 1당 최대 HP
  levelHp: 3, // 레벨당 추가 HP
  vitDef: 0.2, // 체력 1당 방어
  strDef: 0.1, // 힘 1당 방어
  dexCrit: 0.004, // 민첩 1당 치명타 확률
  dexHaste: 0.0025, // 민첩 1당 공격 속도
  dexDodge: 0.0025, // 민첩 1당 회피 확률 (최대 DODGE_MAX)
  intCdr: 0.008, // 지능 1당 스킬 재사용 가속
  intHeal: 0.01, // 지능 1당 회복량 증가
  intMp: 3, // 지능 1당 최대 MP
  intMpRegen: 0.05, // 지능 1당 초당 MP 회복
};

/** 회피 확률 상한 (민첩을 아무리 올려도 이 이상은 피하지 못한다) */
export const DODGE_MAX = 0.25;

export const ATTR_DESC: Record<AttrKey, string> = {
  str: '근접 공격력, 방어',
  dex: '원거리 공격력, 치명타, 공격 속도, 회피',
  int: '마법 공격력, MP, 스킬 재사용, 회복량',
  vit: '최대 HP, 방어',
};

/** 레벨·배분 포인트·장비로 최종 능력치를 계산한다. */
export function totalAttrs(cls: ClassId, level: number, alloc: Attrs, items: (Item | undefined)[]): Attrs {
  const def = CLASSES[cls];
  const a = {} as Attrs;
  for (const k of ATTR_KEYS) {
    a[k] = def.attrs[k] + def.attrGrowth[k] * (level - 1) + alloc[k];
    for (const it of items) a[k] += it?.stats[k] ?? 0;
    a[k] = Math.floor(a[k]);
  }
  return a;
}

/** 능력치 → 전투 수치 */
export function deriveStats(cls: ClassId, level: number, attrs: Attrs, items: (Item | undefined)[]): Stats {
  const def = CLASSES[cls];
  const e = ATTR_EFFECT;
  const sum = (k: keyof ItemStats) => items.reduce((s, it) => s + (it?.stats[k] ?? 0), 0);
  return {
    maxHp: Math.round(def.bonus.hp + attrs.vit * e.vitHp + (level - 1) * e.levelHp + sum('maxHp')),
    atk: Math.round(def.bonus.atk + attrs[def.mainAttr] * e.mainAtk + sum('atk')),
    def: Math.round(def.bonus.def + attrs.vit * e.vitDef + attrs.str * e.strDef + sum('def')),
    crit: Math.min(0.75, def.bonus.crit + attrs.dex * e.dexCrit + sum('crit')),
    haste: attrs.dex * e.dexHaste,
    dodge: Math.min(DODGE_MAX, attrs.dex * e.dexDodge),
    cdr: attrs.int * e.intCdr,
    maxMp: Math.round(def.bonus.mp + attrs.int * e.intMp + (level - 1) * def.bonus.mpLv),
    mpRegen: def.bonus.mpRegen + attrs.int * e.intMpRegen,
  };
}

// 스킬 세부 수치 (이름표는 '직업.순서')
export const SKILL = {
  dash: { time: 0.22, speed: 760, mult: 2.0 }, // 검사 1
  whirl: { radius: 85, mult: 1.6 }, // 검사 2
  warcry: { radius: 260, time: 8, atk: 0.25 }, // 검사 3
  wave: { speed: 620, range: 520, r: 26, mult: 3.5 }, // 검사 4
  taunt: { radius: 300, time: 4, guard: 4, reduce: 0.6 }, // 수호자 1
  slam: { radius: 110, mult: 1.5, stun: 1.2 }, // 수호자 2
  bash: { time: 0.35, speed: 620, mult: 1.2, stun: 1.0, knock: 420 }, // 수호자 3
  bastion: { radius: 300, time: 6, reduce: 0.5, heal: 0.2 }, // 수호자 4
  volley: { arrows: 5, spread: 0.5, mult: 1.1 }, // 궁수 1
  snipe: { speed: 820, range: 680, mult: 3 }, // 궁수 2
  rain: { distance: 240, radius: 95, arrows: 12, aoe: 34, mult: 0.75 }, // 궁수 3
  storm: { arrows: 16, mult: 1.5 }, // 궁수 4
  heal: { radius: 200, ratio: 0.3 }, // 마법사 1
  frost: { radius: 125, mult: 1.0, slow: 3 }, // 마법사 2
  fireball: { speed: 380, range: 380, aoe: 120, mult: 2.5 }, // 마법사 3
  meteor: { distance: 260, aoe: 170, mult: 5, fall: 1.0 }, // 마법사 4
};

export const CLASS_ORDER: ClassId[] = ['swordsman', 'dwarf', 'elf', 'gnome'];

// ─── 경험치 ──────────────────────────────────────────

export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(level, 1.6));
}

// ─── 적 ──────────────────────────────────────────────

/**
 * 몬스터 행동 방식.
 * hop: 튀어 오르며 다가온다(슬라임) · melee: 붙어서 몸으로 친다 · ranged: 거리를 두고 쏜다 ·
 * heavy: 몸이 깜빡인 뒤 크게 내려친다 · dash: 멀리서 힘을 모았다가 돌진해 벤다 ·
 * frost: 거리를 두고 냉기 구슬(맞으면 느려짐)을 쏜다 · bomb: 플레이어 발밑에 화염탄을 떨어뜨린다
 */
export type EnemyAI = 'hop' | 'melee' | 'ranged' | 'heavy' | 'dash' | 'frost' | 'bomb' | 'boss';

export interface EnemyDef {
  name: string;
  ai: EnemyAI;
  heavy?: boolean; // 묵직한 적: 맞아도 잠깐만 멈칫하고, 내려치기 준비(windup)는 기절시켜야만 끊긴다
  knock?: number; // 넉백을 받는 비율 (기본 1, 작을수록 덜 밀린다)
  r: number; // 충돌 반지름. 길찾기가 타일 단위라 보스 외에는 지름이 한 칸(32)보다 작아야 좁은 틈을 지나간다.
  height: number; // 키 (머리 위 체력바 위치 기준, 월드 px)
  hp: number;
  atk: number;
  def: number;
  speed: number;
  xp: number;
  gold: number; // 떨어뜨리는 돈 (구역이 깊을수록 늘어난다)
  dropRate: number;
}

// 몬스터가 많은 대신 마리당 경험치·돈·장비 드랍은 낮게 잡았다 (한 판 동안 얻는 총량이 너무 커지지 않도록)
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { name: '슬라임', ai: 'hop', r: 13, height: 22, hp: 40, atk: 9, def: 0, speed: 65, xp: 7, gold: 3, dropRate: 0.09 },
  goblin: { name: '고블린', ai: 'melee', r: 11, height: 36, hp: 62, atk: 13, def: 2, speed: 110, xp: 12, gold: 4, dropRate: 0.13 },
  skeleton: { name: '해골 궁수', ai: 'ranged', r: 11, height: 46, hp: 52, atk: 11, def: 1, speed: 58, xp: 15, gold: 6, dropRate: 0.17 },
  orc: { name: '오크 전사', ai: 'heavy', heavy: true, knock: 0.35, r: 15, height: 56, hp: 200, atk: 20, def: 6, speed: 72, xp: 36, gold: 18, dropRate: 0.5 },
  boss: { name: '흑룡', ai: 'boss', r: 40, height: 110, hp: 10000, atk: 100, def: 50, speed: 85, xp: 0, gold: 0, dropRate: 1 },
  // 1구역: 작고 빠른 졸개 무리, 돌을 던지는 투척병
  hound: { name: '퍼그 졸개', ai: 'melee', r: 10, height: 30, hp: 34, atk: 8, def: 0, speed: 150, xp: 6, gold: 2, dropRate: 0.06 },
  thrower: { name: '고블린 투척병', ai: 'ranged', r: 11, height: 34, hp: 45, atk: 10, def: 1, speed: 70, xp: 13, gold: 5, dropRate: 0.12 },
  // 2구역: 튼튼한 산적, 멀리서 돌진해 베는 암살자
  bandit: { name: '협곡 산적', ai: 'melee', r: 12, height: 44, hp: 110, atk: 15, def: 3, speed: 95, xp: 20, gold: 9, dropRate: 0.2 },
  assassin: { name: '암살자', ai: 'dash', r: 11, height: 40, hp: 70, atk: 18, def: 2, speed: 115, xp: 22, gold: 10, dropRate: 0.2 },
  // 3구역: 느리고 묵직한 약탈자, 냉기로 발을 묶는 마녀
  raider: { name: '설원 약탈자', ai: 'heavy', heavy: true, knock: 0.5, r: 14, height: 48, hp: 150, atk: 18, def: 4, speed: 75, xp: 28, gold: 12, dropRate: 0.3 },
  iceWitch: { name: '얼음 마녀', ai: 'frost', r: 11, height: 50, hp: 60, atk: 12, def: 1, speed: 60, xp: 24, gold: 12, dropRate: 0.25 },
  // 4구역: 방어가 높은 흑기사, 느리지만 질긴 망자 무리
  darkKnight: { name: '흑기사', ai: 'heavy', heavy: true, knock: 0.3, r: 14, height: 50, hp: 170, atk: 19, def: 9, speed: 70, xp: 34, gold: 16, dropRate: 0.4 },
  zombie: { name: '망자 병사', ai: 'melee', knock: 0.6, r: 12, height: 40, hp: 120, atk: 14, def: 2, speed: 48, xp: 18, gold: 6, dropRate: 0.15 },
  // 5구역: 강한 불꽃 기사, 발밑에 화염탄을 떨어뜨리는 술사
  flameKnight: { name: '불꽃 기사', ai: 'heavy', heavy: true, knock: 0.3, r: 14, height: 50, hp: 200, atk: 22, def: 7, speed: 80, xp: 40, gold: 20, dropRate: 0.45 },
  pyromancer: { name: '화염 술사', ai: 'bomb', r: 11, height: 50, hp: 70, atk: 16, def: 2, speed: 60, xp: 30, gold: 16, dropRate: 0.3 },
};

// ─── 회복 음식 / 상점 ──────────────────────────────────

export const FOOD = {
  hp: 0.35, // HP 음식: 최대 HP의 35% 회복
  mp: 0.5, // MP 음식: 최대 MP의 50% 회복
  stackMax: 5, // 종류별로 들고 다닐 수 있는 개수 (상자 한 칸에 모인다)
};

/** 아이템 상자 칸 수 */
export const INV_SIZE = 6;
/** 가방 칸 수 (장비만, 능력치에 더해지지 않는다) */
export const BAG_SIZE = 6;

export const SHOP = {
  range: 80, // 상인과 이 거리 안에 있어야 살 수 있다
  foodPrice: 20,
  items: 3, // 상점마다 파는 장비 수
  itemPrice: { common: 25, rare: 55, epic: 110, legendary: 240 } as Record<Rarity, number>,
  // 상점 장비는 필드 드랍보다 좋은 등급이 잘 나온다
  rarityWeight: { common: 30, rare: 45, epic: 20, legendary: 5 } as Record<Rarity, number>,
};

/** 상점 종류별 이름과 표시 색 */
export const SHOP_TYPES: Record<ShopType, { name: string; color: number }> = {
  heal: { name: '회복 상점', color: 0x50d070 },
  attack: { name: '공격 상점', color: 0xff6040 },
  defense: { name: '방어 상점', color: 0x5aa8ff },
  forge: { name: '대장간', color: 0xffa040 },
};

// ─── 대장간 ───────────────────────────────────────────

/** 대장간: 장비 2~3개를 넣어 조합한다. 값(fee)은 대장간이 있는 구역 × feePerZone */
export const FORGE = { min: 2, max: 3, feePerZone: 15 };

/** 조합법 재료: noun으로 장비 이름(대검·반지 등)을, slot으로 종류(무기·방어구·장신구)를 맞춘다 */
export interface RecipeNeed {
  noun?: string;
  slot?: Slot;
}

/** 조합법: 재료가 정확히 맞으면 정해진 고유 장비가 나온다 (재료 중 가장 깊은 구역 기준 전설 등급, mult배 수치) */
export interface Recipe {
  title: string; // 만들어지는 장비 이름
  needs: RecipeNeed[];
  slot: Slot;
  /** 만들어지는 장비 수치. base는 그 구역 전설 등급의 기본 수치 */
  stats: (base: { atk: number; def: number; attr: number; crit: number; hp: number }) => ItemStats;
}

export const RECIPES: Recipe[] = [
  { title: '거인의 대검', needs: [{ noun: '대검' }, { noun: '대검' }], slot: 'weapon', stats: (b) => ({ atk: Math.round(b.atk * 1.5), str: Math.round(b.attr * 1.6), crit: 0.05 }) },
  { title: '바람의 장궁', needs: [{ noun: '장궁' }, { noun: '장궁' }], slot: 'weapon', stats: (b) => ({ atk: Math.round(b.atk * 1.5), dex: Math.round(b.attr * 1.6), crit: 0.08 }) },
  { title: '현자의 지팡이', needs: [{ noun: '지팡이' }, { noun: '지팡이' }], slot: 'weapon', stats: (b) => ({ atk: Math.round(b.atk * 1.5), int: Math.round(b.attr * 1.6), maxHp: Math.round(b.hp * 0.5) }) },
  { title: '삼위일체의 검', needs: [{ noun: '대검' }, { noun: '장궁' }, { noun: '지팡이' }], slot: 'weapon', stats: (b) => ({ atk: Math.round(b.atk * 1.7), str: b.attr, dex: b.attr, int: b.attr }) },
  { title: '수호자의 판금', needs: [{ noun: '갑옷' }, { noun: '판금 갑옷' }], slot: 'armor', stats: (b) => ({ def: Math.round(b.def * 1.6), vit: Math.round(b.attr * 1.5), str: Math.round(b.attr * 0.7) }) },
  { title: '생명의 부적', needs: [{ noun: '부적' }, { noun: '부적' }], slot: 'accessory', stats: (b) => ({ maxHp: Math.round(b.hp * 1.8), vit: Math.round(b.attr * 1.2) }) },
  { title: '치명의 반지', needs: [{ noun: '반지' }, { noun: '반지' }], slot: 'accessory', stats: (b) => ({ crit: Math.round(b.crit * 1.8 * 100) / 100, atk: Math.round(b.atk * 0.5) }) },
  { title: '용사의 목걸이', needs: [{ noun: '반지' }, { noun: '부적' }], slot: 'accessory', stats: (b) => ({ atk: Math.round(b.atk * 0.5), def: Math.round(b.def * 0.5), crit: b.crit, maxHp: b.hp }) },
  { title: '무쇠 대장장이의 망치', needs: [{ slot: 'weapon' }, { slot: 'weapon' }, { slot: 'weapon' }], slot: 'weapon', stats: (b) => ({ atk: Math.round(b.atk * 1.4), str: b.attr, vit: b.attr }) },
  { title: '철벽의 갑주', needs: [{ slot: 'armor' }, { slot: 'armor' }, { slot: 'armor' }], slot: 'armor', stats: (b) => ({ def: Math.round(b.def * 1.5), vit: Math.round(b.attr * 1.3), maxHp: b.hp }) },
];

/** 재료 설명 (예: "대검 + 대검") */
export function recipeText(r: Recipe) {
  const slotName: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
  return r.needs.map((n) => n.noun ?? `아무 ${slotName[n.slot!]}`).join(' + ');
}

/** 고른 장비들에 정확히 맞는 조합법 (구체적인 이름 재료가 많은 조합법 우선). 없으면 null */
export function matchRecipe(items: Item[]): Recipe | null {
  const fits = (r: Recipe) => {
    if (r.needs.length !== items.length) return false;
    // 이름 재료부터 짝을 지어 보고, 남은 장비를 종류 재료에 맞춘다
    const left = [...items];
    const needs = [...r.needs].sort((a, b) => Number(!!b.noun) - Number(!!a.noun));
    for (const n of needs) {
      const i = left.findIndex((it) => (n.noun ? it.noun === n.noun && !it.title : true) && (n.slot ? it.slot === n.slot : true));
      if (i < 0) return false;
      left.splice(i, 1);
    }
    return true;
  };
  const named = (r: Recipe) => r.needs.filter((n) => n.noun).length;
  return [...RECIPES].sort((a, b) => named(b) - named(a)).find(fits) ?? null;
}

/** 조합법으로 만드는 장비 (재료 중 가장 깊은 구역의 전설 등급 수치를 바탕으로) */
export function recipeItem(r: Recipe, zone: number, id: number): Item {
  const m = RARITY.legendary.mult;
  const base = {
    atk: Math.round((3 + zone * 4) * m),
    def: Math.round((1.5 + zone * 2) * m),
    attr: Math.max(1, Math.round((1 + zone * 1.5) * m)),
    crit: Math.round((0.02 + 0.01 * zone) * m * 100) / 100,
    hp: Math.round(15 * zone * m),
  };
  return { id, slot: r.slot, rarity: 'legendary', zone, title: r.title, stats: r.stats(base) };
}

/** 랜덤 조합 결과 등급: 재료 중 가장 좋은 등급에서 시작해 재료가 많을수록, 같은 등급끼리일수록 한 단계 오를 확률이 크다 */
export function randomForgeRarity(items: Item[], rng: () => number): Rarity {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const best = Math.max(...items.map((it) => order.indexOf(it.rarity)));
  const same = items.every((it) => it.rarity === items[0].rarity);
  const up = (items.length >= 3 ? 0.55 : 0.25) + (same ? 0.15 : 0);
  return order[Math.min(order.length - 1, best + (rng() < up ? 1 : 0))];
}

/**
 * 상점 지점별 고정 판매 목록. [z - 1] = z구역 지점(출발 지점은 1구역)의 등급.
 * main: 공격 상점 무기 3종·방어 상점 기본 갑옷·방어 장신구, premium: 공격 장신구·판금 갑옷 (한 단계 위)
 */
const SHOP_TIERS: { main: Rarity; premium: Rarity; boost?: number }[] = [
  { main: 'rare', premium: 'epic' },
  { main: 'rare', premium: 'epic' },
  { main: 'epic', premium: 'legendary' },
  { main: 'epic', premium: 'legendary' },
  // 5구역부터는 더 올릴 등급이 없어 premium 품목 수치·값을 25% 더 준다 (구역이 깊을수록 수치 자체도 오른다)
  ...Array.from({ length: 6 }, () => ({ main: 'legendary' as Rarity, premium: 'legendary' as Rarity, boost: 1.25 })),
];

/** 상점의 고정 판매 목록 (매 판 같다). nextId로 장비 id를 받는다 */
export function shopStock(type: ShopType, zone: number, nextId: () => number): ShopEntry[] {
  const food = (kind: 'hpFood' | 'mpFood'): ShopEntry => ({ kind, price: SHOP.foodPrice, sold: false });
  const item = (it: Omit<Item, 'id' | 'zone'>, priceMult = 1): ShopEntry => {
    const full: Item = { ...it, id: nextId(), zone };
    return { kind: 'item', item: full, price: Math.round(shopItemPrice(full.rarity, zone) * priceMult), sold: false, buyers: [] };
  };
  const t = SHOP_TIERS[Math.min(zone, SHOP_TIERS.length) - 1];
  const s = (r: Rarity) => fixedStats(zone, r); // 기본 품목
  const sp = (r: Rarity) => fixedStats(zone, r, t.boost ?? 1); // premium 품목
  if (type === 'forge') return []; // 대장간은 파는 물건이 없다
  if (type === 'heal') return [food('hpFood'), food('mpFood')];
  if (type === 'attack') {
    // 직업별 주 능력치에 맞춘 무기 셋 (이름이 쓰임새를 알려 준다)과 공격 장신구
    const weapon = (attr: AttrKey, noun: string) => item({ slot: 'weapon', rarity: t.main, noun, stats: { atk: s(t.main).atk, [attr]: s(t.main).attr } });
    return [
      weapon('str', '대검'),
      weapon('dex', '장궁'),
      weapon('int', '지팡이'),
      item({ slot: 'accessory', rarity: t.premium, noun: '반지', stats: { crit: sp(t.premium).crit, atk: Math.round(sp(t.premium).atk * 0.4) } }, t.boost),
    ];
  }
  return [
    item({ slot: 'armor', rarity: t.main, noun: '갑옷', stats: { def: s(t.main).def, vit: s(t.main).attr } }),
    item({ slot: 'armor', rarity: t.premium, noun: '판금 갑옷', stats: { def: sp(t.premium).def, vit: sp(t.premium).attr, str: Math.round(sp(t.premium).attr / 2) } }, t.boost),
    item({ slot: 'accessory', rarity: t.main, noun: '부적', stats: { maxHp: Math.round(15 * zone * RARITY[t.main].mult), vit: s(t.main).attr } }),
  ];
}

/** 장비 수치 (makeItem과 같은 공식에서 운을 뺀 값) */
function fixedStats(zone: number, rarity: Rarity, boost = 1) {
  const m = RARITY[rarity].mult * boost;
  return {
    atk: Math.round((3 + zone * 4) * m),
    def: Math.round((1.5 + zone * 2) * m),
    attr: Math.max(1, Math.round((1 + zone * 1.5) * m)),
    crit: Math.round((0.02 + 0.01 * zone) * m * 100) / 100,
  };
}

/** 구역이 깊을수록 장비 값이 오른다 */
export function shopItemPrice(rarity: Rarity, zone: number) {
  return Math.round(SHOP.itemPrice[rarity] * (1 + 0.6 * (zone - 1)));
}

/** 적이 플레이어를 알아차리는 거리 */
export const AGGRO_RANGE = 420;

// ─── 중간보스 ─────────────────────────────────────────

export interface EliteDef {
  kind: Exclude<EnemyKind, 'boss'>; // 움직임·공격 방식과 모델은 이 몬스터를 따른다
  name: string;
  hp: number; // 1구역 기준 능력치. 여기에 구역 보정(zoneScale)과 인원수 보정이 곱해진다
  atk: number;
  def: number;
}

/**
 * 구역마다 길이 U자로 꺾이는 두 곳을 지키는 중간보스. 순서대로 첫 번째·두 번째 꺾이는 곳에 선다.
 * 같은 구역의 일반 정예(오크)보다 강하고, 뒤 구역으로 갈수록 기본 능력치 자체도 오른다.
 */
export const ELITES: EliteDef[][] = [
  [{ kind: 'slime', name: '거대 슬라임', hp: 200, atk: 12, def: 3 }, { kind: 'goblin', name: '고블린 대장', hp: 260, atk: 15, def: 4 }],
  [{ kind: 'goblin', name: '고블린 대장', hp: 300, atk: 17, def: 5 }, { kind: 'skeleton', name: '엘프 저격수', hp: 280, atk: 16, def: 4 }],
  [{ kind: 'skeleton', name: '엘프 저격수', hp: 340, atk: 18, def: 5 }, { kind: 'orc', name: '바이킹 광전사', hp: 420, atk: 22, def: 8 }],
  [{ kind: 'orc', name: '바이킹 광전사', hp: 460, atk: 24, def: 9 }, { kind: 'orc', name: '황금 기사단장', hp: 540, atk: 27, def: 10 }],
  [{ kind: 'orc', name: '용암 광전사', hp: 500, atk: 25, def: 10 }, { kind: 'skeleton', name: '화염 저격수', hp: 420, atk: 22, def: 8 }],
  [{ kind: 'zombie', name: '늪의 망령', hp: 560, atk: 25, def: 10 }, { kind: 'iceWitch', name: '독 마녀', hp: 440, atk: 22, def: 8 }],
  [{ kind: 'bandit', name: '사막 도적왕', hp: 560, atk: 26, def: 10 }, { kind: 'assassin', name: '모래 암살자', hp: 470, atk: 27, def: 9 }],
  [{ kind: 'darkKnight', name: '수정 수호자', hp: 600, atk: 26, def: 12 }, { kind: 'iceWitch', name: '수정 마녀', hp: 460, atk: 24, def: 9 }],
  [{ kind: 'darkKnight', name: '망령 기사', hp: 620, atk: 27, def: 12 }, { kind: 'pyromancer', name: '묘지 술사', hp: 470, atk: 25, def: 9 }],
  [{ kind: 'flameKnight', name: '마왕 친위대장', hp: 660, atk: 28, def: 12 }, { kind: 'pyromancer', name: '지옥 술사', hp: 480, atk: 26, def: 9 }],
];

/**
 * 구역 출구의 문을 지키는 문지기 (구역마다 하나, [z - 1] = z구역). 쓰러뜨려야 문이 열려 다음 구역으로 갈 수 있다.
 * 같은 구역의 중간보스보다 한 단계 강하다. 구역 보정과 인원수 보정은 중간보스와 같이 곱해진다.
 */
export const GATE_KEEPERS: EliteDef[] = [
  { kind: 'goblin', name: '숲의 문지기', hp: 430, atk: 17, def: 5 },
  { kind: 'skeleton', name: '협곡의 문지기', hp: 480, atk: 20, def: 6 },
  { kind: 'orc', name: '설원의 문지기', hp: 580, atk: 26, def: 9 },
  { kind: 'orc', name: '요새의 문지기', hp: 650, atk: 28, def: 10 },
  { kind: 'orc', name: '화산의 문지기', hp: 660, atk: 28, def: 11 },
  { kind: 'zombie', name: '늪의 문지기', hp: 680, atk: 28, def: 11 },
  { kind: 'raider', name: '사막의 문지기', hp: 690, atk: 29, def: 11 },
  { kind: 'darkKnight', name: '수정의 문지기', hp: 700, atk: 29, def: 12 },
  { kind: 'darkKnight', name: '묘지의 문지기', hp: 710, atk: 30, def: 12 },
  { kind: 'flameKnight', name: '흑룡의 문지기', hp: 720, atk: 30, def: 12 }, // 보스 방 입구 (마지막 구역)
];

export const ELITE = {
  xp: 6, // 경험치 배율
  gold: 8, // 돈 배율
  knockResist: 0.25, // 넉백을 이만큼만 받는다
  scale: 1.6, // 그려지는 크기
};

/** 구역이 깊어질수록 적이 강해진다. */
// 구역별 적 능력치 배율 ([z - 1] = z구역). 앞 구역(1·2)도 얕보지 못하게 바닥을 올려 두었다
const ZONE_HP = [1.4, 1.9, 2.15, 2.6, 3.0, 3.35, 3.7, 4.05, 4.4, 4.75];
const ZONE_ATK = [1.3, 1.65, 1.85, 2.15, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4];
const ZONE_DEF = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6];

export function zoneScale(zone: number) {
  const i = Math.max(0, Math.min(ZONE_HP.length - 1, zone - 1));
  return { hp: ZONE_HP[i], atk: ZONE_ATK[i], def: ZONE_DEF[i], xp: 1 + 0.5 * (zone - 1) };
}

/** 인원수가 많을수록 적 체력이 늘어난다. */
export function partyHpScale(players: number) {
  return 1 + 0.8 * (players - 1);
}

// ─── 장비 ────────────────────────────────────────────

export const RARITY: Record<Rarity, { name: string; color: string; mult: number; weight: number }> = {
  common: { name: '일반', color: '#d8d8d8', mult: 1, weight: 60 },
  rare: { name: '희귀', color: '#4aa3ff', mult: 1.6, weight: 28 },
  epic: { name: '영웅', color: '#c061ff', mult: 2.4, weight: 10 },
  legendary: { name: '전설', color: '#ffa020', mult: 3.6, weight: 2 },
};

const MATERIALS = ['낡은', '강철', '미스릴', '용비늘', '군주의', '늪지기의', '사막왕의', '수정', '망령의', '마왕의'];
const ACCESSORY_NOUNS = ['반지', '부적', '목걸이'];

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

export function makeItem(id: number, zone: number, rng: () => number, weights?: Record<Rarity, number>): Item {
  const slots: Slot[] = ['weapon', 'armor', 'accessory'];
  const slot = slots[Math.floor(rng() * slots.length)];
  const rarity = rollRarity(rng, weights);
  const m = RARITY[rarity].mult;
  const v = () => 0.85 + rng() * 0.3;
  const stats: ItemStats = {};
  let noun: string | undefined;
  const attrRoll = (scale: number) => Math.max(1, Math.round((1 + zone * 1.5) * scale * m * v()));
  const randomAttr = (keys: AttrKey[]) => keys[Math.floor(rng() * keys.length)];

  if (slot === 'weapon') {
    stats.atk = Math.round((3 + zone * 4) * m * v());
    // 희귀 이상 무기에는 공격 능력치가 붙는다
    if (rarity !== 'common') stats[randomAttr(['str', 'dex', 'int'])] = attrRoll(0.6);
    if (rarity === 'legendary') stats.crit = 0.05;
  } else if (slot === 'armor') {
    stats.def = Math.round((1.5 + zone * 2) * m * v());
    stats.vit = attrRoll(1);
    noun = '갑옷';
  } else {
    stats.crit = Math.round((0.02 + 0.01 * zone) * m * v() * 100) / 100;
    const first = randomAttr(ATTR_KEYS);
    stats[first] = attrRoll(1.2);
    // 영웅 이상 장신구는 능력치가 하나 더 붙는다
    if (rarity === 'epic' || rarity === 'legendary') {
      const second = randomAttr(ATTR_KEYS.filter((k) => k !== first));
      stats[second] = attrRoll(0.8);
    }
    noun = ACCESSORY_NOUNS[Math.floor(rng() * ACCESSORY_NOUNS.length)];
  }
  return { id, slot, rarity, zone, noun, stats };
}

export function itemName(item: Item, cls: ClassId): string {
  if (item.title) return item.title;
  const mat = MATERIALS[Math.min(item.zone, MATERIALS.length) - 1];
  return `${mat} ${item.noun ?? CLASSES[cls].weaponNoun}`;
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

