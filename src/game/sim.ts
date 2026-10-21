// 게임 시뮬레이션. 호스트에서만 실행되고, 클라이언트는 스냅샷을 받아 그리기만 한다.
import {
  AGGRO_RANGE, BAG_SIZE, FORGE, ITEM_DROP_MULT, TICK_RATE, ATTR_EFFECT, ATTR_KEYS, CLASSES, ELITE, ELITES, ENEMIES, GATE_KEEPERS, FOOD, INV_SIZE, POINTS_PER_LEVEL, REVIVE_TIME, SHOP, SKILL, TILE, ZONE_NAMES,
  deriveStats, makeItem, partyHpScale, partyAtkScale, partyDefScale, skillMpCost, canEquip, DUNGEONS, type DungeonDef, ITEM_LIST, UNIQUE_DROP, WEAPON_EFFECTS, itemFromDef, PASSIVE, arrowCount, ironSkinRate, lifestealRate, manaFlowRate, rogueCritMultiplier, type EliteDef, shopStock, matchRecipe, recipeItem, recipeName, randomForgeRarity, totalAttrs, xpForLevel, zoneScale, type AttackDef,
} from './data';
import { blockedAt, dungeonExit, mulberry32, openGate, zoneOfTx, type DungeonArena, type Level } from './level';
import { gameLevel } from './world';
import { NavField, angleDiff, approach, dist, lineOfSight, moveBody, pointBlocked, pushBody } from './physics';
import {
  EMPTY_INPUT,
  type AttrKey, type Drop, type FoodKind, type Item, type Enemy, type EnemyKind, type EnemyView, type ProjectileView, type GameEvent, type GameStatus, type InputState,
  type DungeonState, type LobbyPlayer, type Player, type Projectile, type Shop, type Snapshot,
} from './types';

/** 투사체를 쏘는 기본 공격 설정 (궁수·마법사) */
type ProjectileAttack = Extract<AttackDef, { kind: 'projectile' }>;

const DEV_MAX_LEVEL = 60; // 개발용 레벨 조정(setLevel)의 최고 레벨
const NAV_EVERY = 15; // 길찾기 지도 갱신 주기 (틱)
const SNAPSHOT_RADIUS = 520; // 플레이어로부터 이 거리 안의 엔티티만 전송 (화면 대각선 + 여유)
const CHILL_TIME = 2; // 얼음 마녀의 냉기 구슬에 맞으면 이 시간 동안
const CHILL_SLOW = 0.6; // 이동 속도가 이만큼으로 줄어든다
const DODGE_INVULN = 0.4; // 공격을 피한 뒤 무적 시간
/** 근접 몬스터가 minDist보다 멀리서 맞으면 time초 동안 speed배로 쏜 플레이어에게 돌격한다 */
const RUSH = { minDist: 160, time: 2.5, speed: 1.7 };

export class Sim {
  readonly level: Level;
  private rng: () => number;
  tick = 0;
  zone = 0;
  status: GameStatus = 'playing';
  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  drops: Drop[] = [];
  shops: Shop[] = [];
  private events: GameEvent[] = [];
  private inputs = new Map<string, InputState>();
  private prevInputs = new Map<string, InputState>();
  private navs = new Map<string, NavField>();
  private nextId = 1;
  private arenaLocked = false;
  /** 문마다 열렸는지 ([z - 1] = z구역 출구) */
  gates: boolean[];
  private gateNoticeAt = new Map<string, number>(); // 닫힌 문 안내를 너무 자주 띄우지 않도록
  private leechAcc = new Map<string, number>(); // 흡혈로 모은 소수점 회복량 (플레이어별)
  private uniquesDropped = new Set<string>(); // 이번 판에 이미 나온 유니크 무기 (한 판에 하나씩)
  /** 던전 진행 (맵에 던전 문이 없으면 null). wave: 나온 웨이브 수, timer: 다음 웨이브까지 남은 시간 */
  dungeons: { state: DungeonState; wave: number; timer: number; summon: number; tombTimer: number; tombsUp: boolean; cleared: boolean }[] = [];
  private endTimer = 0;
  private pendingStatus: GameStatus | null = null;

  /** seed는 떨어지는 물건 같은 운에만 쓴다. 맵은 모두 같은 맵(gameLevel) */
  constructor(seed: number, lobby: LobbyPlayer[], level: Level = gameLevel()) {
    this.level = level;
    this.dungeons = level.dungeons.map(() => ({ state: 'open', wave: 0, timer: 0, summon: 0, tombTimer: 0, tombsUp: false, cleared: false }));
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.gates = this.level.gates.map(() => false);
    lobby.forEach((lp, i) => this.players.push(this.createPlayer(lp, i)));
    const party = this.players.length;
    for (const s of this.level.spawns) {
      const elite = s.gate !== undefined ? GATE_KEEPERS[s.gate] : s.elite !== undefined ? ELITES[s.zone - 1][s.elite] : undefined;
      const e = this.createEnemy(s.kind, s.zone, party, elite);
      e.gate = s.gate ?? null;
      e.x = s.x;
      e.y = s.y;
      this.enemies.push(e);
    }
    // 상점 판매 목록은 종류·지점마다 고정 (매 판 같다)
    this.shops = this.level.shops.map((sp, i) => ({
      id: i, type: sp.type, x: sp.x, y: sp.y, zone: sp.zone,
      stock: shopStock(sp.type, sp.zone, () => this.nextId++),
    }));
  }

  setInput(id: string, input: InputState) {
    this.inputs.set(id, input);
  }

