// 직업: 기본 능력치, 레벨업 성장, 기본 공격, 스킬 4개와 스킬 세부 수치.
import type { AttrKey, Attrs, ClassId } from '../types';

/** 직업의 기본 공격: 근접(부채꼴 베기) 또는 투사체(화살·마법 구체) */
export type AttackDef =
  | {
      kind: 'melee';
      cd: number; // 공격 간격(초)
      mult: number; // 공격력 배율
      range: number; // 몸 중심에서 닿는 거리
      arc: number; // 조준 방향 기준 좌우 각도(라디안)
      knock: number; // 맞은 적을 밀어내는 세기
    }
  | {
      kind: 'projectile';
      cd: number; // 공격 간격(초)
      mult: number; // 공격력 배율
      speed: number; // 날아가는 속도 (px/초)
      proj: 'arrow' | 'orb'; // 투사체 모양
      range: number; // 최대 비행 거리
      aoe: number; // 0보다 크면 터지면서 범위 피해
      arcHeight: number; // 포물선 최고 높이 (보이는 효과)
      // 자동 조준: 쏠 때 조준 방향 좌우 cone(라디안) 안·사거리 안의 보이는 적을 골라 그쪽으로 쏘고,
      // 날아가는 동안 초당 turn(라디안)까지 그 적을 따라 휜다. 없으면 조준 방향 그대로 날아간다
      assist?: { cone: number; turn: number };
    };

/** 스킬 하나의 이름·비용 (세부 수치는 SKILL) */
export interface SkillDef {
  name: string; // 스킬 이름
  cd: number; // 재사용 대기시간(초)
  mp: number; // 1레벨 소모 MP. 위력이 클수록 많이 든다. 레벨이 오르면 늘어난다 (skillMpCost)
  unlock: number; // 배우는 레벨
  desc: string; // 설명 (스킬 바 툴팁·로비 카드)
}

/** 스킬 소모 MP가 레벨당 늘어나는 비율. 레벨이 오르며 최대 MP·회복이 느는 만큼 스킬도 비싸져 마구 쓰지 못하게 한다 */
export const SKILL_MP_PER_LEVEL = 0.03;

/** 이 레벨에서 스킬 하나의 소모 MP (1레벨은 SkillDef.mp 그대로, 레벨당 +3%) */
export function skillMpCost(sk: SkillDef, level: number) {
  return Math.round(sk.mp * (1 + SKILL_MP_PER_LEVEL * (level - 1)));
}

/** 스킬을 배우는 레벨. 마지막이 최종 스킬. */
export const SKILL_UNLOCKS = [1, 4, 7, 10];

/** 직업 하나의 모든 설정 */
export interface ClassDef {
  name: string; // 직업 이름 (검사·수호자·궁수·마법사)
  race: string; // 종족 (휴먼·드워프·엘프·노움)
  color: number; // 파티 패널·지도 점 색
  r: number; // 충돌 반지름
  height: number; // 키 (머리 위 이름표 위치 기준, 월드 px)
  speed: number; // 이동 속도 (px/초)
  aggro: number; // 적이 이 직업을 노릴 때 거리 배율. 작을수록 더 잘 노려진다.
  mainAttr: AttrKey; // 주 능력치 (★ 표시, 레벨업마다 많이 오른다)
  atkAttr?: AttrKey; // 공격력이 오르는 능력치 (없으면 주 능력치). 수호자는 주 능력치가 체력이지만 공격은 힘으로 오른다
  attrs: Attrs; // 1레벨 능력치
  attrGrowth: Attrs; // 레벨업마다 자동으로 오르는 능력치
  bonus: { hp: number; atk: number; def: number; crit: number; mp: number; mpLv: number; mpRegen: number }; // 능력치와 별개인 직업 기본값
  attack: AttackDef; // 기본 공격
  skills: SkillDef[]; // 4개, SKILL_UNLOCKS 레벨에 하나씩 배운다
  passive: { name: string; desc: string }; // 패시브 스킬 (1레벨부터 항상 켜져 있다. 수치는 PASSIVE, 지금 효과 글은 passiveText)
  weaponNoun: string; // 무기 이름 (이름이 없는 옛 장비를 보여줄 때만 쓴다)
  desc: string; // 로비 카드 설명
}

