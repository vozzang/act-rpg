// 아이템 목록: 게임에 나오는 모든 장비. 수치를 바꾸려면 이 표의 숫자를 고치면 된다.
// tier: 구역 묶음 (1: 1·2구역, 2: 3·4구역, 3: 5·6구역, 4: 7·8구역, 5: 9·10구역). 깊은 묶음일수록 재질 이름이 바뀌고 수치가 높다.
// base: 종류 이름 (대장간 조합법 재료로 쓴다), from: 얻는 곳 — drop 몬스터, shop 상점, recipe 대장간 조합법
// (처음 수치는 기존 공식에서 운을 뺀 값으로 만들었다: 무기 공격 = (3 + 4z)·등급배율, 등급배율 일반 1 · 희귀 1.6 · 영웅 2.4 · 전설 3.6)
import type { ItemStats, Rarity, Slot } from './types';

export type ItemSource = 'drop' | 'shop' | 'recipe';

export interface ItemDef {
  key: string;
  name: string;
  base: string;
  slot: Slot;
  rarity: Rarity;
  tier: number;
  from: ItemSource[];
  stats: ItemStats;
}

export const ITEM_LIST: ItemDef[] = [
  // ── 1단계 (1·2구역) · 낡은 ──
  { key: 'sword1', name: '낡은 검', base: '검', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, str: 2 } }, // 일반
  { key: 'bow1', name: '낡은 활', base: '활', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, dex: 2 } }, // 일반
  { key: 'wand1', name: '낡은 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, int: 2 } }, // 일반
  { key: 'leather1', name: '낡은 가죽 갑옷', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 1, from: ['drop'], stats: { def: 4, dex: 2 } }, // 일반
  { key: 'greatsword1', name: '낡은 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, str: 3 } }, // 희귀
  { key: 'longbow1', name: '낡은 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, dex: 3 } }, // 희귀
  { key: 'staff1', name: '낡은 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, int: 3 } }, // 희귀
  { key: 'armor1', name: '낡은 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { def: 7, vit: 5 } }, // 희귀
  { key: 'robe1', name: '낡은 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 1, from: ['drop'], stats: { def: 5, int: 4 } }, // 희귀
  { key: 'ring1', name: '낡은 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { crit: 0.06, atk: 6 } }, // 희귀
  { key: 'amulet1', name: '낡은 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { maxHp: 36, vit: 5 } }, // 희귀
  { key: 'plate1', name: '낡은 판금 갑옷', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 1, from: ['drop', 'shop'], stats: { def: 11, vit: 8, str: 4 } }, // 영웅
  { key: 'necklace1', name: '낡은 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 1, from: ['drop'], stats: { crit: 0.05, str: 4, dex: 4, int: 4 } }, // 영웅
  { key: 'goblinfang', name: '고블린 왕의 송곳니', base: '고블린 왕의 송곳니', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['drop'], stats: { atk: 32, str: 6, dex: 6 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant1', name: '거인의 대검 Ⅰ', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 49, str: 19, crit: 0.05 } }, // 조합법
  { key: 'wind1', name: '바람의 장궁 Ⅰ', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 49, dex: 19, crit: 0.08 } }, // 조합법
  { key: 'sage1', name: '현자의 지팡이 Ⅰ', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 49, int: 19, maxHp: 40 } }, // 조합법
  { key: 'trinity1', name: '삼위일체의 검 Ⅰ', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 55, str: 12, dex: 12, int: 12 } }, // 조합법
  { key: 'guardian1', name: '수호자의 판금 Ⅰ', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { def: 26, vit: 18, str: 8 } }, // 조합법
  { key: 'life1', name: '생명의 부적 Ⅰ', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { maxHp: 146, vit: 14 } }, // 조합법
  { key: 'fatal1', name: '치명의 반지 Ⅰ', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { crit: 0.23, atk: 16 } }, // 조합법
  { key: 'hero1', name: '용사의 목걸이 Ⅰ', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 16, def: 8, crit: 0.13, maxHp: 81 } }, // 조합법
  { key: 'hammer1', name: '무쇠 대장장이의 망치 Ⅰ', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { atk: 45, str: 12, vit: 12 } }, // 조합법
  { key: 'bulwark1', name: '철벽의 갑주 Ⅰ', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 1, from: ['recipe'], stats: { def: 24, vit: 15, maxHp: 81 } }, // 조합법
  // ── 2단계 (3·4구역) · 강철 ──
  { key: 'sword2', name: '강철 검', base: '검', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 17, str: 4 } }, // 일반
  { key: 'bow2', name: '강철 활', base: '활', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 16, dex: 4 } }, // 일반
  { key: 'wand2', name: '강철 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 16, int: 4 } }, // 일반
  { key: 'leather2', name: '강철 가죽 갑옷', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 2, from: ['drop'], stats: { def: 7, dex: 3 } }, // 일반
  { key: 'greatsword2', name: '강철 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, str: 6 } }, // 희귀
  { key: 'longbow2', name: '강철 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, dex: 6 } }, // 희귀
  { key: 'staff2', name: '강철 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, int: 6 } }, // 희귀
  { key: 'armor2', name: '강철 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { def: 14, vit: 10 } }, // 희귀
  { key: 'robe2', name: '강철 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 2, from: ['drop'], stats: { def: 10, int: 8 } }, // 희귀
  { key: 'ring2', name: '강철 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { crit: 0.09, atk: 11 } }, // 희귀
  { key: 'amulet2', name: '강철 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { maxHp: 84, vit: 10 } }, // 희귀
  { key: 'plate2', name: '강철 판금 갑옷', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 2, from: ['drop', 'shop'], stats: { def: 20, vit: 15, str: 8 } }, // 영웅
  { key: 'necklace2', name: '강철 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 2, from: ['drop'], stats: { crit: 0.08, str: 8, dex: 8, int: 8 } }, // 영웅
  { key: 'frostfang', name: '서리 송곳니', base: '서리 송곳니', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['drop'], stats: { atk: 61, dex: 16, crit: 0.1 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant2', name: '거인의 대검 Ⅱ', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 92, str: 36, crit: 0.05 } }, // 조합법
  { key: 'wind2', name: '바람의 장궁 Ⅱ', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 92, dex: 36, crit: 0.08 } }, // 조합법
  { key: 'sage2', name: '현자의 지팡이 Ⅱ', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 92, int: 36, maxHp: 94 } }, // 조합법
  { key: 'trinity2', name: '삼위일체의 검 Ⅱ', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 104, str: 22, dex: 22, int: 22 } }, // 조합법
  { key: 'guardian2', name: '수호자의 판금 Ⅱ', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { def: 49, vit: 34, str: 16 } }, // 조합법
  { key: 'life2', name: '생명의 부적 Ⅱ', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { maxHp: 340, vit: 27 } }, // 조합법
  { key: 'fatal2', name: '치명의 반지 Ⅱ', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { crit: 0.36, atk: 31 } }, // 조합법
  { key: 'hero2', name: '용사의 목걸이 Ⅱ', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 31, def: 15, crit: 0.2, maxHp: 189 } }, // 조합법
  { key: 'hammer2', name: '무쇠 대장장이의 망치 Ⅱ', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { atk: 86, str: 22, vit: 22 } }, // 조합법
  { key: 'bulwark2', name: '철벽의 갑주 Ⅱ', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 2, from: ['recipe'], stats: { def: 46, vit: 29, maxHp: 189 } }, // 조합법
  // ── 3단계 (5·6구역) · 미스릴 ──
  { key: 'sword3', name: '미스릴 검', base: '검', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 25, str: 6 } }, // 일반
  { key: 'bow3', name: '미스릴 활', base: '활', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 24, dex: 6 } }, // 일반
  { key: 'wand3', name: '미스릴 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 24, int: 6 } }, // 일반
  { key: 'leather3', name: '미스릴 가죽 갑옷', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 3, from: ['drop'], stats: { def: 10, dex: 5 } }, // 일반
  { key: 'greatsword3', name: '미스릴 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, str: 9 } }, // 희귀
  { key: 'longbow3', name: '미스릴 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, dex: 9 } }, // 희귀
  { key: 'staff3', name: '미스릴 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, int: 9 } }, // 희귀
  { key: 'armor3', name: '미스릴 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { def: 20, vit: 15 } }, // 희귀
  { key: 'robe3', name: '미스릴 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 3, from: ['drop'], stats: { def: 14, int: 12 } }, // 희귀
  { key: 'ring3', name: '미스릴 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { crit: 0.12, atk: 16 } }, // 희귀
  { key: 'amulet3', name: '미스릴 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { maxHp: 132, vit: 15 } }, // 희귀
  { key: 'plate3', name: '미스릴 판금 갑옷', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 3, from: ['drop', 'shop'], stats: { def: 30, vit: 22, str: 11 } }, // 영웅
  { key: 'necklace3', name: '미스릴 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 3, from: ['drop'], stats: { crit: 0.11, str: 11, dex: 11, int: 11 } }, // 영웅
  { key: 'flamestaff', name: '화염 군주의 지팡이', base: '화염 군주의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['drop'], stats: { atk: 90, int: 27 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant3', name: '거인의 대검 Ⅲ', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, str: 53, crit: 0.05 } }, // 조합법
  { key: 'wind3', name: '바람의 장궁 Ⅲ', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, dex: 53, crit: 0.08 } }, // 조합법
  { key: 'sage3', name: '현자의 지팡이 Ⅲ', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, int: 53, maxHp: 148 } }, // 조합법
  { key: 'trinity3', name: '삼위일체의 검 Ⅲ', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 153, str: 33, dex: 33, int: 33 } }, // 조합법
  { key: 'guardian3', name: '수호자의 판금 Ⅲ', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { def: 72, vit: 50, str: 23 } }, // 조합법
  { key: 'life3', name: '생명의 부적 Ⅲ', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { maxHp: 535, vit: 40 } }, // 조합법
  { key: 'fatal3', name: '치명의 반지 Ⅲ', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { crit: 0.49, atk: 45 } }, // 조합법
  { key: 'hero3', name: '용사의 목걸이 Ⅲ', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 45, def: 22, crit: 0.27, maxHp: 297 } }, // 조합법
  { key: 'hammer3', name: '무쇠 대장장이의 망치 Ⅲ', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 126, str: 33, vit: 33 } }, // 조합법
  { key: 'bulwark3', name: '철벽의 갑주 Ⅲ', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { def: 68, vit: 43, maxHp: 297 } }, // 조합법
  // ── 4단계 (7·8구역) · 용비늘 ──
  { key: 'sword4', name: '용비늘 검', base: '검', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 33, str: 7 } }, // 일반
  { key: 'bow4', name: '용비늘 활', base: '활', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 31, dex: 7 } }, // 일반
  { key: 'wand4', name: '용비늘 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 31, int: 7 } }, // 일반
  { key: 'leather4', name: '용비늘 가죽 갑옷', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 4, from: ['drop'], stats: { def: 13, dex: 6 } }, // 일반
  { key: 'greatsword4', name: '용비늘 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, str: 12 } }, // 희귀
  { key: 'longbow4', name: '용비늘 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, dex: 12 } }, // 희귀
  { key: 'staff4', name: '용비늘 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, int: 12 } }, // 희귀
  { key: 'armor4', name: '용비늘 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { def: 26, vit: 20 } }, // 희귀
  { key: 'robe4', name: '용비늘 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 4, from: ['drop'], stats: { def: 18, int: 16 } }, // 희귀
  { key: 'ring4', name: '용비늘 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { crit: 0.15, atk: 21 } }, // 희귀
  { key: 'amulet4', name: '용비늘 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { maxHp: 180, vit: 20 } }, // 희귀
  { key: 'plate4', name: '용비늘 판금 갑옷', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 4, from: ['drop', 'shop'], stats: { def: 40, vit: 29, str: 15 } }, // 영웅
  { key: 'necklace4', name: '용비늘 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 4, from: ['drop'], stats: { crit: 0.14, str: 15, dex: 15, int: 15 } }, // 영웅
  { key: 'sunring', name: '사막왕의 인장', base: '사막왕의 인장', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['drop'], stats: { crit: 0.34, atk: 59, maxHp: 202 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant4', name: '거인의 대검 Ⅳ', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, str: 71, crit: 0.05 } }, // 조합법
  { key: 'wind4', name: '바람의 장궁 Ⅳ', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, dex: 71, crit: 0.08 } }, // 조합법
  { key: 'sage4', name: '현자의 지팡이 Ⅳ', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, int: 71, maxHp: 202 } }, // 조합법
  { key: 'trinity4', name: '삼위일체의 검 Ⅳ', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 202, str: 44, dex: 44, int: 44 } }, // 조합법
  { key: 'guardian4', name: '수호자의 판금 Ⅳ', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { def: 95, vit: 66, str: 31 } }, // 조합법
  { key: 'life4', name: '생명의 부적 Ⅳ', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { maxHp: 729, vit: 53 } }, // 조합법
  { key: 'fatal4', name: '치명의 반지 Ⅳ', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { crit: 0.62, atk: 59 } }, // 조합법
  { key: 'hero4', name: '용사의 목걸이 Ⅳ', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 59, def: 30, crit: 0.34, maxHp: 405 } }, // 조합법
  { key: 'hammer4', name: '무쇠 대장장이의 망치 Ⅳ', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 166, str: 44, vit: 44 } }, // 조합법
  { key: 'bulwark4', name: '철벽의 갑주 Ⅳ', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { def: 89, vit: 57, maxHp: 405 } }, // 조합법
  // ── 5단계 (9·10구역) · 마왕의 ──
  { key: 'sword5', name: '마왕의 검', base: '검', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 41, str: 9 } }, // 일반
  { key: 'bow5', name: '마왕의 활', base: '활', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 39, dex: 9 } }, // 일반
  { key: 'wand5', name: '마왕의 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 39, int: 9 } }, // 일반
  { key: 'leather5', name: '마왕의 가죽 갑옷', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 5, from: ['drop'], stats: { def: 16, dex: 8 } }, // 일반
  { key: 'greatsword5', name: '마왕의 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, str: 15 } }, // 희귀
  { key: 'longbow5', name: '마왕의 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, dex: 15 } }, // 희귀
  { key: 'staff5', name: '마왕의 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, int: 15 } }, // 희귀
  { key: 'armor5', name: '마왕의 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { def: 33, vit: 24 } }, // 희귀
  { key: 'robe5', name: '마왕의 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 5, from: ['drop'], stats: { def: 23, int: 20 } }, // 희귀
  { key: 'ring5', name: '마왕의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { crit: 0.18, atk: 26 } }, // 희귀
  { key: 'amulet5', name: '마왕의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { maxHp: 228, vit: 24 } }, // 희귀
  { key: 'plate5', name: '마왕의 판금 갑옷', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 5, from: ['drop', 'shop'], stats: { def: 49, vit: 37, str: 18 } }, // 영웅
  { key: 'necklace5', name: '마왕의 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 5, from: ['drop'], stats: { crit: 0.17, str: 18, dex: 18, int: 18 } }, // 영웅
  { key: 'demonblade', name: '마왕의 검', base: '마왕의 검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['drop'], stats: { atk: 162, str: 33, crit: 0.21 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant5', name: '거인의 대검 Ⅴ', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, str: 88, crit: 0.05 } }, // 조합법
  { key: 'wind5', name: '바람의 장궁 Ⅴ', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, dex: 88, crit: 0.08 } }, // 조합법
  { key: 'sage5', name: '현자의 지팡이 Ⅴ', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, int: 88, maxHp: 256 } }, // 조합법
  { key: 'trinity5', name: '삼위일체의 검 Ⅴ', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 251, str: 55, dex: 55, int: 55 } }, // 조합법
  { key: 'guardian5', name: '수호자의 판금 Ⅴ', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { def: 118, vit: 82, str: 38 } }, // 조합법
  { key: 'life5', name: '생명의 부적 Ⅴ', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { maxHp: 923, vit: 66 } }, // 조합법
  { key: 'fatal5', name: '치명의 반지 Ⅴ', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { crit: 0.75, atk: 74 } }, // 조합법
  { key: 'hero5', name: '용사의 목걸이 Ⅴ', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 74, def: 37, crit: 0.41, maxHp: 513 } }, // 조합법
  { key: 'hammer5', name: '무쇠 대장장이의 망치 Ⅴ', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 207, str: 55, vit: 55 } }, // 조합법
  { key: 'bulwark5', name: '철벽의 갑주 Ⅴ', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { def: 111, vit: 71, maxHp: 513 } }, // 조합법
];
