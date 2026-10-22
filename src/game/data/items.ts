// 아이템 목록: 게임에 나오는 모든 장비. 수치를 바꾸려면 이 표의 숫자를 고치면 된다.
// tier: 구역 묶음 (1: 1·2구역, 2: 3·4구역, 3: 5·6구역, 4: 7·8구역, 5: 9·10구역). 깊은 묶음일수록 재질 이름이 바뀌고 수치가 높다.
// base: 종류 이름 (대장간 조합법 재료로 쓴다), from: 얻는 곳 — drop 몬스터, shop 상점, recipe 대장간 조합법
// (처음 수치는 기존 공식에서 운을 뺀 값으로 만들었다: 무기 공격 = (3 + 4z)·등급배율, 등급배율 일반 1 · 희귀 1.6 · 영웅 2.4 · 전설 3.6)
import type { ClassId, ItemStats, Rarity, Slot, WeaponEffect } from '../types';

/** 장비를 얻는 곳: 몬스터 드랍 · 상점 · 대장간 조합법 · 유니크(5구역부터 중간보스·문지기, 한 판에 하나씩) · 던전 클리어 보상 */
export type ItemSource = 'drop' | 'shop' | 'recipe' | 'unique' | 'dungeon';

/** 장비 하나의 정의 */
export interface ItemDef {
  key: string; // 고유 키 (종류 영문 키 + 단계 숫자, 예: 'greatsword2')
  name: string; // 화면에 보이는 이름 (예: '강철 대검')
  base: string; // 종류 이름 (예: '대검'). 대장간 조합법 재료를 맞출 때 쓴다
  slot: Slot; // 무기 · 방어구 · 장신구
  rarity: Rarity; // 등급
  tier: number; // 단계 1~5 (이 단계 구역의 몬스터·상점에서 나온다)
  from: ItemSource[]; // 얻는 곳
  stats: ItemStats; // 수치
  effect?: WeaponEffect; // 특수 효과 (유니크 전설 무기)
  cls?: ClassId; // 이 직업만 착용할 수 있다 (유니크 전설 무기)
}

