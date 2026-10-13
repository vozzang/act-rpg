// 게임 상태 타입. 호스트의 시뮬레이션과 네트워크 스냅샷이 같은 타입을 공유한다.

export type ClassId = 'swordsman' | 'dwarf' | 'elf' | 'gnome';
export type EnemyKind = 'slime' | 'goblin' | 'skeleton' | 'orc' | 'boss';
export type Slot = 'weapon' | 'armor' | 'accessory';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
  down: boolean; // 아이템 줍기
  skill: boolean;
}

export const EMPTY_INPUT: InputState = { left: false, right: false, jump: false, attack: false, down: false, skill: false };

export interface Stats {
  maxHp: number;
  atk: number;
  def: number;
  crit: number; // 0~1
}

export interface Item {
  id: number;
  slot: Slot;
  rarity: Rarity;
  zone: number; // 드랍된 구역. 이름의 재질과 기본 수치를 결정한다.
  noun?: string; // 무기는 비워두고 착용자 직업에 맞는 이름으로 표시한다.
  stats: Partial<Stats>;
}

export interface Body {
  x: number; // 좌상단
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  onGround: boolean;
}

export interface Player extends Body {
  id: string;
  name: string;
  cls: ClassId;
  facing: 1 | -1;
  hp: number;
  level: number;
  xp: number;
  xpNext: number;
  stats: Stats;
  equip: Partial<Record<Slot, Item>>;
  atkCd: number;
  atkAnim: number; // 공격 모션 남은 시간(렌더용)
  skillCd: number;
  dashTime: number; // 검사 돌진 중 남은 시간
  dashHits: number[]; // 이번 돌진에 이미 맞은 적
  guard: number; // 드워프 방패 태세 남은 시간 (받는 피해 감소)
  invuln: number;
  dead: boolean;
  revive: number; // 부활 게이지 0~REVIVE_TIME
  kills: number;
}

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  zone: number;
  active: boolean;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  xp: number;
  hurt: number; // 피격 번쩍임
  stun: number; // 넉백 중에는 AI가 멈춘다
  taunt: number; // 도발 남은 시간
  tauntBy: string;
  timer: number; // AI용 범용 타이머
  state: 'idle' | 'move' | 'windup' | 'attack' | 'charge' | 'leap';
  stateTime: number;
}

export interface Projectile {
  id: number;
  fromPlayer: boolean;
  ownerId: string;
  kind: 'arrow' | 'orb' | 'enemyArrow' | 'rock' | 'shockwave';
  x: number; // 중심
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  crit: boolean;
  life: number;
  grav: number;
  aoe: number;
  pierce: boolean;
  hitIds: number[]; // 관통 투사체가 이미 맞힌 적
}

export interface Drop {
  id: number;
  kind: 'item' | 'potion';
  item?: Item;
  x: number; // 중심 x, 바닥 y
  y: number;
  vy: number;
}

export type GameEvent =
  | { t: 'dmg'; x: number; y: number; v: number; crit: boolean; toPlayer: boolean }
  | { t: 'heal'; x: number; y: number; v: number }
  | { t: 'boom'; x: number; y: number; r: number }
  | { t: 'levelup'; pid: string; level: number }
  | { t: 'equip'; pid: string; item: Item }
  | { t: 'down'; pid: string }
  | { t: 'revive'; pid: string }
  | { t: 'banner'; text: string; sub?: string }
  | { t: 'skill'; pid: string; x: number; y: number; r: number };

export type GameStatus = 'playing' | 'victory' | 'defeat';

/** 네트워크로 전송되고 렌더러가 그리는 상태. 화면 근처의 엔티티만 담는다. */
export interface Snapshot {
  tick: number;
  camX: number;
  zone: number;
  status: GameStatus;
  players: Player[];
  enemies: Enemy[];
  projectiles: Projectile[];
  drops: Drop[];
  events: GameEvent[];
  boss: { hp: number; maxHp: number } | null;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  cls: ClassId | null;
}
