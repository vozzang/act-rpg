// 3D 월드: Kenney Mini Forest / Mini Dungeon / Mini Arena 모델(CC0)로 Three.js 장면을 그린다.
// 게임 규칙은 모르고, 매 프레임 스냅샷을 받아 장면을 맞추기만 한다.
// HUD·글자는 위에 투명하게 겹친 Phaser 화면이 그리며, 그 위치 계산용으로 toScreen() 등을 제공한다.
//
// 좌표: 월드 (x, y) → 3D (x / TILE, 높이, y / TILE). 카메라는 북쪽(-z)을 비스듬히 내려다본다.
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { isTouchDevice } from './TouchControls';
import { SkillFx } from './SkillFx';
import { DUNGEONS, CLASSES, ELITE, GATE_KEEPERS, RARITY, ZONE_PALETTE, TILE, VIEW_H, VIEW_W } from '../game/data';
import { G_ROAD, G_STONE, T_FLOOR, T_GATE, T_PROP, T_SHOP, T_TREE, T_VOID, dungeonExit, openGate, zoneOfTx, type Level } from '../game/level';
import { PROPS } from '../game/props';
import type { ClassId, DropView, Rarity, EnemyKind, EnemyView, Player, ProjectileView, Snapshot, WeaponEffect } from '../game/types';

const BASE = 'assets/';
const MODELS = {
  // 숲 (Mini Forest)
  archer: 'mini/forest/character-archer', bow: 'mini/forest/weapon-bow', tree: 'mini/forest/tree', treeHigh: 'mini/forest/tree-high',
  rocksLow: 'mini/forest/rocks-low', rocksHigh: 'mini/forest/rocks-high', stones: 'mini/forest/stones', plant: 'mini/forest/plant',
  patchGrass: 'mini/forest/patch-grass', tent: 'mini/forest/tent', flag: 'mini/forest/flag', target: 'mini/forest/target',
  // 던전 (Mini Dungeon)
  human: 'mini/dungeon/character-human', orc: 'mini/dungeon/character-orc', sword: 'mini/dungeon/weapon-sword',
  spear: 'mini/dungeon/weapon-spear', shieldRound: 'mini/dungeon/shield-round', shieldRect: 'mini/dungeon/shield-rectangle',
  wallHalf: 'mini/dungeon/wall-half', column: 'mini/dungeon/column', dRocks: 'mini/dungeon/rocks', chest: 'mini/dungeon/chest',
  barrel: 'mini/dungeon/barrel', coin: 'mini/dungeon/coin',
  // 사람 (Mini Characters)
  sage: 'mini/characters/character-male-e', merchant: 'mini/characters/character-male-b',
  // 마을 (Fantasy Town Kit)
  stall: 'town/stall-red', stallGreen: 'town/stall-green', stallPlain: 'town/stall', cart: 'town/cart', lantern: 'town/lantern',
  // 아레나 (Mini Arena)
  soldier: 'mini/arena/character-soldier', aFloor: 'mini/arena/floor', aFloorDetail: 'mini/arena/floor-detail',
  aColumn: 'mini/arena/column', aColumnBroken: 'mini/arena/column-damaged', statue: 'mini/arena/statue', aBanner: 'mini/arena/banner',
  // 성 (Castle Kit): 구역 출구의 철문과 양쪽 망루
  metalGate: 'castle/metal-gate', gateTower: 'castle/tower-square-base',
  // 3구역 설원 (Holiday Kit, Tower Defense Kit)
  snowTreeA: 'holiday/tree-snow-a', snowTreeB: 'holiday/tree-snow-b', snowTreeSmall: 'td/snow-detail-tree-large',
  snowRocksL: 'holiday/rocks-large', snowRocksM: 'holiday/rocks-medium', snowRocksS: 'holiday/rocks-small',
  snowman: 'holiday/snowman', snowPile: 'holiday/snow-pile', snowBunker: 'holiday/snow-bunker',
  iceCrystal: 'td/snow-detail-crystal', iceCrystalL: 'td/snow-detail-crystal-large', snowStones: 'td/snow-detail-rocks',
  // 궁수 화살 (Arrow.fbx를 길이 1, 가운데 기준 GLB로 바꾼 것. 촉이 -z)
  arrowModel: 'arrow/arrow',
  // 서리바람 활 (Bow pack의 bow_05, CC BY 4.0 CreativeSky2000. 손잡이가 원점, 활대가 위아래(+Y), 시위가 -Z, 높이 0.55, 파란 수정은 스스로 빛남)
  frostBow: 'frostbow/frostbow',
  // 검사의 장검 (longsword1.blend를 GLB로 바꾼 것. 손잡이 가운데가 원점, 칼끝이 +y, 길이 0.6)
  longsword: 'longsword/longsword',
  // 수호자의 도끼 (axe_model.obj를 GLB로 바꾼 것. 쥐는 곳이 원점, 머리가 +y, 길이 0.55)
  axe: 'axe/axe',
  // 마법사의 지팡이 (staff01.blend를 GLB로 바꾼 것. 쥐는 곳이 원점, 머리가 +y, 길이 0.75)
  staff: 'staff/staff',
  // 맵 편집기 장식 (Survival Kit, 원본이 작아 PROPS에서 2배로 키운다)
  svTreeAutumn: 'survival/tree-autumn', svLog: 'survival/tree-log', svStump: 'survival/tree-trunk', svTent: 'survival/tent-canvas',
  svCampfire: 'survival/campfire-pit', svBedroll: 'survival/bedroll', svSignpost: 'survival/signpost', svWorkbench: 'survival/workbench',
  svBox: 'survival/box', svAnvil: 'survival/workbench-anvil', svBoxLarge: 'survival/box-large', svFence: 'survival/fence', svFenceFort: 'survival/fence-fortified',
  // 6~10구역 테마 (Nature Kit · Survival Kit · Tower Defense Kit · Castle Kit)
  ntTreeDark: 'nature/tree_default_dark', ntOakDark: 'nature/tree_oak_dark', ntTreeThin: 'nature/tree_thin_dark', ntTreeSimple: 'nature/tree_simple_dark',
  ntRockTallA: 'nature/rock_tallA', ntRockTallC: 'nature/rock_tallC', ntStoneTallA: 'nature/stone_tallA', ntStoneTallC: 'nature/stone_tallC',
  ntCactusTall: 'nature/cactus_tall', ntCactusShort: 'nature/cactus_short', ntLily: 'nature/lily_large', ntMushRed: 'nature/mushroom_redGroup',
  ntMushTan: 'nature/mushroom_tanGroup', ntObelisk: 'nature/statue_obelisk', ntStatueHead: 'nature/statue_head', ntColumnBroken: 'nature/statue_columnDamaged',
  ntStump: 'nature/stump_old', ntBush: 'nature/plant_bushSmall',
  svSandA: 'survival/rock-sand-a', svSandB: 'survival/rock-sand-b', svSandC: 'survival/rock-sand-c',
  tdCrystalL: 'td/detail-crystal-large', tdCrystal: 'td/detail-crystal', tdCrystalTower: 'td/tower-round-crystals',
  csWall: 'castle/wall', csTower: 'castle/tower-square-base', csBanner: 'castle/flag-banner-long',
  // 회복 음식 (Food Kit)
  ham: 'food/whole-ham', apple: 'food/apple', grapes: 'food/grapes', wine: 'food/wine-red',
} as const;
/** 'dragon'(최종 보스)은 Collada 파일이라 따로 불러온다 (loadDragon). 'goblinKeeper'(첫 문지기)도 크기를 맞춰야 해서 따로 (loadGoblin) */
type ModelKey = keyof typeof MODELS | 'dragon' | 'goblinKeeper' | UacpKey | 'slime' | 'slimePurple' | 'outlaw' | 'ranger' | 'wizard' | 'warrior' | 'cleric';

/**
 * Quaternius "Ultimate Animated Character Pack" (CC0) 캐릭터: 구역별 몬스터. 키가 약 3.1이라 불러올 때 Kenney 캐릭터 키로 줄인다.
 * 모두 같은 뼈대·동작(Idle·Walk·Punch·Shoot_OneHanded·Defeat·RecieveHit)을 쓴다.
 */
const UACP = {
  uPug: 'Pug', uGoblin: 'Goblin_Male', uGoblinF: 'Goblin_Female', uPirate: 'Pirate_Male', uNinja: 'Ninja_Male',
  uViking: 'Viking_Male', uWitch: 'Witch', uKnight: 'Knight_Male', uZombie: 'Zombie_Male', uKnightGold: 'Knight_Golden_Male', uWizard: 'Wizard',
  // 중간보스·문지기 전용
  uElf: 'Elf', uVikingF: 'Viking_Female', uNinjaSand: 'Ninja_Sand', uKnightGoldF: 'Knight_Golden_Female',
} as const;
/** Quaternius 캐릭터 모델 이름 (UACP의 키) */
type UacpKey = keyof typeof UACP;
/** 게임이 부르는 동작 이름 → 이 팩의 클립 이름 (달리기·도약 클립이 없어 걷기로 대신한다) */
const UACP_ANIMS = {
  idle: 'Idle', walk: 'Walk', sprint: 'Walk', jump: 'Walk', die: 'Defeat',
  'attack-melee-right': 'Punch', 'holding-left-shoot': 'Shoot_OneHanded', 'holding-right': 'RecieveHit',
};
/** Quaternius Ranger 동작 이름을 게임에서 사용하는 캐릭터 동작에 연결한다. */
const RANGER_ANIMS = {
  idle: 'idle', walk: 'walk', sprint: 'run', jump: 'run', die: 'death',
  'attack-melee-right': 'punch', 'holding-left-shoot': 'bow-attack-shoot',
  'holding-right': 'receive-hit', hurt: 'receive-hit',
};
/** Quaternius Wizard 동작 이름을 게임에서 사용하는 캐릭터 동작에 연결한다. */
const WIZARD_ANIMS = {
  idle: 'idle', walk: 'walk', sprint: 'run-weapon', jump: 'run-weapon', die: 'death',
  'attack-melee-right': 'staff-attack', 'holding-left-shoot': 'spell1',
  'holding-right': 'receive-hit', hurt: 'receive-hit',
};
/** Quaternius Warrior 동작 이름을 게임에서 사용하는 캐릭터 동작에 연결한다. */
const WARRIOR_ANIMS = {
  idle: 'idle-weapon', walk: 'walk', sprint: 'run-weapon', jump: 'run-weapon', die: 'death',
  'attack-melee-right': 'sword-attack', 'holding-left-shoot': 'sword-attack',
  'holding-right': 'receive-hit', hurt: 'receive-hit',
};
/** Quaternius Cleric 동작 이름을 게임에서 사용하는 캐릭터 동작에 연결한다. */
const CLERIC_ANIMS = {
  idle: 'idle-weapon', walk: 'walk', sprint: 'run-weapon', jump: 'run-weapon', die: 'death',
  'attack-melee-right': 'staff-attack', 'holding-left-shoot': 'staff-attack',
  'holding-right': 'receive-hit', hurt: 'receive-hit',
};
/** 불러온 3D 모델: 장면(복제해서 쓴다)과 애니메이션 클립 */
type Model = {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
};

