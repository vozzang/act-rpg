// 밸런스 데이터. 수치 조정은 대부분 이 파일에서 하면 된다.
// 거리·속도는 월드 좌표(px) 기준이다. 타일 한 칸(TILE = 32)이 3D 화면에서 1칸 크기의 블록이 된다.
import type { AttrKey, Attrs, ClassId, EnemyKind, Item, ItemStats, Rarity, Slot, Stats } from './types';

export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 544;
export const TICK_RATE = 60;
export const SNAPSHOT_EVERY = 3; // 60/3 = 초당 20회 전송
export const REVIVE_TIME = 2;
export const ZONE_NAMES = ['초록 숲', '고블린 협곡', '얼어붙은 설원', '오크 요새', '불타는 화산'];

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
    attrs: { str: 10, dex: 6, int: 3, vit: 8 },
    attrGrowth: { str: 2, dex: 1, int: 0, vit: 1.5 },
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
    attrs: { str: 9, dex: 3, int: 2, vit: 12 },
    attrGrowth: { str: 1.5, dex: 0.5, int: 0, vit: 2.5 },
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
    attrs: { str: 4, dex: 11, int: 4, vit: 6 },
    attrGrowth: { str: 0.5, dex: 2.5, int: 0.5, vit: 1 },
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
    attrs: { str: 2, dex: 4, int: 12, vit: 5 },
    attrGrowth: { str: 0, dex: 0.5, int: 3, vit: 1 },
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
  dexHaste: 0.005, // 민첩 1당 공격 속도
  intCdr: 0.008, // 지능 1당 스킬 재사용 가속
  intHeal: 0.01, // 지능 1당 회복량 증가
  intMp: 3, // 지능 1당 최대 MP
  intMpRegen: 0.05, // 지능 1당 초당 MP 회복
};

export const ATTR_DESC: Record<AttrKey, string> = {
  str: '근접 공격력, 방어',
  dex: '원거리 공격력, 치명타, 공격 속도',
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
  boss: { name: '흑룡', ai: 'boss', r: 40, height: 110, hp: 3600, atk: 58, def: 13, speed: 85, xp: 0, gold: 0, dropRate: 1 },
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

export const SHOP = {
  range: 80, // 상인과 이 거리 안에 있어야 살 수 있다
  foodPrice: 20,
  items: 3, // 상점마다 파는 장비 수
  itemPrice: { common: 25, rare: 55, epic: 110, legendary: 240 } as Record<Rarity, number>,
  // 상점 장비는 필드 드랍보다 좋은 등급이 잘 나온다
  rarityWeight: { common: 30, rare: 45, epic: 20, legendary: 5 } as Record<Rarity, number>,
};

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
  [{ kind: 'goblin', name: '고블린 대장', hp: 300, atk: 17, def: 5 }, { kind: 'skeleton', name: '해골 저격수', hp: 280, atk: 16, def: 4 }],
  [{ kind: 'skeleton', name: '해골 저격수', hp: 340, atk: 18, def: 5 }, { kind: 'orc', name: '오크 광전사', hp: 420, atk: 22, def: 8 }],
  [{ kind: 'orc', name: '오크 광전사', hp: 460, atk: 24, def: 9 }, { kind: 'orc', name: '오크 족장', hp: 540, atk: 27, def: 10 }],
  [{ kind: 'orc', name: '용암 광전사', hp: 500, atk: 25, def: 10 }, { kind: 'skeleton', name: '화염 저격수', hp: 420, atk: 22, def: 8 }],
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
  { kind: 'orc', name: '흑룡의 문지기', hp: 620, atk: 26, def: 11 }, // 보스 방 입구. 구역 보정 후에도 흑룡보다 약하게
];

export const ELITE = {
  xp: 6, // 경험치 배율
  gold: 8, // 돈 배율
  knockResist: 0.25, // 넉백을 이만큼만 받는다
  scale: 1.6, // 그려지는 크기
};

/** 구역이 깊어질수록 적이 강해진다. */
// 구역별 적 능력치 배율 ([z - 1] = z구역). 앞 구역(1·2)도 얕보지 못하게 바닥을 올려 두었다
const ZONE_HP = [1.4, 1.95, 2.2, 2.8, 3.3];
const ZONE_ATK = [1.3, 1.7, 1.96, 2.44, 2.75];
const ZONE_DEF = [1, 2, 2, 3, 4];

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

const MATERIALS = ['낡은', '강철', '미스릴', '용비늘', '군주의'];
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
  for (const k of ATTR_KEYS) if (s[k]) parts.push(`${ATTR_NAMES[k]} +${s[k]}`);
  return parts.join(' ');
}