  removePlayer(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
    this.inputs.delete(id);
    this.navs.delete(id);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ─── 생성 ──────────────────────────────────────────

  private createPlayer(lp: LobbyPlayer, index: number): Player {
    const def = CLASSES[lp.cls!];
    const ang = (index / 4) * Math.PI * 2;
    const p: Player = {
      id: lp.id, name: lp.name, cls: lp.cls!,
      x: this.level.start.x + Math.cos(ang) * 24, y: this.level.start.y + Math.sin(ang) * 24,
      vx: 0, vy: 0, r: def.r, aim: 0, moving: false,
      hp: 0, level: 1, xp: 0, xpNext: xpForLevel(1),
      attrs: { ...def.attrs }, alloc: { str: 0, dex: 0, int: 0, vit: 0 }, points: 0,
      gold: 0,
      // 음식 먹는 법을 익히도록 HP·MP 음식을 하나씩 넣어 준다
      inv: [{ kind: 'hpFood', count: 1 }, { kind: 'mpFood', count: 1 }, ...Array<null>(INV_SIZE - 2).fill(null)],
      bag: Array<null>(BAG_SIZE).fill(null),
      stats: { maxHp: 0, atk: 0, def: 0, crit: 0, haste: 0, dodge: 0, cdr: 0, maxMp: 0, mpRegen: 0 },
      atkCd: 0, atkAnim: 0, skillCds: [0, 0, 0, 0], dashTime: 0, dashSkill: 0, dashHits: [],
      guard: 0, guardReduce: 0, atkBuff: 0, chill: 0, mp: 0,
      invuln: 0, dead: false, revive: 0, kills: 0, undyingCd: 0,
      record: { xp: 0, gold: 0, dmg: 0, taken: 0, downs: 0, revives: 0, eliteKills: 0 },
    };
    this.recalcStats(p);
    p.hp = p.stats.maxHp;
    p.mp = p.stats.maxMp;
    return p;
  }

  /** elite를 주면 그 능력치로 중간보스를 만든다 (ELITES) */
  private createEnemy(kind: EnemyKind, zone: number, players: number, elite?: EliteDef): Enemy {
    const def = ENEMIES[kind];
    // 흑룡은 구역 배율 없이 자기 능력치 그대로
    const zs = kind === 'boss' ? { hp: 1, atk: 1, def: 0, xp: 1 } : zoneScale(zone);
    const base = elite ?? def;
    const hp = Math.round(base.hp * zs.hp * partyHpScale(players));
    return {
      id: this.nextId++, kind, zone, elite: elite?.name ?? null, gate: null, active: false,
      // 몸집이 커져도 타일 한 칸 틈은 지나가야 하므로 충돌 반지름은 15까지만
      x: 0, y: 0, vx: 0, vy: 0, r: elite ? Math.min(15, def.r * 1.25) : def.r, aim: Math.PI,
      hp, maxHp: hp,
      atk: Math.round(base.atk * zs.atk * partyAtkScale(players)),
      def: Math.round((base.def + zs.def) * partyDefScale(players)),
      xp: Math.round(def.xp * zs.xp * (elite ? ELITE.xp : 1)),
      hurt: 0, stun: 0, slow: 0, burn: 0, burnDps: 0, bleed: 0, bleedStacks: 0, bleedDps: 0, dotBy: '', dotTick: 0, rush: 0, taunt: 0, tauntBy: '', timer: 1 + this.rng(), state: 'move', stateTime: 0,
      z: 0, tx: 0, ty: 0,
    };
  }

  private recalcStats(p: Player) {
    // 상자에 든 장비는 종류와 상관없이 모두 능력치에 더해진다
    const items = p.inv.flatMap((sl) => (sl?.kind === 'item' ? [sl.item] : []));
    p.attrs = totalAttrs(p.cls, p.level, p.alloc, items);
    p.weaponFx = this.weaponEffect(p);
    const oldMax = p.stats.maxHp;
    p.stats = deriveStats(p.cls, p.level, p.attrs, items);
    // 최대 HP가 늘면 늘어난 만큼 현재 HP도 채운다
    if (p.hp > 0) p.hp = Math.min(p.stats.maxHp, p.hp + Math.max(0, p.stats.maxHp - oldMax));
    p.mp = Math.min(p.mp, p.stats.maxMp);
  }

  /** 레벨업 포인트를 능력치 하나에 1 배분한다. */
  allocate(id: string, attr: AttrKey) {
    const p = this.playerById(id);
    if (!p || p.points <= 0 || !ATTR_KEYS.includes(attr)) return;
    p.points--;
    p.alloc[attr]++;
    this.recalcStats(p);
  }

  /**
   * 개발용: 레벨을 바로 바꾼다 (개발 서버에서만 부른다). 경험치는 0부터, HP·MP는 가득 채운다.
   * 레벨업 포인트는 (레벨 − 1) × POINTS_PER_LEVEL 만큼 갖게 되며, 이미 배분한 포인트가 그보다 많으면(레벨을 내렸을 때) 배분을 모두 되돌린다.
   */
  setLevel(id: string, level: number) {
    const p = this.playerById(id);
    if (!p) return;
    const lv = Math.max(1, Math.min(DEV_MAX_LEVEL, Math.round(level)));
    const prev = p.level;
    const total = (lv - 1) * POINTS_PER_LEVEL;
    const used = ATTR_KEYS.reduce((s, k) => s + p.alloc[k], 0);
    if (used > total) p.alloc = { str: 0, dex: 0, int: 0, vit: 0 };
    p.points = total - (used > total ? 0 : used);
    p.level = lv;
    p.xp = 0;
    p.xpNext = xpForLevel(lv);
    this.recalcStats(p);
    if (!p.dead) {
      p.hp = p.stats.maxHp;
      p.mp = p.stats.maxMp;
    }
    if (lv > prev) this.events.push({ t: 'levelup', pid: p.id, level: lv });
    // 새로 배운 스킬을 알린다 (스킬 사용 가능 여부는 레벨로 정해지므로 따로 할 일은 없다)
    CLASSES[p.cls].skills.forEach((sk, idx) => sk.unlock > prev && sk.unlock <= lv && this.events.push({ t: 'unlock', pid: p.id, idx }));
    this.notice(p, `[개발] 레벨 ${lv}${used > total ? ' · 배분한 포인트를 되돌렸어요' : ''}`);
  }

  /**
   * 개발용: z구역 입구에서 시작한다 (개발 서버 로비의 '시작 구역'). 앞 구역들의 문은 열고 그 구역 몬스터는 치운다.
   * 모든 플레이어를 앞 구역 출구 문 바로 뒤(이 구역 입구)에 둔다.
   */
  devStartZone(z: number) {
    const zones = this.level.zoneStartsTx.length;
    const zone = Math.max(1, Math.min(zones, Math.round(z)));
    if (zone <= 1) return;
    for (let i = 0; i < zone - 1; i++) {
      if (this.gates[i]) continue;
      this.gates[i] = true;
      openGate(this.level, i);
    }
    this.enemies = this.enemies.filter((e) => e.kind === 'boss' || e.zone >= zone);
    // 입구 자리: 앞 구역 출구 문(이제 열림) 오른쪽으로 몇 칸, 문 높이 가운데에서 가까운 걸을 수 있는 칸
    const g = this.level.gates[zone - 2];
    const midY = Math.round((g.ty0 + g.ty1) / 2);
    let spot = { tx: g.tx, ty: midY };
    search: for (let dx = 2; dx <= 8; dx++)
      for (const dy of [0, -1, 1, -2, 2, -3, 3]) {
        if (!blockedAt(this.level, g.tx + dx, midY + dy) && !blockedAt(this.level, g.tx + dx + 1, midY + dy)) {
          spot = { tx: g.tx + dx, ty: midY + dy };
          break search;
        }
      }
    this.players.forEach((p, i) => {
      p.x = (spot.tx + 0.5) * TILE + (i % 2) * 20;
      p.y = (spot.ty + 0.5) * TILE + (Math.floor(i / 2) - 0.5) * 20;
      if (pointBlocked(this.level, p.x, p.y)) [p.x, p.y] = [(spot.tx + 0.5) * TILE, (spot.ty + 0.5) * TILE];
    });
    for (const nav of this.navs.values()) nav.originTx = -1; // 문 자리가 길이 됐다
  }

  /**
   * 개발용: 아이템 상자(where 'inv') 또는 가방('bag')의 idx 칸에 목록의 장비(key)를 넣는다. key가 null이면 그 칸을 비운다.
   * 원래 칸에 있던 것은 사라진다. 개발 서버의 장비 시험 창(DevItemPanel)에서만 부른다.
   */
  devSetSlot(id: string, where: 'inv' | 'bag', idx: number, key: string | null) {
    const p = this.playerById(id);
    const d = key ? ITEM_LIST.find((x) => x.key === key) : null;
    if (!p || (key && !d)) return;
    const item = d ? itemFromDef(d, this.nextId++) : null;
    if (where === 'inv' && item && !canEquip(p.cls, item)) return this.notice(p, `${CLASSES[item.cls!].name}만 착용할 수 있어요 (가방 칸에는 넣을 수 있다)`);
    if (where === 'inv') p.inv[idx] = item ? { kind: 'item', item } : null;
    else p.bag[idx] = item;
    this.recalcStats(p);
    p.hp = Math.min(p.hp, p.stats.maxHp);
  }

  // ─── 메인 루프 ──────────────────────────────────────

  step(dt: number) {
    if (this.status !== 'playing') return;
    this.tick++;

    if (this.pendingStatus) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.status = this.pendingStatus;
    }

    if (this.tick % NAV_EVERY === 1) this.updateNav();
    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateZone();
    this.updateDungeons(dt);

    for (const e of this.enemies) {
      if (!e.active) {
        const wake = e.kind === 'boss'
          ? this.arenaLocked
          // 벽 너머(옆 통로)에 있는 플레이어는 알아차리지 못한다
          : this.players.some((p) => !p.dead && dist(p.x, p.y, e.x, e.y) < AGGRO_RANGE && lineOfSight(this.level, e.x, e.y, p.x, p.y));
        if (!wake) continue;
        e.active = true;
        if (e.elite) this.events.push({ t: 'banner', text: '', sub: `⚔ ${e.elite} 등장!` });
      }
      this.updateEnemy(e, dt);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.separateEnemies();

    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.contactDamage();
    this.updateRevive(dt);

    if (!this.pendingStatus && this.players.length > 0 && this.players.every((p) => p.dead)) {
      this.events.push({ t: 'banner', text: '전멸', sub: '모험은 여기서 끝났다...' });
      this.endWith('defeat', 2);
    }

    for (const p of this.players) this.prevInputs.set(p.id, this.inputs.get(p.id) ?? EMPTY_INPUT);
  }

  /** 게임을 도중에 끝낸다 (방장·혼자 하기의 '끝내기'). 모두에게 결과 화면이 뜬다 */
  endEarly() {
    if (this.status === 'playing') this.status = 'ended';
  }

  private endWith(status: GameStatus, delay: number) {
    this.pendingStatus = status;
    this.endTimer = delay;
  }

  private updateNav() {
    for (const p of this.players) {
      if (p.dead) continue;
      let nav = this.navs.get(p.id);
      if (!nav) this.navs.set(p.id, (nav = new NavField(this.level)));
      nav.compute(p.x, p.y);
    }
  }

  // ─── 플레이어 ───────────────────────────────────────

  private updatePlayer(p: Player, dt: number) {
    const inp = this.inputs.get(p.id) ?? EMPTY_INPUT;
    const prev = this.prevInputs.get(p.id) ?? EMPTY_INPUT;
    const def = CLASSES[p.cls];
    p.atkCd -= dt;
    p.atkAnim -= dt;
    for (let i = 0; i < p.skillCds.length; i++) p.skillCds[i] -= dt;
    p.guard -= dt;
    p.atkBuff -= dt;
    p.chill -= dt;
    p.invuln -= dt;
    p.undyingCd -= dt;

    if (p.dead) {
      p.vx = p.vy = 0;
      p.moving = false;
      return;
    }
    p.mp = Math.min(p.stats.maxMp, p.mp + p.stats.mpRegen * dt);
    if (Number.isFinite(inp.aim)) p.aim = inp.aim;

    if (p.dashTime > 0) {
      this.updateDash(p, dt);
      return;
    }

    let mx = Number.isFinite(inp.mx) ? inp.mx : 0;
    let my = Number.isFinite(inp.my) ? inp.my : 0;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const accel = 1800 * dt;
    const speed = def.speed * (p.chill > 0 ? CHILL_SLOW : 1); // 얼음 마녀의 냉기에 맞으면 느려진다
    p.vx = approach(p.vx, mx * speed, accel);
    p.vy = approach(p.vy, my * speed, accel);
    p.moving = len > 0.1;
    moveBody(this.level, p, dt);

    // 새로 누른 스킬 키 (여러 개면 번호가 작은 것 하나만)
    const pressed = (inp.skills | 0) & ~(prev.skills | 0);
    const idx = [0, 1, 2, 3].find((i) => pressed & (1 << i));
    if (idx !== undefined) this.tryUseSkill(p, idx);
    else if (inp.attack && p.atkCd <= 0) this.playerAttack(p);
    if (inp.pickup && !prev.pickup) this.tryPickup(p);
    const used = (inp.use | 0) & ~(prev.use | 0);
    if (used & 1) this.eatFromInv(p, 'hpFood');
    if (used & 2) this.eatFromInv(p, 'mpFood');
  }

  private rollDamage(p: Player, mult: number) {
    let v = p.stats.atk * mult * (0.9 + this.rng() * 0.2);
    if (p.atkBuff > 0) v *= 1 + SKILL.warcry.atk;
    const crit = this.rng() < p.stats.crit;
    if (crit) v *= p.cls === 'rogue' ? rogueCritMultiplier(p.level) : 1.6;
    return { v, crit };
  }

  private playerAttack(p: Player) {
    const a = CLASSES[p.cls].attack;
    p.atkCd = a.cd / (1 + p.stats.haste);
    p.atkAnim = 0.18;

    if (a.kind === 'melee') {
      const dealt = this.meleeArc(p, a.range, a.arc, a.mult, a.knock, 0);
      // 검사 패시브 '흡혈 베기': 기본 공격으로 준 피해의 일부를 HP로
      if (p.cls === 'swordsman' && dealt > 0) this.leech(p, dealt * lifestealRate(p.level));
    } else {
      // 궁수 패시브 '연발 사격': 레벨에 따라 화살이 는다. 자동 조준은 화살마다 다른 적을 노린다 (가까운·정면에 가까운 적부터)
      const count = p.cls === 'elf' ? arrowCount(p.level) : 1;
      const targets = a.assist ? this.assistTargets(p, a.range, a.assist.cone, count) : [];
      const center = targets[0] ? Math.atan2(targets[0].y - p.y, targets[0].x - p.x) : p.aim;
      if (targets[0]) p.aim = center; // 캐릭터도 쏜 쪽을 바라본다 (다음 입력이 오면 다시 바뀐다)
      let spare = 0; // 노릴 적이 없는 화살은 부채꼴로 벌려 쏜다
      for (let i = 0; i < count; i++) {
        const target = targets[i];
        let ang = center;
        if (target) ang = Math.atan2(target.y - p.y, target.x - p.x);
        else if (i > 0) {
          spare++;
          ang = center + PASSIVE.multiShot.spread * Math.ceil(spare / 2) * (spare % 2 ? 1 : -1);
        }
        const d = this.rollDamage(p, a.mult);
        const pr = this.playerProjectile(p, {
          kind: a.proj, ang, speed: a.speed, range: a.range, arcHeight: a.arcHeight,
          r: a.proj === 'orb' ? 9 : 6, aoe: a.aoe, dmg: d.v, crit: d.crit, pierce: false,
        });
        // 자동 조준: 날아가는 동안 노린 적을 따라간다
        if (target && a.assist) {
          pr.homing = target.id;
          pr.turn = a.assist.turn;
        }
        this.projectiles.push(pr);
      }
      this.events.push({ t: 'shoot', x: p.x, y: p.y, kind: a.proj, enemy: false });
    }
  }

  /**
   * 자동 조준 대상 최대 n마리: 조준 방향 좌우 cone 안, 사거리 안에서 벽에 가리지 않은 적.
   * 가까울수록, 조준 방향 정면에 가까울수록 먼저 고른다.
   */
  private assistTargets(p: Player, range: number, cone: number, n: number): Enemy[] {
    const found: { e: Enemy; score: number }[] = [];
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || e.z > 30) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d - e.r > range) continue;
      const off = Math.abs(angleDiff(Math.atan2(e.y - p.y, e.x - p.x), p.aim));
      if (off > cone) continue;
      found.push({ e, score: d * (1 + 2 * off) });
    }
    found.sort((a, b) => a.score - b.score);
    const out: Enemy[] = [];
    for (const f of found) {
      if (out.length >= n) break;
      if (lineOfSight(this.level, p.x, p.y, f.e.x, f.e.y)) out.push(f.e);
    }
    return out;
  }

  /** 착용한 유니크 무기의 특수 효과 (없으면 undefined). 공격 겉모습을 정할 때 쓴다 (방어구 효과는 빼고) */
  private weaponEffect(p: Player) {
    for (const sl of p.inv) if (sl?.kind === 'item' && sl.item.slot === 'weapon' && sl.item.effect) return sl.item.effect;
    return undefined;
  }

  /** 플레이어 앞(또는 주변) 부채꼴 안의 적을 친다. arc가 π 이상이면 360도. 준 피해의 합을 돌려준다. */
  private meleeArc(p: Player, range: number, arc: number, mult: number, knock: number, stun: number): number {
    let dealt = 0;
    const eff = this.weaponEffect(p);
    // 선혈의 검·대지 분쇄 도끼를 낀 사람의 칼자국은 핏빛·흙빛으로 보인다
    const look = eff === 'bleed' || eff === 'quake' ? eff : undefined;
    this.events.push({ t: 'swing', x: p.x, y: p.y, aim: p.aim, range, arc, enemy: false, ...(look ? { look } : {}) });
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || e.z > 30) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      const inArc = arc >= Math.PI || Math.abs(angleDiff(ang, p.aim)) <= arc;
      if (d - e.r <= range && (inArc || d < p.r + e.r + 4)) {
        const dmg = this.rollDamage(p, mult);
        dealt += this.hitEnemy(e, dmg.v, dmg.crit, Math.cos(ang) * knock, Math.sin(ang) * knock, p, stun);
      }
    }
    return dealt;
  }

  private playerProjectile(p: Player, o: {
    kind: Projectile['kind']; ang: number; speed: number; range: number; arcHeight: number;
    r: number; aoe: number; dmg: number; crit: boolean; pierce: boolean;
  }): Projectile {
    const life = o.range / o.speed;
    // 포물선: 0에서 출발해 arcHeight까지 올랐다가 비행이 끝날 때 다시 0
    const vz = (4 * o.arcHeight) / life;
    const gz = (8 * o.arcHeight) / (life * life);
    return {
      id: this.nextId++, fromPlayer: true, ownerId: p.id, kind: o.kind,
      x: p.x + Math.cos(o.ang) * p.r, y: p.y + Math.sin(o.ang) * p.r, z: 0,
      vx: Math.cos(o.ang) * o.speed, vy: Math.sin(o.ang) * o.speed, vz, gz,
      r: o.r, dmg: o.dmg, crit: o.crit, life, aoe: o.aoe, pierce: o.pierce, hitIds: [],
      // 유니크 무기 겉모습: 서리바람 활 궁수의 화살은 얼음빛, 업화의 지팡이 마법사의 구체는 불덩이
      ...(o.kind === 'arrow' && this.weaponEffect(p) === 'frost' ? { look: 'frost' as const } : {}),
      ...(o.kind === 'orb' && this.weaponEffect(p) === 'burn' ? { look: 'burn' as const } : {}),
    };
  }

  /** 하늘에서 (x, y)로 떨어지는 투사체. 땅에 닿을 때 aoe 범위에 피해를 준다. */
  private fallingProjectile(p: Player, kind: 'rain' | 'meteor', x: number, y: number, height: number, fall: number, aoe: number, mult: number): Projectile {
    const d = this.rollDamage(p, mult);
    return {
      id: this.nextId++, fromPlayer: true, ownerId: p.id, kind, x, y, z: height,
      vx: 0, vy: 0, vz: 0, gz: (2 * height) / (fall * fall),
      r: kind === 'meteor' ? 30 : 4, dmg: d.v, crit: d.crit, life: fall, aoe, pierce: false, hitIds: [],
    };
  }

  /** 조준 방향으로 distance만큼 앞의 지점. 벽 너머면 벽 앞에서 멈춘다. */
  private aimPoint(p: Player, distance: number) {
    let x = p.x, y = p.y;
    for (let d = 16; d <= distance; d += 16) {
      const nx = p.x + Math.cos(p.aim) * d, ny = p.y + Math.sin(p.aim) * d;
      if (pointBlocked(this.level, nx, ny)) break;
      x = nx;
      y = ny;
    }
    return { x, y };
  }

  // ─── 스킬 ─────────────────────────────────────────

  private tryUseSkill(p: Player, idx: number) {
    const sk = CLASSES[p.cls].skills[idx];
    if (!sk || p.level < sk.unlock || p.skillCds[idx] > 0) return;
    const cost = skillMpCost(sk, p.level);
    if (p.mp < cost) {
      this.events.push({ t: 'nomp', pid: p.id });
      return;
    }
    p.mp -= cost;
    p.skillCds[idx] = sk.cd / (1 + p.stats.cdr);
    this.useSkill(p, idx);
  }

  private useSkill(p: Player, idx: number) {
    const ev = (r: number, x = p.x, y = p.y) => this.events.push({ t: 'skill', pid: p.id, cls: p.cls, idx, x, y, r, aim: Math.round(p.aim * 100) / 100 });
    const elfArrow = CLASSES.elf.attack as ProjectileAttack;
    switch (`${p.cls}.${idx}`) {
      // ── 검사 ──
      case 'swordsman.0':
        this.startDash(p, 0, SKILL.dash.time);
        ev(0);
        break;
      case 'swordsman.1':
        p.atkAnim = 0.3;
        this.meleeArc(p, SKILL.whirl.radius, Math.PI, SKILL.whirl.mult, 240, 0);
        ev(0);
        break;
      case 'swordsman.2':
        for (const o of this.players) {
          if (!o.dead && dist(p.x, p.y, o.x, o.y) <= SKILL.warcry.radius) o.atkBuff = SKILL.warcry.time;
        }
        ev(SKILL.warcry.radius);
        break;
      case 'swordsman.3': {
        const w = SKILL.wave;
        const d = this.rollDamage(p, w.mult);
        p.atkAnim = 0.3;
        this.projectiles.push(this.playerProjectile(p, {
          kind: 'wave', ang: p.aim, speed: w.speed, range: w.range, arcHeight: 0,
          r: w.r, aoe: 0, dmg: d.v, crit: d.crit, pierce: true,
        }));
        ev(0);
        break;
      }

      // ── 수호자 ──
      case 'dwarf.0': {
        const { radius, time, guard, reduce } = SKILL.taunt;
        this.setGuard(p, guard, reduce);
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0) continue;
          if (dist(p.x, p.y, e.x, e.y) <= radius) {
            e.taunt = e.kind === 'boss' ? time / 2 : time;
            e.tauntBy = p.id;
          }
        }
        ev(radius);
        break;
      }
      case 'dwarf.1':
        p.atkAnim = 0.3;
        this.meleeArc(p, SKILL.slam.radius, Math.PI, SKILL.slam.mult, 160, SKILL.slam.stun);
        this.events.push({ t: 'boom', x: p.x, y: p.y, r: SKILL.slam.radius, kind: 'slam' });
        ev(0);
        break;
      case 'dwarf.2':
        this.startDash(p, 2, SKILL.bash.time);
        ev(0);
        break;
      case 'dwarf.3': {
        const b = SKILL.bastion;
        for (const o of this.players) {
          if (o.dead || dist(p.x, p.y, o.x, o.y) > b.radius) continue;
          this.setGuard(o, b.time, b.reduce);
          this.healPlayer(o, Math.round(o.stats.maxHp * b.heal));
        }
        ev(b.radius);
        break;
      }

      // ── 궁수 ──
      case 'elf.0': {
        const { arrows, spread, mult } = SKILL.volley;
        p.atkAnim = 0.25;
        for (let i = 0; i < arrows; i++) {
          const d = this.rollDamage(p, mult);
          this.projectiles.push(this.playerProjectile(p, {
            kind: 'arrow', ang: p.aim - spread / 2 + (spread * i) / (arrows - 1), speed: elfArrow.speed,
            range: elfArrow.range, arcHeight: elfArrow.arcHeight, r: 6, aoe: 0, dmg: d.v, crit: d.crit, pierce: true,
          }));
        }
        ev(0);
        break;
      }
      case 'elf.1': {
        const sn = SKILL.snipe;
        const d = this.rollDamage(p, sn.mult);
        p.atkAnim = 0.25;
        this.projectiles.push(this.playerProjectile(p, {
          kind: 'arrow', ang: p.aim, speed: sn.speed, range: sn.range, arcHeight: 30,
          r: 9, aoe: 0, dmg: d.v, crit: d.crit, pierce: true,
        }));
        ev(0);
        break;
      }
      case 'elf.2': {
        const rn = SKILL.rain;
        const c = this.aimPoint(p, rn.distance);
        p.atkAnim = 0.3;
        for (let i = 0; i < rn.arrows; i++) {
          const a = this.rng() * Math.PI * 2, r = Math.sqrt(this.rng()) * rn.radius;
          // 높이를 다르게 해서 0.5~1.5초에 걸쳐 차례로 떨어지게 한다
          const fall = 0.5 + (i / rn.arrows) * 1.0;
          this.projectiles.push(this.fallingProjectile(p, 'rain', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 260, fall, rn.aoe, rn.mult));
        }
        ev(rn.radius, c.x, c.y);
        break;
      }
      case 'elf.3': {
        const st = SKILL.storm;
        p.atkAnim = 0.3;
        for (let i = 0; i < st.arrows; i++) {
          const d = this.rollDamage(p, st.mult);
          this.projectiles.push(this.playerProjectile(p, {
            kind: 'arrow', ang: p.aim + (i / st.arrows) * Math.PI * 2, speed: elfArrow.speed,
            range: elfArrow.range, arcHeight: elfArrow.arcHeight, r: 7, aoe: 0, dmg: d.v, crit: d.crit, pierce: true,
          }));
        }
        ev(0);
        break;
      }

      // ── 로그 ──
      case 'rogue.0':
        this.startDash(p, 0, SKILL.ambush.time);
        ev(0);
        break;
      case 'rogue.1': {
        const f = SKILL.flurry;
        p.atkAnim = 0.25;
        this.meleeArc(p, f.radius, f.arc, f.mult, f.knock, 0);
        ev(0);
        break;
      }
      case 'rogue.2': {
        const s = SKILL.poisonSmoke;
        p.atkAnim = 0.3;
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0 || dist(p.x, p.y, e.x, e.y) - e.r > s.radius) continue;
          e.slow = Math.max(e.slow, e.kind === 'boss' ? s.slow / 2 : s.slow);
          const d = this.rollDamage(p, s.mult);
          this.hitEnemy(e, d.v, d.crit, 0, 0, p);
        }
        ev(s.radius);
        break;
      }
      case 'rogue.3': {
        const s = SKILL.shadowDance;
        p.atkAnim = 0.35;
        this.meleeArc(p, s.radius, s.arc, s.mult, s.knock, 0);
        ev(0);
        break;
      }

      // ── 마법사 ──
      case 'gnome.0': {
        const { radius } = SKILL.heal;
        const ratio = SKILL.heal.ratio * (1 + p.attrs.int * ATTR_EFFECT.intHeal);
        for (const o of this.players) {
          if (dist(p.x, p.y, o.x, o.y) > radius) continue;
          if (o.dead) {
            p.record.revives++;
            this.revivePlayer(o, ratio);
          }
          else this.healPlayer(o, Math.round(o.stats.maxHp * ratio));
        }
        p.atkAnim = 0.3;
        ev(radius);
        break;
      }
      case 'gnome.1': {
        const f = SKILL.frost;
        p.atkAnim = 0.3;
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0 || dist(p.x, p.y, e.x, e.y) - e.r > f.radius) continue;
          const d = this.rollDamage(p, f.mult);
          e.slow = e.kind === 'boss' ? f.slow / 2 : f.slow;
          this.hitEnemy(e, d.v, d.crit, 0, 0, p);
        }
        ev(f.radius);
        break;
      }
      case 'gnome.2': {
        const fb = SKILL.fireball;
        const d = this.rollDamage(p, fb.mult);
        p.atkAnim = 0.3;
        this.projectiles.push(this.playerProjectile(p, {
          kind: 'fireball', ang: p.aim, speed: fb.speed, range: fb.range, arcHeight: 0,
          r: 14, aoe: fb.aoe, dmg: d.v, crit: d.crit, pierce: false,
        }));
        ev(0);
        break;
      }
      case 'gnome.3': {
        const m = SKILL.meteor;
        const c = this.aimPoint(p, m.distance);
        p.atkAnim = 0.4;
        this.projectiles.push(this.fallingProjectile(p, 'meteor', c.x, c.y, 600, m.fall, m.aoe, m.mult));
        ev(0, c.x, c.y);
        break;
      }
    }
  }

  private setGuard(p: Player, time: number, reduce: number) {
    // 더 강한 보호가 이미 걸려 있으면 약한 것으로 덮지 않는다
    if (p.guard > 0 && p.guardReduce > reduce) {
      p.guard = Math.max(p.guard, time);
      return;
    }
    p.guard = time;
    p.guardReduce = reduce;
  }

  private startDash(p: Player, skillIdx: number, time: number) {
    p.dashTime = time;
    p.dashSkill = skillIdx;
    p.dashHits = [];
    p.invuln = Math.max(p.invuln, time + 0.15);
    p.atkAnim = time;
  }

  /** 돌진(돌진 베기·방패 돌진): 조준 방향으로 미끄러지며 닿는 적을 한 번씩 친다. */
  private updateDash(p: Player, dt: number) {
    const shield = p.cls === 'dwarf';
    const rogue = p.cls === 'rogue';
    const speed = shield ? SKILL.bash.speed : rogue ? SKILL.ambush.speed : SKILL.dash.speed;
    p.dashTime -= dt;
    p.vx = Math.cos(p.aim) * speed;
    p.vy = Math.sin(p.aim) * speed;
    p.moving = true;
    moveBody(this.level, p, dt);
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || p.dashHits.includes(e.id)) continue;
      if (dist(p.x, p.y, e.x, e.y) < p.r + e.r + 14) {
        p.dashHits.push(e.id);
        const mult = shield ? SKILL.bash.mult : rogue ? SKILL.ambush.mult : SKILL.dash.mult;
        const knock = shield ? SKILL.bash.knock : rogue ? SKILL.ambush.knock : 260;
        const d = this.rollDamage(p, mult);
        this.hitEnemy(e, d.v, d.crit, Math.cos(p.aim) * knock, Math.sin(p.aim) * knock, p, shield ? SKILL.bash.stun : 0);
      }
    }
    if (p.dashTime <= 0) {
      p.vx *= 0.2;
      p.vy *= 0.2;
    }
  }

  private notice(p: Player, text: string) {
    this.events.push({ t: 'notice', pid: p.id, text });
  }

  private tryPickup(p: Player) {
    const drop = this.drops.find((d) => d.kind === 'item' && dist(d.x, d.y, p.x, p.y) < 36);
    if (!drop || !drop.item) return;
    if (!this.addItem(p, drop.item)) return this.notice(p, '아이템 상자와 가방이 가득 찼어요');
    this.drops = this.drops.filter((d) => d !== drop);
  }

  // ─── 아이템 상자 ─────────────────────────────────────

  /** 장비를 아이템 상자 빈 칸에 넣는다(바로 능력치에 더해진다). 상자가 차 있으면 가방에. 둘 다 없으면 false. */
  private addItem(p: Player, item: Item): boolean {
    const free = canEquip(p.cls, item) ? p.inv.indexOf(null) : -1; // 다른 직업 전용 장비는 가방에만
    if (free >= 0) {
      p.inv[free] = { kind: 'item', item };
      this.recalcStats(p);
      this.events.push({ t: 'equip', pid: p.id, item });
      return true;
    }
    const bag = p.bag.indexOf(null);
    if (bag < 0) return false;
    p.bag[bag] = item;
    this.events.push({ t: 'equip', pid: p.id, item });
    this.notice(p, canEquip(p.cls, item) ? '아이템 상자가 가득 차서 가방에 넣었어요' : `${CLASSES[item.cls!].name}만 착용할 수 있어 가방에 넣었어요`);
    return true;
  }

  // ─── 가방 ─────────────────────────────────────────

  /** 상자 장비 → 가방 (from 'inv'), 가방 → 상자 (from 'bag'). 상자에 든 장비만 능력치에 더해진다 */
  moveItem(id: string, from: 'inv' | 'bag', idx: number) {
    const p = this.playerById(id);
    if (!p || p.dead) return;
    if (from === 'inv') {
      const sl = p.inv[idx];
      if (!sl || sl.kind !== 'item') return;
      const free = p.bag.indexOf(null);
      if (free < 0) return this.notice(p, '가방이 가득 찼어요');
      p.bag[free] = sl.item;
      p.inv[idx] = null;
    } else {
      const item = p.bag[idx];
      if (!item) return;
      if (!canEquip(p.cls, item)) return this.notice(p, `${CLASSES[item.cls!].name}만 착용할 수 있어요`);
      const free = p.inv.indexOf(null);
      if (free < 0) return this.notice(p, '아이템 상자가 가득 찼어요');
      p.inv[free] = { kind: 'item', item };
      p.bag[idx] = null;
    }
    this.recalcStats(p);
  }

  /** 장비를 버린다 (발밑에 떨어뜨린다) */
  dropItem(id: string, from: 'inv' | 'bag', idx: number) {
    const p = this.playerById(id);
    if (!p || p.dead) return;
    let item: Item | null = null;
    if (from === 'inv') {
      const sl = p.inv[idx];
      if (sl?.kind === 'item') {
        item = sl.item;
        p.inv[idx] = null;
        this.recalcStats(p);
      }
    } else {
      item = p.bag[idx];
      p.bag[idx] = null;
    }
    if (!item) return;
    this.spawnDrop({ kind: 'item', item }, p.x, p.y);
    this.notice(p, '장비를 버렸어요');
  }

  // ─── 대장간 ───────────────────────────────────────

  /**
   * 대장간에서 고른 장비(상자·가방) 2~3개를 조합한다. random이 아니면 맞는 조합법이 있어야 하고 정해진 장비가 나온다.
   * random이면 재료 중 가장 깊은 구역·좋은 등급을 바탕으로 무작위 장비가 나온다. 값은 대장간 구역 × FORGE.feePerZone
   */
  forge(id: string, shopId: number, picks: { from: 'inv' | 'bag'; idx: number }[], random: boolean) {
    const p = this.playerById(id);
    const shop = this.shops[shopId];
    if (!p || p.dead || !shop || shop.type !== 'forge') return;
    const fail = (text: string) => this.notice(p, text);
    if (dist(p.x, p.y, shop.x, shop.y) > SHOP.range + 20) return fail('대장장이에게서 너무 멀어요');
    const uniq = new Map(picks.map((k) => [`${k.from}:${k.idx}`, k]));
    const items: Item[] = [];
    for (const k of uniq.values()) {
      const it = k.from === 'inv' ? (p.inv[k.idx]?.kind === 'item' ? (p.inv[k.idx] as { item: Item }).item : null) : p.bag[k.idx];
      if (!it) return fail('없는 장비예요');
      items.push(it);
    }
    if (items.length < FORGE.min || items.length > FORGE.max) return fail(`장비를 ${FORGE.min}~${FORGE.max}개 고르세요`);
    const fee = FORGE.feePerZone * shop.zone;
    if (p.gold < fee) return fail(`돈이 부족해요 (${fee} G)`);
    const zone = Math.max(...items.map((it) => it.zone), shop.zone);
    let result: Item;
    let recipe: string | null = null;
    if (random) {
      const rarity = randomForgeRarity(items, this.rng);
      result = makeItem(this.nextId++, zone, this.rng, { common: 0, rare: 0, epic: 0, legendary: 0, [rarity]: 1 });
    } else {
      const r = matchRecipe(items, shop.zone);
      if (!r) return fail('맞는 조합법이 없어요 (오른쪽 조합법을 보세요)');
      result = recipeItem(r, this.nextId++);
      recipe = recipeName(r);
    }
    // 재료를 빼고 결과를 넣는다 (재료가 빠진 자리가 있으니 항상 들어간다)
    for (const k of uniq.values()) {
      if (k.from === 'inv') p.inv[k.idx] = null;
      else p.bag[k.idx] = null;
    }
    p.gold -= fee;
    this.recalcStats(p);
    this.addItem(p, result);
    this.events.push({ t: 'forged', pid: p.id, item: result, recipe });
  }

  /** 음식 n개를 같은 종류 묶음에 더하거나 빈 칸에 새로 넣는다. 최대 개수나 자리가 없으면 false. */
  private addFood(p: Player, kind: FoodKind, n = 1): boolean {
    const stack = p.inv.find((sl) => sl?.kind === kind) as { kind: FoodKind; count: number } | undefined;
    if (stack) {
      if (stack.count + n > FOOD.stackMax) return false;
      stack.count += n;
      return true;
    }
    const free = p.inv.indexOf(null);
    if (free < 0) return false;
    p.inv[free] = { kind, count: n };
    return true;
  }

  private foodCount(p: Player, kind: FoodKind) {
    const stack = p.inv.find((sl) => sl?.kind === kind);
    return stack && stack.kind !== 'item' ? stack.count : 0;
  }

  /** 상자의 음식을 하나 먹는다 (Q·R 또는 칸 클릭). 이미 가득 차 있으면 먹지 않는다. */
  private eatFromInv(p: Player, kind: FoodKind) {
    const i = p.inv.findIndex((sl) => sl?.kind === kind);
    const stack = p.inv[i];
    if (!stack || stack.kind === 'item') return;
    if (kind === 'hpFood') {
      if (p.hp >= p.stats.maxHp) return this.notice(p, 'HP가 가득 차 있어요');
      this.healPlayer(p, Math.round(p.stats.maxHp * FOOD.hp));
    } else {
      if (p.mp >= p.stats.maxMp) return this.notice(p, 'MP가 가득 차 있어요');
      this.restoreMp(p, p.stats.maxMp * FOOD.mp);
    }
    if (--stack.count <= 0) p.inv[i] = null;
  }

  /** 상자 칸 클릭(단축키 5~0): 음식은 하나 먹고, 장비는 가방에 넣는다 (버리기는 캐릭터 메뉴에서) */
  useSlot(id: string, idx: number) {
    const p = this.playerById(id);
    const sl = p?.inv[idx];
    if (!p || p.dead || !sl) return;
    if (sl.kind !== 'item') return this.eatFromInv(p, sl.kind);
    this.moveItem(id, 'inv', idx);
  }

  // ─── 상점 ─────────────────────────────────────────

  /** 상점에서 물건을 산다. 상인 가까이 있어야 하고, 산 물건은 아이템 상자에 들어간다. */
  buy(id: string, shopId: number, idx: number) {
    const p = this.playerById(id);
    const shop = this.shops[shopId];
    const entry = shop?.stock[idx];
    if (!p || p.dead || !shop || !entry) return;
    const fail = (text: string) => this.notice(p, text);
    if (dist(p.x, p.y, shop.x, shop.y) > SHOP.range + 20) return fail('상인에게서 너무 멀어요');
    if (entry.buyers?.includes(p.id)) return fail('이미 산 장비예요');
    if (p.gold < entry.price) return fail('돈이 부족해요');
    if (entry.kind === 'item') {
      // 장비는 플레이어마다 하나씩 살 수 있다 (산 사람에게만 품절로 보인다). 산 장비는 따로 복사해 준다
      if (!this.addItem(p, { ...entry.item!, id: this.nextId++, stats: { ...entry.item!.stats } })) return fail('아이템 상자가 가득 찼어요');
      entry.buyers!.push(p.id);
    } else if (!this.addFood(p, entry.kind)) {
      return fail(this.foodCount(p, entry.kind) >= FOOD.stackMax ? `${FOOD.stackMax}개까지만 들 수 있어요` : '아이템 상자가 가득 찼어요');
    }
    p.gold -= entry.price;
    this.events.push({ t: 'bought', pid: p.id, entry });
  }

  private spawnDrop(d: Pick<Drop, 'kind' | 'item' | 'gold'>, x: number, y: number) {
    const ang = this.rng() * Math.PI * 2;
    const off = 6 + this.rng() * 10;
    let dx = x + Math.cos(ang) * off, dy = y + Math.sin(ang) * off;
    if (pointBlocked(this.level, dx, dy)) [dx, dy] = [x, y];
    this.drops.push({ id: this.nextId++, ...d, x: dx, y: dy, z: 0, vz: 260 });
  }

  private gainXp(p: Player, amount: number) {
    p.xp += amount;
    p.record.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.points += POINTS_PER_LEVEL;
      p.xpNext = xpForLevel(p.level);
      this.recalcStats(p);
      p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.3));
      p.mp = Math.min(p.stats.maxMp, p.mp + p.stats.maxMp * 0.3);
      this.events.push({ t: 'levelup', pid: p.id, level: p.level });
      const idx = CLASSES[p.cls].skills.findIndex((sk) => sk.unlock === p.level);
      if (idx >= 0) this.events.push({ t: 'unlock', pid: p.id, idx });
    }
  }

  private damagePlayer(p: Player, raw: number, fromX: number, fromY: number) {
    if (p.dead || p.invuln > 0) return;
    // 민첩에 따라 가끔 피한다. 피한 뒤 잠깐 무적이라 몸에 닿아 있는 적이 매 틱 다시 굴려 결국 맞히는 일은 없다
    if (this.rng() < p.stats.dodge) {
      p.invuln = DODGE_INVULN;
      this.events.push({ t: 'dodge', x: p.x, y: p.y });
      return;
    }
    // 방어구 '절대방어'(파라오의 황금 갑주): 확률로 피해를 통째로 막는다. 막은 뒤 잠깐 무적 (회피와 같은 이유)
    if (p.inv.some((sl) => sl?.kind === 'item' && sl.item.effect === 'aegis') && this.rng() < WEAPON_EFFECTS.aegis.chance) {
      p.invuln = DODGE_INVULN;
      this.events.push({ t: 'block', x: p.x, y: p.y });
      return;
    }
    let scaled = raw * (0.9 + this.rng() * 0.2);
    if (p.guard > 0) scaled *= 1 - p.guardReduce;
    const iron = p.cls === 'dwarf'; // 수호자 패시브 '강철 피부': 받는 피해 감소, 덜 밀려난다
    if (iron) scaled *= 1 - ironSkinRate(p.level);
    const dmg = Math.max(1, Math.round(scaled * 0.15), Math.round(scaled - p.stats.def * 0.5));
    p.record.taken += Math.min(dmg, Math.max(0, p.hp));
    p.hp -= dmg;
    p.invuln = 0.7;
    const ang = Math.atan2(p.y - fromY, p.x - fromX);
    const push = 240 * (iron ? PASSIVE.ironSkin.knock : 1);
    p.vx = Math.cos(ang) * push;
    p.vy = Math.sin(ang) * push;
    this.events.push({ t: 'dmg', x: p.x, y: p.y, v: dmg, crit: false, toPlayer: true });
    // 장신구 '불사'(무법자의 해골 목걸이): 쓰러질 피해를 한 번 버틴다 (재사용 대기)
    if (p.hp <= 0 && p.undyingCd <= 0 && p.inv.some((sl) => sl?.kind === 'item' && sl.item.effect === 'undying')) {
      const u = WEAPON_EFFECTS.undying;
      p.hp = Math.max(1, Math.round(p.stats.maxHp * u.hp));
      p.undyingCd = u.cooldown;
      p.invuln = u.invuln;
      this.events.push({ t: 'undying', x: p.x, y: p.y });
    }
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.revive = 0;
      p.record.downs++;
      this.events.push({ t: 'down', pid: p.id });
    }
  }

  private updateRevive(dt: number) {
    for (const p of this.players) {
      if (!p.dead) continue;
      const helpers = this.players.filter((o) => !o.dead && dist(o.x, o.y, p.x, p.y) < 44);
      p.revive = helpers.length ? p.revive + dt : Math.max(0, p.revive - dt);
      if (p.revive >= REVIVE_TIME) {
        for (const o of helpers) o.record.revives++;
        this.revivePlayer(p, 0.4);
      }
    }
  }

  private revivePlayer(p: Player, hpRatio: number) {
    p.dead = false;
    p.revive = 0;
    p.hp = Math.round(p.stats.maxHp * hpRatio);
    p.invuln = 1.5;
    this.events.push({ t: 'revive', pid: p.id });
  }

  /** MP 회복. passive면 패시브 효과라 화면에 작게, 소리 없이 */
  private restoreMp(p: Player, amount: number, passive = false) {
    const before = p.mp;
    p.mp = Math.min(p.stats.maxMp, p.mp + amount);
    if (p.mp - before >= 1) this.events.push({ t: 'mana', x: p.x, y: p.y, v: Math.round(p.mp - before), passive });
  }

  /** HP 회복. passive면 패시브 효과라 화면에 작게, 소리 없이 */
  private healPlayer(p: Player, amount: number, passive = false) {
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (p.hp > before) this.events.push({ t: 'heal', x: p.x, y: p.y, v: p.hp - before, passive });
  }

  /** 흡혈: 소수점 회복량을 모아 두었다가 1 이상이 되면 정수만큼 회복한다 (HP는 정수로 유지) */
  private leech(p: Player, amount: number) {
    if (p.dead || p.hp >= p.stats.maxHp) return;
    const acc = (this.leechAcc.get(p.id) ?? 0) + amount;
    const whole = Math.floor(acc);
    this.leechAcc.set(p.id, acc - whole);
    if (whole > 0) this.healPlayer(p, whole, true);
  }

  // ─── 구역 ─────────────────────────────────────────

  private openGate(i: number, keeper: string) {
    if (this.gates[i]) return;
    this.gates[i] = true;
    openGate(this.level, i);
    const g = this.level.gates[i];
    this.events.push({ t: 'gate', x: (g.tx + 0.5) * TILE, y: ((g.ty0 + g.ty1 + 1) / 2) * TILE });
    // 길찾기 지도를 새로 계산하게 한다 (문 자리가 길이 됐다)
    for (const nav of this.navs.values()) nav.originTx = -1;
    const last = i === this.gates.length - 1;
    this.events.push({ t: 'banner', text: '문이 열렸다', sub: `${keeper} 처치! — ${last ? '이 너머에 흑룡이 기다린다' : `다음 → ${i + 2}구역 ${ZONE_NAMES[i + 1]}`}` });
  }

  // ─── 던전 ─────────────────────────────────────────

  /** 이 자리가 들어 있는 던전 투기장 번호 (맵 아래에 붙인 줄, 가장 가까운 투기장). 투기장 밖이면 -1 */
  private dungeonAt(p: { x: number; y: number }) {
    if (p.y <= this.level.mapH * TILE) return -1;
    let best = -1, bestD = Infinity;
    this.level.dungeons.forEach((d, i) => {
      const dd = Math.abs(p.x - d.center.x);
      if (dd < bestD) [best, bestD] = [i, dd];
    });
    return best;
  }

  /** 순간이동 (던전 문). 떠난 자리와 도착한 자리에 빛 기둥 */
  private warp(p: Player, x: number, y: number) {
    this.events.push({ t: 'warp', x: Math.round(p.x), y: Math.round(p.y) });
    p.x = x;
    p.y = y;
    p.vx = p.vy = 0;
    this.events.push({ t: 'warp', x: Math.round(x), y: Math.round(y) });
  }

  /** 던전마다 진행 */
  private updateDungeons(dt: number) {
    this.level.dungeons.forEach((d, i) => this.updateDungeon(d, i, dt));
  }

  /**
   * 던전 하나의 진행: 문에 닿으면 투기장으로 → 웨이브(마지막엔 중간보스·보스) → 다 물리치면 보상 상자와 나가는 문.
   * 안에 들어간 사람이 모두 쓰러지면 실패 (쓰러진 채로 문 앞에 돌려보낸다). 성공이든 실패든 한 판에 한 번뿐.
   */
  private updateDungeon(d: DungeonArena, idx: number, dt: number) {
    const st = this.dungeons[idx], def = DUNGEONS[d.zone];
    if (!def || st.state === 'closed') return;
    const N = def.waves.length;

    // 들어가기: 시작 전이거나 싸우는 중이면 문이 열려 있다 (늦게 온 동료도 들어갈 수 있다)
    if (st.state === 'open' || st.state === 'active') {
      for (const p of this.players) {
        if (p.dead || this.dungeonAt(p) >= 0 || dist(p.x, p.y, d.portal.x, d.portal.y) > 26) continue;
        this.warp(p, d.entry.x + (this.rng() - 0.5) * 60, d.entry.y);
        if (st.state === 'open') {
          st.state = 'active';
          st.wave = 0;
          st.timer = def.startDelay;
          this.events.push({ t: 'banner', text: def.name, sub: def.intro });
        }
      }
    }

    const inside = this.players.filter((p) => this.dungeonAt(p) === idx);
    const mine = this.enemies.filter((e) => e.dungeon === idx && e.hp > 0);
    if (st.state === 'active') {
      // 실패: 안에 들어간 사람이 모두 쓰러졌다
      if (inside.length && inside.every((p) => p.dead)) {
        for (const e of mine) e.hp = 0;
        inside.forEach((p, i) => {
          p.x = d.portal.x + 30 + i * 20;
          p.y = d.portal.y + 10;
          p.revive = 0;
        });
        st.state = 'closed';
        this.events.push({ t: 'banner', text: '던전 실패', sub: `${def.name}의 문이 닫혔다` });
        return;
      }
      // 묘비: 서 있는 동안 보스에게 보호막, 묘비마다 해골을 불러낸다. 모두 부수면 보호막이 깨지고 보스가 휘청거린다
      const w = def.waves[st.wave - 1];
      if (w?.tombs && st.tombsUp) {
        const tombs = mine.filter((e) => e.tomb);
        for (const e of mine) if (e.elite) e.shielded = tombs.length > 0;
        if (!tombs.length) {
          st.tombsUp = false;
          for (const e of mine) if (e.elite) {
            e.stun = Math.max(e.stun, w.tombs.stun);
            e.state = 'move';
          }
          this.events.push({ t: 'banner', text: '보호막이 깨졌다!', sub: '모든 묘비가 부서졌다 — 지금이다!' });
        } else {
          st.tombTimer -= dt;
          if (st.tombTimer <= 0) {
            st.tombTimer = w.tombs.every;
            const party = this.players.length;
            let alive = mine.length;
            for (const t of tombs) {
              if (alive >= w.tombs.max) break;
              const kind = def.pool[Math.floor(this.rng() * def.pool.length)];
              const e = this.createEnemy(kind, def.zone, party);
              const a = this.rng() * Math.PI * 2;
              e.x = t.x + Math.cos(a) * 30;
              e.y = t.y + Math.sin(a) * 30;
              e.active = true;
              e.dungeon = idx;
              this.enemies.push(e);
              this.events.push({ t: 'warp', x: Math.round(e.x), y: Math.round(e.y) });
              alive++;
            }
          }
        }
      }
      // 보스(중간보스)가 살아 있는 동안 부하를 불러낸다
      if (w?.summon && mine.some((e) => e.elite)) {
        st.summon -= dt;
        if (st.summon <= 0) {
          st.summon = w.summon.every;
          if (mine.length < w.summon.max) {
            this.spawnDungeonAdds(d, idx, def, w.summon.count);
            this.events.push({ t: 'banner', text: '', sub: w.summon.text });
          }
        }
      }
      if (mine.length) return;
      st.timer -= dt;
      if (st.timer > 0) return;
      if (st.wave < N) this.spawnDungeonWave(d, idx);
      else this.clearDungeon(d, idx, inside);
    } else if (st.state === 'cleared') {
      // 나가는 문(투기장 북쪽)에 닿으면 던전 문 옆으로. 모두 나오면 닫힌다
      const exit = dungeonExit(d);
      for (const p of inside) {
        if (p.dead || dist(p.x, p.y, exit.x, exit.y) > 26) continue;
        this.warp(p, d.portal.x + 40, d.portal.y + 10);
      }
      if (!this.players.some((p) => this.dungeonAt(p) === idx)) st.state = 'closed';
    }
  }

  /** 투기장 둘레(사방)에 몬스터를 놓는다 */
  private placeInArena(d: DungeonArena, idx: number, e: Enemy, ang: number) {
    const r = (d.radius - TILE * 1.2) * (0.8 + this.rng() * 0.2);
    e.x = d.center.x + Math.cos(ang) * r;
    e.y = d.center.y + Math.sin(ang) * r;
    e.active = true;
    e.dungeon = idx;
    e.aim = ang + Math.PI;
    this.enemies.push(e);
  }

  /** 보호막(묘비) 보스가 받는 피해 배율 (그 던전 묘비 웨이브의 bossTaken) */
  private shieldTaken(e: Enemy) {
    const d = e.dungeon !== undefined ? this.level.dungeons[e.dungeon] : undefined;
    return (d && DUNGEONS[d.zone]?.waves.find((w) => w.tombs)?.tombs?.bossTaken) ?? 1;
  }

  /** 부하 n마리를 투기장 둘레 무작위 자리에 */
  private spawnDungeonAdds(d: DungeonArena, idx: number, def: DungeonDef, n: number) {
    const party = this.players.length;
    for (let i = 0; i < n; i++) {
      const kind = def.pool[Math.floor(this.rng() * def.pool.length)];
      this.placeInArena(d, idx, this.createEnemy(kind, def.zone, party), this.rng() * Math.PI * 2);
    }
  }

  /** 다음 웨이브: 투기장 둘레 사방에서 몬스터가 나온다 (중간보스·보스는 북쪽에서) */
  private spawnDungeonWave(d: DungeonArena, idx: number) {
    const st = this.dungeons[idx], def = DUNGEONS[d.zone];
    const w = def.waves[st.wave++];
    const party = this.players.length;
    for (let i = 0; i < w.count; i++) {
      const kind = def.pool[Math.floor(this.rng() * def.pool.length)];
      this.placeInArena(d, idx, this.createEnemy(kind, def.zone, party), (i / w.count) * Math.PI * 2 + (this.rng() - 0.5) * 0.3);
    }
    (w.elites ?? []).forEach((el, i, all) => {
      this.placeInArena(d, idx, this.createEnemy(el.kind, def.zone, party, el), -Math.PI / 2 + (i - (all.length - 1) / 2) * 1.2);
      this.events.push({ t: 'banner', text: '', sub: `⚔ ${el.name} 등장!` });
    });
    // 묘비: 보스 둘레(투기장 반쯤 거리) 사방에. 움직이지 않고 공격하지 않으며, HP는 구역·인원 배율을 받는다
    if (w.tombs) {
      const zs = zoneScale(def.zone);
      for (let i = 0; i < w.tombs.count; i++) {
        const t = this.createEnemy('zombie', def.zone, party);
        const a = (i / w.tombs.count) * Math.PI * 2 + Math.PI / 4;
        t.x = d.center.x + Math.cos(a) * d.radius * 0.55;
        t.y = d.center.y + Math.sin(a) * d.radius * 0.55;
        t.hp = t.maxHp = Math.round(w.tombs.hp * zs.hp * partyHpScale(party));
        t.atk = 0;
        t.def = 0;
        t.xp = 0;
        t.r = 16;
        t.tomb = true;
        t.active = true;
        t.dungeon = idx;
        this.enemies.push(t);
      }
      st.tombsUp = true;
      st.tombTimer = w.tombs.every;
      for (const e of this.enemies) if (e.dungeon === idx && e.elite) e.shielded = true;
      this.events.push({ t: 'banner', text: '', sub: '묘비가 서 있는 동안 보스는 피해를 거의 받지 않는다 — 묘비를 부숴라!' });
    }
    const last = st.wave === def.waves.length;
    this.events.push({ t: 'banner', text: `웨이브 ${st.wave} / ${def.waves.length}`, sub: last ? (w.elites?.length ? '마지막 웨이브! 보스가 나타났다' : '마지막 웨이브!') : '사방에서 적이 몰려온다!' });
    st.timer = def.waveGap;
    st.summon = w.summon?.every ?? 0;
  }

  /** 클리어: 가운데에 보상 상자 하나, 쓰러진 동료는 일어나고, 북쪽에 나가는 문이 열린다 */
  private clearDungeon(d: DungeonArena, idx: number, inside: Player[]) {
    const st = this.dungeons[idx], def = DUNGEONS[d.zone];
    st.state = 'cleared';
    st.cleared = true;
    const r = def.reward;
    const pool = r.kind === 'item' ? ITEM_LIST.filter((x) => x.key === r.key)
      : ITEM_LIST.filter((x) => x.tier === r.tier && x.rarity === 'legendary' && x.from.some((f) => f === 'drop' || f === 'recipe'));
    const item = pool[Math.floor(this.rng() * pool.length)];
    this.spawnDrop({ kind: 'item', item: itemFromDef(item, this.nextId++) }, d.center.x, d.center.y);
    for (const p of inside) if (p.dead) this.revivePlayer(p, 0.3);
    this.events.push({ t: 'banner', text: '던전 클리어!', sub: `전설 장비 ${item.name}이(가) 나타났다 — 북쪽 문으로 나갈 수 있다` });
  }

  /** 닫힌 문 앞에 선 플레이어에게 문지기를 쓰러뜨리라고 알려준다 */
  private gateNotice(p: Player) {
    const ptx = p.x / TILE, pty = Math.floor(p.y / TILE);
    const g = this.level.gates.find((g, i) => !this.gates[i] && ptx > g.tx - 2 && ptx < g.tx && pty >= g.ty0 && pty <= g.ty1);
    if (!g) return;
    if (this.tick - (this.gateNoticeAt.get(p.id) ?? -Infinity) < TICK_RATE * 4) return;
    this.gateNoticeAt.set(p.id, this.tick);
    this.events.push({ t: 'notice', pid: p.id, text: '문이 잠겨 있다 — 문지기를 쓰러뜨려야 열린다' });
  }

  private updateZone() {
    const alive = this.players.filter((p) => !p.dead);
    if (alive.length === 0) return;
    for (const p of alive) this.gateNotice(p);
    const front = alive.reduce((a, b) => (b.x > a.x ? b : a));
    const zone = zoneOfTx(this.level, Math.floor(front.x / TILE));

    if (!this.arenaLocked && front.x > (this.level.arenaTx + 3) * TILE) {
      this.arenaLocked = true;
      this.events.push({ t: 'banner', text: ENEMIES.boss.name, sub: '최종 보스' });
    }

    if (zone <= this.zone) return;
    const first = this.zone === 0;
    this.zone = zone;
    this.events.push({ t: 'banner', text: `${zone}구역`, sub: ZONE_NAMES[zone - 1] });
    if (first) return;
    // 체크포인트: 쓰러진 동료는 맨 앞 동료 곁에서 부활, 나머지는 체력 회복
    for (const p of this.players) {
      if (p.dead) {
        p.x = front.x - Math.cos(front.aim) * 30;
        p.y = front.y - Math.sin(front.aim) * 30;
        if (pointBlocked(this.level, p.x, p.y)) [p.x, p.y] = [front.x, front.y];
        this.revivePlayer(p, 0.5);
      } else this.healPlayer(p, Math.round(p.stats.maxHp * 0.25));
      this.restoreMp(p, p.stats.maxMp * 0.5);
    }
  }

  // ─── 적 ────────────────────────────────────────────

  private pickTarget(e: Enemy): Player | null {
    if (e.taunt > 0) {
      const t = this.players.find((p) => p.id === e.tauntBy && !p.dead);
      if (t) return t;
    }
    let best: Player | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y) * CLASSES[p.cls].aggro;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // 너무 멀어지면 쫓기를 포기한다 (보스는 예외)
    if (best && e.kind !== 'boss' && dist(best.x, best.y, e.x, e.y) > AGGRO_RANGE * 2) return null;
    return best;
  }

  /** 길찾기 지도를 따라 목표에게 다가간다. */
  private chase(e: Enemy, target: Player, speed: number, stopDist: number) {
    const d = dist(e.x, e.y, target.x, target.y);
    if (d <= stopDist) {
      e.vx = e.vy = 0;
      return;
    }
    let dir: { x: number; y: number } | null = null;
    if (d > TILE * 1.5) dir = this.navs.get(target.id)?.direction(e.x, e.y) ?? null;
    if (!dir) dir = { x: (target.x - e.x) / d, y: (target.y - e.y) / d };
    e.vx = dir.x * speed;
    e.vy = dir.y * speed;
  }

  /** 적에게 피해를 준다. 실제로 준 피해(방어를 뺀 값)를 돌려준다. proc이 false면 무기 특수 효과를 굴리지 않는다 (충격파 등에서 다시 터지지 않게) */
  private hitEnemy(e: Enemy, raw: number, crit: boolean, kx: number, ky: number, by: Player | null, stun = 0, proc = true): number {
    if (e.hp <= 0) return 0;
    let dmg = Math.max(1, Math.round(raw - e.def * 0.5));
    if (e.shielded) dmg = Math.max(1, Math.round(dmg * this.shieldTaken(e))); // 묘비가 서 있는 동안 보스는 피해를 거의 받지 않는다
    if (by) by.record.dmg += Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.hurt = 0.12;
    this.events.push({ t: 'dmg', x: e.x, y: e.y, v: dmg, crit, toPlayer: false });
    if (e.kind !== 'boss' && !e.tomb) {
      const def = ENEMIES[e.kind];
      const resist = e.elite ? ELITE.knockResist : def.knock ?? 1;
      e.vx = kx * resist;
      e.vy = ky * resist;
      // 중간보스는 기절이 절반만 걸리고, 오크처럼 묵직한 적은 맞아도 거의 멈추지 않는다
      const heavy = e.elite || def.heavy;
      e.stun = Math.max(e.stun, e.elite ? stun / 2 : stun, heavy ? 0.1 : 0.25);
      // 힘을 모으는 중에 맞으면 끊긴다 (묵직한 적은 기절시켜야 끊긴다). 암살자의 돌진 준비도 여기서 끊을 수 있다
      if (e.state === 'windup' && (!def.heavy || stun > 0)) e.state = 'move';
    }
    // 근접 몬스터가 멀리서 맞으면 쏜 쪽으로 돌격한다 (원거리 직업이 멀리서만 때려 몬스터가 다가오지도 못하는 일이 없도록)
    const ai = ENEMIES[e.kind].ai;
    if (by && !e.elite && !e.tomb && (ai === 'melee' || ai === 'heavy' || ai === 'hop' || ai === 'dash') && dist(e.x, e.y, by.x, by.y) > RUSH.minDist) {
      e.rush = RUSH.time;
      e.active = true;
      if (e.taunt <= 0) {
        // 쏜 플레이어를 노린다 (수호자의 도발이 걸려 있으면 도발이 우선)
        e.taunt = RUSH.time;
        e.tauntBy = by.id;
      }
    }
    if (e.hp <= 0) this.killEnemy(e, by);
    else if (by && proc) this.weaponProcs(e, by);
    return dmg;
  }

  /** 유니크 전설 무기 특수 효과: 장비한 무기마다 확률을 굴려 맞은 적에게 건다 */
  private weaponProcs(e: Enemy, by: Player) {
    for (const sl of by.inv) {
      const effect = sl?.kind === 'item' ? sl.item.effect : undefined;
      if (!effect || effect === 'aegis' || effect === 'undying' || this.rng() >= WEAPON_EFFECTS[effect].chance) continue; // 절대방어·불사는 맞을 때 (damagePlayer)
      switch (effect) {
        case 'frost': {
          const t = WEAPON_EFFECTS.frost.slow;
          e.slow = Math.max(e.slow, e.kind === 'boss' ? t / 2 : t);
          this.events.push({ t: 'proc', effect: 'frost', x: Math.round(e.x), y: Math.round(e.y) });
          break;
        }
        case 'burn': {
          const b = WEAPON_EFFECTS.burn;
          e.burnDps = Math.max(e.burn > 0 ? e.burnDps : 0, by.stats.atk * b.ratio); // 이미 타고 있으면 센 쪽을 남긴다
          e.burn = b.time;
          this.events.push({ t: 'proc', effect: 'burn', x: Math.round(e.x), y: Math.round(e.y) });
          e.dotBy = by.id;
          break;
        }
        case 'bleed': {
          const b = WEAPON_EFFECTS.bleed;
          e.bleedStacks = e.bleed > 0 ? Math.min(b.maxStacks, e.bleedStacks + 1) : 1;
          e.bleed = b.time;
          e.bleedDps = by.stats.atk * b.ratio;
          e.dotBy = by.id;
          this.events.push({ t: 'proc', effect: 'bleed', x: Math.round(e.x), y: Math.round(e.y) });
          break;
        }
        case 'quake': {
          const q = WEAPON_EFFECTS.quake;
          this.events.push({ t: 'boom', x: e.x, y: e.y, r: q.radius, kind: 'slam' });
          for (const o of this.enemies) {
            if (o === e || !o.active || o.hp <= 0 || dist(o.x, o.y, e.x, e.y) > q.radius + o.r) continue;
            const ang = Math.atan2(o.y - e.y, o.x - e.x);
            const d = this.rollDamage(by, 0); // 치명타만 굴린다
            this.hitEnemy(o, by.stats.atk * q.ratio * (d.crit ? 1.6 : 1), d.crit, Math.cos(ang) * 160, Math.sin(ang) * 160, by, q.stun, false);
          }
          break;
        }
      }
    }
  }

  /** 화염·출혈 지속 피해: 0.5초마다 방어를 깎고 들어간다. 움찔하거나 밀려나지는 않는다 */
  private updateDot(e: Enemy, dt: number) {
    e.burn -= dt;
    e.bleed -= dt;
    if (e.bleed <= 0) e.bleedStacks = 0;
    e.dotTick -= dt;
    if (e.dotTick > 0) return;
    e.dotTick = 0.5;
    const by = this.playerById(e.dotBy);
    for (const kind of ['burn', 'bleed'] as const) {
      const dps = kind === 'burn' ? (e.burn > 0 ? e.burnDps : 0) : e.bleed > 0 ? e.bleedDps * e.bleedStacks : 0;
      if (dps <= 0 || e.hp <= 0) continue;
      let dmg = Math.max(1, Math.round(dps * 0.5 - e.def * 0.5));
      if (e.shielded) dmg = Math.max(1, Math.round(dmg * this.shieldTaken(e)));
      if (by) by.record.dmg += Math.min(dmg, e.hp);
      e.hp -= dmg;
      this.events.push({ t: 'dmg', x: e.x, y: e.y, v: dmg, crit: false, toPlayer: false, dot: kind });
      if (e.hp <= 0) this.killEnemy(e, by);
    }
  }

  private killEnemy(e: Enemy, by: Player | null) {
    if (e.tomb) {
      this.events.push({ t: 'boom', x: e.x, y: e.y, r: 50, kind: 'slam' });
      const left = this.enemies.filter((o) => o.tomb && o !== e && o.dungeon === e.dungeon && o.hp > 0).length;
      if (left) this.events.push({ t: 'banner', text: '', sub: `묘비가 부서졌다! (남은 묘비 ${left})` });
      return;
    }
    if (by) {
      by.kills++;
      if (e.elite) by.record.eliteKills++;
    }
    // 마법사 패시브 '마나 순환': 쓰러뜨린 마법사가 최대 MP의 일부를 회복한다
    if (by && !by.dead && by.cls === 'gnome') this.restoreMp(by, by.stats.maxMp * manaFlowRate(by.level), true);
    this.events.push({ t: 'kill', x: Math.round(e.x), y: Math.round(e.y), kind: e.kind, elite: !!e.elite });
    for (const p of this.players) if (!p.dead) this.gainXp(p, e.xp);

    if (e.kind === 'boss') {
      this.events.push({ t: 'boom', x: e.x, y: e.y, r: 140, shake: true, kind: 'boss' });
      this.events.push({ t: 'banner', text: '승리!', sub: `${ENEMIES.boss.name}을(를) 쓰러뜨렸다` });
      this.endWith('victory', 3);
      return;
    }
    // 문지기가 여럿이면 모두 쓰러뜨려야 문이 열린다
    if (e.gate !== null && !this.enemies.some((o) => o !== e && o.gate === e.gate && o.hp > 0)) this.openGate(e.gate, e.elite!);
    // 돈은 항상 떨어진다 (구역이 깊을수록 많이)
    const gold = Math.max(1, Math.round(ENEMIES[e.kind].gold * zoneScale(e.zone).xp * (0.7 + this.rng() * 0.6) * (e.elite ? ELITE.gold : 1)));
    this.spawnDrop({ kind: 'gold', gold }, e.x, e.y);
    if (e.elite) {
      // 중간보스: 좋은 장비 하나와 회복 음식을 반드시 떨어뜨린다
      // 문지기는 문이 열리는 배너에 함께 알린다
      if (e.gate === null) this.events.push({ t: 'banner', text: '', sub: `${e.elite} 처치!` });
      this.spawnDrop({ kind: 'item', item: makeItem(this.nextId++, e.zone, this.rng, SHOP.rarityWeight) }, e.x, e.y);
      this.spawnDrop({ kind: this.rng() < 0.5 ? 'hpFood' : 'mpFood' }, e.x, e.y);
      // 유니크 전설 무기: 5구역부터 낮은 확률로, 이번 판에 아직 안 나온 것 중 하나
      if (e.zone >= UNIQUE_DROP.fromZone && this.rng() < UNIQUE_DROP.chance) {
        const left = ITEM_LIST.filter((d) => d.from.includes('unique') && !this.uniquesDropped.has(d.key));
        if (left.length) {
          const d = left[Math.floor(this.rng() * left.length)];
          this.uniquesDropped.add(d.key);
          this.spawnDrop({ kind: 'item', item: itemFromDef(d, this.nextId++) }, e.x, e.y);
          this.events.push({ t: 'banner', text: '', sub: `✦ 유니크 무기 ${d.name}이(가) 떨어졌다!` });
        }
      }
      return;
    }
    if (this.rng() < ENEMIES[e.kind].dropRate * ITEM_DROP_MULT) {
      this.spawnDrop({ kind: 'item', item: makeItem(this.nextId++, e.zone, this.rng) }, e.x, e.y);
    } else if (this.rng() < 0.1) {
      this.spawnDrop({ kind: this.rng() < 0.5 ? 'hpFood' : 'mpFood' }, e.x, e.y);
    }
  }

  private enemyProjectile(e: Enemy, kind: Projectile['kind'], ang: number, speed: number, life: number, dmg: number): Projectile {
    if (kind !== 'shockwave') this.events.push({ t: 'shoot', x: Math.round(e.x), y: Math.round(e.y), kind, enemy: true });
    return {
      id: this.nextId++, fromPlayer: false, ownerId: '', kind,
      x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r, z: 0,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: 0, gz: 0,
      r: kind === 'shockwave' ? 14 : 6, dmg, crit: false, life, aoe: 0, pierce: false, hitIds: [],
    };
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.hurt -= dt;
    if (e.tomb) return; // 묘비는 움직이지도 공격하지도 않는다 (해골을 불러내는 건 던전 진행이 한다)
    e.stun -= dt;
    e.slow -= dt;
    if (e.burn > 0 || e.bleed > 0) {
      this.updateDot(e, dt);
      if (e.hp <= 0) return;
    }
    e.rush -= dt;
    e.taunt -= dt;
    e.timer -= dt;
    e.stateTime += dt;
    const def = ENEMIES[e.kind];
    const target = this.pickTarget(e);

    if (e.kind === 'boss' && e.state === 'leap') {
      // 공중에서는 넉백이나 대상 상실과 관계없이 도약을 마친다
      this.updateBoss(e, target);
    } else if (e.stun > 0 || !target) {
      const f = 900 * dt;
      e.vx = approach(e.vx, 0, f);
      e.vy = approach(e.vy, 0, f);
    } else {
      const d = dist(e.x, e.y, target.x, target.y);
      const toTarget = Math.atan2(target.y - e.y, target.x - e.x);
      switch (def.ai) {
        case 'hop': {
          // 0.45초 튀어 오르고 0.55초 쉰다
          const cycle = e.stateTime % 1;
          if (cycle < 0.45) {
            this.chase(e, target, def.speed * 2.2, 0);
            e.z = Math.sin((cycle / 0.45) * Math.PI) * 14;
          } else {
            e.vx = e.vy = 0;
            e.z = 0;
          }
          e.aim = toTarget;
          break;
        }

        case 'melee':
          // 몸이 닿을 만큼 붙는다 (몸통 박치기 판정이 '닿은 거리 - 2'라서 딱 맞닿는 거리에서 멈추면 영영 못 때린다)
          this.chase(e, target, def.speed, e.r + target.r - 6);
          e.aim = toTarget;
          if (e.state === 'attack' && e.stateTime > 0.35) this.setState(e, 'move'); // 공격 동작을 보여 주는 시간
          break;

        case 'ranged':
        case 'frost':
        case 'bomb':
          this.updateCaster(e, target, d, toTarget);
          break;

        case 'heavy':
          this.updateHeavy(e, target, d, toTarget);
          break;

        case 'dash':
          this.updateDasher(e, target, d, toTarget);
          break;

        case 'boss':
          this.updateBoss(e, target);
          break;
      }
    }
    // 둔화(냉기 파동)는 느리게, 돌격(멀리서 맞음)은 빠르게. 이번 틱 이동에만 곱하고 되돌린다
    const k = e.stun > 0 ? 1 : (e.slow > 0 ? 0.5 : 1) * (e.rush > 0 && e.state === 'move' ? RUSH.speed : 1);
    e.vx *= k;
    e.vy *= k;
    moveBody(this.level, e, dt);
    e.vx /= k;
    e.vy /= k;
  }

  private setState(e: Enemy, s: Enemy['state']) {
    e.state = s;
    e.stateTime = 0;
  }

  /**
   * 원거리 적: 거리를 두고 서서 쏜다 (가까우면 물러나고, 시야가 막히면 돌아서 다가간다).
   * ranged: 화살(해골)·돌(투척병), frost: 냉기 구슬(맞으면 느려짐), bomb: 발밑에 떨어지는 화염탄
   */
  private updateCaster(e: Enemy, target: Player, d: number, toTarget: number) {
    const def = ENEMIES[e.kind];
    e.aim = toTarget;
    // [이보다 가까우면 물러난다, 이보다 멀면 다가간다] (그 사이에서 멈춰 쏜다)
    const keep = def.ai === 'bomb' ? [190, 330] : def.ai === 'frost' ? [160, 280] : [170, 300];
    const sight = lineOfSight(this.level, e.x, e.y, target.x, target.y);
    if (e.state === 'attack') {
      e.vx = e.vy = 0;
      if (e.stateTime > 0.3) this.setState(e, 'move');
      return;
    }
    if (!sight || d > keep[1]) this.chase(e, target, def.speed, 0);
    else if (d < keep[0]) {
      e.vx = -Math.cos(toTarget) * def.speed;
      e.vy = -Math.sin(toTarget) * def.speed;
    } else e.vx = e.vy = 0;
    if (!sight || e.timer > 0 || d > keep[1] + 80) return;
    if (def.ai === 'bomb') {
      this.spitFire(e, target, e.elite ? 3 : 1);
      e.timer = 3 + this.rng() * 0.8;
    } else if (def.ai === 'frost') {
      for (const off of e.elite ? [-0.25, 0, 0.25] : [0]) this.projectiles.push(this.enemyProjectile(e, 'iceOrb', toTarget + off, 230, 1.9, e.atk));
      e.timer = 2.6 + this.rng() * 0.6;
    } else {
      // 중간보스(엘프 저격수 등)는 3발을 부채꼴로 쏜다. 투척병은 돌을 더 높이 던진다
      const rock = e.kind === 'thrower';
      for (const off of e.elite ? [-0.22, 0, 0.22] : [0]) {
        const p = this.enemyProjectile(e, rock ? 'rock' : 'enemyArrow', toTarget + off, rock ? 260 : 300, 1.6, e.atk);
        p.vz = rock ? 110 : 60;
        p.gz = rock ? 200 : 120;
        this.projectiles.push(p);
      }
      e.timer = (e.elite ? 1.6 : rock ? 2.3 : 2) + this.rng() * 0.6;
    }
    this.setState(e, 'attack');
  }

  /** 암살자: 거리를 좁히다가 멈춰 힘을 모은 뒤(이때 때리면 끊긴다) 조준한 쪽으로 빠르게 돌진하며 벤다 */
  private updateDasher(e: Enemy, target: Player, d: number, toTarget: number) {
    const def = ENEMIES[e.kind];
    if (e.state === 'move') {
      e.aim = toTarget;
      this.chase(e, target, def.speed, e.r + target.r);
      if (d < 200 && e.timer <= 0 && lineOfSight(this.level, e.x, e.y, target.x, target.y)) {
        this.setState(e, 'windup');
        e.vx = e.vy = 0;
      }
    } else if (e.state === 'windup') {
      e.vx = e.vy = 0;
      e.aim = toTarget;
      if (e.stateTime > 0.5) {
        this.setState(e, 'charge');
        e.tx = 0; // 돌진 중에는 도약 목표(tx)를 쓰지 않으므로 '이번 돌진에 이미 벴는지' 표시로 빌려 쓴다
      }
    } else if (e.state === 'charge') {
      e.vx = Math.cos(e.aim) * 520;
      e.vy = Math.sin(e.aim) * 520;
      for (const p of this.players) {
        if (p.dead || e.tx > 0) continue;
        if (dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) {
          this.damagePlayer(p, e.atk * 1.4, e.x, e.y);
          e.tx = 1;
        }
      }
      if (e.stateTime > 0.32) {
        this.setState(e, 'attack');
        this.events.push({ t: 'swing', x: e.x, y: e.y, aim: e.aim, range: e.r + 30, arc: 0.8, enemy: true });
      }
    } else {
      e.vx = approach(e.vx, 0, 2000 / 60);
      e.vy = approach(e.vy, 0, 2000 / 60);
      if (e.stateTime > 0.45) {
        this.setState(e, 'move');
        e.timer = 2.2 + this.rng() * 0.8;
      }
    }
  }

  /** 묵직한 적(오크·약탈자·기사): 다가가 멈춰 몸이 깜빡인 뒤 앞쪽을 크게 내려친다 */
  private updateHeavy(e: Enemy, target: Player, d: number, toTarget: number) {
    const def = ENEMIES[e.kind];
    if (e.state === 'move') {
      e.aim = toTarget;
      this.chase(e, target, def.speed, e.r + target.r + 6);
      if (d < e.r + target.r + 40 && e.timer <= 0) {
        this.setState(e, 'windup');
        e.vx = e.vy = 0;
      }
    } else if (e.state === 'windup') {
      e.vx = e.vy = 0;
      if (e.stateTime > 0.55) {
        this.enemySweep(e, 70, 1.1, 1.6);
        this.setState(e, 'attack');
      }
    } else {
      e.vx = e.vy = 0;
      if (e.stateTime > 0.3) {
        this.setState(e, 'move');
        e.timer = 1.6;
      }
    }
  }

  /** 적이 바라보는 방향으로 부채꼴 근접 공격 */
  private enemySweep(e: Enemy, range: number, arc: number, mult: number) {
    this.events.push({ t: 'swing', x: e.x, y: e.y, aim: e.aim, range: e.r + range, arc, enemy: true });
    for (const p of this.players) {
      if (p.dead) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      const ang = Math.atan2(p.y - e.y, p.x - e.x);
      if (d - p.r <= e.r + range && Math.abs(angleDiff(ang, e.aim)) <= arc) this.damagePlayer(p, e.atk * mult, e.x, e.y);
    }
  }

  private updateBoss(e: Enemy, target: Player | null) {
    const def = ENEMIES.boss;
    const enraged = e.hp < e.maxHp / 2;
    const speed = def.speed * (enraged ? 1.3 : 1);
    const cooldown = () => (enraged ? 1.3 : 2.1) + this.rng() * 0.6;
    const LEAP_TIME = 0.8;

    switch (e.state) {
      case 'move': {
        if (!target) break;
        e.aim = Math.atan2(target.y - e.y, target.x - e.x);
        this.chase(e, target, speed, e.r + target.r);
        if (e.timer > 0) break;
        if (enraged && this.rng() < 0.2 && this.enemies.filter((o) => o.kind !== 'boss').length < 4) {
          this.summonAdds(e);
          e.timer = cooldown();
          break;
        }
        const roll = this.rng();
        if (roll < 0.34) {
          // 도약: 목표 위치로 뛰어올라 내려찍는다
          this.setState(e, 'leap');
          e.tx = target.x;
          e.ty = target.y;
          e.vx = (e.tx - e.x) / LEAP_TIME;
          e.vy = (e.ty - e.y) / LEAP_TIME;
        } else if (roll < 0.67) {
          this.setState(e, 'windup');
          e.vx = e.vy = 0;
        } else {
          this.spitFire(e, target, enraged ? 5 : 3);
          this.setState(e, 'attack');
          e.vx = e.vy = 0;
        }
        break;
      }
      case 'leap': {
        const t = e.stateTime / LEAP_TIME;
        e.z = Math.sin(Math.min(1, t) * Math.PI) * 130;
        if (t >= 1) {
          e.z = 0;
          e.vx = e.vy = 0;
          const n = enraged ? 16 : 12;
          for (let i = 0; i < n; i++) {
            this.projectiles.push(this.enemyProjectile(e, 'shockwave', (i / n) * Math.PI * 2, 240, 1.3, e.atk));
          }
          this.events.push({ t: 'boom', x: e.x, y: e.y, r: 80, shake: true, kind: 'bossSlam' });
          for (const p of this.players) if (dist(p.x, p.y, e.x, e.y) < e.r + 30) this.damagePlayer(p, e.atk * 1.3, e.x, e.y);
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
      }
      case 'windup':
        e.vx = e.vy = 0;
        if (target) e.aim = Math.atan2(target.y - e.y, target.x - e.x);
        if (e.stateTime > 0.6) this.setState(e, 'charge');
        break;
      case 'charge': {
        const s = 400 * (enraged ? 1.2 : 1);
        e.vx = Math.cos(e.aim) * s;
        e.vy = Math.sin(e.aim) * s;
        if (e.stateTime > 0.9) {
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
      }
      case 'attack':
        e.vx = e.vy = 0;
        if (e.stateTime > 0.5) {
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
    }
  }

  /** 목표 주변에 화염탄 n개를 뱉는다 (흑룡, 화염 술사). 포물선으로 날아가 떨어질 자리에 경고 원이 그려진다. 첫 발은 목표 발밑. */
  private spitFire(e: Enemy, target: Player, n: number) {
    const flight = 1.1, height = 140;
    this.events.push({ t: 'shoot', x: Math.round(e.x), y: Math.round(e.y), kind: 'firebomb', enemy: true });
    for (let i = 0; i < n; i++) {
      const ang = this.rng() * Math.PI * 2;
      const off = i === 0 ? 0 : 30 + this.rng() * 70;
      const lx = target.x + Math.cos(ang) * off + target.vx * 0.4;
      const ly = target.y + Math.sin(ang) * off + target.vy * 0.4;
      this.projectiles.push({
        id: this.nextId++, fromPlayer: false, ownerId: '', kind: 'firebomb',
        x: e.x, y: e.y, z: 40, vx: (lx - e.x) / flight, vy: (ly - e.y) / flight,
        vz: (4 * height) / flight, gz: (8 * height) / (flight * flight),
        r: 12, dmg: e.atk * 0.9, crit: false, life: flight, aoe: 46, pierce: false, hitIds: [],
      });
    }
  }

  private summonAdds(boss: Enemy) {
    const party = this.players.length;
    for (const side of [-1, 1]) {
      const g = this.createEnemy('goblin', 4, party);
      g.active = true;
      g.x = boss.x + Math.cos(boss.aim + side * 1.6) * 70;
      g.y = boss.y + Math.sin(boss.aim + side * 1.6) * 70;
      if (pointBlocked(this.level, g.x, g.y)) [g.x, g.y] = [boss.x, boss.y];
      this.enemies.push(g);
    }
    this.events.push({ t: 'banner', text: '', sub: `${ENEMIES.boss.name}이 고블린들을 불러냈다!` });
  }

  /** 적끼리 겹치지 않게 밀어낸다. */
  private separateEnemies() {
    const list = this.enemies.filter((e) => e.active);
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = a.r + b.r - d;
        if (overlap <= 0) continue;
        const fixedA = a.kind === 'boss' || a.tomb, fixedB = b.kind === 'boss' || b.tomb; // 흑룡·묘비는 밀리지 않는다
        if (fixedA && fixedB) continue;
        const wa = fixedA ? 0 : fixedB ? 1 : 0.5;
        const nx = dx / d, ny = dy / d;
        // 벽 검사를 하며 민다: 그냥 옮기면 무리에 떠밀린 적이 얇은 문(한 칸) 속으로 들어가 반대편으로 빠져나간다
        pushBody(this.level, a, -nx * overlap * wa, -ny * overlap * wa);
        pushBody(this.level, b, nx * overlap * (1 - wa), ny * overlap * (1 - wa));
      }
  }

  private contactDamage() {
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || e.z > 20 || e.tomb) continue;
      const mult = e.kind === 'boss' ? (e.state === 'charge' ? 1.4 : 1) : 0.8;
      for (const p of this.players) {
        if (p.dead || p.invuln > 0) continue;
        if (dist(e.x, e.y, p.x, p.y) >= e.r + p.r - 2) continue;
        this.damagePlayer(p, e.atk * mult, e.x, e.y);
        // 근접 몬스터는 때릴 때 공격 동작을 보여 준다 (화면이 state를 보고 공격 애니메이션을 튼다)
        if (ENEMIES[e.kind].ai === 'melee' && e.state !== 'attack') this.setState(e, 'attack');
      }
    }
  }

  // ─── 투사체 / 드랍 ──────────────────────────────────

  private updateProjectiles(dt: number) {
    const alive: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      if (pr.homing !== undefined) this.steer(pr, dt);
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;
      pr.vz -= pr.gz * dt;
      let gone = false;

      if (pr.kind === 'firebomb' || pr.kind === 'rain' || pr.kind === 'meteor') {
        // 떨어지는 투사체는 장애물 위로 지나가 착지할 때만 피해를 준다
        if (pr.life <= 0) {
          gone = true;
          if (pr.fromPlayer) this.explode(pr);
          else {
            this.events.push({ t: 'boom', x: pr.x, y: pr.y, r: pr.aoe, kind: 'firebomb' });
            for (const p of this.players) if (dist(p.x, p.y, pr.x, pr.y) < pr.aoe + p.r) this.damagePlayer(p, pr.dmg, pr.x, pr.y);
          }
        }
        if (!gone) alive.push(pr);
        continue;
      }

      const explodes = pr.kind === 'orb' || pr.kind === 'fireball';
      if (pointBlocked(this.level, pr.x, pr.y) || pr.life <= 0) {
        gone = true;
        if (explodes) this.explode(pr);
      }

      if (!gone && pr.fromPlayer) {
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0 || e.z > 30 || pr.hitIds.includes(e.id)) continue;
          if (dist(pr.x, pr.y, e.x, e.y) < pr.r + e.r) {
            if (explodes) this.explode(pr);
            else {
              const s = Math.hypot(pr.vx, pr.vy) || 1;
              this.hitEnemy(e, pr.dmg, pr.crit, (pr.vx / s) * 140, (pr.vy / s) * 140, this.playerById(pr.ownerId));
            }
            if (pr.pierce) {
              pr.hitIds.push(e.id);
              continue;
            }
            gone = true;
            break;
          }
        }
      } else if (!gone) {
        for (const p of this.players) {
          if (p.dead || p.invuln > 0) continue;
          if (dist(pr.x, pr.y, p.x, p.y) < pr.r + p.r) {
            this.damagePlayer(p, pr.dmg, pr.x - pr.vx, pr.y - pr.vy);
            if (pr.kind === 'iceOrb') p.chill = CHILL_TIME;
            if (pr.kind !== 'shockwave') gone = true;
            break;
          }
        }
      }
      if (!gone) alive.push(pr);
    }
    this.projectiles = alive;
  }

  /** 자동 조준된 투사체를 따라가는 적 쪽으로 조금씩 꺾는다. 적이 쓰러지거나 사라지면 그대로 곧게 날아간다 */
  private steer(pr: Projectile, dt: number) {
    const e = this.enemies.find((x) => x.id === pr.homing);
    if (!e || !e.active || e.hp <= 0) {
      pr.homing = undefined;
      return;
    }
    const cur = Math.atan2(pr.vy, pr.vx);
    const want = Math.atan2(e.y - pr.y, e.x - pr.x);
    const diff = angleDiff(want, cur);
    const step = Math.max(-(pr.turn ?? 0) * dt, Math.min((pr.turn ?? 0) * dt, diff));
    const s = Math.hypot(pr.vx, pr.vy);
    pr.vx = Math.cos(cur + step) * s;
    pr.vy = Math.sin(cur + step) * s;
  }

  private explode(pr: Projectile) {
    // 업화의 지팡이 마법사의 구체는 작은 화염 폭발로 보인다
    const kind = pr.kind === 'meteor' || pr.kind === 'fireball' || pr.kind === 'rain' ? pr.kind : pr.look === 'burn' ? 'fireOrb' : 'orb';
    this.events.push({ t: 'boom', x: pr.x, y: pr.y, r: pr.aoe, kind, shake: kind === 'meteor' });
    const by = this.playerById(pr.ownerId);
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0) continue;
      if (dist(pr.x, pr.y, e.x, e.y) <= pr.aoe + e.r) {
        const ang = Math.atan2(e.y - pr.y, e.x - pr.x);
        this.hitEnemy(e, pr.dmg, pr.crit, Math.cos(ang) * 180, Math.sin(ang) * 180, by);
      }
    }
  }

  private playerById(id: string): Player | null {
    return this.players.find((p) => p.id === id) ?? null;
  }

  private updateDrops(dt: number) {
    for (const d of this.drops) {
      if (d.z <= 0 && d.vz <= 0) continue;
      d.z += d.vz * dt;
      d.vz -= 900 * dt;
      if (d.z <= 0) {
        d.z = 0;
        d.vz = 0;
      }
    }
    // 돈은 가까운 플레이어에게 끌려간다 (주우면 파티 전원이 받는다)
    for (const d of this.drops) {
      if (d.kind !== 'gold' || d.z > 0) continue;
      let best: Player | null = null, bestD = 90;
      for (const p of this.players) {
        const dd = dist(p.x, p.y, d.x, d.y);
        if (!p.dead && dd < bestD) [best, bestD] = [p, dd];
      }
      if (!best || bestD < 1) continue;
      const step = Math.min(bestD, 360 * dt);
      d.x += ((best.x - d.x) / bestD) * step;
      d.y += ((best.y - d.y) / bestD) * step;
    }

    // 닿으면 줍는다: 돈은 지갑에, 음식은 필요하면 바로 먹고 아니면 아이템 상자에
    this.drops = this.drops.filter((d) => {
      if (d.kind === 'item' || d.z > 0) return true;
      const p = this.players.find((p) => !p.dead && dist(p.x, p.y, d.x, d.y) < p.r + 12);
      if (!p) return true;
      if (d.kind === 'gold') {
        // 협동 게임이라 돈은 경험치처럼 파티 전원이 같은 만큼 받는다 (근접 직업만 돈을 줍는 일이 없도록)
        for (const o of this.players) {
          o.gold += d.gold ?? 0;
          o.record.gold += d.gold ?? 0;
          this.events.push({ t: 'gold', pid: o.id, x: o.x, y: o.y, v: d.gold ?? 0 });
        }
        return false;
      }
      const hungry = d.kind === 'hpFood' ? p.hp < p.stats.maxHp : p.mp < p.stats.maxMp;
      if (hungry) {
        if (d.kind === 'hpFood') this.healPlayer(p, Math.round(p.stats.maxHp * FOOD.hp));
        else this.restoreMp(p, p.stats.maxMp * FOOD.mp);
        return false;
      }
      if (!this.addFood(p, d.kind)) return true; // 더 못 들면 바닥에 둔다
      this.events.push({ t: 'stash', pid: p.id, kind: d.kind });
      return false;
    });
  }

  // ─── 스냅샷 ────────────────────────────────────────

  /**
   * 화면용 상태. viewer를 주면 그 플레이어에게 보낼 것으로 만든다:
   * 아이템 상자는 자기 것만 필요하므로 다른 플레이어의 상자는 비워서 보낸다.
   */
  snapshot(events: GameEvent[], viewer?: string, shopViewer = viewer): Snapshot {
    const near = (x: number, y: number) => this.players.some((p) => dist(p.x, p.y, x, y) < SNAPSHOT_RADIUS);
    const r = (v: number) => Math.round(v * 10) / 10;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const ended = this.status !== 'playing'; // 끝나면 결과 화면에 모두의 장비를 보여 주려고 상자·가방도 보낸다
    const boss = this.enemies.find((e) => e.kind === 'boss' && e.active);
    // 화면에 필요한 값만 골라 반올림해서 보낸다 (스냅샷은 초당 20번, 참가자마다 전송된다)
    const enemyView = (e: Enemy): EnemyView => ({
      id: e.id, kind: e.kind, elite: e.elite, x: r(e.x), y: r(e.y), r: e.r, aim: r2(e.aim),
      hp: e.hp, maxHp: e.maxHp, hurt: r2(Math.max(0, e.hurt)), stun: r2(Math.max(0, e.stun)), slow: r2(Math.max(0, e.slow)), burn: r2(Math.max(0, e.burn)), bleed: r2(Math.max(0, e.bleed)),
      taunt: r2(Math.max(0, e.taunt)), state: e.state, timer: r2(e.timer), z: r(e.z), tx: r(e.tx), ty: r(e.ty),
      ...(e.tomb ? { tomb: true } : {}), ...(e.shielded ? { shielded: true } : {}),
    });
    const projView = (p: Projectile): ProjectileView => ({
      id: p.id, kind: p.kind, x: r(p.x), y: r(p.y), z: r(p.z), vx: r(p.vx), vy: r(p.vy), vz: r(p.vz), r: p.r, life: r2(p.life), aoe: p.aoe, ...(p.look ? { look: p.look } : {}),
    });
    return {
      tick: this.tick,
      zone: this.zone,
      status: this.status,
      players: this.players.map((p) => ({
        ...p, x: r(p.x), y: r(p.y), aim: r2(p.aim), dashHits: [], inv: viewer && p.id !== viewer && !ended ? [] : p.inv, bag: viewer && p.id !== viewer && !ended ? [] : p.bag,
      })),
      enemies: this.enemies.filter((e) => e.active && near(e.x, e.y)).map(enemyView),
      projectiles: this.projectiles.filter((p) => near(p.x, p.y)).map(projView),
      drops: this.drops.filter((d) => near(d.x, d.y)).map((d) => ({ id: d.id, kind: d.kind, x: r(d.x), y: r(d.y), z: r(d.z), item: d.item })),
      // 장비 품절 여부는 보는 사람 기준 (산 사람 목록은 보내지 않는다)
      shops: this.shops.filter((sh) => near(sh.x, sh.y)).map((sh) => ({
        ...sh, stock: sh.stock.map(({ buyers, ...e }) => ({ ...e, sold: !!shopViewer && !!buyers?.includes(shopViewer) })),
      })),
      events,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
      gates: this.gates,
      dungeons: this.level.dungeons.map((d, i) => {
        const st = this.dungeons[i], mine = this.enemies.filter((e) => e.dungeon === i && e.hp > 0), boss = mine.find((e) => e.elite);
        return {
          zone: d.zone, name: DUNGEONS[d.zone]?.name ?? '던전', state: st.state, wave: st.wave, waves: DUNGEONS[d.zone]?.waves.length ?? 0,
          left: mine.length, cleared: st.cleared, boss: boss ? { name: boss.elite!, hp: r2(boss.hp / boss.maxHp) } : null,
        };
      }),
    };
  }
}
