// 게임 상태 타입. 호스트의 시뮬레이션과 네트워크 스냅샷이 같은 타입을 공유한다.
// 좌표는 모두 "월드 좌표"(위에서 내려다본 평면, px)다. 3D 변환은 렌더러(World3D)만 한다.

/** 직업: 검사(휴먼) · 수호자(드워프) · 궁수(엘프) · 로그(휴먼) · 마법사(노움) */
export type ClassId = 'swordsman' | 'dwarf' | 'elf' | 'rogue' | 'gnome';

/** 몬스터 종류. 능력치·행동 방식은 data/enemies.ts의 ENEMIES */
export type EnemyKind =
  | 'slime' | 'goblin' | 'skeleton' | 'orc' | 'boss'
  // 구역별로 섞여 나오는 몬스터 (Quaternius 캐릭터 모델)
  | 'hound' | 'thrower' // 1구역: 퍼그 졸개, 고블린 투척병
  | 'bandit' | 'assassin' // 2구역: 협곡 산적, 암살자
  | 'raider' | 'iceWitch' // 3구역: 설원 약탈자, 얼음 마녀
  | 'darkKnight' | 'zombie' // 4구역: 흑기사, 망자 병사
  | 'flameKnight' | 'pyromancer'; // 5구역: 불꽃 기사, 화염 술사

/** 장비 종류: 무기 · 방어구 · 장신구 */
export type Slot = 'weapon' | 'armor' | 'accessory';

/** 장비 등급: 일반 · 희귀 · 영웅 · 전설 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** 플레이어 한 명의 한 프레임 입력. 참가자는 이것만 호스트에 보낸다 */
export interface InputState {
  mx: number; // 이동 방향 x (월드 좌표, 길이 0~1)
  my: number; // 이동 방향 y
  aim: number; // 조준 각도 (월드 좌표, 라디안)
  attack: boolean; // 기본 공격 버튼을 누르고 있는지
  skills: number; // 누르고 있는 스킬 키 (비트마스크: 1번 스킬 = 1, 2번 = 2, 3번 = 4, 4번 = 8)
  pickup: boolean; // 줍기 (발밑 장비)
  use: number; // 아이템 상자의 음식 먹기 (비트마스크: HP 음식 = 1, MP 음식 = 2)
}

/** 아무것도 누르지 않은 입력 (입력이 아직 안 왔거나 방장 탭이 뒤에 있을 때) */
export const EMPTY_INPUT: InputState = { mx: 0, my: 0, aim: 0, attack: false, skills: 0, pickup: false, use: 0 };

/** 기본 능력치. 레벨업 자동 상승 + 직접 배분한 포인트 + 장비로 정해진다. */
export interface Attrs {
  str: number; // 힘
  dex: number; // 민첩
  int: number; // 지능
  vit: number; // 체력
}

/** 능력치 이름 ('str' | 'dex' | 'int' | 'vit') */
export type AttrKey = keyof Attrs;

/** 능력치에서 계산되는 전투 수치 */
export interface Stats {
  maxHp: number; // 최대 HP
  atk: number; // 공격력
  def: number; // 방어 (받는 피해를 줄인다)
  crit: number; // 치명타 확률 (0~1)
  haste: number; // 공격 속도 증가 (0.1 = 10% 빠름)
  dodge: number; // 적의 공격을 피할 확률 (0~1, 민첩에서 나온다)
  cdr: number; // 스킬 재사용 가속 (0.1 = 10% 빨리 돌아옴)
  maxMp: number; // 최대 MP
  mpRegen: number; // 초당 MP 회복
}

/** 장비에 붙는 수치 (있는 것만): 공격·방어·최대 HP·치명타 확률과 능력치 */
export type ItemStats = Partial<Record<'atk' | 'def' | 'maxHp' | 'crit' | AttrKey, number>>;

/** 장비 하나. 아이템 목록(data/items.ts)의 정의를 복사해 만든다 */
export interface Item {
  id: number; // 장비마다 다른 번호
  key?: string; // 아이템 목록(data/items.ts)의 키
  slot: Slot; // 종류
  rarity: Rarity; // 등급
  zone: number; // 장비 단계를 대표하는 구역 (단계 × 2 − 1). 대장간 결과 단계를 정할 때 쓴다
  noun?: string; // 종류 이름 (대검·반지 등). 대장간 조합법 재료를 맞출 때 쓴다
  title?: string; // 화면에 보이는 이름 (목록의 장비는 모두 있다)
  stats: ItemStats; // 붙은 수치
  effect?: WeaponEffect; // 맞히면 일정 확률로 생기는 특수 효과 (유니크 전설 무기, 수치는 WEAPON_EFFECTS)
  cls?: ClassId; // 이 직업만 착용(아이템 상자에 넣기)할 수 있다. 다른 직업은 가방에 보관만 (유니크 전설 무기)
}

