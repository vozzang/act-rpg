// 장식 물건: 맵 편집기로 칸에 놓는 나무·바위·통·천막 같은 것. 게임 규칙에는 "지나갈 수 있는지(block)"만 영향을 준다.
// model은 화면(World3D)의 모델 이름, scale은 그 모델의 크기 배율이다. 칸 하나가 1(가로·세로)이다.

export type PropGroup = '자연' | '야영지' | '물자' | '구조물' | '설원';

export interface PropDef {
  name: string;
  group: PropGroup;
  model: string; // World3D MODELS의 키
  scale: number;
  block: boolean; // 그 칸을 막는지 (몬스터·플레이어가 지나가지 못한다)
  color: string; // 편집기 2D 지도에 그릴 색
}

export const PROPS = {
  // 자연
  tree: { name: '나무', group: '자연', model: 'tree', scale: 1, block: true, color: '#2f6a2a' },
  treeHigh: { name: '큰 나무', group: '자연', model: 'treeHigh', scale: 1.1, block: true, color: '#2a5a26' },
  treeAutumn: { name: '단풍나무', group: '자연', model: 'svTreeAutumn', scale: 1.4, block: true, color: '#c87a30' },
  log: { name: '쓰러진 통나무', group: '자연', model: 'svLog', scale: 2, block: true, color: '#7a5030' },
  stump: { name: '그루터기', group: '자연', model: 'svStump', scale: 2, block: true, color: '#8a6040' },
  rockBig: { name: '큰 바위', group: '자연', model: 'rocksHigh', scale: 1, block: true, color: '#6a6a72' },
  rockSmall: { name: '바위', group: '자연', model: 'rocksLow', scale: 1, block: true, color: '#7a7a82' },
  stones: { name: '자갈', group: '자연', model: 'stones', scale: 1, block: false, color: '#9a9aa0' },
  plant: { name: '풀포기', group: '자연', model: 'plant', scale: 1, block: false, color: '#6aaa50' },
  grass: { name: '잔디', group: '자연', model: 'patchGrass', scale: 1, block: false, color: '#80b060' },
  // 야영지
  tent: { name: '텐트', group: '야영지', model: 'tent', scale: 1.2, block: true, color: '#3a60b0' },
  tentCanvas: { name: '천막', group: '야영지', model: 'svTent', scale: 2, block: true, color: '#c0a070' },
  campfire: { name: '모닥불', group: '야영지', model: 'svCampfire', scale: 2, block: true, color: '#ff8030' },
  bedroll: { name: '침낭', group: '야영지', model: 'svBedroll', scale: 2, block: false, color: '#5080a0' },
  flag: { name: '깃발', group: '야영지', model: 'flag', scale: 1.2, block: true, color: '#d04040' },
  target: { name: '과녁', group: '야영지', model: 'target', scale: 1, block: true, color: '#e0c060' },
  signpost: { name: '표지판', group: '야영지', model: 'svSignpost', scale: 2, block: true, color: '#a07040' },
  // 물자
  barrel: { name: '통', group: '물자', model: 'barrel', scale: 0.9, block: true, color: '#9a6a3a' },
  crate: { name: '나무 상자', group: '물자', model: 'svBox', scale: 2, block: true, color: '#b08a50' },
  crateLong: { name: '긴 나무 상자', group: '물자', model: 'svBoxLarge', scale: 2, block: true, color: '#a07a40' },
  chest: { name: '보물상자 (장식)', group: '물자', model: 'chest', scale: 1, block: true, color: '#d0a040' },
  cart: { name: '수레', group: '물자', model: 'cart', scale: 1.2, block: true, color: '#b0703a' },
  workbench: { name: '작업대', group: '물자', model: 'svWorkbench', scale: 2, block: true, color: '#8a6a4a' },
  lantern: { name: '가로등', group: '물자', model: 'lantern', scale: 1.4, block: true, color: '#e0d080' },
  // 구조물
  fence: { name: '울타리', group: '구조물', model: 'svFence', scale: 2, block: true, color: '#9a7a50' },
  fenceFort: { name: '목책', group: '구조물', model: 'svFenceFort', scale: 2, block: true, color: '#7a5a30' },
  wall: { name: '돌담', group: '구조물', model: 'wallHalf', scale: 1, block: true, color: '#8a8a90' },
  column: { name: '기둥', group: '구조물', model: 'aColumn', scale: 1.2, block: true, color: '#c0c0c8' },
  columnBroken: { name: '부서진 기둥', group: '구조물', model: 'aColumnBroken', scale: 1.2, block: true, color: '#a0a0a8' },
  statue: { name: '석상', group: '구조물', model: 'statue', scale: 1.4, block: true, color: '#d0d0d8' },
  banner: { name: '깃발 기둥', group: '구조물', model: 'aBanner', scale: 1.3, block: true, color: '#c03030' },
  // 설원
  snowman: { name: '눈사람', group: '설원', model: 'snowman', scale: 0.8, block: true, color: '#f0f4f8' },
  snowPile: { name: '눈 무더기', group: '설원', model: 'snowPile', scale: 1, block: false, color: '#e0e8f0' },
  snowTree: { name: '눈 덮인 나무', group: '설원', model: 'snowTreeA', scale: 0.8, block: true, color: '#9ab8b0' },
  iceCrystal: { name: '얼음 결정', group: '설원', model: 'iceCrystalL', scale: 1, block: true, color: '#9ae0ff' },
} satisfies Record<string, PropDef>;

export type PropKind = keyof typeof PROPS;
export const PROP_KINDS = Object.keys(PROPS) as PropKind[];

/** 맵에 놓인 장식 하나. x·y는 타일, r은 90도 단위 회전(0~3) */
export interface PropPlacement {
  t: PropKind;
  x: number;
  y: number;
  r?: number;
}
