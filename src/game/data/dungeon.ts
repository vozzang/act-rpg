// 던전: 구역 길가의 던전 문으로 들어가는 둥근 투기장. 한 판에 하나씩, 들어가면 웨이브를 모두 물리쳐야 보상을 받는다.
// 성공하든(클리어), 안에 들어간 사람이 모두 쓰러져 실패하든 문은 닫힌다. 문 위치는 맵 파일(dungeons), 투기장은 mapfile.ts가 그 구역 아래에 붙인다.
// 던전마다 설정은 DUNGEONS[문이 있는 구역]. 진행은 sim.ts(updateDungeons)에 있다.
import type { EnemyKind } from '../types';
import type { EliteDef } from './enemies';

/** 웨이브 하나: 몰려오는 몬스터 수와 중간보스(보스) */
export interface DungeonWave {
  count: number; // 일반 몬스터 수 (투기장 둘레 사방에서 나온다)
  elites?: EliteDef[]; // 함께 나오는 중간보스 (보스)
  /** 이 웨이브의 중간보스가 살아 있는 동안 every초마다 부하 count마리를 불러낸다 (살아 있는 던전 몬스터가 max 이상이면 건너뛴다) */
  summon?: { every: number; count: number; max: number; text: string };
  /**
   * 묘비: 이 웨이브와 함께 투기장에 count개가 선다 (움직이지 않고 공격하지 않는 부술 수 있는 물건, HP는 hp × 구역·인원 배율).
   * 묘비가 하나라도 서 있으면 보스(중간보스)는 받는 피해가 bossTaken배로 줄고, 묘비마다 every초에 해골 하나를 불러낸다 (던전 몬스터 max마리까지).
   * 묘비를 모두 부수면 보스가 stun초 동안 휘청거린다.
   */
  tombs?: { count: number; hp: number; bossTaken: number; every: number; max: number; stun: number };
}

/** 던전 하나의 설정 */
export interface DungeonDef {
  name: string; // 던전 이름 (배너·화면 위 진행 표시)
  intro: string; // 들어갈 때 배너 아래 글
  zone: number; // 몬스터 강함·경험치 기준 구역 (zoneScale). 문이 있는 구역보다 한 단계 강하게
  theme: 'volcano' | 'desert' | 'grave'; // 투기장 꾸미기 (World3D)
  color: number; // 던전 문 빛 색
  startDelay: number; // 들어온 뒤 첫 웨이브까지(초)
  waveGap: number; // 웨이브 사이 쉬는 시간(초)
  pool: EnemyKind[]; // 웨이브·부하로 고르는 몬스터 (같은 이름이 여러 번이면 더 자주)
  waves: DungeonWave[];
  /** 클리어 보상 상자 하나 (파티 전체에 하나): random = 그 단계 전설 중 무작위(유니크 제외), item = 아이템 목록의 정해진 장비 */
  reward: { kind: 'random'; tier: number } | { kind: 'item'; key: string };
}

/** 던전 설정: [문이 있는 구역] */
export const DUNGEONS: Record<number, DungeonDef> = {
  // 5구역 불의 투기장: 사방에서 몰려오는 5웨이브, 마지막에 중간보스 둘
  5: {
    name: '불의 투기장',
    intro: '사방에서 적이 몰려온다! 5웨이브를 모두 물리쳐라',
    zone: 6,
    theme: 'volcano',
    color: 0xff5a30,
    startDelay: 3,
    waveGap: 3,
    pool: ['orc', 'skeleton', 'flameKnight', 'pyromancer', 'assassin', 'zombie', 'bandit', 'orc', 'skeleton'],
    waves: [
      { count: 8 },
      { count: 10 },
      { count: 12 },
      { count: 14 },
      {
        count: 8,
        elites: [
          { kind: 'flameKnight', name: '용암 수문장', hp: 600, atk: 27, def: 11 },
          { kind: 'pyromancer', name: '불꽃 대마법사', hp: 480, atk: 26, def: 9 },
        ],
      },
    ],
    reward: { kind: 'random', tier: 3 },
  },
  // 7구역 모래 폭군의 무덤: 사막 도적 무리를 물리치면 보스 모래 폭군이 깨어난다. 폭군은 돌진하며 베고, 살아 있는 동안 도적을 불러낸다
  // 봇 시험(4인 23레벨): 7·8구역 상점 장비만 0/6, 3단계 조합 전설 무기를 갖추면 4/6 클리어
  7: {
    name: '모래 폭군의 무덤',
    intro: '무덤을 지키는 도적들을 물리치면 모래 폭군이 깨어난다',
    zone: 8,
    theme: 'desert',
    color: 0xffc040,
    startDelay: 3,
    waveGap: 4,
    pool: ['bandit', 'assassin', 'thrower', 'raider', 'bandit', 'skeleton'],
    waves: [
      { count: 12 },
      {
        count: 4,
        elites: [{ kind: 'assassin', name: '모래 폭군', hp: 1700, atk: 27, def: 14 }],
        summon: { every: 14, count: 3, max: 8, text: '모래 폭군이 도적들을 불러냈다!' },
      },
    ],
    reward: { kind: 'item', key: 'pharaohArmor' },
  },
  // 9구역 무법자의 묘지: 망자 무리를 물리치면 해골 무법자가 묘비 넷과 함께 깨어난다.
  // 묘비가 서 있는 동안 무법자는 피해를 거의 받지 않고, 묘비에서 해골이 계속 일어난다 → 묘비부터 부숴야 한다
  // 봇 시험(4인 28레벨, 묘비부터 노리는 봇): 9·10구역 상점 장비만 0/6, 4단계 조합 전설 무기를 갖추면 4/6 클리어
  9: {
    name: '무법자의 묘지',
    intro: '묘지의 망자들을 물리치면 해골 무법자가 깨어난다 — 묘비가 서 있는 동안 무법자는 쓰러지지 않는다',
    zone: 9,
    theme: 'grave',
    color: 0xb070ff,
    startDelay: 3,
    waveGap: 4,
    pool: ['zombie', 'skeleton', 'darkKnight', 'zombie', 'skeleton', 'pyromancer'],
    waves: [
      { count: 12 },
      {
        count: 2,
        elites: [{ kind: 'darkKnight', name: '해골 무법자', hp: 1100, atk: 26, def: 14 }],
        tombs: { count: 4, hp: 40, bossTaken: 0.1, every: 12, max: 8, stun: 3 },
      },
    ],
    reward: { kind: 'item', key: 'outlawCharm' },
  },
};
