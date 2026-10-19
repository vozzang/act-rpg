// 대장간: 조합 값, 조합법(정해진 재료 → 전설 장비), 랜덤 조합 결과 등급.
import type { Item, Rarity } from '../types';
import { itemDef, itemFromDef, zoneTier } from './gear';

/** 대장간: 장비 2~3개를 넣어 조합한다. 값(fee)은 대장간이 있는 구역 × feePerZone */
export const FORGE = { min: 2, max: 3, feePerZone: 15 };

/** 조합법 재료는 아이템 목록의 정확한 키로 지정한다 */
export interface RecipeNeed {
  key: string;
}

/** 조합법: 지정된 대장간에서 정확한 재료를 넣으면 고정된 아이템이 나온다 */
export interface Recipe {
  zone: number; // 이 조합법을 사용할 수 있는 대장간 구역
  resultKey: string; // 결과 장비 키 (items.ts)
  needs: RecipeNeed[]; // 재료 (개수와 종류가 정확히 맞아야 한다)
}

type RecipePlan = { resultKey: string; materials: string[] };

const AREA_RECIPES: { zone: number; plans: RecipePlan[] }[] = [
  {
    zone: 2,
    plans: [
      { resultKey: 'giant1', materials: ['greatsword', 'sword'] },
      { resultKey: 'wind1', materials: ['longbow', 'bow'] },
      { resultKey: 'sage1', materials: ['staff', 'wand'] },
      { resultKey: 'trinity1', materials: ['greatsword', 'longbow', 'staff'] },
      { resultKey: 'guardian1', materials: ['armor', 'plate'] },
      { resultKey: 'life1', materials: ['amulet', 'necklace'] },
      { resultKey: 'fatal1', materials: ['ring', 'greatsword'] },
      { resultKey: 'hero1', materials: ['ring', 'amulet', 'necklace'] },
      { resultKey: 'hammer1', materials: ['sword', 'wand', 'armor'] },
      { resultKey: 'bulwark1', materials: ['plate', 'leather', 'armor'] },
    ],
  },
  {
    zone: 4,
    plans: [
      { resultKey: 'giant2', materials: ['greatsword', 'plate'] },
      { resultKey: 'wind2', materials: ['longbow', 'ring'] },
      { resultKey: 'sage2', materials: ['staff', 'amulet'] },
      { resultKey: 'trinity2', materials: ['sword', 'bow', 'wand'] },
      { resultKey: 'guardian2', materials: ['plate', 'leather'] },
      { resultKey: 'life2', materials: ['amulet', 'robe'] },
      { resultKey: 'fatal2', materials: ['ring', 'greatsword', 'bow'] },
      { resultKey: 'hero2', materials: ['necklace', 'armor'] },
      { resultKey: 'hammer2', materials: ['greatsword', 'wand', 'robe'] },
      { resultKey: 'bulwark2', materials: ['armor', 'plate', 'ring'] },
    ],
  },
  {
    zone: 6,
    plans: [
      { resultKey: 'giant3', materials: ['greatsword', 'ring'] },
      { resultKey: 'wind3', materials: ['longbow', 'amulet'] },
      { resultKey: 'sage3', materials: ['staff', 'robe'] },
      { resultKey: 'trinity3', materials: ['sword', 'longbow', 'wand'] },
      { resultKey: 'guardian3', materials: ['armor', 'necklace'] },
      { resultKey: 'life3', materials: ['amulet', 'leather'] },
      { resultKey: 'fatal3', materials: ['ring', 'plate'] },
      { resultKey: 'hero3', materials: ['necklace', 'bow', 'amulet'] },
      { resultKey: 'hammer3', materials: ['staff', 'armor', 'wand'] },
      { resultKey: 'bulwark3', materials: ['plate', 'leather', 'necklace'] },
    ],
  },
  {
    zone: 8,
    plans: [
      { resultKey: 'giant4', materials: ['greatsword', 'amulet'] },
      { resultKey: 'wind4', materials: ['longbow', 'plate'] },
      { resultKey: 'sage4', materials: ['staff', 'ring'] },
      { resultKey: 'trinity4', materials: ['greatsword', 'bow', 'wand'] },
      { resultKey: 'guardian4', materials: ['armor', 'robe'] },
      { resultKey: 'life4', materials: ['amulet', 'ring'] },
      { resultKey: 'fatal4', materials: ['ring', 'necklace'] },
      { resultKey: 'hero4', materials: ['necklace', 'plate'] },
      { resultKey: 'hammer4', materials: ['staff', 'sword', 'armor'] },
      { resultKey: 'bulwark4', materials: ['plate', 'leather', 'amulet'] },
    ],
  },
  {
    zone: 10,
    plans: [
      { resultKey: 'giant5', materials: ['greatsword', 'necklace'] },
      { resultKey: 'wind5', materials: ['longbow', 'robe'] },
      { resultKey: 'sage5', materials: ['staff', 'plate'] },
      { resultKey: 'trinity5', materials: ['sword', 'longbow', 'wand'] },
      { resultKey: 'guardian5', materials: ['armor', 'amulet'] },
      { resultKey: 'life5', materials: ['amulet', 'bow'] },
      { resultKey: 'fatal5', materials: ['ring', 'staff'] },
      { resultKey: 'hero5', materials: ['necklace', 'greatsword', 'ring'] },
      { resultKey: 'hammer5', materials: ['greatsword', 'robe', 'wand'] },
      { resultKey: 'bulwark5', materials: ['plate', 'leather', 'ring'] },
    ],
  },
];

