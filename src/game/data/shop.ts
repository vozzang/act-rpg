// 상점과 아이템 상자: 회복 음식, 상자·가방 칸 수, 상점 종류와 고정 판매 목록, 값.
import type { Rarity, ShopEntry, ShopType } from '../types';
import { itemDef, itemFromDef, zoneTier } from './gear';

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
  itemPrice: { common: 25, rare: 55, epic: 110, legendary: 240 } as Record<Rarity, number>,
  // 상점 장비는 필드 드랍보다 좋은 등급이 잘 나온다
  rarityWeight: { common: 30, rare: 47, epic: 21, legendary: 2 } as Record<Rarity, number>, // 중간보스·문지기 확정 드랍의 등급 확률
};

/** 상점 종류별 이름과 표시 색 */
export const SHOP_TYPES: Record<ShopType, { name: string; color: number }> = {
  heal: { name: '회복 상점', color: 0x50d070 },
  attack: { name: '공격 상점', color: 0xff6040 },
  defense: { name: '방어 상점', color: 0x5aa8ff },
  forge: { name: '대장간', color: 0xffa040 },
};

/** 상점 판매 목록 (items.ts의 기본 장비 키, 단계 숫자 없이). 그 지점 구역의 단계 장비를 판다 */
const SHOP_ITEMS: Record<'attack' | 'defense', string[]> = {
  attack: ['greatsword', 'longbow', 'staff', 'ring'],
  defense: ['armor', 'plate', 'amulet'],
};

/** 상점의 고정 판매 목록 (매 판 같다). nextId로 장비 id를 받는다 */
export function shopStock(type: ShopType, zone: number, nextId: () => number): ShopEntry[] {
  if (type === 'forge') return []; // 대장간은 파는 물건이 없다
  if (type === 'heal') return [{ kind: 'hpFood', price: SHOP.foodPrice, sold: false }, { kind: 'mpFood', price: SHOP.foodPrice, sold: false }];
  return SHOP_ITEMS[type].map((k) => {
    const item = itemFromDef(itemDef(`${k}${zoneTier(zone)}`)!, nextId());
    // 값은 장비 단계 기준 (같은 단계 장비는 어느 지점에서 사든 같은 값)
    return { kind: 'item', item, price: shopItemPrice(item.rarity, item.zone), sold: false, buyers: [] };
  });
}

/** 구역이 깊을수록 장비 값이 오른다 */
export function shopItemPrice(rarity: Rarity, zone: number) {
  return Math.round(SHOP.itemPrice[rarity] * (1 + 0.6 * (zone - 1)));
}