/**
 * 장비 특수 효과. 무기(맞힐 때): 서리(둔화) · 화염(불타는 지속 피해) · 출혈(겹치는 지속 피해) · 대지 가르기(주변 충격파와 기절).
 * 방어구(맞을 때): 절대방어(일정 확률로 피해를 막는다) · 장신구: 불사(쓰러질 피해를 한 번 버틴다, 재사용 대기)
 */
export type WeaponEffect = 'frost' | 'burn' | 'bleed' | 'quake' | 'aegis' | 'undying';

/** 회복 음식 종류: HP 음식 · MP 음식 */
export type FoodKind = 'hpFood' | 'mpFood';

/** 아이템 상자 한 칸: 장비 하나, 또는 같은 종류 음식 한 묶음 */
export type InvSlot = { kind: 'item'; item: Item } | { kind: FoodKind; count: number };

/** 원형 몸체. x, y는 발밑 중심. */
export interface Body {
  x: number; // 위치 (월드 px)
  y: number;
  vx: number; // 속도 (px/초)
  vy: number;
  r: number; // 충돌 반지름
}

/** 플레이어 캐릭터 */
export interface Player extends Body {
  id: string; // 접속 id (방장은 'host')
  name: string; // 닉네임
  cls: ClassId; // 직업
  aim: number; // 조준 방향 (라디안)
  moving: boolean; // 이번 틱에 움직였는지 (걷기 동작용)
  hp: number;
  mp: number;
  level: number;
  xp: number; // 이번 레벨에서 모은 경험치
  xpNext: number; // 다음 레벨까지 필요한 경험치
  attrs: Attrs; // 최종 능력치 (장비 포함)
  alloc: Attrs; // 직접 배분한 포인트
  points: number; // 남은 배분 포인트
  gold: number; // 가진 돈 (파티 전원이 같은 만큼 받는다)
  inv: (InvSlot | null)[]; // 아이템 상자 (INV_SIZE칸). 상자에 든 장비는 모두 능력치에 더해진다 (= 착용 중)
  undyingCd: number; // 장신구 '불사'를 다시 쓸 수 있을 때까지 남은 시간
  weaponFx?: WeaponEffect; // 착용한 유니크 무기의 효과 (손에 든 무기 모양용. 남의 상자는 스냅샷에 안 보내므로 따로)
  bag: (Item | null)[]; // 가방 (BAG_SIZE칸). 장비를 넣어 두기만 하는 곳이라 능력치에 더해지지 않는다
  stats: Stats; // 능력치·장비로 계산한 전투 수치
  atkCd: number; // 다음 기본 공격까지 남은 시간
  atkAnim: number; // 공격 모션 남은 시간(렌더용)
  skillCds: number[]; // 스킬별 남은 재사용 대기시간
  dashTime: number; // 돌진(돌진 베기·방패 돌진) 중 남은 시간
  dashSkill: number; // 어떤 스킬의 돌진인지 (스킬 순서)
  dashHits: number[]; // 이번 돌진에 이미 맞은 적
  guard: number; // 받는 피해 감소 남은 시간
  guardReduce: number; // 받는 피해 감소율
  atkBuff: number; // 전투 함성 남은 시간
  chill: number; // 얼음 마녀의 냉기에 맞아 느려진 남은 시간
  invuln: number; // 무적 남은 시간 (맞은 직후·부활 직후·회피 직후)
  dead: boolean; // 쓰러졌는지 (동료가 곁에 서 있으면 부활)
  revive: number; // 부활 게이지 0~REVIVE_TIME
  kills: number; // 쓰러뜨린 적 수 (결과 화면용)
  record: PlayerRecord; // 한 판 기록 (결과 화면용)
}

/** 한 판 동안의 개인 기록 (결과 화면에 보여 준다) */
export interface PlayerRecord {
  xp: number; // 얻은 경험치 합
  gold: number; // 얻은 돈 합
  dmg: number; // 적에게 준 피해 합 (지속 피해 포함, 남은 체력보다 많이 준 만큼은 빼고)
  taken: number; // 받은 피해 합
  downs: number; // 쓰러진 횟수
  revives: number; // 쓰러진 동료를 일으킨 횟수 (곁에 서 있기·치유의 빛)
  eliteKills: number; // 쓰러뜨린 중간보스·문지기 수
}