export const CLASSES: Record<ClassId, ClassDef> = {
  swordsman: {
    name: '검사', race: '휴먼', color: 0x4a90e2, r: 12, height: 50, speed: 170, aggro: 1,
    mainAttr: 'str',
    attrs: { str: 10, dex: 5, int: 3, vit: 7 },
    attrGrowth: { str: 1.25, dex: 0.5, int: 0, vit: 0.75 },
    bonus: { hp: 56, atk: 6, def: 1, crit: 0.056, mp: 50, mpLv: 4, mpRegen: 1.5 },
    attack: { kind: 'melee', cd: 0.32, mult: 1.0, range: 62, arc: 1.0, knock: 200 },
    skills: [
      { name: '돌진 베기', cd: 5, mp: 10, unlock: 1, desc: '조준 방향으로 돌진하며 지나가는 적을 벤다. 돌진 중 무적.' },
      { name: '회오리 베기', cd: 7, mp: 20, unlock: 4, desc: '제자리에서 회전하며 주변의 모든 적을 벤다.' },
      { name: '전투 함성', cd: 18, mp: 30, unlock: 7, desc: '주변 동료와 자신의 공격력을 8초간 25% 올린다.' },
      { name: '검기 폭풍', cd: 20, mp: 60, unlock: 10, desc: '거대한 검기를 날려 일직선의 모든 적을 베어 버린다.' },
    ],
    passive: { name: '흡혈 베기', desc: '기본 공격으로 준 피해의 일부만큼 HP를 회복한다. 레벨이 오를수록 늘어난다.' },
    weaponNoun: '장검',
    desc: '빠른 연속 베기. 균형 잡힌 능력치.',
  },
  dwarf: {
    name: '수호자', race: '드워프', color: 0xd08040, r: 15, height: 40, speed: 150, aggro: 0.5,
    // 수호자: 주 능력치는 체력(최대 HP·방어), 공격력은 힘으로 오른다. 포인트를 힘에 주면 공격형, 체력에 주면 탱커형
    mainAttr: 'vit',
    atkAttr: 'str',
    attrs: { str: 9, dex: 2, int: 2, vit: 12 },
    attrGrowth: { str: 0.75, dex: 0.25, int: 0.25, vit: 1.25 },
    bonus: { hp: 104, atk: 4, def: 4.65, crit: 0.018, mp: 60, mpLv: 4, mpRegen: 1.5 },
    attack: { kind: 'melee', cd: 0.6, mult: 1.4, range: 58, arc: 1.3, knock: 380 },
    skills: [
      { name: '도발', cd: 12, mp: 15, unlock: 1, desc: '주변 적의 시선을 끌고 4초간 받는 피해 60% 감소.' },
      { name: '대지 강타', cd: 8, mp: 20, unlock: 4, desc: '땅을 내리쳐 주변 적에게 피해를 주고 기절시킨다.' },
      { name: '방패 돌진', cd: 9, mp: 25, unlock: 7, desc: '방패를 앞세워 돌진하며 부딪힌 적을 날려 보내고 기절시킨다.' },
      { name: '산의 수호', cd: 30, mp: 70, unlock: 10, desc: '주변 동료가 6초간 받는 피해를 절반으로 줄이고 체력을 20% 회복시킨다.' },
    ],
    passive: { name: '강철 피부', desc: '맞아도 덜 밀려나고, 레벨이 오를수록 받는 피해가 줄어든다.' },
    weaponNoun: '전투도끼',
    desc: '튼튼한 몸과 강한 넉백. 적이 우선적으로 노린다.',
  },
  elf: {
    name: '궁수', race: '엘프', color: 0x4caf50, r: 11, height: 56, speed: 180, aggro: 1.2,
    mainAttr: 'dex',
    attrs: { str: 4, dex: 12, int: 4, vit: 5 },
    attrGrowth: { str: 0.25, dex: 1.5, int: 0.25, vit: 0.25 }, // 연발 사격(화살 여러 발)이 있어 다른 직업보다 성장을 낮게
    bonus: { hp: 42, atk: 4.2, def: 1, crit: 0.106, mp: 55, mpLv: 5, mpRegen: 1.8 },
    attack: { kind: 'projectile', cd: 0.42, mult: 0.75, speed: 520, proj: 'arrow', range: 480, aoe: 0, arcHeight: 60, assist: { cone: 0.7, turn: 6 } },
    skills: [
      { name: '부채 사격', cd: 6, mp: 12, unlock: 1, desc: '적을 관통하는 화살 5발을 부채꼴로 쏜다.' },
      { name: '저격', cd: 6, mp: 18, unlock: 4, desc: '멀리까지 꿰뚫는 강력한 화살 한 발. 공격력 3배.' },
      { name: '화살비', cd: 12, mp: 35, unlock: 7, desc: '조준한 곳에 화살을 비처럼 쏟아붓는다.' },
      { name: '폭풍의 화살', cd: 20, mp: 60, unlock: 10, desc: '사방으로 관통하는 화살 16발을 동시에 쏜다.' },
    ],
    passive: { name: '연발 사격', desc: '기본 공격 한 번에 화살을 여러 발 쏜다. 레벨이 오르면 화살이 늘어난다. 더 쏜 화살은 다른 적을 노린다.' },
    weaponNoun: '장궁',
    desc: '포물선을 그리며 멀리 날아가는 화살. 치명타 확률이 높다.',
  },
  gnome: {
    name: '마법사', race: '노움', color: 0x9c5bd6, r: 10, height: 32, speed: 160, aggro: 1.2,
    mainAttr: 'int',
    attrs: { str: 3, dex: 4, int: 13, vit: 5 },
    attrGrowth: { str: 0, dex: 0, int: 2.75, vit: 0.25 },
    bonus: { hp: 40, atk: 6.4, def: 0.75, crit: 0.044, mp: 40, mpLv: 6, mpRegen: 1.8 },
    attack: { kind: 'projectile', cd: 0.75, mult: 1.2, speed: 340, proj: 'orb', range: 340, aoe: 70, arcHeight: 0 },
    skills: [
      { name: '치유의 빛', cd: 14, mp: 25, unlock: 1, desc: '주변 동료를 30% 회복하고 쓰러진 동료를 일으킨다.' },
      { name: '냉기 파동', cd: 8, mp: 20, unlock: 4, desc: '주변에 냉기를 퍼뜨려 피해를 주고 3초간 느리게 만든다.' },
      { name: '화염구', cd: 6, mp: 30, unlock: 7, desc: '크게 폭발하는 불덩이를 던진다. 공격력 2.5배.' },
      { name: '메테오', cd: 25, mp: 80, unlock: 10, desc: '조준한 곳에 거대한 운석을 떨어뜨린다. 공격력 5배.' },
    ],
    passive: { name: '마나 순환', desc: '적을 쓰러뜨릴 때마다 최대 MP의 일부를 회복한다. 레벨이 오를수록 늘어난다.' },
    weaponNoun: '지팡이',
    desc: '터지는 마법 구체로 여러 적에게 피해를 준다.',
  },
};

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

