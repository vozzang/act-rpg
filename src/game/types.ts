// 게임 상태 타입. 호스트의 시뮬레이션과 네트워크 스냅샷이 같은 타입을 공유한다.
// 좌표는 모두 "월드 좌표"(위에서 내려다본 평면, px)다. 3D 변환은 렌더러(World3D)만 한다.

export type ClassId = 'swordsman' | 'dwarf' | 'elf' | 'gnome';
export type EnemyKind =
  | 'slime' | 'goblin' | 'skeleton' | 'orc' | 'boss'
  // 구역별로 섞여 나오는 몬스터 (Quaternius 캐릭터 모델)
  | 'hound' | 'thrower' // 1구역: 퍼그 졸개, 고블린 투척병
  | 'bandit' | 'assassin' // 2구역: 협곡 산적, 암살자
  | 'raider' | 'iceWitch' // 3구역: 설원 약탈자, 얼음 마녀
  | 'darkKnight' | 'zombie' // 4구역: 흑기사, 망자 병사
  | 'flameKnight' | 'pyromancer'; // 5구역: 불꽃 기사, 화염 술사
export type Slot = 'weapon' | 'armor' | 'accessory';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface InputState {
  mx: number; // 이동 방향 (월드 좌표, 길이 0~1)
  my: number;
  aim: number; // 조준 각도 (월드 좌표, 라디안)
  attack: boolean;
  skills: number; // 누르고 있는 스킬 키 (비트마스크: 1번 스킬 = 1, 2번 = 2, 3번 = 4, 4번 = 8)
  pickup: boolean;
  use: number; // 아이템 상자의 음식 먹기 (비트마스크: HP 음식 = 1, MP 음식 = 2)
}

export const EMPTY_INPUT: InputState = { mx: 0, my: 0, aim: 0, attack: false, skills: 0, pickup: false, use: 0 };

/** 기본 능력치. 레벨업 자동 상승 + 직접 배분한 포인트 + 장비로 정해진다. */
export interface Attrs {
  str: number; // 힘
  dex: number; // 민첩
  int: number; // 지능
  vit: number; // 체력
}

export type AttrKey = keyof Attrs;

/** 능력치에서 계산되는 전투 수치 */
export interface Stats {
  maxHp: number;
  atk: number;
  def: number;
  crit: number; // 0~1
  haste: number; // 공격 속도 증가 (0.1 = 10% 빠름)
  dodge: number; // 적의 공격을 피할 확률 (0~1, 민첩에서 나온다)
  cdr: number; // 스킬 재사용 가속 (0.1 = 10% 빨리 돌아옴)
  maxMp: number;
  mpRegen: number; // 초당 MP 회복
}

/** 장비에 붙는 수치 */
export type ItemStats = Partial<Record<'atk' | 'def' | 'maxHp' | 'crit' | AttrKey, number>>;

export interface Item {
  id: number;
  slot: Slot;
  rarity: Rarity;
  zone: number; // 드랍된 구역. 이름의 재질과 기본 수치를 결정한다.
  noun?: string; // 무기는 비워두고 착용자 직업에 맞는 이름으로 표시한다.
  stats: ItemStats;
}

export type FoodKind = 'hpFood' | 'mpFood';

/** 아이템 상자 한 칸: 장비 하나, 또는 같은 종류 음식 한 묶음 */
export type InvSlot = { kind: 'item'; item: Item } | { kind: FoodKind; count: number };

/** 원형 몸체. x, y는 발밑 중심. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Player extends Body {
  id: string;
  name: string;
  cls: ClassId;
  aim: number;
  moving: boolean;
  hp: number;
  mp: number;
  level: number;
  xp: number;
  xpNext: number;
  attrs: Attrs; // 최종 능력치 (장비 포함)
  alloc: Attrs; // 직접 배분한 포인트
  points: number; // 남은 배분 포인트
  gold: number;
  inv: (InvSlot | null)[]; // 아이템 상자 (INV_SIZE칸). 상자에 든 장비는 모두 능력치에 더해진다
  stats: Stats;
  atkCd: number;
  atkAnim: number; // 공격 모션 남은 시간(렌더용)
  skillCds: number[]; // 스킬별 남은 재사용 대기시간
  dashTime: number; // 돌진(돌진 베기·방패 돌진) 중 남은 시간
  dashSkill: number; // 어떤 스킬의 돌진인지 (스킬 순서)
  dashHits: number[]; // 이번 돌진에 이미 맞은 적
  guard: number; // 받는 피해 감소 남은 시간
  guardReduce: number; // 받는 피해 감소율
  atkBuff: number; // 전투 함성 남은 시간
  chill: number; // 얼음 마녀의 냉기에 맞아 느려진 남은 시간
  invuln: number;
  dead: boolean;
  revive: number; // 부활 게이지 0~REVIVE_TIME
  kills: number;
}

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  zone: number;
  elite: string | null; // 중간보스면 그 이름 (예: '고블린 대장')
  gate: number | null; // 문지기면 지키는 문 번호 (쓰러뜨리면 그 문이 열린다)
  active: boolean;
  aim: number; // 바라보는 방향
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  xp: number;
  hurt: number; // 피격 번쩍임
  stun: number; // 넉백·기절 중에는 AI가 멈춘다
  slow: number; // 둔화 남은 시간
  rush: number; // 멀리서 공격받아 쏜 쪽으로 돌격하는 남은 시간 (빨라진다)
  taunt: number; // 도발 남은 시간
  tauntBy: string;
  timer: number; // AI용 범용 타이머
  state: 'move' | 'windup' | 'attack' | 'charge' | 'leap';
  stateTime: number;
  z: number; // 점프 높이 (보스 도약)
  tx: number; // 도약 착지 지점
  ty: number;
}

export interface Projectile {
  id: number;
  fromPlayer: boolean;
  ownerId: string;
  kind: 'arrow' | 'orb' | 'fireball' | 'wave' | 'rain' | 'meteor' | 'enemyArrow' | 'firebomb' | 'shockwave' | 'rock' | 'iceOrb';
  x: number;
  y: number;
  z: number; // 높이 (렌더용 포물선, 돌은 착지 판정에 사용)
  vx: number;
  vy: number;
  vz: number;
  gz: number; // 높이 방향 중력
  r: number;
  dmg: number;
  crit: boolean;
  life: number;
  aoe: number;
  pierce: boolean;
  hitIds: number[]; // 관통 투사체가 이미 맞힌 적
}

export interface Drop {
  id: number;
  kind: 'item' | 'hpFood' | 'mpFood' | 'gold'; // 장비 / HP 회복 음식 / MP 회복 음식 / 돈
  item?: Item;
  gold?: number;
  x: number;
  y: number;
  z: number;
  vz: number;
}

/** 상점 진열대 한 칸. 음식은 무제한, 장비는 하나뿐이라 누가 사면 품절 */
export interface ShopEntry {
  kind: 'hpFood' | 'mpFood' | 'item';
  price: number;
  item?: Item;
  /** 화면용: 보는 플레이어가 이미 산 장비인지 (장비는 플레이어마다 하나씩 살 수 있다) */
  sold: boolean;
  /** 호스트 전용: 이 장비를 산 플레이어 id (스냅샷에는 보내지 않는다) */
  buyers?: string[];
}