/** 몬스터 (흑룡 포함) */
export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  zone: number; // 놓인 구역 (구역 배율이 붙는다)
  elite: string | null; // 중간보스면 그 이름 (예: '고블린 대장')
  gate: number | null; // 문지기면 지키는 문 번호 (쓰러뜨리면 그 문이 열린다)
  active: boolean; // 플레이어를 알아차렸는지 (깨어나야 움직인다)
  aim: number; // 바라보는 방향
  hp: number;
  maxHp: number;
  atk: number; // 공격력 (구역·인원수 배율이 붙은 값)
  def: number; // 방어 (구역·인원수 배율이 붙은 값)
  xp: number; // 쓰러뜨리면 주는 경험치
  hurt: number; // 피격 번쩍임
  stun: number; // 넉백·기절 중에는 AI가 멈춘다
  slow: number; // 둔화 남은 시간
  burn: number; // 화염 남은 시간 (업화의 지팡이)
  burnDps: number; // 화염 초당 피해
  bleed: number; // 출혈 남은 시간 (선혈의 검)
  bleedStacks: number; // 출혈 겹친 수
  bleedDps: number; // 출혈 한 겹의 초당 피해
  dotBy: string; // 지속 피해를 건 플레이어 id (쓰러뜨린 사람으로 친다)
  dotTick: number; // 지속 피해를 다음에 줄 때까지 남은 시간
  dungeon?: number; // 던전 웨이브로 나온 적이면 그 던전 번호 (Level.dungeons)
  tomb?: boolean; // 던전의 묘비 (움직이지 않고 공격하지 않는 부술 수 있는 물건)
  shielded?: boolean; // 묘비가 서 있어 피해를 거의 받지 않는 보스
  rush: number; // 멀리서 공격받아 쏜 쪽으로 돌격하는 남은 시간 (빨라진다)
  taunt: number; // 도발 남은 시간
  tauntBy: string; // 도발한(또는 멀리서 쏜) 플레이어 id
  timer: number; // AI용 범용 타이머
  state: 'move' | 'windup' | 'attack' | 'charge' | 'leap'; // 행동 단계: 이동 · 힘 모으기 · 공격 · 돌진 · 도약
  stateTime: number; // 지금 단계에 들어온 뒤 지난 시간
  z: number; // 점프 높이 (보스 도약)
  tx: number; // 도약 착지 지점 (암살자는 돌진에 이미 벴는지 표시로 빌려 쓴다)
  ty: number;
}

/** 날아가는 것: 화살·마법 구체·불덩이·충격파 등 (플레이어 것과 적 것 모두) */
export interface Projectile {
  id: number;
  fromPlayer: boolean; // 플레이어가 쏜 것인지
  ownerId: string; // 쏜 플레이어 id (적이 쏜 것은 빈 글자)
  kind: 'arrow' | 'orb' | 'fireball' | 'wave' | 'rain' | 'meteor' | 'enemyArrow' | 'firebomb' | 'shockwave' | 'rock' | 'iceOrb';
  x: number;
  y: number;
  z: number; // 높이 (렌더용 포물선, 돌은 착지 판정에 사용)
  vx: number; // 속도 (px/초)
  vy: number;
  vz: number; // 높이 방향 속도
  gz: number; // 높이 방향 중력
  r: number; // 맞는 판정 반지름
  dmg: number; // 피해량
  crit: boolean; // 치명타인지
  life: number; // 남은 시간 (0이 되면 사라지거나 터진다)
  aoe: number; // 폭발 반지름 (0이면 터지지 않는다)
  pierce: boolean; // 적을 뚫고 지나가는지
  hitIds: number[]; // 관통 투사체가 이미 맞힌 적
  homing?: number; // 따라가는 적 id (자동 조준된 궁수·마법사 기본 공격)
  look?: 'frost' | 'burn'; // 겉모습: frost = 서리바람 활 궁수의 화살 (얼음빛), burn = 업화의 지팡이 마법사의 구체 (불덩이)
  turn?: number; // 따라갈 때 초당 최대로 꺾이는 각도 (라디안)
}

/** 바닥에 떨어진 물건 */
export interface Drop {
  id: number;
  kind: 'item' | 'hpFood' | 'mpFood' | 'gold'; // 장비 / HP 회복 음식 / MP 회복 음식 / 돈
  item?: Item; // 장비일 때
  gold?: number; // 돈일 때 액수
  x: number;
  y: number;
  z: number; // 튀어 오르는 높이
  vz: number; // 튀어 오르는 속도
}