// ─── 패시브 스킬 ──────────────────────────────────────

/** 패시브 스킬 수치 (설명 글은 CLASSES.*.passive) */
export const PASSIVE = {
  // 검사 흡혈 베기: 기본 공격 피해의 %. 1레벨 base%, everyLevels 레벨마다 +1%, 최대 max%
  lifesteal: { base: 1, everyLevels: 5, max: 10 },
  // 수호자 강철 피부: 받는 피해 everyLevels 레벨마다 −1% (1레벨 0%), 최대 max%. 맞았을 때 밀려나는 거리 × knock (항상)
  ironSkin: { everyLevels: 5, max: 10, knock: 0.5 },
  // 궁수 연발 사격: 이 레벨들에 이를 때마다 기본 공격 화살이 1발씩 는다. spread = 짝 없는 화살의 벌어짐(라디안)
  multiShot: { levels: [1, 5, 10], spread: 0.14 },
  // 마법사 마나 순환: 적을 쓰러뜨리면 최대 MP의 %. everyLevels 레벨마다 +1% (1레벨 0%), 최대 max%
  manaFlow: { everyLevels: 5, max: 10 },
};

/** 검사 흡혈 베기: 기본 공격 피해 중 HP로 돌아오는 비율 (0.01 = 1%) */
export function lifestealRate(level: number) {
  const l = PASSIVE.lifesteal;
  return Math.min(l.max, l.base + Math.floor(level / l.everyLevels)) / 100;
}

