// 던전: 5구역 길가의 던전 문으로 들어가는 둥근 투기장. 사방에서 몰려오는 적을 5웨이브 동안 물리치면 전설 장비 상자가 나온다.
// 한 판에 한 번뿐이다: 클리어하든, 안에 들어간 사람이 모두 쓰러져 실패하든 문은 닫힌다.
// 투기장 모양·자리는 mapfile.ts(levelFromMap), 진행은 sim.ts(updateDungeon)에 있다.
import type { EnemyKind } from '../types';
import type { EliteDef } from './enemies';

/** 웨이브 하나: 몰려오는 몬스터 수와 (마지막 웨이브의) 중간보스 */
export interface DungeonWave {
  count: number; // 일반 몬스터 수 (투기장 둘레 사방에서 나온다)
  elites?: EliteDef[]; // 함께 나오는 중간보스
}

export const DUNGEON = {
  /** 몬스터 강함·보상 기준 구역: 5구역 문이지만 한 단계 강하게 6구역 배율 (zoneScale) */
  zone: 6,
  /** 들어온 뒤 첫 웨이브까지, 웨이브 사이 쉬는 시간(초) */
  startDelay: 3,
  waveGap: 3,
  /** 웨이브마다 고르는 몬스터 (같은 이름이 여러 번이면 더 자주) */
  pool: ['orc', 'skeleton', 'flameKnight', 'pyromancer', 'assassin', 'zombie', 'bandit', 'orc', 'skeleton'] as EnemyKind[],
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
  ] as DungeonWave[],
  /** 클리어 보상: 파티 전체에 전설 장비 하나 (이 단계의 전설 중 무작위, 유니크 무기 제외) */
  rewardTier: 3,
};