const U = 1 / TILE; // 월드 단위 → 3D 단위
const SQUASH_TIME = 0.35; // 죽는 동작이 없는 적(슬라임)이 찌그러져 사라지는 시간
const PITCH = THREE.MathUtils.degToRad(56); // 카메라가 내려다보는 각도
const CAM_DIST = 11.5; // 카메라와 캐릭터 사이 거리
const CHAR_SCALE = 1.25;
const DRAGON_SCALE = 6; // 흑룡 모델 배율 (CHAR_SCALE이 한 번 더 곱해진다). 보스 방을 꽉 채우는 크기. 충돌 반지름(ENEMIES.boss.r)은 그대로 둔다 — 키우면 화살이 다 맞아 전설 장비 균형이 무너진다
const Z_SCALE = 1 / 40; // 투사체 높이(px) → 3D 높이

// 구역별 바닥·길 색은 data/core.ts의 ZONE_PALETTE
const VOLCANO_ZONE = 5;
const SNOW_ZONE = 3;

/** 6~10구역 테마: [모델, 크기] 목록. square면 바위 칸을 90도 단위로만 돌린다 (성벽처럼 반듯한 모델) */
type ZoneTheme = {
  trees: [ModelKey, number][]; // 나무 칸에 놓는 모델 (없으면 바위 모델)
  rocks: [ModelKey, number][]; // 길가 바위 칸
  rocksHigh: [ModelKey, number][]; // 벽 안쪽(사방이 막힌) 바위 칸
  floor: [ModelKey, number][]; // 바닥에 가끔 놓는 장식
  floorChance: number; // 바닥 칸에 장식을 놓을 확률
  square?: boolean; // 바위 칸을 90도 단위로만 돌린다
};
const ZONE_THEMES: Record<number, ZoneTheme> = {
  6: { // 독기의 늪: 검은 나무, 이끼 낀 바위, 연잎·버섯
    trees: [['ntTreeDark', 1.1], ['ntOakDark', 1.3]],
    rocks: [['ntRockTallC', 0.9], ['dRocks', 1]], rocksHigh: [['rocksHigh', 1.05]],
    floor: [['ntLily', 2.2], ['ntMushRed', 2], ['ntMushTan', 2], ['ntBush', 1.6]], floorChance: 0.09,
  },
  7: { // 사막 유적: 선인장, 모래 바위, 오벨리스크
    trees: [['ntCactusTall', 1.7]],
    rocks: [['svSandA', 1.9], ['svSandB', 1.9], ['svSandC', 1.9]], rocksHigh: [['ntStoneTallA', 1], ['ntObelisk', 1.4]],
    floor: [['ntCactusShort', 1.6], ['svSandC', 1.2]], floorChance: 0.04,
  },
  8: { // 수정 동굴: 수정 덩어리와 뾰족 바위
    trees: [],
    rocks: [['tdCrystalL', 1.1], ['ntRockTallA', 1]], rocksHigh: [['tdCrystalTower', 1], ['ntRockTallA', 1.05]],
    floor: [['tdCrystal', 1.6]], floorChance: 0.05,
  },
  9: { // 망령의 묘지: 앙상한 나무, 비석(오벨리스크), 그루터기
    trees: [['ntTreeThin', 1.15], ['ntTreeSimple', 1.2]],
    rocks: [['ntStoneTallC', 1], ['ntObelisk', 1.1]], rocksHigh: [['ntStoneTallA', 1]],
    floor: [['ntObelisk', 0.6], ['ntStump', 1.6], ['ntColumnBroken', 0.8]], floorChance: 0.05,
  },
  10: { // 마왕성: 성벽과 망루, 깃발
    trees: [], square: true,
    rocks: [['csWall', 1]], rocksHigh: [['csTower', 1], ['csWall', 1]],
    floor: [['csBanner', 0.8], ['aColumnBroken', 1.1]], floorChance: 0.02,
  },
};
const SNOW_BOX = { x: 30, y: 12, z: 22 }; // 눈 입자가 도는 카메라 주변 상자
const STONE = 0x9a9aa4;

/**
 * 떨어진 물건 모델 배율. 원본 크기가 제각각이라(사과 0.2칸, 햄 0.64칸, 포도주 병 0.7칸 등)
 * 화면에서 비슷한 크기(높이 약 0.4~0.5칸)로 보이게 맞춘 값.
 */
/** 장비 상자 등급별 모습: tint 상자를 등급 색으로 칠하는 정도, glow 빛나는 정도, pillar 빛기둥 높이(0이면 없음) */
const CHEST_LOOK: Record<Rarity, { tint: number; glow: number; pillar: number }> = {
  common: { tint: 0, glow: 0.05, pillar: 0 },
  rare: { tint: 0.65, glow: 0.25, pillar: 0 },
  epic: { tint: 0.7, glow: 0.4, pillar: 1.6 },
  legendary: { tint: 0.75, glow: 0.55, pillar: 2.6 },
};
const DROP_SCALE: Partial<Record<ModelKey, number>> = { chest: 0.6, ham: 0.9, apple: 2.2, grapes: 1.4, wine: 1.0, coin: 0.7 };

/** 직업·적별 3D 모델 설정 */
type Look = {
  model: ModelKey; // 몸 모델
  scale: [number, number, number]; // 크기 배율 (가로·키·깊이)
  tint?: number; // 몸 색에 곱할 색 (구역 분위기·종족 구분)
  weapons?: {
    model: ModelKey; // 무기 모델
    bone: string; // 붙일 뼈 이름 (오른손 등)
    pos: [number, number, number]; // 뼈 기준 위치
    rot: [number, number, number]; // 뼈 기준 회전 (라디안)
    scale: number; // 크기
    glowTip?: number; // 무기 끝에 빛나는 구슬 (지팡이)
    glowSize?: number; // 구슬 반지름 (무기 모델 단위, 기본 0.07)
  }[];
  hideMeshes?: string[]; // 특정 장비 외형에서 모델에 포함된 메시를 숨긴다
  attack: string; // 공격 애니메이션
  /** 게임이 쓰는 애니메이션 이름 → 이 모델의 클립 이름 (Kenney 캐릭터가 아닌 모델용) */
  anims?: Record<string, string>;
};
const SWORD = { model: 'sword' as const, bone: 'arm-right', pos: [-0.02, -0.2, 0.06] as [number, number, number], rot: [0.5, 0, 0] as [number, number, number], scale: 0.9 };
const SHIELD = { model: 'shieldRound' as const, bone: 'arm-left', pos: [0.06, -0.16, 0.08] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: 0.85 };
const BOW = { model: 'bow' as const, bone: 'arm-left', pos: [0.03, -0.16, 0.1] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: 0.9 };
const SPEAR = { model: 'spear' as const, bone: 'arm-right', pos: [-0.02, -0.2, 0.06] as [number, number, number], rot: [0.2, 0, 0] as [number, number, number], scale: 0.9 };

const PLAYER_LOOKS: Record<ClassId, Look> = {
  // RPG Characters의 Warrior 모델은 장검이 포함되어 있다.
  swordsman: { model: 'warrior', scale: [1.3, 1.3, 1.3], attack: 'attack-melee-right', anims: WARRIOR_ANIMS },
  // Cleric의 수염·어깨 장식에 도끼와 방패를 장착해 드워프 수호자로 사용한다.
  dwarf: {
    model: 'cleric', scale: [1.15, 0.82, 1.15], hideMeshes: ['Cleric_Staff'], anims: CLERIC_ANIMS,
    weapons: [
      { ...SWORD, model: 'axe', bone: 'WeaponR', pos: [0, 0, 0], rot: [0, 0, 0], scale: 2.5 },
      { ...SHIELD, bone: 'FistL', model: 'shieldRect', scale: 2.9 },
    ],
    attack: 'attack-melee-right',
  },
  elf: { model: 'ranger', scale: [1.3, 1.3, 1.3], attack: 'holding-left-shoot', anims: RANGER_ANIMS },
  // RPG Characters의 Wizard 모델은 지팡이가 포함되어 있다.
  gnome: { model: 'wizard', scale: [1.3, 1.3, 1.3], attack: 'holding-left-shoot', anims: WIZARD_ANIMS },
};
/** 유니크 무기를 끼면 손에 든 무기 모양이 바뀐다: [직업][효과] → 그 직업의 겉모습 (없으면 PLAYER_LOOKS 그대로) */
const UNIQUE_LOOKS: Partial<Record<ClassId, Partial<Record<WeaponEffect, Look>>>> = {
  // 궁수 + 서리바람 활: 파란 수정이 빛나는 은빛 활
  elf: { frost: { ...PLAYER_LOOKS.elf, hideMeshes: ['Ranger_Bow'], weapons: [{ model: 'frostBow', bone: 'WeaponR', pos: [-0.021, 0.269, -0.022], rot: [-1.932, -1.571, 2.799], scale: 3.92 }] } },
};
function playerLook(p: Player): Look {
  return (p.weaponFx && UNIQUE_LOOKS[p.cls]?.[p.weaponFx]) || PLAYER_LOOKS[p.cls];
}
/** Quaternius 캐릭터 손(FistR)에 드는 무기. 손 안쪽은 원본 크기 단위라 크게 키운다 */
const U_HAND = { bone: 'FistR', pos: [0, 0.3, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number] };
const uLook = (model: UacpKey, size: number, attack: 'attack-melee-right' | 'holding-left-shoot', weapon?: { model: ModelKey; scale: number; glowTip?: number }): Look => ({
  model, scale: [size, size, size], attack, anims: UACP_ANIMS,
  weapons: weapon ? [{ ...U_HAND, ...weapon }] : [],
});