/** 상점 진열대 한 칸. 음식은 무제한, 장비는 플레이어마다 하나씩 살 수 있다 */
export interface ShopEntry {
  kind: 'hpFood' | 'mpFood' | 'item'; // HP 음식 / MP 음식 / 장비
  price: number; // 값 (G)
  item?: Item; // 장비일 때 그 장비 (사면 복사본을 받는다)
  /** 화면용: 보는 플레이어가 이미 산 장비인지 (장비는 플레이어마다 하나씩 살 수 있다) */
  sold: boolean;
  /** 호스트 전용: 이 장비를 산 플레이어 id (스냅샷에는 보내지 않는다) */
  buyers?: string[];
}

/** 상점 종류: 회복(음식), 공격(무기·공격 장신구), 방어(갑옷·방어 장신구), 대장간(파는 물건 없이 장비 조합) */
export type ShopType = 'heal' | 'attack' | 'defense' | 'forge';

/** 상점 가판대 하나 */
export interface Shop {
  id: number; // 맵의 상점 순서
  type: ShopType;
  x: number; // 상인이 서 있는 곳 (월드 좌표)
  y: number;
  zone: number; // 놓인 구역 (파는 장비 단계·대장간 값이 정해진다)
  stock: ShopEntry[]; // 진열대 (대장간은 비어 있다)
}

/** 폭발 연출 종류 (화면 효과만 다르다) */
export type BoomKind = 'orb' | 'fireOrb' | 'fireball' | 'meteor' | 'rain' | 'slam' | 'bossSlam' | 'firebomb' | 'boss';

/**
 * 게임에서 일어난 일. 호스트가 만들어 스냅샷에 담아 보내고, 화면이 숫자·배너·효과·소리로 보여 준다.
 * x·y가 있는 것은 그 자리(월드 좌표)에서, pid가 있는 것은 그 플레이어에게 일어난 일이다.
 */
export type GameEvent =
  | { t: 'dmg'; x: number; y: number; v: number; crit: boolean; toPlayer: boolean; dot?: 'burn' | 'bleed' } // 피해 (v: 피해량, toPlayer: 플레이어가 맞았는지, dot: 화염·출혈 지속 피해)
  | { t: 'proc'; effect: WeaponEffect; x: number; y: number } // 유니크 무기 효과가 걸렸다 (맞은 자리에 얼음·불꽃·피가 튄다)
  | { t: 'warp'; x: number; y: number } // 던전 문으로 순간이동한 자리 (빛 기둥)
  | { t: 'block'; x: number; y: number } // 절대방어로 피해를 막았다 (금빛 방패)
  | { t: 'undying'; x: number; y: number } // 불사로 쓰러질 피해를 버텼다 (보랏빛 불꽃)
  | { t: 'dodge'; x: number; y: number } // 플레이어가 적의 공격을 피했다
  // 소리용 이벤트 (화면 효과는 없다)
  | { t: 'kill'; x: number; y: number; kind: EnemyKind; elite: boolean } // 적이 쓰러졌다
  | { t: 'shoot'; x: number; y: number; kind: Projectile['kind']; enemy: boolean } // 투사체를 쐈다 (기본 공격·적의 원거리 공격)
  | { t: 'gate'; x: number; y: number } // 문이 열렸다
  | { t: 'forged'; pid: string; item: Item; recipe: string | null } // 대장간에서 조합했다 (recipe: 조합법 이름, 랜덤이면 null)
  | { t: 'heal'; x: number; y: number; v: number; passive?: boolean } // HP 회복 (v: 회복량, passive: 패시브 흡혈이라 소리 없이 작게)
  | { t: 'boom'; x: number; y: number; r: number; shake?: boolean; kind?: BoomKind } // 폭발·충격 (r: 반지름, shake: 화면 흔들기)
  | { t: 'levelup'; pid: string; level: number } // 레벨업
  | { t: 'equip'; pid: string; item: Item } // 장비를 얻었다 (주움·구매·조합)
  | { t: 'down'; pid: string } // 쓰러졌다
  | { t: 'revive'; pid: string } // 부활했다
  | { t: 'banner'; text: string; sub?: string } // 화면 가운데 큰 글자 (구역 이름·중간보스 등장·승리 등)
  | { t: 'skill'; pid: string; cls: ClassId; idx: number; x: number; y: number; r: number; aim: number } // 스킬 사용 (idx: 스킬 순서, r: 범위)
  | { t: 'unlock'; pid: string; idx: number } // 새 스킬을 배웠다
  | { t: 'nomp'; pid: string } // MP가 모자라 스킬을 못 썼다
  | { t: 'mana'; x: number; y: number; v: number; passive?: boolean } // MP 회복 (v: 회복량, passive: 패시브 마나 순환이라 소리 없이 작게)
  | { t: 'gold'; pid: string; x: number; y: number; v: number } // 돈을 받았다 (v: 액수)
  | { t: 'bought'; pid: string; entry: ShopEntry } // 상점에서 샀다
  | { t: 'notice'; pid: string; text: string } // 그 플레이어에게만 보이는 짧은 안내 (품절, 상자 가득 등)
  | { t: 'stash'; pid: string; kind: FoodKind } // 주운 음식을 상자에 넣었다
  | { t: 'swing'; x: number; y: number; aim: number; range: number; arc: number; enemy: boolean; look?: WeaponEffect }; // 근접 공격 부채꼴 (enemy: 적의 공격인지, look: 유니크 무기 칼자국 모양)

