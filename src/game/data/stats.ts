// 능력치(힘·민첩·지능·체력)와 전투 수치 계산, 레벨업 경험치.
import type { AttrKey, Attrs, ClassId, Item, ItemStats, Stats } from '../types';
import { CLASSES } from './classes';

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
  intCdr: 0.008, // 지능 1당 스킬 재사용 가속 (최대 CDR_MAX)
  intHeal: 0.01, // 지능 1당 회복량 증가
  intMp: 3, // 지능 1당 최대 MP
  intMpRegen: 0.03, // 지능 1당 초당 MP 회복
};

/** 회피 확률 상한 (민첩을 아무리 올려도 이 이상은 피하지 못한다) */
export const DODGE_MAX = 0.25;
/** 스킬 가속 상한 (+100% = 재사용 대기시간 절반). 지능 장비를 겹쳐도 스킬을 끝없이 쓰지 못하게 */
export const CDR_MAX = 1;

export const ATTR_DESC: Record<AttrKey, string> = {
  str: '검사·수호자 공격력, 방어',
  dex: '궁수·로그 공격력, 치명타, 공격 속도, 회피',
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
    atk: Math.round(def.bonus.atk + attrs[def.atkAttr ?? def.mainAttr] * e.mainAtk + sum('atk')),
    def: Math.round(def.bonus.def + attrs.vit * e.vitDef + attrs.str * e.strDef + sum('def')),
    crit: Math.min(0.75, def.bonus.crit + attrs.dex * e.dexCrit + sum('crit')),
    haste: attrs.dex * e.dexHaste,
    dodge: Math.min(DODGE_MAX, attrs.dex * e.dexDodge),
    cdr: Math.min(CDR_MAX, attrs.int * e.intCdr),
    maxMp: Math.round(def.bonus.mp + attrs.int * e.intMp + (level - 1) * def.bonus.mpLv),
    mpRegen: def.bonus.mpRegen + attrs.int * e.intMpRegen,
  };
}

/** 다음 레벨까지 필요한 경험치 */
export function xpForLevel(level: number): number {
  return Math.round(40 * Math.pow(level, 1.6));
}