/**
 * 슬라임 (Slime.blend를 GLB로 바꾼 것). 동작은 IDLE(대기)·ROAM(이동)·Attack 셋뿐이고 죽는 동작은 없어 찌그러지며 사라진다.
 * 슬라임은 몸으로 부딪혀 공격해서 공격 상태가 없으므로, Attack은 원작자 안내대로 맞았을 때 움찔하는 동작(hurt)으로 쓴다.
 */
const SLIME_LOOK: Look = {
  model: 'slime', scale: [1, 1, 1], attack: 'attack-melee-right',
  anims: { idle: 'IDLE', walk: 'ROAM', sprint: 'ROAM', jump: 'ROAM', 'attack-melee-right': 'Attack', 'holding-right': 'Attack', hurt: 'Attack' },
};

const ENEMY_LOOKS: Record<EnemyKind, Look> = {
  slime: SLIME_LOOK,
  goblin: uLook('uGoblin', 0.85, 'attack-melee-right', { model: 'sword', scale: 2.6 }),
  hound: uLook('uPug', 0.9, 'attack-melee-right'),
  thrower: uLook('uGoblinF', 0.82, 'holding-left-shoot'),
  bandit: uLook('uPirate', 1, 'attack-melee-right', { model: 'sword', scale: 3.4 }),
  assassin: uLook('uNinja', 0.95, 'attack-melee-right', { model: 'sword', scale: 2.8 }),
  raider: uLook('uViking', 1.15, 'attack-melee-right', { model: 'spear', scale: 3.6 }),
  iceWitch: uLook('uWitch', 1, 'holding-left-shoot', { model: 'spear', scale: 3, glowTip: 0x80e0ff }),
  darkKnight: uLook('uKnight', 1.12, 'attack-melee-right', { model: 'sword', scale: 3.8 }),
  zombie: uLook('uZombie', 1, 'attack-melee-right'),
  flameKnight: uLook('uKnightGold', 1.15, 'attack-melee-right', { model: 'spear', scale: 3.8, glowTip: 0xff6020 }),
  pyromancer: uLook('uWizard', 1, 'holding-left-shoot', { model: 'spear', scale: 3, glowTip: 0xff7a20 }),
  skeleton: { model: 'soldier', scale: [0.9, 1, 0.9], tint: 0xeeeedd, weapons: [BOW], attack: 'holding-left-shoot' },
  orc: { model: 'orc', scale: [1.25, 1.25, 1.25], weapons: [SPEAR], attack: 'attack-melee-right' },
  // 최종 보스: OpenGameArt "Cethiel's Dragon 3D" (CC0). 클립은 idle·walk·attack·die 넷뿐이라 나머지는 비슷한 것으로 대신한다
  boss: {
    model: 'dragon', scale: [DRAGON_SCALE, DRAGON_SCALE, DRAGON_SCALE], attack: 'attack',
    anims: { 'attack-melee-right': 'attack', 'holding-right': 'attack', sprint: 'walk', jump: 'idle' },
  },
};

/** 던전의 묘비: 움직이지 않는 키 큰 비석 (보랏빛으로 물들인다) */
const TOMB_LOOK: Look = { model: 'ntStoneTallC', scale: [1.3, 1.3, 1.3], tint: 0xc0a0ff, attack: '' };

/** 특정 중간보스·문지기만 다른 모델로 그린다 (이름으로 찾는다). 없으면 ENEMY_LOOKS[kind] */
const ELITE_LOOKS: Record<string, Look> = {
  [GATE_KEEPERS[0].name]: {
    model: 'goblinKeeper', scale: [1, 1, 1], attack: 'attack-melee-right',
    // 뼈 안쪽은 원본 크기(키 12) 단위라 무기를 그만큼 키운다
    weapons: [{ ...SWORD, bone: 'hand_R', pos: [0, 0.6, 0], rot: [0, 0, 0], scale: 11 }],
    anims: { idle: 'Idle.000', walk: 'Walk', sprint: 'Run', 'attack-melee-right': 'Attack.000', 'holding-right': 'Attack.001', jump: 'Run', die: 'Die' },
  },
  '거대 슬라임': { ...SLIME_LOOK, model: 'slimePurple' }, // 보라색 슬라임
  // 나머지 중간보스·문지기: Quaternius 캐릭터. 행동(근접·원거리 등)은 data/enemies.ts의 kind 그대로이고 모양만 바꾼다
  // (거대 슬라임은 슬라임 그대로, 고블린 대장은 고블린 모델 그대로)
  '엘프 저격수': uLook('uElf', 1, 'holding-left-shoot'),
  '화염 저격수': { ...uLook('uElf', 1, 'holding-left-shoot'), tint: 0xff9a70 },
  '바이킹 광전사': uLook('uVikingF', 1, 'attack-melee-right', { model: 'spear', scale: 3.6 }),
  '황금 기사단장': uLook('uKnightGoldF', 1, 'attack-melee-right', { model: 'sword', scale: 3.8 }),
  '용암 광전사': { ...uLook('uKnightGold', 1, 'attack-melee-right', { model: 'spear', scale: 3.8, glowTip: 0xff5020 }), tint: 0xff9a80 },
  '협곡의 문지기': uLook('uNinjaSand', 1, 'holding-left-shoot'),
  '설원의 문지기': { ...uLook('uViking', 1.05, 'attack-melee-right', { model: 'spear', scale: 3.8 }), tint: 0xd8ecff },
  '요새의 문지기': uLook('uKnight', 1.05, 'attack-melee-right', { model: 'sword', scale: 4 }),
  '화산의 문지기': { ...uLook('uKnightGold', 1.1, 'attack-melee-right', { model: 'spear', scale: 4, glowTip: 0xff5020 }), tint: 0xffb090 },
  // 6~10구역 중간보스·문지기: 같은 종류 모델에 구역 분위기 색을 입힌다
  '늪의 망령': { ...ENEMY_LOOKS.zombie, tint: 0x90d070 },
  '독 마녀': { ...ENEMY_LOOKS.iceWitch, tint: 0xa0ff80, weapons: [{ ...U_HAND, model: 'spear', scale: 3, glowTip: 0x80ff40 }] },
  '늪의 문지기': { ...ENEMY_LOOKS.zombie, tint: 0x70b060 },
  '사막 도적왕': { ...ENEMY_LOOKS.bandit, tint: 0xffe0a0 },
  '모래 암살자': uLook('uNinjaSand', 1, 'attack-melee-right', { model: 'sword', scale: 2.8 }),
  // 7구역 던전 보스: 금빛 사막 닌자, 다른 중간보스보다 한 번 더 크게
  // 9구역 던전 보스: 해골 무법자 (붉은 눈, 도끼). 다른 중간보스보다 크게. 공격은 세 가지 중 하나를 쓴다
  '해골 무법자': {
    model: 'outlaw', scale: [1.35, 1.35, 1.35], attack: 'attack-melee-right',
    anims: { idle: 'Idle', walk: 'Walk', sprint: 'Run', jump: 'Jump', die: 'Dead', hurt: 'Damage', 'attack-melee-right': 'Attack00', 'holding-right': 'Attack02', 'holding-left-shoot': 'Attack01' },
  },
  '모래 폭군': { ...uLook('uNinjaSand', 1.4, 'attack-melee-right', { model: 'sword', scale: 3.6, glowTip: 0xffc040 }), tint: 0xffd890 },
  '사막의 문지기': { ...ENEMY_LOOKS.raider, tint: 0xffd890 },
  '수정 수호자': { ...ENEMY_LOOKS.darkKnight, tint: 0xc0a0ff },
  '수정 마녀': { ...ENEMY_LOOKS.iceWitch, tint: 0xd0b0ff, weapons: [{ ...U_HAND, model: 'spear', scale: 3, glowTip: 0xc080ff }] },
  '수정의 문지기': { ...ENEMY_LOOKS.darkKnight, tint: 0xb090ff },
  '망령 기사': { ...ENEMY_LOOKS.darkKnight, tint: 0xb0c8d8 },
  '묘지 술사': { ...ENEMY_LOOKS.pyromancer, tint: 0xa0b0c0, weapons: [{ ...U_HAND, model: 'spear', scale: 3, glowTip: 0x80d0ff }] },
  '묘지의 문지기': { ...ENEMY_LOOKS.zombie, tint: 0xa8b8c8 },
  '마왕 친위대장': { ...ENEMY_LOOKS.flameKnight, tint: 0xff7070 },
  '지옥 술사': { ...ENEMY_LOOKS.pyromancer, tint: 0xff8080 },
  '흑룡의 문지기': { ...uLook('uKnightGold', 1.15, 'attack-melee-right', { model: 'spear', scale: 4, glowTip: 0xff3010 }), tint: 0x9a6a6a },
};

/** 화면에 놓인 캐릭터 하나 (플레이어·적·상인) */
type Char = {
  root: THREE.Object3D; // 장면에 놓인 몸
  mixer: THREE.AnimationMixer; // 애니메이션 재생기
  actions: Map<string, THREE.AnimationAction>; // 동작 이름 → 재생할 동작 (게임 이름 별칭 포함)
  current: string; // 지금 동작
  oneShotUntil: number; // 한 번만 하는 동작(공격 등)이 끝나는 시각 — 그 전에는 다른 동작으로 바꾸지 않는다
  materials: THREE.MeshStandardMaterial[]; // 번쩍임(피격·힘 모으기)을 바꿀 재질
  baseEmissive: THREE.Color[]; // 재질의 원래 빛 색 (번쩍임을 끄면 되돌린다)
  lastX: number; // 지난 프레임 위치 (움직였는지 보고 걷기·멈춤을 고른다)
  lastZ: number;
  prevAtk: number; // 지난 프레임의 공격 모션 값 (새 공격을 알아채는 데 쓴다)
  attack: string; // 이 캐릭터의 공격 동작 이름
};

