// 대장간: 조합 값, 조합법(정해진 재료 → 전설 장비), 랜덤 조합 결과 등급.
import type { Item, Rarity, Slot } from '../types';
import { itemDef, itemFromDef, zoneTier } from './gear';

/** 대장간: 장비 2~3개를 넣어 조합한다. 값(fee)은 대장간이 있는 구역 × feePerZone */
export const FORGE = { min: 2, max: 3, feePerZone: 15 };

/** 조합법 재료: noun으로 장비 이름(대검·반지 등)을, slot으로 종류(무기·방어구·장신구)를 맞춘다 */
export interface RecipeNeed {
  noun?: string; // 장비 종류 이름이 이것이어야 한다 (예: '대검')
  slot?: Slot; // 장비 종류가 이것이어야 한다 (예: 아무 무기)
}

/** 조합법: 재료가 정확히 맞으면 정해진 고유 장비가 나온다 (items.ts의 `${key}${단계}` — 재료 중 가장 깊은 단계) */
export interface Recipe {
  key: string; // 결과 장비 키 (단계 숫자 없이)
  title: string; // 만들어지는 장비 이름
  needs: RecipeNeed[]; // 재료 (개수와 종류가 정확히 맞아야 한다)
}

export const RECIPES: Recipe[] = [
  { key: 'giant', title: '거인의 대검', needs: [{ noun: '대검' }, { noun: '대검' }] },
  { key: 'wind', title: '바람의 장궁', needs: [{ noun: '장궁' }, { noun: '장궁' }] },
  { key: 'sage', title: '현자의 지팡이', needs: [{ noun: '지팡이' }, { noun: '지팡이' }] },
  { key: 'trinity', title: '삼위일체의 검', needs: [{ noun: '대검' }, { noun: '장궁' }, { noun: '지팡이' }] },
  { key: 'guardian', title: '수호자의 판금', needs: [{ noun: '갑옷' }, { noun: '판금 갑옷' }] },
  { key: 'life', title: '생명의 부적', needs: [{ noun: '부적' }, { noun: '부적' }] },
  { key: 'fatal', title: '치명의 반지', needs: [{ noun: '반지' }, { noun: '반지' }] },
  { key: 'hero', title: '용사의 목걸이', needs: [{ noun: '반지' }, { noun: '부적' }] },
  { key: 'hammer', title: '무쇠 대장장이의 망치', needs: [{ slot: 'weapon' }, { slot: 'weapon' }, { slot: 'weapon' }] },
  { key: 'bulwark', title: '철벽의 갑주', needs: [{ slot: 'armor' }, { slot: 'armor' }, { slot: 'armor' }] },
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
      const i = left.findIndex((it) => (n.noun ? it.noun === n.noun : true) && (n.slot ? it.slot === n.slot : true));
      if (i < 0) return false;
      left.splice(i, 1);
    }
    return true;
  };
  const named = (r: Recipe) => r.needs.filter((n) => n.noun).length;
  return [...RECIPES].sort((a, b) => named(b) - named(a)).find(fits) ?? null;
}

/** 조합법으로 만드는 장비: 목록(ITEM_LIST)의 그 조합법 결과 중 zone이 속한 단계의 것 */
export function recipeItem(r: Recipe, zone: number, id: number): Item {
  return itemFromDef(itemDef(`${r.key}${zoneTier(zone)}`)!, id);
}

/** 랜덤 조합 결과 등급: 재료 중 가장 좋은 등급에서 시작해 재료가 많을수록, 같은 등급끼리일수록 한 단계 오를 확률이 크다 */
export function randomForgeRarity(items: Item[], rng: () => number): Rarity {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const best = Math.max(...items.map((it) => order.indexOf(it.rarity)));
  const same = items.every((it) => it.rarity === items[0].rarity);
  const up = (items.length >= 3 ? 0.55 : 0.25) + (same ? 0.15 : 0);
  return order[Math.min(order.length - 1, best + (rng() < up ? 1 : 0))];
}