/** 상점 종류: 회복(음식), 공격(무기·공격 장신구), 방어(갑옷·방어 장신구) */
export type ShopType = 'heal' | 'attack' | 'defense';

export interface Shop {
  id: number;
  type: ShopType;
  x: number; // 상인이 서 있는 곳 (월드 좌표)
  y: number;
  zone: number;
  stock: ShopEntry[];
}

/** 폭발 연출 종류 (화면 효과만 다르다) */
export type BoomKind = 'orb' | 'fireball' | 'meteor' | 'rain' | 'slam' | 'bossSlam' | 'firebomb' | 'boss';

export type GameEvent =
  | { t: 'dmg'; x: number; y: number; v: number; crit: boolean; toPlayer: boolean }
  | { t: 'dodge'; x: number; y: number } // 플레이어가 적의 공격을 피했다
  // 소리용 이벤트 (화면 효과는 없다)
  | { t: 'kill'; x: number; y: number; kind: EnemyKind; elite: boolean } // 적이 쓰러졌다
  | { t: 'shoot'; x: number; y: number; kind: Projectile['kind']; enemy: boolean } // 투사체를 쐈다 (기본 공격·적의 원거리 공격)
  | { t: 'gate'; x: number; y: number } // 문이 열렸다
  | { t: 'heal'; x: number; y: number; v: number }
  | { t: 'boom'; x: number; y: number; r: number; shake?: boolean; kind?: BoomKind }
  | { t: 'levelup'; pid: string; level: number }
  | { t: 'equip'; pid: string; item: Item }
  | { t: 'down'; pid: string }
  | { t: 'revive'; pid: string }
  | { t: 'banner'; text: string; sub?: string }
  | { t: 'skill'; pid: string; cls: ClassId; idx: number; x: number; y: number; r: number; aim: number }
  | { t: 'unlock'; pid: string; idx: number }
  | { t: 'nomp'; pid: string }
  | { t: 'mana'; x: number; y: number; v: number }
  | { t: 'gold'; pid: string; x: number; y: number; v: number }
  | { t: 'bought'; pid: string; entry: ShopEntry }
  | { t: 'notice'; pid: string; text: string } // 그 플레이어에게만 보이는 짧은 안내 (품절, 상자 가득 등)
  | { t: 'stash'; pid: string; kind: FoodKind }
  | { t: 'swing'; x: number; y: number; aim: number; range: number; arc: number; enemy: boolean };

export type GameStatus = 'playing' | 'victory' | 'defeat';

/** 네트워크로 전송되고 렌더러가 그리는 상태. 플레이어들 근처의 엔티티만 담는다. */
/** 화면에 필요한 적 정보만 (네트워크로 보내는 양을 줄이려고 공격력·경험치·AI 내부 값 등은 뺀다) */
export type EnemyView = Pick<Enemy,
  'id' | 'kind' | 'elite' | 'x' | 'y' | 'r' | 'aim' | 'hp' | 'maxHp' | 'hurt' | 'stun' | 'slow' | 'taunt' | 'state' | 'timer' | 'z' | 'tx' | 'ty'>;

/** 화면에 필요한 떨어진 물건 정보만 (돈 액수·튀는 속도는 빼고, 장비는 이름·수치를 보여줘야 하므로 남긴다) */
export type DropView = Pick<Drop, 'id' | 'kind' | 'x' | 'y' | 'z' | 'item'>;

/** 화면에 필요한 투사체 정보만 */
export type ProjectileView = Pick<Projectile, 'id' | 'kind' | 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'r' | 'life' | 'aoe'>;

export interface Snapshot {
  tick: number;
  zone: number;
  status: GameStatus;
  players: Player[];
  enemies: EnemyView[];
  projectiles: ProjectileView[];
  drops: DropView[];
  shops: Shop[];
  events: GameEvent[];
  boss: { hp: number; maxHp: number } | null;
  gates: boolean[]; // 문마다 열렸는지 ([z - 1] = z구역 출구)
}

export interface LobbyPlayer {
  id: string;
  name: string;
  cls: ClassId | null;
}
