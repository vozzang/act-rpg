// 적: 몬스터 종류별 능력치·행동, 중간보스·문지기, 구역·인원수에 따른 강화 배율.
import type { EnemyKind } from '../types';

/**
 * 몬스터 행동 방식.
 * hop: 튀어 오르며 다가온다(슬라임) · melee: 붙어서 몸으로 친다 · ranged: 거리를 두고 쏜다 ·
 * heavy: 몸이 깜빡인 뒤 크게 내려친다 · dash: 멀리서 힘을 모았다가 돌진해 벤다 ·
 * frost: 거리를 두고 냉기 구슬(맞으면 느려짐)을 쏜다 · bomb: 플레이어 발밑에 화염탄을 떨어뜨린다
 */
export type EnemyAI = 'hop' | 'melee' | 'ranged' | 'heavy' | 'dash' | 'frost' | 'bomb' | 'boss';

/** 몬스터 한 종류의 능력치·행동 (1구역 기준. 구역 배율 zoneScale과 인원수 배율이 곱해진다) */
export interface EnemyDef {
  name: string; // 이름
  ai: EnemyAI; // 행동 방식
  heavy?: boolean; // 묵직한 적: 맞아도 잠깐만 멈칫하고, 내려치기 준비(windup)는 기절시켜야만 끊긴다
  knock?: number; // 넉백을 받는 비율 (기본 1, 작을수록 덜 밀린다)
  r: number; // 충돌 반지름. 길찾기가 타일 단위라 보스 외에는 지름이 한 칸(32)보다 작아야 좁은 틈을 지나간다.
  height: number; // 키 (머리 위 체력바 위치 기준, 월드 px)
  hp: number; // 체력
  atk: number; // 공격력
  def: number; // 방어
  speed: number; // 이동 속도 (px/초)
  xp: number; // 쓰러뜨리면 주는 경험치
  gold: number; // 떨어뜨리는 돈 (구역이 깊을수록 늘어난다)
  dropRate: number; // 장비를 떨어뜨릴 확률 (여기에 ITEM_DROP_MULT를 곱한다)
}

// 몬스터가 많은 대신 마리당 경험치·돈·장비 드랍은 낮게 잡았다 (한 판 동안 얻는 총량이 너무 커지지 않도록)
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  slime: { name: '슬라임', ai: 'hop', r: 13, height: 22, hp: 40, atk: 9, def: 0, speed: 50, xp: 7, gold: 3, dropRate: 0.09 },
  goblin: { name: '고블린', ai: 'melee', r: 11, height: 36, hp: 62, atk: 13, def: 2, speed: 100, xp: 12, gold: 4, dropRate: 0.13 },
  skeleton: { name: '해골 궁수', ai: 'ranged', r: 11, height: 46, hp: 52, atk: 11, def: 1, speed: 55, xp: 15, gold: 6, dropRate: 0.17 },
  orc: { name: '오크 전사', ai: 'heavy', heavy: true, knock: 0.35, r: 15, height: 56, hp: 200, atk: 20, def: 6, speed: 65, xp: 36, gold: 18, dropRate: 0.5 },
  // 흑룡: 4인이 9·10구역 상점 장비를 대장간에서 조합한 전설 장비 6개씩을 갖춰야 겨우 이기도록 맞췄다.
  // 방어가 매우 높아(한 대에 1500을 깎는다) 공격력이 낮은 장비로는 거의 피해를 주지 못한다 (봇 시험: 전설 6개 5/8 승, 전설 5+영웅 1 0/8, 그 아래 0)
  boss: { name: '흑룡', ai: 'boss', r: 40, height: 220, hp: 100000, atk: 1000, def: 4000, speed: 75, xp: 0, gold: 0, dropRate: 1 },
  // 1구역: 작고 빠른 졸개 무리, 돌을 던지는 투척병
  hound: { name: '퍼그 졸개', ai: 'melee', r: 10, height: 30, hp: 34, atk: 8, def: 0, speed: 120, xp: 6, gold: 2, dropRate: 0.06 },
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

/** 적이 플레이어를 알아차리는 거리 */
export const AGGRO_RANGE = 420;

/** 중간보스·문지기 하나 */
export interface EliteDef {
  kind: Exclude<EnemyKind, 'boss'>; // 움직임·공격 방식과 모델은 이 몬스터를 따른다
  name: string; // 이름 (머리 위·배너에 보인다)
  hp: number; // 1구역 기준 능력치. 여기에 구역 보정(zoneScale)과 인원수 보정이 곱해진다
  atk: number; // 공격력
  def: number; // 방어
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

/**
 * 구역이 깊어질수록 적이 강해진다. 구역별 적 능력치 배율 ([z - 1] = z구역): hp·atk는 곱하고, def는 더한다.
 * 몬스터·중간보스·문지기에 모두 적용된다 (흑룡은 제외).
 */
// 뒤 구역일수록 가파르게 오른다: 상점 장비·대장간 조합으로 플레이어 공격력이 구역마다 크게 느는 만큼 몬스터도 따라간다.
// 봇 시험(4인, 구역마다 상점 장비를 사고 짝수 구역에서 조합): 보스 방 도착 4/8, 나머지는 9·10구역에서 전멸. 장비를 안 사면 중간 구역에서 전멸한다
export const ZONE_SCALE = {
  hp: [1.4, 2.13, 3.18, 5.41, 8.76, 13.4, 19.68, 27.86, 38.19, 50.92],
  atk: [1.3, 1.8, 2.52, 3.89, 5.86, 8.45, 11.87, 16.23, 21.63, 28.19],
  def: [1, 2, 4, 7, 11, 16, 22, 30, 40, 52],
};

export function zoneScale(zone: number) {
  const i = Math.max(0, Math.min(ZONE_SCALE.hp.length - 1, zone - 1));
  return { hp: ZONE_SCALE.hp[i], atk: ZONE_SCALE.atk[i], def: ZONE_SCALE.def[i], xp: 1 + 0.5 * (zone - 1) };
}

/** 인원수가 많을수록 적 체력이 늘어난다. */
export function partyHpScale(players: number) {
  return 1 + 0.8 * (players - 1);
}