const hash = (a: number, b: number) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class World3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private models = new Map<ModelKey, Model>();
  private dying: { root: THREE.Object3D; mixer: THREE.AnimationMixer; until: number; squash?: THREE.Vector3 }[] = []; // 죽는 모습을 보여 주는 중인 적
  private players = new Map<string, Char>();
  private enemies = new Map<number, Char>();
  private eliteRings = new Map<number, THREE.Mesh>(); // 중간보스 발밑의 금빛 고리
  private projectiles = new Map<number, THREE.Object3D>();
  private drops = new Map<number, THREE.Object3D>();
  private npcs: Char[] = []; // 상인처럼 제자리에서 움직이기만 하는 캐릭터
  private gates: { group: THREE.Group; open: boolean; t: number }[] = []; // 구역 출구의 철문 (열리면 땅속으로 내려간다)
  private portals: { enter: THREE.Group; exit: THREE.Group }[] = []; // 던전마다 문 (맵 위 입구, 투기장 북쪽 출구)
  private playerLookKeys = new Map<string, string>(); // 플레이어마다 지금 겉모습 (직업:유니크 무기 효과)
  /** 구역 날씨: 카메라가 그 구역 위에 있을 때 주변에 도는 입자 (3구역 눈, 5구역 불씨) */
  private weather: { pts: THREE.Points; zone: number; mode: 'fall' | 'rise' | 'drift' }[] = [];
  private camTarget = new THREE.Vector3();
  private tmpSize = new THREE.Vector2();
  private camReady = false;
  /** 맵 편집기의 3D 보기처럼 플레이어 없이 카메라를 직접 움직일 때 true (update가 플레이어를 따라가지 않는다) */
  freeCamera = false;
  /** 카메라와 바라보는 곳 사이 거리 (편집기 3D 보기에서 확대·축소) */
  camDist = CAM_DIST;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pxPerUnit = 40;
  private clock = 0;
  /** 스킬·폭발 연출 */
  readonly fx: SkillFx;

  constructor(private phaserCanvas: HTMLCanvasElement, private level: Level) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '0';
    phaserCanvas.style.position = 'relative';
    phaserCanvas.style.zIndex = '1';
    phaserCanvas.parentElement!.insertBefore(this.canvas, phaserCanvas);

    // 모바일(터치 기기)은 화질을 조금 낮춰 가볍게 돌린다: 안티앨리어싱 끄기, 화소 배율·그림자 해상도 낮추기
    const mobile = isTouchDevice();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(mobile ? 1.5 : 2, window.devicePixelRatio));
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.background = new THREE.Color(0x1d2620);
    this.scene.fog = new THREE.Fog(0x1d2620, 22, 40);
    this.camera = new THREE.PerspectiveCamera(38, VIEW_W / VIEW_H, 0.5, 80);

    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 1.6));
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.fx = new SkillFx(this.scene);
  }

  async load() {
    const loader = new GLTFLoader();
    await Promise.all([
      ...(Object.keys(MODELS) as (keyof typeof MODELS)[]).map(async (k) => {
        const g = await loader.loadAsync(`${BASE}${MODELS[k]}.glb`);
        g.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        // 마왕성(10구역) 성벽·망루는 검붉은 돌로 (철문 옆 망루는 다른 키라 그대로)
        if (k === 'csWall' || k === 'csTower') {
          g.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).color.multiply(new THREE.Color(0x5a4648));
          });
        }
        this.models.set(k, g);
      }),
      this.loadDragon(),
      this.loadGoblin(loader),
      this.loadRanger(loader),
      this.loadWizard(loader),
      this.loadWarrior(loader),
      this.loadCleric(loader),
      ...(Object.keys(UACP) as UacpKey[]).map((k) => this.loadUacp(loader, k)),
      this.loadSlime(loader, 'slime', 'slime'),
      this.loadSlime(loader, 'slimePurple', 'slime_purple'),
      this.loadOutlaw(loader),
    ]);
    this.buildWorld();
  }

  /**
   * 최종 보스 드래곤: 몸(dragon.dae)과 동작별 애니메이션 파일 4개.
   * 애니메이션 파일의 트랙은 그 파일 안에서만 통하는 노드 id(uuid)를 가리키므로 뼈 이름으로 바꿔서 붙인다.
   */
  private async loadDragon() {
    const loader = new ColladaLoader();
    const dir = `${BASE}dragon/`;
    const [body, black, ...clips] = await Promise.all([
      loader.loadAsync(`${dir}dragon.dae`),
      new THREE.TextureLoader().loadAsync(`${dir}dragon_black.png`),
      ...['idle', 'walk', 'attack', 'die'].map(async (name) => {
        const file = await loader.loadAsync(`${dir}dragon_${name}.dae`);
        const tracks = file.scene.animations.flatMap((clip) => clip.tracks).map((t) => {
          const dot = t.name.indexOf('.');
          const node = file.scene.getObjectByProperty('uuid', t.name.slice(0, dot));
          const track = t.clone();
          track.name = `${node?.name ?? t.name.slice(0, dot)}${t.name.slice(dot)}`;
          return track;
        });
        return new THREE.AnimationClip(name, -1, tracks);
      }),
    ]);
    // 검은 비늘 텍스처로 바꾸고, 피격 번쩍임(emissive)이 되도록 표준 재질로
    black.colorSpace = THREE.SRGBColorSpace;
    body.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = new THREE.MeshStandardMaterial({ map: black, roughness: 0.75 });
      mesh.castShadow = true;
      mesh.frustumCulled = false; // 애니메이션으로 몸이 원래 경계 밖까지 움직인다
    });
    // 원본은 머리가 -x를 향한다. 다른 캐릭터처럼 +z를 보게 돌려 둔다
    const yaw = new THREE.Group();
    yaw.rotation.y = Math.PI / 2;
    yaw.add(body.scene);
    const root = new THREE.Group();
    root.add(yaw);
    this.models.set('dragon', { scene: root, animations: clips });
  }

  /**
   * 첫 번째 문지기: Kelgar 프로젝트의 고블린 (CC0, Blender 파일을 GLB로 바꾼 것, public/assets/goblin/License.txt).
   * 원본은 키가 약 12라서 Kenney 캐릭터(약 0.8)와 같은 키로 줄여 둔다. 클립 이름은 ELITE_LOOKS의 anims로 맞춘다.
   */
  private async loadGoblin(loader: GLTFLoader) {
    const g = await loader.loadAsync(`${BASE}goblin/goblin.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // 애니메이션으로 몸이 원래 경계 밖까지 움직인다
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.8 / 12);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('goblinKeeper', { scene: root, animations: g.animations });
  }

  /** Quaternius Ranger (CC0). FBX 원본 키 약 3.76을 플레이어 캐릭터 크기에 맞추고 활쏘기 동작을 보존한다. */
  private async loadRanger(loader: GLTFLoader) {
    const g = await loader.loadAsync(`${BASE}characters/ranger.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.emissive.set(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 1.2;
      }
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.85 / 3.763);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('ranger', { scene: root, animations: g.animations });
  }

  /** Quaternius Wizard (CC0). 원본 키 약 3.92를 플레이어 크기에 맞춘다. */
  private async loadWizard(loader: GLTFLoader) {
    const g = await loader.loadAsync(`${BASE}characters/wizard.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.emissive.set(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 1.2;
      }
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.85 / 3.916);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('wizard', { scene: root, animations: g.animations });
  }

  /** Quaternius Warrior (CC0). 원본 키 약 3.92를 플레이어 크기에 맞춘다. */
  private async loadWarrior(loader: GLTFLoader) {
    const g = await loader.loadAsync(`${BASE}characters/warrior.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.emissive.set(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 1.2;
      }
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.85 / 3.916);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('warrior', { scene: root, animations: g.animations });
  }

  /** Quaternius Cleric (CC0). 원본 키 약 2.91을 플레이어 크기에 맞춘다. */
  private async loadCleric(loader: GLTFLoader) {
    const g = await loader.loadAsync(`${BASE}characters/cleric.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.emissive.set(0xffffff);
        material.emissiveMap = material.map;
        material.emissiveIntensity = 1.2;
      }
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.85 / 2.911);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('cleric', { scene: root, animations: g.animations });
  }

  /** 슬라임 모델 (원본이 커서 지름 0.7칸 정도로 줄인다. 뼈대 배율 때문에 정점 크기보다 크게 그려져 실제 화면을 보고 맞춘 값) */
  private async loadSlime(loader: GLTFLoader, key: 'slime' | 'slimePurple', file: string) {
    const g = await loader.loadAsync(`${BASE}slime/${file}.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.16);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set(key, { scene: root, animations: g.animations });
  }

  /**
   * 9구역 던전 보스 해골 무법자 (Kevin Iglesias, CC0). 원본 FBX 6.1을 GLB로 바꾼 것이라 텍스처는 따로 불러 입힌다 (도끼만 도끼 텍스처).
   * 키가 약 3.44라 Kenney 캐릭터 키로 줄인다. 동작: Idle·Walk·Run·Attack00~02·Damage·Dead·Jump
   */
  private async loadOutlaw(loader: GLTFLoader) {
    const [g, skin, axe] = await Promise.all([
      loader.loadAsync(`${BASE}outlaw/outlaw.glb`),
      new THREE.TextureLoader().loadAsync(`${BASE}outlaw/skeleton.jpg`),
      new THREE.TextureLoader().loadAsync(`${BASE}outlaw/axe.jpg`),
    ]);
    for (const t of [skin, axe]) t.colorSpace = THREE.SRGBColorSpace; // 원본 FBX와 같이 flipY 그대로 (UV가 아래쪽 원점)
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.map = m.name === 'Axe' ? axe : skin;
      m.needsUpdate = true;
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.85 / 3.44);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set('outlaw', { scene: root, animations: g.animations });
  }

  /** 구역별 몬스터 모델 하나 (키 약 3.1 → Kenney 캐릭터와 비슷한 키로 줄인다) */
  private async loadUacp(loader: GLTFLoader, key: UacpKey) {
    const g = await loader.loadAsync(`${BASE}uacp/${UACP[key]}.glb`);
    g.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // 애니메이션으로 몸이 원래 경계 밖까지 움직인다
    });
    const body = new THREE.Group();
    body.scale.setScalar(0.9 / 3.1);
    body.add(g.scene);
    const root = new THREE.Group();
    root.add(body);
    this.models.set(key, { scene: root, animations: g.animations });
  }

  // ─── 정적인 맵 ─────────────────────────────────────

  private buildWorld() {
    const { w, h, tiles, ground } = this.level;

    // 바닥: 칸마다 얇은 상자 하나 (인스턴싱으로 한 번에 그린다)
    const box = new THREE.BoxGeometry(1, 0.4, 1);
    const groundMesh = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), w * h);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        // 빈 칸(던전 줄의 투기장 밖)은 바닥을 그리지 않는다 (크기 0)
        if (tiles[ty * w + tx] === T_VOID) m.makeScale(0, 0, 0);
        else m.makeTranslation(tx + 0.5, -0.2, ty + 0.5);
        groundMesh.setMatrixAt(i, m);
        const g = ground[ty * w + tx];
        const pal = ZONE_PALETTE[zoneOfTx(this.level, tx) - 1];
        c.setHex(g === G_ROAD ? pal.road : g === G_STONE ? STONE : pal.ground);
        c.multiplyScalar(0.92 + hash(tx, ty) * 0.12);
        groundMesh.setColorAt(i++, c);
      }
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // 장애물과 장식
    const place = new Map<ModelKey, THREE.Matrix4[]>();
    const put = (k: ModelKey, x: number, z: number, rot = 0, s = 1, y = 0) => {
      const mat = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
        new THREE.Vector3(s, s, s),
      );
      if (!place.has(k)) place.set(k, []);
      place.get(k)!.push(mat);
    };
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const t = tiles[ty * w + tx];
        if (t === T_VOID) continue; // 빈 칸은 아무것도 그리지 않는다
        const r = hash(tx, ty), r2 = hash(ty, tx);
        const x = tx + 0.5, z = ty + 0.5;
        // 3구역은 설원: 눈 덮인 나무·바위와 눈 무더기·얼음 결정으로 바꿔 그린다
        const zoneHere = tx < this.level.arenaTx ? zoneOfTx(this.level, tx) : 0;
        const special = !this.level.zoneStartsTx.includes(tx) && t !== T_SHOP && t !== T_GATE && t !== T_PROP;
        if (zoneHere === SNOW_ZONE && special) {
          this.putSnow(put, t, tx, ty, r, r2);
          continue;
        }
        // 6~10구역: 구역 테마(ZONE_THEMES)의 나무·바위·바닥 장식으로 그린다
        const theme = ZONE_THEMES[zoneHere];
        if (theme && special) {
          this.putThemed(put, theme, t, tx, ty, r, r2);
          continue;
        }
        if (t === T_TREE) {
          put(r < 0.4 ? 'treeHigh' : 'tree', x + (r2 - 0.5) * 0.3, z + (r - 0.5) * 0.3, r2 * Math.PI * 2, 0.85 + r * 0.3);
        } else if (t === T_SHOP || t === T_GATE || t === T_PROP) {
          // 상점 가판대·철문·장식은 아래에서 따로 놓는다
        } else if (t !== T_FLOOR) {
          let around = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = tx + dx, ny = ty + dy;
              if ((dx || dy) && (nx < 0 || ny < 0 || nx >= w || ny >= h || tiles[ny * w + nx] !== T_FLOOR)) around++;
            }
          if (this.level.zoneStartsTx.includes(tx)) put(r < 0.7 ? 'wallHalf' : 'column', x, z, Math.PI / 2, 1);
          else if (around >= 6) put('rocksHigh', x, z, Math.floor(r2 * 4) * (Math.PI / 2), 1.05);
          else put(r < 0.5 ? 'rocksLow' : r < 0.8 ? 'dRocks' : 'stones', x, z, r2 * Math.PI * 2, 1);
        } else if (ground[ty * w + tx] === G_STONE) {
          put(r < 0.85 ? 'aFloor' : 'aFloorDetail', x, z, 0, 1, 0.001);
        } else if (ground[ty * w + tx] !== G_ROAD && r < 0.05) {
          // 5구역 화산은 풀 대신 붉게 갈라진 용암 자국
          if (tx < this.level.arenaTx && zoneOfTx(this.level, tx) === VOLCANO_ZONE) {
            if (r < 0.03) this.fx.staticDecal(x, z, 1.4 + r2 * 1.6, 'scorch', r2 * Math.PI * 2);
          } else put(r2 < 0.5 ? 'plant' : 'patchGrass', x, z, r2 * Math.PI * 2, 0.9);
        }
      }

    this.buildDungeon(put);

    // 상점: 가판대 앞(길이 있는 남쪽)에 상인. 회복은 초록 천막(옆에 가로등), 공격은 빨간 천막, 방어는 나무 가판대(옆에 수레)
    for (const sh of this.level.shops) {
      const x = sh.x * U, z = sh.y * U;
      if (sh.type === 'forge') {
        // 대장간: 모루와 작업대, 화로
        put('svAnvil', x, z + 0.1, 0, 2.6);
        put('svWorkbench', x - 1.2, z - 0.2, 0.3, 2.2);
        put('svCampfire', x + 1.2, z - 0.1, 0, 2.2);
        put('barrel', x + 1.4, z + 0.9, 0, 0.8);
      } else put(sh.type === 'heal' ? 'stallGreen' : sh.type === 'attack' ? 'stall' : 'stallPlain', x, z, 0, 1.6);
      if (sh.type === 'heal') put('lantern', x - 1.3, z + 0.8, 0, 1.4);
      if (sh.type === 'defense') put('cart', x + 1.6, z + 0.2, -0.5, 1.2);
      const npc = this.makeChar({ model: 'merchant', scale: [1, 1, 1], attack: 'emote-yes' });
      npc.root.position.set(x, 0, z + 0.6);
      npc.root.rotation.y = 0; // +z(남쪽, 길 쪽)를 본다
      this.npcs.push(npc);
    }

    // 맵 편집기로 놓은 장식
    for (const p of this.level.props) {
      const def = PROPS[p.t];
      put(def.model as ModelKey, p.x + 0.5, p.y + 0.5, ((p.r ?? 0) * Math.PI) / 2, def.scale);
    }

    // 구역 출구의 철문: 칸마다 쇠창살 한 장, 양 끝에 망루
    for (const gate of this.level.gates) {
      const group = new THREE.Group();
      const bars = this.models.get('metalGate')!.scene;
      for (let ty = gate.ty0; ty <= gate.ty1; ty++) {
        const piece = bars.clone();
        piece.position.set(gate.tx + 0.5, 0, ty + 0.5);
        piece.scale.set(2, 1.7, 1 / 0.7);
        piece.traverse((o) => (o.castShadow = true));
        group.add(piece);
      }
      this.scene.add(group);
      this.gates.push({ group, open: false, t: 0 });
      put('gateTower', gate.tx + 0.5, gate.ty0 - 0.5, 0, 1.15);
      put('gateTower', gate.tx + 0.5, gate.ty1 + 1.5, 0, 1.15);
    }

    // 구역 날씨: 3 눈, 5 불씨, 6 독 포자, 7 모래바람, 8 수정 가루, 9 안개, 10 붉은 불씨
    this.makeWeather(SNOW_ZONE, 0xffffff, 0.09, 700, 'fall');
    this.makeWeather(VOLCANO_ZONE, 0xff7a30, 0.08, 260, 'rise');
    this.makeWeather(6, 0x9aff60, 0.07, 220, 'rise');
    this.makeWeather(7, 0xe8c888, 0.06, 450, 'drift');
    this.makeWeather(8, 0xc0a8ff, 0.07, 240, 'rise');
    this.makeWeather(9, 0xc8d0d8, 0.9, 90, 'drift', 0.18);
    this.makeWeather(10, 0xff4020, 0.09, 320, 'rise');

    // 출발 지점 야영지
    const s = { x: this.level.start.x * U, z: this.level.start.y * U };
    put('tent', s.x - 2, s.z - 2.2, 0.4, 1.2);
    put('flag', s.x - 0.5, s.z - 2.4, 0, 1.2);
    put('target', s.x + 2, s.z + 2.6, -0.5, 1);
    put('barrel', s.x - 2.6, s.z - 0.6, 0, 0.9);

    // 보스 방: 기둥으로 둘러싸고 뒤쪽에 석상
    const ac = { x: this.level.arenaCenter.x * U, z: this.level.arenaCenter.y * U };
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const px = ac.x + Math.cos(a) * 10.5, pz = ac.z + Math.sin(a) * 9;
      const tx = Math.floor(px), ty = Math.floor(pz);
      if (tx >= 0 && ty >= 0 && tx < w && ty < h && tiles[ty * w + tx] === T_FLOOR && Math.cos(a) > -0.7) {
        put(k % 3 === 0 ? 'aColumnBroken' : 'aColumn', px, pz, 0, 1.4);
      }
    }
    put('statue', ac.x + 10, ac.z, -Math.PI / 2, 2);
    put('aBanner', ac.x + 9.5, ac.z - 3, -Math.PI / 2, 1.6);
    put('aBanner', ac.x + 9.5, ac.z + 3, -Math.PI / 2, 1.6);

    for (const [k, mats] of place) this.instance(k, mats);
  }

  /** mode: fall 위에서 내린다(눈) · rise 땅에서 떠오른다(불씨·포자) · drift 낮게 옆으로 흐른다(모래·안개) */
  private makeWeather(zone: number, color: number, size: number, n: number, mode: 'fall' | 'rise' | 'drift', opacity = 0.85) {
    const rise = mode === 'rise';
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SNOW_BOX.x;
      pos[i * 3 + 1] = Math.random() * (mode === 'drift' ? 3 : SNOW_BOX.y);
      pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size, transparent: true, opacity: rise ? 1 : opacity, depthWrite: false,
      blending: rise ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    pts.frustumCulled = false;
    pts.visible = false;
    this.scene.add(pts);
    this.weather.push({ pts, zone, mode });
  }

  /** 카메라가 그 구역 위에 있으면 눈은 비스듬히 내리고 불씨는 흔들리며 떠오른다 (입자는 카메라를 따라다니며 상자 끝에서 반대쪽으로 돌아간다) */
  private updateWeather(dt: number) {
    const s = this.level.zoneStartsTx;
    const x = this.camTarget.x;
    for (const w of this.weather) {
      const on = s[w.zone - 1] !== undefined && x > s[w.zone - 1] - 6 && x < (s[w.zone] ?? this.level.arenaTx) + 6;
      w.pts.visible = on;
      if (!on) continue;
      w.pts.position.set(this.camTarget.x, 0, this.camTarget.z);
      const pos = w.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        if (w.mode === 'drift') {
          a[i] += dt * (2.2 + (i % 5) * 0.4);
          a[i + 1] += dt * Math.sin(this.clock * 1.5 + i) * 0.2;
          if (a[i + 1] < 0.05) a[i + 1] = 0.05;
        } else if (w.mode === 'rise') {
          a[i + 1] += dt * (0.5 + (i % 5) * 0.15);
          a[i] += dt * Math.sin(this.clock * 2 + i) * 0.5;
          a[i + 2] += dt * Math.cos(this.clock * 1.7 + i) * 0.3;
          if (a[i + 1] > SNOW_BOX.y * 0.5) {
            a[i + 1] = 0;
            a[i] = (Math.random() - 0.5) * SNOW_BOX.x;
            a[i + 2] = (Math.random() - 0.5) * SNOW_BOX.z;
          }
        } else {
          a[i + 1] -= dt * (1.2 + (i % 7) * 0.12);
          a[i] += dt * (0.35 + Math.sin(this.clock + i) * 0.25);
          if (a[i + 1] < 0) {
            a[i + 1] += SNOW_BOX.y;
            a[i] = (Math.random() - 0.5) * SNOW_BOX.x;
          }
        }
        if (a[i] > SNOW_BOX.x / 2) a[i] -= SNOW_BOX.x;
        if (a[i] < -SNOW_BOX.x / 2) a[i] += SNOW_BOX.x;
      }
      pos.needsUpdate = true;
    }
  }

  /** 6~10구역 칸 하나를 구역 테마로 꾸민다 (나무 칸 → theme.trees, 바위 칸 → 안쪽은 rocksHigh·길가는 rocks, 바닥 → 가끔 floor 장식) */
  private putThemed(put: (k: ModelKey, x: number, z: number, rot?: number, s?: number, y?: number) => void, theme: ZoneTheme, t: number, tx: number, ty: number, r: number, r2: number) {
    const { w, h, tiles, ground } = this.level;
    const x = tx + 0.5, z = ty + 0.5, rot = r2 * Math.PI * 2;
    const pick = (list: [ModelKey, number][]) => list[Math.floor(r * 997) % list.length];
    if (t === T_TREE && theme.trees.length) {
      const [k, s] = pick(theme.trees);
      put(k, x + (r2 - 0.5) * 0.3, z + (r - 0.5) * 0.3, rot, s * (0.85 + r * 0.3));
    } else if (t !== T_FLOOR) {
      let around = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if ((dx || dy) && (nx < 0 || ny < 0 || nx >= w || ny >= h || tiles[ny * w + nx] !== T_FLOOR)) around++;
        }
      const [k, s] = pick(around >= 6 ? theme.rocksHigh : theme.rocks);
      put(k, x, z, theme.square ? Math.floor(r2 * 4) * (Math.PI / 2) : rot, s);
    } else if (ground[ty * w + tx] !== G_ROAD && r < theme.floorChance && theme.floor.length) {
      const [k, s] = pick(theme.floor);
      put(k, x, z, rot, s);
    }
  }

  /** 설원(3구역) 칸 하나를 꾸민다 */
  private putSnow(put: (k: ModelKey, x: number, z: number, rot?: number, s?: number, y?: number) => void, t: number, tx: number, ty: number, r: number, r2: number) {
    const { w, h, tiles, ground } = this.level;
    const x = tx + 0.5, z = ty + 0.5, rot = r2 * Math.PI * 2;
    if (t === T_TREE) {
      const jx = x + (r2 - 0.5) * 0.3, jz = z + (r - 0.5) * 0.3;
      if (r < 0.45) put('snowTreeA', jx, jz, rot, 0.7 + r * 0.3);
      else if (r < 0.85) put('snowTreeB', jx, jz, rot, 0.7 + r * 0.25);
      else put('snowTreeSmall', jx, jz, rot, 1.8);
    } else if (t !== T_FLOOR) {
      let around = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if ((dx || dy) && (nx < 0 || ny < 0 || nx >= w || ny >= h || tiles[ny * w + nx] !== T_FLOOR)) around++;
        }
      // 벽 안쪽(사방이 막힌 곳)은 큰 눈 바위, 길가는 작은 바위
      if (around >= 6) put(r < 0.5 ? 'snowRocksL' : 'snowRocksM', x, z, rot, r < 0.5 ? 0.6 : 0.9);
      else put(r < 0.45 ? 'snowRocksM' : r < 0.8 ? 'snowRocksS' : 'snowStones', x, z, rot, r < 0.45 ? 0.6 : r < 0.8 ? 0.7 : 1.6);
    } else if (ground[ty * w + tx] !== G_ROAD) {
      if (r < 0.006) put('snowman', x, z, rot, 0.8);
      else if (r < 0.03) put('snowPile', x, z, rot, 0.7 + r2 * 0.5);
      else if (r < 0.045) put('snowBunker', x, z, rot, 0.7);
      else if (r < 0.055) put(r2 < 0.5 ? 'iceCrystal' : 'iceCrystalL', x, z, rot, 0.9);
    }
  }

  /** 같은 모델을 여러 곳에 그릴 때 인스턴싱 (모델 안의 메시마다 InstancedMesh 하나) */
  private instance(key: ModelKey, mats: THREE.Matrix4[]) {
    const root = this.models.get(key)!.scene;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, mats.length);
      const local = mesh.matrixWorld;
      mats.forEach((mt, i) => im.setMatrixAt(i, mt.clone().multiply(local)));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.scene.add(im);
    });
  }

  /** 문지기가 쓰러진 문은 맵에서 열고(길이 되게), 철문을 땅속으로 천천히 내린다 */
  /** 던전마다 투기장 꾸미기(둘레 장식)와 던전 문 두 개(입구·출구)를 만든다. 화산은 화로·부서진 기둥, 사막은 오벨리스크·모래 바위·선인장 */
  private buildDungeon(put: (k: ModelKey, x: number, z: number, rot?: number, s?: number, y?: number) => void) {
    for (const d of this.level.dungeons) {
      const def = DUNGEONS[d.zone];
      const cx = d.center.x * U, cz = d.center.y * U, r = d.radius * U;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const x = cx + Math.cos(a) * (r - 0.9), z = cz + Math.sin(a) * (r - 0.9);
        if (def?.theme === 'grave') {
          // 묘지: 앙상한 나무와 그루터기, 낮은 비석
          if (i % 2) put('ntTreeThin', x, z, a, 1.2);
          else put(i % 4 ? 'ntStump' : 'ntObelisk', x, z, a, i % 4 ? 1.6 : 0.7);
        } else if (def?.theme === 'desert') {
          if (i % 2) put('ntObelisk', x, z, a, 1.3);
          else put(i % 4 ? 'svSandA' : 'ntCactusTall', x, z, a, i % 4 ? 1.9 : 1.7);
        } else if (i % 2) put('svCampfire', x, z, a, 2.2); // 화로
        else put('aColumnBroken', x, z, a, 1.1);
      }
      const exit = dungeonExit(d);
      const g = { enter: this.makePortal(d.portal.x * U, d.portal.y * U, def?.color ?? 0xff5a30), exit: this.makePortal(exit.x * U, exit.y * U, 0x60c0ff) };
      g.exit.visible = false;
      this.portals.push(g);
    }
  }

  /** 던전 문: 바닥에 빛나는 고리 두 개와 가운데 빛 웅덩이 (돌면서 빛 알갱이가 솟는다) */
  private makePortal(x: number, z: number, color: number) {
    const g = new THREE.Group();
    g.position.set(x, 0.05, z);
    const mat = (o: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 40).rotateX(Math.PI / 2), mat(0.9));
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 32, Math.PI * 1.5).rotateX(Math.PI / 2), mat(0.7));
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.72, 32).rotateX(-Math.PI / 2), mat(0.35));
    ring2.name = 'spin';
    g.add(ring1, ring2, pool);
    g.userData.color = color;
    this.scene.add(g);
    return g;
  }

  /** 던전 문 보이기: 입구는 던전이 열려 있는 동안(시작 전·싸우는 중), 출구는 클리어한 뒤 */
  private syncPortals(s: Snapshot, dt: number) {
    this.portals.forEach((pg, i) => {
      const st = s.dungeons[i]?.state;
      pg.enter.visible = st === 'open' || st === 'active';
      pg.exit.visible = st === 'cleared';
    });
    for (const g of this.portals.flatMap((pg) => [pg.enter, pg.exit])) {
      if (!g.visible) continue;
      g.getObjectByName('spin')!.rotation.y += dt * 2.5;
      g.scale.setScalar(1 + Math.sin(this.clock * 3) * 0.05);
      if (Math.random() < dt * 25) {
        const a = Math.random() * Math.PI * 2, rr = 0.2 + Math.random() * 0.5;
        this.fx.emitGlow(g.position.x + Math.cos(a) * rr, 0.1, g.position.z + Math.sin(a) * rr, 0, 0.8 + Math.random(), 0, 0.9, g.userData.color as number, 0.12);
      }
    }
  }

  private syncGates(s: Snapshot, dt: number) {
    this.gates.forEach((g, i) => {
      if (!g.open && s.gates?.[i]) {
        g.open = true;
        openGate(this.level, i);
      }
      if (!g.open || !g.group.visible) return;
      g.t += dt;
      g.group.position.y = -(Math.min(1, g.t / 1.6) ** 2) * 1.4;
      g.group.position.x = Math.sin(g.t * 40) * 0.02 * Math.max(0, 1 - g.t / 1.6); // 내려가며 덜컹거린다
      if (g.t > 1.6) g.group.visible = false;
    });
  }

  // ─── 캐릭터 ─────────────────────────────────────────

  private makeChar(look: Look): Char {
    const g = this.models.get(look.model)!;
    const root = cloneSkinned(g.scene);
    root.scale.set(look.scale[0] * CHAR_SCALE, look.scale[1] * CHAR_SCALE, look.scale[2] * CHAR_SCALE);
    const materials: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      if (look.hideMeshes?.includes(o.name)) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      if (look.tint !== undefined) mat.color.multiply(new THREE.Color(look.tint));
      mesh.material = mat;
      materials.push(mat);
    });
    for (const wpn of look.weapons ?? []) {
      const bone = root.getObjectByName(wpn.bone);
      if (!bone) continue;
      const wm = this.models.get(wpn.model)!.scene.clone();
      wm.position.set(...wpn.pos);
      wm.rotation.set(...wpn.rot);
      wm.scale.setScalar(wpn.scale);
      if (wpn.glowTip !== undefined) {
        // 창끝을 가리는 위치(모델의 가장 높은 곳)에 구슬을 단다
        const top = new THREE.Box3().setFromObject(this.models.get(wpn.model)!.scene).max.y;
        const orb = new THREE.Mesh(
          new THREE.SphereGeometry(wpn.glowSize ?? 0.07, 12, 8),
          new THREE.MeshStandardMaterial({ color: wpn.glowTip, emissive: wpn.glowTip, emissiveIntensity: 1.5 }),
        );
        orb.position.y = top;
        wm.add(orb);
      }
      bone.add(wm);
    }
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of g.animations) actions.set(clip.name, mixer.clipAction(clip));
    for (const [alias, clip] of Object.entries(look.anims ?? {})) {
      const a = actions.get(clip);
      if (a) actions.set(alias, a);
    }
    this.scene.add(root);
    const ch: Char = {
      root, mixer, actions, current: '', oneShotUntil: 0, materials,
      baseEmissive: materials.map((m) => m.emissive.clone()), lastX: NaN, lastZ: NaN, prevAtk: 0, attack: look.attack,
    };
    this.play(ch, 'idle');
    return ch;
  }

  private play(ch: Char, name: string, once = false) {
    if (ch.current === name && !once) return;
    const next = ch.actions.get(name);
    if (!next) return;
    const prev = ch.actions.get(ch.current);
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.fadeIn(0.12).play();
    if (prev && prev !== next) prev.fadeOut(0.12);
    ch.current = name;
    if (once) ch.oneShotUntil = this.clock + next.getClip().duration * 0.9;
  }

  private placeChar(ch: Char, x: number, y: number, aim: number, lift = 0) {
    const px = x * U, pz = y * U;
    const moved = Number.isNaN(ch.lastX) ? 0 : Math.hypot(px - ch.lastX, pz - ch.lastZ);
    ch.root.position.set(px, lift, pz);
    // 모델은 +z를 바라보므로 월드 조준 방향 (cos, sin) → (x, z)
    const target = Math.atan2(Math.cos(aim), Math.sin(aim));
    ch.root.rotation.y += Math.atan2(Math.sin(target - ch.root.rotation.y), Math.cos(target - ch.root.rotation.y)) * 0.35;
    ch.lastX = px;
    ch.lastZ = pz;
    return moved;
  }

  private flash(ch: Char, on: boolean, color = 0xffffff) {
    ch.materials.forEach((m, i) => m.emissive.copy(on ? new THREE.Color(color).multiplyScalar(0.6) : ch.baseEmissive[i]));
  }

  // ─── 매 프레임 ─────────────────────────────────────

  update(s: Snapshot, myId: string, dt: number) {
    this.clock += dt;
    this.syncPlayers(s, dt);
    this.syncEnemies(s, dt);
    this.syncProjectiles(s);
    this.syncDrops(s);
    this.syncGates(s, dt);
    this.syncPortals(s, dt);
    this.fx.update(dt, s.players, s.enemies);
    for (const npc of this.npcs) npc.mixer.update(dt);

    const me = this.freeCamera ? undefined : s.players.find((p) => p.id === myId);
    if (me) {
      const t = new THREE.Vector3(me.x * U, 0, me.y * U);
      if (!this.camReady) {
        this.camTarget.copy(t);
        this.camReady = true;
      }
      this.camTarget.lerp(t, Math.min(1, dt * 8));
    }
    const ct = this.camTarget;
    this.camera.position.set(ct.x, ct.y + Math.sin(PITCH) * this.camDist, ct.z + Math.cos(PITCH) * this.camDist);
    this.camera.lookAt(ct);
    this.camera.updateMatrixWorld();
    this.updateWeather(dt);
    this.sun.position.set(ct.x - 8, 18, ct.z + 6);
    this.sun.target.position.copy(ct);

    // 화면 1월드칸이 몇 px인지 (HUD 글자 위치 계산용)
    const a = this.project3(ct.x, 0, ct.z), b = this.project3(ct.x + 1, 0, ct.z);
    this.pxPerUnit = Math.abs(b.sx - a.sx);

    this.syncCanvas();
    this.fx.setScreenHeight(this.renderer.getDrawingBufferSize(this.tmpSize).y);
    this.renderer.render(this.scene, this.camera);
  }

  private syncPlayers(s: Snapshot, dt: number) {
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let ch = this.players.get(p.id);
      // 유니크 무기를 끼거나 빼면 손에 든 무기 모양이 바뀌므로 캐릭터를 다시 만든다
      const lookKey = `${p.cls}:${p.weaponFx ?? ''}`;
      if (ch && this.playerLookKeys.get(p.id) !== lookKey) {
        this.scene.remove(ch.root);
        ch = undefined;
      }
      if (!ch) {
        this.players.set(p.id, (ch = this.makeChar(playerLook(p))));
        this.playerLookKeys.set(p.id, lookKey);
      }
      this.placeChar(ch, p.x, p.y, p.aim);
      this.animate(ch, p, dt);
      // 무적(피격 직후) 깜빡임
      ch.root.visible = !(p.invuln > 0 && p.dashTime <= 0 && !p.dead && Math.floor(this.clock * 20) % 2 === 0);
      ch.mixer.update(dt);
    }
    for (const [id, ch] of this.players) if (!seen.has(id)) {
      this.scene.remove(ch.root);
      this.players.delete(id);
    }
  }

  private animate(ch: Char, p: Player, _dt: number) {
    if (p.dead) {
      if (ch.current !== 'die') this.play(ch, 'die', true);
      return;
    }
    if (ch.current === 'die') ch.oneShotUntil = 0;
    const started = p.atkAnim > 0 && p.atkAnim > ch.prevAtk + 0.01;
    ch.prevAtk = p.atkAnim;
    if (started) {
      this.play(ch, CLASSES[p.cls].attack.kind === 'melee' || p.dashTime > 0 ? 'attack-melee-right' : ch.attack, true);
      return;
    }
    if (this.clock < ch.oneShotUntil) return;
    this.play(ch, p.dashTime > 0 ? 'sprint' : p.moving ? 'walk' : 'idle');
  }

  private syncEnemies(s: Snapshot, dt: number) {
    const seen = new Set<number>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let ent = this.enemies.get(e.id);
      if (!ent) {
        const size = e.elite ? ELITE.scale : 1;
        const look = e.tomb ? TOMB_LOOK : (e.elite && ELITE_LOOKS[e.elite]) || ENEMY_LOOKS[e.kind];
        ent = this.makeChar({ ...look, scale: [look.scale[0] * size, look.scale[1] * size, look.scale[2] * size] });
        this.enemies.set(e.id, ent);
        if (e.elite) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.72, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.8, depthWrite: false }),
          );
          this.scene.add(ring);
          this.eliteRings.set(e.id, ring);
        }
      }
      const ring = this.eliteRings.get(e.id);
      if (ring) {
        ring.position.set(e.x * U, 0.03, e.y * U);
        ring.rotation.y = this.clock;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(this.clock * 4);
      }
      this.updateEnemyChar(ent, e, dt);
    }
    for (const [id, ent] of this.enemies) if (!seen.has(id)) {
      this.enemies.delete(id);
      const ring = this.eliteRings.get(id);
      if (ring) {
        this.scene.remove(ring);
        this.eliteRings.delete(id);
      }
      const ch = ent as Char;
      // 화면 안에서 사라졌으면 죽은 것: 쓰러지는 모습을 보여 주고 치운다 (멀어져서 빠진 적은 바로 치운다)
      const { sx, sy } = this.project3(ch.root?.position.x ?? 0, 0, ch.root?.position.z ?? 0);
      const onScreen = sx > -50 && sx < VIEW_W + 50 && sy > -50 && sy < VIEW_H + 50;
      if (onScreen && ch.actions.has('die')) {
        this.flash(ch, false);
        this.play(ch, 'die', true);
        this.dying.push({ root: ch.root, mixer: ch.mixer, until: this.clock + ch.actions.get('die')!.getClip().duration + 0.8 });
      } else if (onScreen) {
        // 죽는 동작이 없는 모델(슬라임): 납작하게 찌그러지며 사라진다
        this.flash(ch, false);
        this.dying.push({ root: ch.root, mixer: ch.mixer, until: this.clock + SQUASH_TIME, squash: ch.root.scale.clone() });
      } else this.scene.remove(ch.root);
    }
    this.dying = this.dying.filter((d) => {
      d.mixer.update(dt);
      if (d.squash) {
        const k = Math.max(0, (d.until - this.clock) / SQUASH_TIME); // 1 → 0
        d.root.scale.set(d.squash.x * (1.5 - 0.5 * k), d.squash.y * k * k, d.squash.z * (1.5 - 0.5 * k));
      }
      if (this.clock < d.until) return true;
      this.scene.remove(d.root);
      return false;
    });
  }

  private updateEnemyChar(ch: Char, e: EnemyView, dt: number) {
    const moved = this.placeChar(ch, e.x, e.y, e.aim, (e.z * U) * (e.kind === 'slime' ? 1.5 : 0.6)); // 슬라임은 통통 튀어 오른다
    const blink = e.hurt > 0 || (e.state === 'windup' && Math.floor(this.clock * 12) % 2 === 0);
    // 냉기 파동·서리로 느려진 적은 푸르게 언 빛, 불타는 적은 주황, 출혈은 붉게
    if (!blink && e.slow > 0) this.flash(ch, true, 0x4a90ff);
    else if (!blink && e.burn > 0) this.flash(ch, Math.floor(this.clock * 8) % 2 === 0, 0xff6a10);
    else if (!blink && e.bleed > 0) this.flash(ch, true, 0x8a1020);
    else this.flash(ch, blink, e.hurt > 0 ? 0xffffff : 0xff3020);
    // 맞은 순간 움찔하는 동작이 있는 모델(슬라임)은 그 동작을 한 번 보여준다 (hurt는 맞으면 0.12초에서 줄어든다)
    if (e.hurt > 0.08 && ch.actions.has('hurt') && ch.current !== 'hurt') this.play(ch, 'hurt', true);
    if (this.clock >= ch.oneShotUntil) {
      if (e.state === 'attack') this.play(ch, ch.attack, true);
      else if (e.state === 'charge') this.play(ch, 'sprint');
      else if (e.state === 'leap') this.play(ch, 'jump');
      else if (e.state === 'windup') this.play(ch, 'holding-right');
      else this.play(ch, moved > 0.002 ? 'walk' : 'idle');
    }
    ch.mixer.update(dt * (e.slow > 0 ? 0.5 : 1));
  }

  private syncProjectiles(s: Snapshot) {
    const seen = new Set<number>();
    for (const pr of s.projectiles) {
      seen.add(pr.id);
      let obj = this.projectiles.get(pr.id);
      if (!obj) {
        obj = this.makeProjectile(pr);
        this.scene.add(obj);
        this.projectiles.set(pr.id, obj);
      }
      const falling = pr.kind === 'rain' || pr.kind === 'meteor' || pr.kind === 'firebomb';
      const y = pr.kind === 'shockwave' ? 0.05 : falling ? pr.z * Z_SCALE * 0.6 + 0.2 : 0.55 + pr.z * Z_SCALE;
      obj.position.set(pr.x * U, y, pr.y * U);
      this.fx.trail(pr, obj.position);
      if (pr.kind === 'arrow' || pr.kind === 'enemyArrow' || pr.kind === 'wave') {
        // 진행 방향(높이 변화 포함)으로 돌린다
        const dir = new THREE.Vector3(pr.vx * U, pr.vz * Z_SCALE, pr.vy * U);
        obj.lookAt(obj.position.clone().add(dir));
      }
    }
    for (const [id, obj] of this.projectiles) if (!seen.has(id)) {
      this.scene.remove(obj);
      this.projectiles.delete(id);
    }
  }

  private makeProjectile(pr: ProjectileView): THREE.Object3D {
    const glow = (color: number, r: number) =>
      new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2 }));
    switch (pr.kind) {
      case 'arrow':
      case 'rain': {
        // 궁수 화살: 화살 모델. 촉이 진행 방향(+z, lookAt 기준)을 향하게 돌려 둔다. 저격·폭풍의 화살(r>7)은 더 크다
        const model = this.models.get('arrowModel')!.scene.clone();
        model.rotation.y = Math.PI;
        model.scale.setScalar(pr.r > 7 ? 0.95 : 0.7);
        if (pr.look === 'frost') {
          // 서리바람 활: 화살을 얼음빛으로 칠하고 스스로 은은하게 빛나게 한다 (재질은 복사해서 다른 화살은 그대로)
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            const m = (mesh.material as THREE.MeshStandardMaterial).clone();
            m.color.lerp(new THREE.Color(0xbfefff), 0.75);
            m.emissive = new THREE.Color(0x3aa8ff);
            m.emissiveIntensity = 0.9;
            mesh.material = m;
          });
        }
        const g = new THREE.Group();
        g.add(model);
        if (pr.kind === 'rain') g.rotation.x = Math.PI / 2; // 화살비는 촉이 아래로
        return g;
      }
      case 'enemyArrow': // 적(해골 궁수 등)의 화살은 플레이어 화살과 구분되게 빨간 막대
        return new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, 0.55, 5).rotateX(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xff6a50 }),
        );
      case 'orb': return pr.look === 'burn' ? glow(0xff6a20, 0.2) : glow(0xc89aff, 0.18); // 업화의 지팡이는 불덩이
      case 'iceOrb': return glow(0x9ae4ff, 0.2); // 얼음 마녀의 냉기 구슬
      case 'rock': // 고블린 투척병의 돌
        return new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9 }));
      case 'fireball': return glow(0xff7a20, 0.35);
      case 'meteor': return glow(0xff5010, 0.9);
      case 'firebomb': return glow(0xff6a1a, 0.32); // 흑룡의 화염탄
      case 'shockwave':
        return new THREE.Mesh(
          new THREE.CylinderGeometry(0.4, 0.4, 0.06, 16),
          new THREE.MeshStandardMaterial({ color: 0xff9a40, emissive: 0xff7a20, transparent: true, opacity: 0.8 }),
        );
      case 'wave':
        return new THREE.Mesh(
          new THREE.TorusGeometry(0.9, 0.08, 6, 20, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x88ccff, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }),
        );
    }
  }

  private syncDrops(s: Snapshot) {
    const seen = new Set<number>();
    for (const d of s.drops) {
      seen.add(d.id);
      let obj = this.drops.get(d.id);
      if (!obj) {
        obj = this.makeDrop(d);
        this.scene.add(obj);
        this.drops.set(d.id, obj);
      }
      // 바닥 빛은 땅에 두고, 물건만 통통 튀며 돈다
      obj.position.set(d.x * U, 0, d.y * U);
      const model = obj.userData.model as THREE.Object3D;
      model.position.y = (d.z > 0 ? d.z : Math.sin(this.clock * 3 + d.id) * 3 + 5) * U;
      model.rotation.y = this.clock * 1.2 + d.id;
      // 빛기둥은 천천히 숨 쉬듯 밝아졌다 어두워진다
      const beam = obj.userData.beam as THREE.Mesh | undefined;
      if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.13 * Math.sin(this.clock * 3 + d.id);
    }
    for (const [id, obj] of this.drops) if (!seen.has(id)) {
      this.scene.remove(obj);
      this.drops.delete(id);
    }
  }

  /**
   * 바닥에 떨어진 물건: 장비는 등급 색으로 빛나는 상자, 회복 음식은 HP(빨강)·MP(파랑) 빛 위의 음식.
   * 음식 모델은 종류마다 두 가지 중 하나 (id로 정해서 모두에게 같은 모습).
   */
  private makeDrop(d: DropView): THREE.Object3D {
    const group = new THREE.Group();
    let key: ModelKey, glow: number;
    if (d.kind === 'item') {
      key = 'chest';
      glow = new THREE.Color(RARITY[d.item!.rarity].color).getHex();
    } else if (d.kind === 'gold') {
      key = 'coin';
      glow = 0xffcc33;
    } else if (d.kind === 'hpFood') {
      key = d.id % 2 ? 'ham' : 'apple';
      glow = 0xff4050;
    } else {
      key = d.id % 2 ? 'grapes' : 'wine';
      glow = 0x4a80ff;
    }

    const model = this.models.get(key)!.scene.clone();
    model.scale.setScalar(DROP_SCALE[key] ?? 1);
    if (d.kind === 'item') {
      // 장비 상자는 등급 색으로 칠하고 빛나게 한다 (일반은 나무색 그대로)
      const look = CHEST_LOOK[d.item!.rarity];
      const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(glow), look.tint);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(tint);
        mat.emissive = new THREE.Color(glow).multiplyScalar(look.glow);
        mesh.material = mat;
      });
      // 영웅·전설은 멀리서도 보이게 등급 색 빛기둥
      if (look.pillar > 0) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.24, look.pillar, 16, 1, true).translate(0, look.pillar / 2, 0),
          new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        group.add(beam);
        group.userData.beam = beam;
      }
    }
    group.add(model);
    group.userData.model = model;

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    disc.position.y = 0.02;
    group.add(disc);
    return group;
  }

  // ─── 화면 좌표 (HUD·입력용) ─────────────────────────
  // 모두 게임 월드 좌표(px) 기준이다. 화면 좌표는 게임 화면(VIEW_W×VIEW_H) 기준.

  private project3(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { sx: ((v.x + 1) / 2) * VIEW_W, sy: ((1 - v.y) / 2) * VIEW_H };
  }

  /** 월드 바닥의 한 점 → 화면 좌표 */
  toScreen(x: number, y: number) {
    return this.project3(x * U, 0, y * U);
  }

  /** 화면 좌표 → 월드 바닥의 한 점 (마우스 조준용) */
  toWorld(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / VIEW_W) * 2 - 1, 1 - (sy / VIEW_H) * 2);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return { x: this.camTarget.x / U, y: this.camTarget.z / U };
    return { x: hit.x / U, y: hit.z / U };
  }

  /** 화면 기준 방향(키보드·스틱) → 월드 방향. 카메라가 북쪽을 보므로 화면 오른쪽 = +x, 화면 위 = -y */
  screenDirToWorld(dx: number, dy: number) {
    const len = Math.hypot(dx, dy);
    return len ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
  }

  /** 월드에서 반지름 r인 바닥 원이 화면에서 보이는 타원의 폭/높이 */
  groundEllipse(r: number) {
    const w = 2 * r * U * this.pxPerUnit;
    return { w, h: w * Math.sin(PITCH) };
  }

  /** 카메라가 바라보는 곳 (월드 px). 자유 카메라용 */
  get lookAtPx() {
    return { x: this.camTarget.x / U, y: this.camTarget.z / U };
  }

  /** 카메라가 (x, y) 월드 px를 바라보게 한다. 자유 카메라용 */
  lookAtWorld(x: number, y: number) {
    this.camTarget.set(x * U, 0, y * U);
    this.camReady = true;
  }

  /** 자유 카메라의 거리를 바꾼다. 멀어지면 안개·그림자 범위도 넓혀 맵이 잘리지 않게 한다 */
  setCamDist(d: number) {
    this.camDist = d;
    const k = d / CAM_DIST;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = 22 * k;
    fog.far = 40 * k;
    this.camera.far = 80 * k;
    this.camera.updateProjectionMatrix();
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -18 * k;
    sc.right = sc.top = 18 * k;
    sc.far = 60 * k;
    sc.updateProjectionMatrix();
  }

  /** 그리는 해상도와 화면 비율을 바꾼다 (게임은 960×544 고정, 편집기 3D 보기는 창 크기에 맞춘다) */
  setViewport(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 바닥에서 높이 z(월드 px)인 지점이 화면에서 얼마나 위에 보이는지(px) */
  heightPx(z: number) {
    return z * U * this.pxPerUnit * Math.cos(PITCH) * 0.85;
  }

  /** Phaser 캔버스와 같은 자리·크기로 3D 캔버스를 맞춘다 (창 크기 변경 대응) */
  private syncCanvas() {
    const pc = this.phaserCanvas;
    const st = this.canvas.style;
    const left = `${pc.offsetLeft}px`, top = `${pc.offsetTop}px`;
    const width = `${pc.clientWidth}px`, height = `${pc.clientHeight}px`;
    if (st.left !== left) st.left = left;
    if (st.top !== top) st.top = top;
    if (st.width !== width) st.width = width;
    if (st.height !== height) st.height = height;
  }

  destroy() {
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // 편집기에서 3D 보기를 여러 번 열고 닫아도 WebGL 컨텍스트가 쌓이지 않게
    this.canvas.remove();
  }
}