export const RECIPES: Recipe[] = AREA_RECIPES.flatMap(({ zone, plans }) => {
  const tier = zoneTier(zone);
  return plans.map(({ resultKey, materials }) => ({
    zone,
    resultKey,
    needs: materials.map((key) => ({ key: `${key}${tier}` })),
  }));
});

export const MAX_RECIPES_PER_FORGE = Math.max(...AREA_RECIPES.map(({ plans }) => plans.length));

export function recipesForZone(zone: number): Recipe[] {
  return RECIPES.filter((recipe) => recipe.zone === zone);
}

/** 결과 장비의 현재 이름 (아이템 목록을 이름의 기준으로 삼는다) */
export function recipeName(r: Recipe): string {
  const def = itemDef(r.resultKey);
  if (!def) throw new Error(`Unknown forge recipe result item: ${r.resultKey}`);
  return def.name;
}

/** 재료 설명은 아이템 목록의 현재 이름을 사용한다 */
export function recipeText(r: Recipe) {
  return r.needs.map(({ key }) => {
    const def = itemDef(key);
    if (!def) throw new Error(`Unknown forge recipe material item: ${key}`);
    return def.name;
  }).join(' + ');
}

/** 해당 대장간의 조합법 중 고른 장비 키가 정확히 일치하는 조합법 */
export function matchRecipe(items: Item[], zone: number): Recipe | null {
  const fits = (r: Recipe) => {
    if (r.needs.length !== items.length) return false;
    const left = [...items];
    for (const n of r.needs) {
      const i = left.findIndex((it) => it.key === n.key);
      if (i < 0) return false;
      left.splice(i, 1);
    }
    return true;
  };
  return recipesForZone(zone).find(fits) ?? null;
}

/** 조합법에 지정된 결과 장비 */
export function recipeItem(r: Recipe, id: number): Item {
  const def = itemDef(r.resultKey);
  if (!def) throw new Error(`Unknown forge recipe result item: ${r.resultKey}`);
  return itemFromDef(def, id);
}

/** 랜덤 조합 결과 등급: 재료 중 가장 좋은 등급에서 시작해 재료가 많을수록, 같은 등급끼리일수록 한 단계 오를 확률이 크다 */
export function randomForgeRarity(items: Item[], rng: () => number): Rarity {
  const order: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
  const best = Math.max(...items.map((it) => order.indexOf(it.rarity)));
  const same = items.every((it) => it.rarity === items[0].rarity);
  const up = (items.length >= 3 ? 0.55 : 0.25) + (same ? 0.15 : 0);
  return order[Math.min(order.length - 1, best + (rng() < up ? 1 : 0))];
}