export const ITEM_LIST: ItemDef[] = [
  // ── 1단계 (1·2구역) · 낡은 ──
  { key: 'sword1', name: '방랑자의 검', base: '검', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, str: 2 } }, // 일반
  { key: 'bow1', name: '사냥꾼의 활', base: '활', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, dex: 2 } }, // 일반
  { key: 'wand1', name: '견습생 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 1, from: ['drop'], stats: { atk: 9, int: 2 } }, // 일반
  { key: 'leather1', name: '추적자 가죽갑', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 1, from: ['drop'], stats: { def: 4, dex: 2 } }, // 일반
  { key: 'greatsword1', name: '용병의 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, str: 3 } }, // 희귀
  { key: 'longbow1', name: '매의 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, dex: 3 } }, // 희귀
  { key: 'staff1', name: '고목 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { atk: 14, int: 3 } }, // 희귀
  { key: 'armor1', name: '파수꾼 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { def: 7, vit: 5 } }, // 희귀
  { key: 'robe1', name: '별빛 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 1, from: ['drop'], stats: { def: 5, int: 4 } }, // 희귀
  { key: 'ring1', name: '결의의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { crit: 0.06, atk: 6 } }, // 희귀
  { key: 'amulet1', name: '숲의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 1, from: ['drop', 'shop'], stats: { maxHp: 36, vit: 5 } }, // 희귀
  { key: 'plate1', name: '선봉대 판금', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 1, from: ['drop', 'shop'], stats: { def: 11, vit: 8, str: 4 } }, // 영웅
  { key: 'necklace1', name: '개척자 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 1, from: ['drop'], stats: { crit: 0.05, str: 4, dex: 4, int: 4 } }, // 영웅
  { key: 'goblinfang', name: '폭군의 송곳니', base: '고블린 왕의 송곳니', slot: 'weapon', rarity: 'legendary', tier: 1, from: ['drop'], stats: { atk: 32, str: 6, dex: 6 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant1', name: '거암의 대검', base: '거인의 대검', slot: 'weapon', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 49, str: 19, crit: 0.05 } }, // 조합법
  { key: 'wind1', name: '질풍의 장궁', base: '바람의 장궁', slot: 'weapon', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 49, dex: 19, crit: 0.08 } }, // 조합법
  { key: 'sage1', name: '지혜의 지팡이', base: '현자의 지팡이', slot: 'weapon', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 49, int: 19, maxHp: 40 } }, // 조합법
  { key: 'trinity1', name: '조화의 검', base: '삼위일체의 검', slot: 'weapon', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 55, str: 12, dex: 12, int: 12 } }, // 조합법
  { key: 'guardian1', name: '파수꾼 판금', base: '수호자의 판금', slot: 'armor', rarity: 'epic', tier: 1, from: ['recipe'], stats: { def: 26, vit: 18, str: 8 } }, // 조합법
  { key: 'life1', name: '새싹의 부적', base: '생명의 부적', slot: 'accessory', rarity: 'epic', tier: 1, from: ['recipe'], stats: { maxHp: 146, vit: 14 } }, // 조합법
  { key: 'fatal1', name: '살의의 반지', base: '치명의 반지', slot: 'accessory', rarity: 'epic', tier: 1, from: ['recipe'], stats: { crit: 0.23, atk: 16 } }, // 조합법
  { key: 'hero1', name: '모험가 목걸이', base: '용사의 목걸이', slot: 'accessory', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 16, def: 8, crit: 0.13, maxHp: 81 } }, // 조합법
  { key: 'hammer1', name: '대장간 망치', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'epic', tier: 1, from: ['recipe'], stats: { atk: 45, str: 12, vit: 12 } }, // 조합법
  { key: 'bulwark1', name: '성벽의 갑주', base: '철벽의 갑주', slot: 'armor', rarity: 'epic', tier: 1, from: ['recipe'], stats: { def: 24, vit: 15, maxHp: 81 } }, // 조합법
  // ── 2단계 (3·4구역) · 강철 ──
  { key: 'sword2', name: '서리강철 검', base: '검', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 17, str: 4 } }, // 일반
  { key: 'bow2', name: '북풍의 활', base: '활', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 16, dex: 4 } }, // 일반
  { key: 'wand2', name: '빙결정 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 2, from: ['drop'], stats: { atk: 16, int: 4 } }, // 일반
  { key: 'leather2', name: '설원랑 가죽갑', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 2, from: ['drop'], stats: { def: 7, dex: 3 } }, // 일반
  { key: 'greatsword2', name: '백은의 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, str: 6 } }, // 희귀
  { key: 'longbow2', name: '만년설 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, dex: 6 } }, // 희귀
  { key: 'staff2', name: '서리 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { atk: 27, int: 6 } }, // 희귀
  { key: 'armor2', name: '빙하의 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { def: 14, vit: 10 } }, // 희귀
  { key: 'robe2', name: '창백한 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 2, from: ['drop'], stats: { def: 10, int: 8 } }, // 희귀
  { key: 'ring2', name: '빙하의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { crit: 0.09, atk: 11 } }, // 희귀
  { key: 'amulet2', name: '설원의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 2, from: ['drop', 'shop'], stats: { maxHp: 84, vit: 10 } }, // 희귀
  { key: 'plate2', name: '백은의 판금', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 2, from: ['drop', 'shop'], stats: { def: 20, vit: 15, str: 8 } }, // 영웅
  { key: 'necklace2', name: '북극성 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 2, from: ['drop'], stats: { crit: 0.08, str: 8, dex: 8, int: 8 } }, // 영웅
  { key: 'frostfang', name: '혹한의 송곳니', base: '서리 송곳니', slot: 'weapon', rarity: 'legendary', tier: 2, from: ['drop'], stats: { atk: 61, dex: 16, crit: 0.1 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant2', name: '거신병 대검', base: '거인의 대검', slot: 'weapon', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 92, str: 36, crit: 0.05 } }, // 조합법
  { key: 'wind2', name: '삭풍의 장궁', base: '바람의 장궁', slot: 'weapon', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 92, dex: 36, crit: 0.08 } }, // 조합법
  { key: 'sage2', name: '진리의 지팡이', base: '현자의 지팡이', slot: 'weapon', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 92, int: 36, maxHp: 94 } }, // 조합법
  { key: 'trinity2', name: '균형의 성검', base: '삼위일체의 검', slot: 'weapon', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 104, str: 22, dex: 22, int: 22 } }, // 조합법
  { key: 'guardian2', name: '수호기사 판금', base: '수호자의 판금', slot: 'armor', rarity: 'epic', tier: 2, from: ['recipe'], stats: { def: 49, vit: 34, str: 16 } }, // 조합법
  { key: 'life2', name: '신록의 부적', base: '생명의 부적', slot: 'accessory', rarity: 'epic', tier: 2, from: ['recipe'], stats: { maxHp: 340, vit: 27 } }, // 조합법
  { key: 'fatal2', name: '암살의 반지', base: '치명의 반지', slot: 'accessory', rarity: 'epic', tier: 2, from: ['recipe'], stats: { crit: 0.36, atk: 31 } }, // 조합법
  { key: 'hero2', name: '투사의 목걸이', base: '용사의 목걸이', slot: 'accessory', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 31, def: 15, crit: 0.2, maxHp: 189 } }, // 조합법
  { key: 'hammer2', name: '명장의 망치', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'epic', tier: 2, from: ['recipe'], stats: { atk: 86, str: 22, vit: 22 } }, // 조합법
  { key: 'bulwark2', name: '철벽의 갑주', base: '철벽의 갑주', slot: 'armor', rarity: 'epic', tier: 2, from: ['recipe'], stats: { def: 46, vit: 29, maxHp: 189 } }, // 조합법
  // ── 3단계 (5·6구역) · 미스릴 ──
  { key: 'sword3', name: '미스릴 세검', base: '검', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 25, str: 6 } }, // 일반
  { key: 'bow3', name: '별빛의 활', base: '활', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 24, dex: 6 } }, // 일반
  { key: 'wand3', name: '비전의 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 3, from: ['drop'], stats: { atk: 24, int: 6 } }, // 일반
  { key: 'leather3', name: '황혼의 가죽갑', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 3, from: ['drop'], stats: { def: 10, dex: 5 } }, // 일반
  { key: 'greatsword3', name: '성광의 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, str: 9 } }, // 희귀
  { key: 'longbow3', name: '유성우 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, dex: 9 } }, // 희귀
  { key: 'staff3', name: '마탑 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { atk: 40, int: 9 } }, // 희귀
  { key: 'armor3', name: '성전의 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { def: 20, vit: 15 } }, // 희귀
  { key: 'robe3', name: '천공의 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 3, from: ['drop'], stats: { def: 14, int: 12 } }, // 희귀
  { key: 'ring3', name: '달빛의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { crit: 0.12, atk: 16 } }, // 희귀
  { key: 'amulet3', name: '정령의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 3, from: ['drop', 'shop'], stats: { maxHp: 132, vit: 15 } }, // 희귀
  { key: 'plate3', name: '성기사 판금', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 3, from: ['drop', 'shop'], stats: { def: 30, vit: 22, str: 11 } }, // 영웅
  { key: 'necklace3', name: '에테르 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 3, from: ['drop'], stats: { crit: 0.11, str: 11, dex: 11, int: 11 } }, // 영웅
  { key: 'flamestaff', name: '염옥 지팡이', base: '화염 군주의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['drop'], stats: { atk: 90, int: 27 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant3', name: '타이탄 대검', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, str: 53, crit: 0.05 } }, // 조합법
  { key: 'wind3', name: '폭풍의 장궁', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, dex: 53, crit: 0.08 } }, // 조합법
  { key: 'sage3', name: '대현자 지팡이', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 135, int: 53, maxHp: 148 } }, // 조합법
  { key: 'trinity3', name: '삼위일체 검', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 153, str: 33, dex: 33, int: 33 } }, // 조합법
  { key: 'guardian3', name: '성역의 판금', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { def: 72, vit: 50, str: 23 } }, // 조합법
  { key: 'life3', name: '생명수 부적', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { maxHp: 535, vit: 40 } }, // 조합법
  { key: 'fatal3', name: '처형의 반지', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { crit: 0.49, atk: 45 } }, // 조합법
  { key: 'hero3', name: '용사의 목걸이', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 45, def: 22, crit: 0.27, maxHp: 297 } }, // 조합법
  { key: 'hammer3', name: '룬문자 망치', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { atk: 126, str: 33, vit: 33 } }, // 조합법
  { key: 'bulwark3', name: '요새의 갑주', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 3, from: ['recipe'], stats: { def: 68, vit: 43, maxHp: 297 } }, // 조합법
  // ── 4단계 (7·8구역) · 용비늘 ──
  { key: 'sword4', name: '용발톱 검', base: '검', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 33, str: 7 } }, // 일반
  { key: 'bow4', name: '용골의 활', base: '활', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 31, dex: 7 } }, // 일반
  { key: 'wand4', name: '용심장 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 4, from: ['drop'], stats: { atk: 31, int: 7 } }, // 일반
  { key: 'leather4', name: '적룡 가죽갑', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 4, from: ['drop'], stats: { def: 13, dex: 6 } }, // 일반
  { key: 'greatsword4', name: '멸룡의 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, str: 12 } }, // 희귀
  { key: 'longbow4', name: '폭풍룡 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, dex: 12 } }, // 희귀
  { key: 'staff4', name: '용안 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { atk: 53, int: 12 } }, // 희귀
  { key: 'armor4', name: '고룡린 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { def: 26, vit: 20 } }, // 희귀
  { key: 'robe4', name: '용혈의 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 4, from: ['drop'], stats: { def: 18, int: 16 } }, // 희귀
  { key: 'ring4', name: '용안의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { crit: 0.15, atk: 21 } }, // 희귀
  { key: 'amulet4', name: '역린의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 4, from: ['drop', 'shop'], stats: { maxHp: 180, vit: 20 } }, // 희귀
  { key: 'plate4', name: '용기사 판금', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 4, from: ['drop', 'shop'], stats: { def: 40, vit: 29, str: 15 } }, // 영웅
  { key: 'necklace4', name: '태양룡 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 4, from: ['drop'], stats: { crit: 0.14, str: 15, dex: 15, int: 15 } }, // 영웅
  { key: 'sunring', name: '태양제 인장', base: '사막왕의 인장', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['drop'], stats: { crit: 0.34, atk: 59, maxHp: 202 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant4', name: '산맥분쇄검', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, str: 71, crit: 0.05 } }, // 조합법
  { key: 'wind4', name: '태풍의 영궁', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, dex: 71, crit: 0.08 } }, // 조합법
  { key: 'sage4', name: '성운의 지팡이', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 178, int: 71, maxHp: 202 } }, // 조합법
  { key: 'trinity4', name: '삼신기의 검', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 202, str: 44, dex: 44, int: 44 } }, // 조합법
  { key: 'guardian4', name: '이지스 판금', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { def: 95, vit: 66, str: 31 } }, // 조합법
  { key: 'life4', name: '대자연 부적', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { maxHp: 729, vit: 53 } }, // 조합법
  { key: 'fatal4', name: '파멸의 반지', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { crit: 0.62, atk: 59 } }, // 조합법
  { key: 'hero4', name: '영웅왕 목걸이', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 59, def: 30, crit: 0.34, maxHp: 405 } }, // 조합법
  { key: 'hammer4', name: '화산신 망치', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { atk: 166, str: 44, vit: 44 } }, // 조합법
  { key: 'bulwark4', name: '거성의 갑주', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 4, from: ['recipe'], stats: { def: 89, vit: 57, maxHp: 405 } }, // 조합법
  // ── 5단계 (9·10구역) · 마왕의 ──
  { key: 'sword5', name: '심연의 흑검', base: '검', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 41, str: 9 } }, // 일반
  { key: 'bow5', name: '그림자 활', base: '활', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 39, dex: 9 } }, // 일반
  { key: 'wand5', name: '공허의 완드', base: '완드', slot: 'weapon', rarity: 'common', tier: 5, from: ['drop'], stats: { atk: 39, int: 9 } }, // 일반
  { key: 'leather5', name: '암살자 가죽갑', base: '가죽 갑옷', slot: 'armor', rarity: 'common', tier: 5, from: ['drop'], stats: { def: 16, dex: 8 } }, // 일반
  { key: 'greatsword5', name: '흑기사 대검', base: '대검', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, str: 15 } }, // 희귀
  { key: 'longbow5', name: '원한의 장궁', base: '장궁', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, dex: 15 } }, // 희귀
  { key: 'staff5', name: '심연 지팡이', base: '지팡이', slot: 'weapon', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { atk: 66, int: 15 } }, // 희귀
  { key: 'armor5', name: '지옥불 갑옷', base: '갑옷', slot: 'armor', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { def: 33, vit: 24 } }, // 희귀
  { key: 'robe5', name: '칠흑의 로브', base: '로브', slot: 'armor', rarity: 'rare', tier: 5, from: ['drop'], stats: { def: 23, int: 20 } }, // 희귀
  { key: 'ring5', name: '계약의 반지', base: '반지', slot: 'accessory', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { crit: 0.18, atk: 26 } }, // 희귀
  { key: 'amulet5', name: '망자의 부적', base: '부적', slot: 'accessory', rarity: 'rare', tier: 5, from: ['drop', 'shop'], stats: { maxHp: 228, vit: 24 } }, // 희귀
  { key: 'plate5', name: '마신의 판금', base: '판금 갑옷', slot: 'armor', rarity: 'epic', tier: 5, from: ['drop', 'shop'], stats: { def: 49, vit: 37, str: 18 } }, // 영웅
  { key: 'necklace5', name: '타락한 목걸이', base: '목걸이', slot: 'accessory', rarity: 'epic', tier: 5, from: ['drop'], stats: { crit: 0.17, str: 18, dex: 18, int: 18 } }, // 영웅
  { key: 'demonblade', name: '종언의 마검', base: '마왕의 검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['drop'], stats: { atk: 162, str: 33, crit: 0.21 } }, // 전설 (이 단계에 하나뿐)
  { key: 'giant5', name: '태고의 거신검', base: '거인의 대검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, str: 88, crit: 0.05 } }, // 조합법
  { key: 'wind5', name: '천공의 신풍궁', base: '바람의 장궁', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, dex: 88, crit: 0.08 } }, // 조합법
  { key: 'sage5', name: '전지의 지팡이', base: '현자의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 221, int: 88, maxHp: 256 } }, // 조합법
  { key: 'trinity5', name: '창세의 신검', base: '삼위일체의 검', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 251, str: 55, dex: 55, int: 55 } }, // 조합법
  { key: 'guardian5', name: '불멸의 신성갑', base: '수호자의 판금', slot: 'armor', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { def: 118, vit: 82, str: 38 } }, // 조합법
  { key: 'life5', name: '세계수 부적', base: '생명의 부적', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { maxHp: 923, vit: 66 } }, // 조합법
  { key: 'fatal5', name: '사신의 반지', base: '치명의 반지', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { crit: 0.75, atk: 74 } }, // 조합법
  { key: 'hero5', name: '신화의 목걸이', base: '용사의 목걸이', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 74, def: 37, crit: 0.41, maxHp: 513 } }, // 조합법
  { key: 'hammer5', name: '창조신 망치', base: '무쇠 대장장이의 망치', slot: 'weapon', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { atk: 207, str: 55, vit: 55 } }, // 조합법
  { key: 'bulwark5', name: '난공불락 갑주', base: '철벽의 갑주', slot: 'armor', rarity: 'legendary', tier: 5, from: ['recipe'], stats: { def: 111, vit: 71, maxHp: 513 } }, // 조합법

  // ── 유니크 전설 무기: 단계가 하나뿐이고, 5구역부터 중간보스·문지기가 낮은 확률로 떨어뜨린다 (한 판에 같은 무기는 한 번만, UNIQUE_DROP) ──
  // 수치는 4단계(7·8구역) 조합 전설 정도. 대신 맞히면 일정 확률로 특수 효과 (WEAPON_EFFECTS). 각자 한 직업만 착용할 수 있다 (cls)
  { key: 'frostbow', name: '빙설의 신궁', base: '서리바람 활', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['unique'], stats: { atk: 160, dex: 45, crit: 0.08 }, effect: 'frost', cls: 'elf' }, // 서리: 둔화 · 궁수 전용
  { key: 'hellstaff', name: '업화 지팡이', base: '업화의 지팡이', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['unique'], stats: { atk: 160, int: 45, maxHp: 120 }, effect: 'burn', cls: 'gnome' }, // 화염: 지속 피해 · 마법사 전용
  { key: 'bloodsword', name: '선혈의 마검', base: '선혈의 검', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['unique'], stats: { atk: 170, str: 45, crit: 0.06 }, effect: 'bleed', cls: 'swordsman' }, // 출혈: 겹치는 지속 피해 · 검사 전용
  // ── 던전 보상: 7구역 모래 폭군의 무덤을 클리어하면 하나 (DUNGEONS[7].reward). 누구나 착용, 맞을 때 30% 확률로 피해를 막는다 ──
  { key: 'pharaohArmor', name: '태양왕 갑주', base: '파라오의 황금 갑주', slot: 'armor', rarity: 'legendary', tier: 4, from: ['dungeon'], stats: { def: 75, vit: 50, maxHp: 250 }, effect: 'aegis' }, // 절대방어
  // ── 던전 보상: 9구역 무법자의 묘지를 클리어하면 하나 (DUNGEONS[9].reward). 누구나 착용, 쓰러질 피해를 한 번 버틴다 ──
  { key: 'outlawCharm', name: '해골왕 목걸이', base: '무법자의 해골 목걸이', slot: 'accessory', rarity: 'legendary', tier: 5, from: ['dungeon'], stats: { maxHp: 350, vit: 35, def: 25, crit: 0.06 }, effect: 'undying' }, // 불사
  { key: 'quakeaxe', name: '대지파괴자', base: '대지 분쇄 도끼', slot: 'weapon', rarity: 'legendary', tier: 4, from: ['unique'], stats: { atk: 160, str: 35, vit: 35 }, effect: 'quake', cls: 'dwarf' }, // 대지 가르기: 주변 충격파 · 수호자 전용
];