/** 수호자 강철 피부: 받는 피해가 줄어드는 비율 (0.01 = 1%) */
export function ironSkinRate(level: number) {
  const r = PASSIVE.ironSkin;
  return Math.min(r.max, Math.floor(level / r.everyLevels)) / 100;
}

/** 궁수 연발 사격: 기본 공격 한 번에 쏘는 화살 수 */
export function arrowCount(level: number) {
  return PASSIVE.multiShot.levels.filter((lv) => level >= lv).length;
}

/** 마법사 마나 순환: 적을 쓰러뜨렸을 때 회복하는 최대 MP 비율 (0.01 = 1%) */
export function manaFlowRate(level: number) {
  const m = PASSIVE.manaFlow;
  return Math.min(m.max, Math.floor(level / m.everyLevels)) / 100;
}

/** 이 레벨에서 패시브의 지금 효과 (화면 표시용 짧은 글) */
export function passiveText(cls: ClassId, level: number): string {
  switch (cls) {
    case 'swordsman':
      return `기본 공격 피해의 ${Math.round(lifestealRate(level) * 100)}% 흡혈`;
    case 'dwarf':
      return `받는 피해 −${Math.round(ironSkinRate(level) * 100)}%, 밀려남 −${Math.round((1 - PASSIVE.ironSkin.knock) * 100)}%`;
    case 'elf':
      return `기본 공격 화살 ${arrowCount(level)}발`;
    case 'gnome':
      return `처치 시 최대 MP의 ${Math.round(manaFlowRate(level) * 100)}% 회복`;
  }
}

/** 패시브가 레벨에 따라 어떻게 늘어나는지 (로비 카드·README용 짧은 글) */
export function passiveGrowthText(cls: ClassId): string {
  const l = PASSIVE.lifesteal, m = PASSIVE.manaFlow;
  switch (cls) {
    case 'swordsman':
      return `기본 공격 피해의 ${l.base}% 흡혈, ${l.everyLevels}레벨마다 +1% (최대 ${l.max}%)`;
    case 'dwarf':
      return `받는 피해 ${PASSIVE.ironSkin.everyLevels}레벨마다 −1% (최대 ${PASSIVE.ironSkin.max}%), 밀려남 −${Math.round((1 - PASSIVE.ironSkin.knock) * 100)}%`;
    case 'elf':
      return `기본 공격 화살 ${PASSIVE.multiShot.levels.map((lv, i) => `Lv${lv} ${i + 1}발`).join(' · ')}`;
    case 'gnome':
      return `처치 시 최대 MP의 ${m.everyLevels}레벨마다 +1% 회복 (최대 ${m.max}%)`;
  }
}