/** 판 상태: 진행 중 · 승리 · 전멸 */
/** 게임 상태: 진행 중 · 승리(흑룡 처치) · 전멸 · 도중에 끝냄(방장이 끝내기를 눌렀거나 내가 나갔거나 방장 연결이 끊김) */
export type GameStatus = 'playing' | 'victory' | 'defeat' | 'ended';

/** 화면에 필요한 적 정보만 (네트워크로 보내는 양을 줄이려고 공격력·경험치·AI 내부 값 등은 뺀다) */
export type EnemyView = Pick<Enemy,
  'id' | 'kind' | 'elite' | 'x' | 'y' | 'r' | 'aim' | 'hp' | 'maxHp' | 'hurt' | 'stun' | 'slow' | 'burn' | 'bleed' | 'tomb' | 'shielded' | 'taunt' | 'state' | 'timer' | 'z' | 'tx' | 'ty'>;

/** 화면에 필요한 떨어진 물건 정보만 (돈 액수·튀는 속도는 빼고, 장비는 이름·수치를 보여줘야 하므로 남긴다) */
export type DropView = Pick<Drop, 'id' | 'kind' | 'x' | 'y' | 'z' | 'item'>;

/** 화면에 필요한 투사체 정보만 */
export type ProjectileView = Pick<Projectile, 'id' | 'kind' | 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz' | 'r' | 'life' | 'aoe' | 'look'>;

/** 네트워크로 전송되고 렌더러가 그리는 상태. 플레이어들 근처의 엔티티만 담는다. */
export interface Snapshot {
  tick: number; // 게임 틱 (초당 60)
  zone: number; // 맨 앞 플레이어가 도달한 구역
  status: GameStatus;
  players: Player[]; // 다른 플레이어의 상자·가방은 비워서 보낸다
  enemies: EnemyView[]; // 깨어 있고 플레이어 가까이 있는 적
  projectiles: ProjectileView[];
  drops: DropView[];
  shops: Shop[]; // 가까운 상점 (품절은 보는 사람 기준)
  events: GameEvent[]; // 지난 스냅샷 뒤에 일어난 일
  boss: { hp: number; maxHp: number } | null; // 흑룡이 깨어나 있으면 체력 (보스 체력바용)
  gates: boolean[]; // 문마다 열렸는지 ([z - 1] = z구역 출구)
  dungeons: DungeonView[]; // 던전마다 진행 (Level.dungeons 순서)
}

/**
 * 던전 진행 상태. open 아직 아무도 안 들어감(문 열림) · active 싸우는 중(문 열림, 늦게 와도 들어갈 수 있다) ·
 * cleared 다 물리침(보상 상자, 투기장 북쪽에 나가는 문) · closed 끝남(클리어 뒤 모두 나왔거나 실패, 문 닫힘)
 */
export type DungeonState = 'open' | 'active' | 'cleared' | 'closed';

/** 스냅샷의 던전 정보 */
export interface DungeonView {
  zone: number; // 문이 있는 구역
  name: string; // 던전 이름
  state: DungeonState;
  wave: number; // 지금 웨이브 (1부터, 시작 전 0)
  waves: number; // 웨이브 수
  left: number; // 남은 적 수
  cleared: boolean; // 클리어했는지 (끝난 뒤 결과 화면용)
  boss: { name: string; hp: number } | null; // 살아 있는 중간보스·보스 하나 (hp: 남은 비율 0~1)
}

/** 로비(대기실)의 참가자 */
export interface LobbyPlayer {
  id: string; // 접속 id
  name: string; // 닉네임
  cls: ClassId | null; // 고른 직업 (아직 안 골랐으면 null)
}
