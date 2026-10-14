// 게임 시뮬레이션. 호스트에서만 실행되고, 클라이언트는 스냅샷을 받아 그리기만 한다.
import {
  AGGRO_RANGE, TICK_RATE, ATTR_EFFECT, ATTR_KEYS, CLASSES, ELITE, ELITES, ENEMIES, GATE_KEEPERS, FOOD, INV_SIZE, POINTS_PER_LEVEL, REVIVE_TIME, SHOP, SKILL, TILE, ZONE_NAMES,
  deriveStats, makeItem, partyHpScale, type EliteDef, shopItemPrice, totalAttrs, xpForLevel, zoneScale, type AttackDef,
} from './data';
import { mulberry32, openGate, zoneOfTx, type Level } from './level';
import { gameLevel } from './world';
import { NavField, angleDiff, approach, dist, lineOfSight, moveBody, pointBlocked, pushBody } from './physics';
import {
  EMPTY_INPUT,
  type AttrKey, type Drop, type FoodKind, type Item, type Enemy, type EnemyKind, type EnemyView, type ProjectileView, type GameEvent, type GameStatus, type InputState,
  type LobbyPlayer, type Player, type Projectile, type Shop, type Snapshot,
} from './types';

type ProjectileAttack = Extract<AttackDef, { kind: 'projectile' }>;

const NAV_EVERY = 15; // 길찾기 지도 갱신 주기 (틱)
const SNAPSHOT_RADIUS = 520; // 플레이어로부터 이 거리 안의 엔티티만 전송 (화면 대각선 + 여유)
const CHILL_TIME = 2; // 얼음 마녀의 냉기 구슬에 맞으면 이 시간 동안
const CHILL_SLOW = 0.6; // 이동 속도가 이만큼으로 줄어든다
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
  private endTimer = 0;
  private pendingStatus: GameStatus | null = null;

  /** seed는 떨어지는 물건 같은 운에만 쓴다. 맵은 모두 같은 맵(gameLevel) */
  constructor(seed: number, lobby: LobbyPlayer[], level: Level = gameLevel()) {
    this.level = level;
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    this.gates = this.level.gates.map(() => false);
    lobby.forEach((lp, i) => this.players.push(this.createPlayer(lp, i)));
    const party = partyHpScale(this.players.length);
    for (const s of this.level.spawns) {
      const elite = s.gate !== undefined ? GATE_KEEPERS[s.gate] : s.elite !== undefined ? ELITES[s.zone - 1][s.elite] : undefined;
      const e = this.createEnemy(s.kind, s.zone, party, elite);
      e.gate = s.gate ?? null;
      e.x = s.x;
      e.y = s.y;
      this.enemies.push(e);
    }
    this.shops = this.level.shops.map((sp, i) => ({
      id: i, x: sp.x, y: sp.y, zone: sp.zone,
      stock: [
        { kind: 'hpFood' as const, price: SHOP.foodPrice, sold: false },
        { kind: 'mpFood' as const, price: SHOP.foodPrice, sold: false },
        ...Array.from({ length: SHOP.items }, () => {
          const item = makeItem(this.nextId++, sp.zone, this.rng, SHOP.rarityWeight);
          return { kind: 'item' as const, item, price: shopItemPrice(item.rarity, sp.zone), sold: false };
        }),
      ],
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
      stats: { maxHp: 0, atk: 0, def: 0, crit: 0, haste: 0, cdr: 0, maxMp: 0, mpRegen: 0 },
      atkCd: 0, atkAnim: 0, skillCds: [0, 0, 0, 0], dashTime: 0, dashSkill: 0, dashHits: [],
      guard: 0, guardReduce: 0, atkBuff: 0, chill: 0, mp: 0,
      invuln: 0, dead: false, revive: 0, kills: 0,
    };
    this.recalcStats(p);
    p.hp = p.stats.maxHp;
    p.mp = p.stats.maxMp;
    return p;
  }

  /** elite를 주면 그 능력치로 중간보스를 만든다 (ELITES) */
  private createEnemy(kind: EnemyKind, zone: number, party: number, elite?: EliteDef): Enemy {
    const def = ENEMIES[kind];
    // 흑룡은 구역 배율 없이 자기 능력치 그대로
    const zs = kind === 'boss' ? { hp: 1, atk: 1, def: 0, xp: 1 } : zoneScale(zone);
    const base = elite ?? def;
    const hp = Math.round(base.hp * zs.hp * party);
    return {
      id: this.nextId++, kind, zone, elite: elite?.name ?? null, gate: null, active: false,
      // 몸집이 커져도 타일 한 칸 틈은 지나가야 하므로 충돌 반지름은 15까지만
      x: 0, y: 0, vx: 0, vy: 0, r: elite ? Math.min(15, def.r * 1.25) : def.r, aim: Math.PI,
      hp, maxHp: hp, atk: Math.round(base.atk * zs.atk), def: base.def + zs.def,
      xp: Math.round(def.xp * zs.xp * (elite ? ELITE.xp : 1)),
      hurt: 0, stun: 0, slow: 0, rush: 0, taunt: 0, tauntBy: '', timer: 1 + this.rng(), state: 'move', stateTime: 0,
      z: 0, tx: 0, ty: 0,
    };
  }

  private recalcStats(p: Player) {
    // 상자에 든 장비는 종류와 상관없이 모두 능력치에 더해진다
    const items = p.inv.flatMap((sl) => (sl?.kind === 'item' ? [sl.item] : []));
    p.attrs = totalAttrs(p.cls, p.level, p.alloc, items);
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
    if (crit) v *= 1.6;
    return { v, crit };
  }

  private playerAttack(p: Player) {
    const a = CLASSES[p.cls].attack;
    p.atkCd = a.cd / (1 + p.stats.haste);
    p.atkAnim = 0.18;

    if (a.kind === 'melee') {
      this.meleeArc(p, a.range, a.arc, a.mult, a.knock, 0);
    } else {
      const d = this.rollDamage(p, a.mult);
      this.projectiles.push(this.playerProjectile(p, {
        kind: a.proj, ang: p.aim, speed: a.speed, range: a.range, arcHeight: a.arcHeight,
        r: a.proj === 'orb' ? 9 : 6, aoe: a.aoe, dmg: d.v, crit: d.crit, pierce: false,
      }));
    }
  }

  /** 플레이어 앞(또는 주변) 부채꼴 안의 적을 친다. arc가 π 이상이면 360도. */
  private meleeArc(p: Player, range: number, arc: number, mult: number, knock: number, stun: number) {
    this.events.push({ t: 'swing', x: p.x, y: p.y, aim: p.aim, range, arc, enemy: false });
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || e.z > 30) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      const inArc = arc >= Math.PI || Math.abs(angleDiff(ang, p.aim)) <= arc;
      if (d - e.r <= range && (inArc || d < p.r + e.r + 4)) {
        const dmg = this.rollDamage(p, mult);
        this.hitEnemy(e, dmg.v, dmg.crit, Math.cos(ang) * knock, Math.sin(ang) * knock, p, stun);
      }
    }
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
    if (p.mp < sk.mp) {
      this.events.push({ t: 'nomp', pid: p.id });
      return;
    }
    p.mp -= sk.mp;
    p.skillCds[idx] = sk.cd / (1 + p.stats.cdr);
    this.useSkill(p, idx);
  }

  private useSkill(p: Player, idx: number) {
    const ev = (r: number, x = p.x, y = p.y) => this.events.push({ t: 'skill', pid: p.id, idx, x, y, r, aim: Math.round(p.aim * 100) / 100 });
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

      // ── 마법사 ──
      case 'gnome.0': {
        const { radius } = SKILL.heal;
        const ratio = SKILL.heal.ratio * (1 + p.attrs.int * ATTR_EFFECT.intHeal);
        for (const o of this.players) {
          if (dist(p.x, p.y, o.x, o.y) > radius) continue;
          if (o.dead) this.revivePlayer(o, ratio);
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
    const speed = shield ? SKILL.bash.speed : SKILL.dash.speed;
    p.dashTime -= dt;
    p.vx = Math.cos(p.aim) * speed;
    p.vy = Math.sin(p.aim) * speed;
    p.moving = true;
    moveBody(this.level, p, dt);
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || p.dashHits.includes(e.id)) continue;
      if (dist(p.x, p.y, e.x, e.y) < p.r + e.r + 14) {
        p.dashHits.push(e.id);
        const d = this.rollDamage(p, shield ? SKILL.bash.mult : SKILL.dash.mult);
        const knock = shield ? SKILL.bash.knock : 260;
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
    if (!this.addItem(p, drop.item)) return this.notice(p, '아이템 상자가 가득 찼어요');
    this.drops = this.drops.filter((d) => d !== drop);
  }

  // ─── 아이템 상자 ─────────────────────────────────────

  /** 장비를 빈 칸에 넣는다. 자리가 없으면 false. */
  private addItem(p: Player, item: Item): boolean {
    const free = p.inv.indexOf(null);
    if (free < 0) return false;
    p.inv[free] = { kind: 'item', item };
    this.recalcStats(p);
    this.events.push({ t: 'equip', pid: p.id, item });
    return true;
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

  /** 상자 칸 클릭: 음식은 하나 먹고, 장비는 발밑에 내려놓는다 (자리를 비우려고). */
  useSlot(id: string, idx: number) {
    const p = this.playerById(id);
    const sl = p?.inv[idx];
    if (!p || p.dead || !sl) return;
    if (sl.kind !== 'item') return this.eatFromInv(p, sl.kind);
    p.inv[idx] = null;
    this.recalcStats(p);
    this.spawnDrop({ kind: 'item', item: sl.item }, p.x, p.y);
    this.notice(p, '장비를 내려놓았어요');
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
    if (entry.sold) return fail('품절');
    if (p.gold < entry.price) return fail('돈이 부족해요');
    if (entry.kind === 'item') {
      if (!this.addItem(p, entry.item!)) return fail('아이템 상자가 가득 찼어요');
      entry.sold = true;
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
    let scaled = raw * (0.9 + this.rng() * 0.2);
    if (p.guard > 0) scaled *= 1 - p.guardReduce;
    const dmg = Math.max(1, Math.round(scaled * 0.15), Math.round(scaled - p.stats.def * 0.5));
    p.hp -= dmg;
    p.invuln = 0.7;
    const ang = Math.atan2(p.y - fromY, p.x - fromX);
    p.vx = Math.cos(ang) * 240;
    p.vy = Math.sin(ang) * 240;
    this.events.push({ t: 'dmg', x: p.x, y: p.y, v: dmg, crit: false, toPlayer: true });
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = true;
      p.revive = 0;
      this.events.push({ t: 'down', pid: p.id });
    }
  }

  private updateRevive(dt: number) {
    for (const p of this.players) {
      if (!p.dead) continue;
      const helper = this.players.some((o) => !o.dead && dist(o.x, o.y, p.x, p.y) < 44);
      p.revive = helper ? p.revive + dt : Math.max(0, p.revive - dt);
      if (p.revive >= REVIVE_TIME) this.revivePlayer(p, 0.4);
    }
  }

  private revivePlayer(p: Player, hpRatio: number) {
    p.dead = false;
    p.revive = 0;
    p.hp = Math.round(p.stats.maxHp * hpRatio);
    p.invuln = 1.5;
    this.events.push({ t: 'revive', pid: p.id });
  }

  private restoreMp(p: Player, amount: number) {
    const before = p.mp;
    p.mp = Math.min(p.stats.maxMp, p.mp + amount);
    if (p.mp - before >= 1) this.events.push({ t: 'mana', x: p.x, y: p.y, v: Math.round(p.mp - before) });
  }

  private healPlayer(p: Player, amount: number) {
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (p.hp > before) this.events.push({ t: 'heal', x: p.x, y: p.y, v: p.hp - before });
  }

  // ─── 구역 ─────────────────────────────────────────

  private openGate(i: number, keeper: string) {
    if (this.gates[i]) return;
    this.gates[i] = true;
    openGate(this.level, i);
    // 길찾기 지도를 새로 계산하게 한다 (문 자리가 길이 됐다)
    for (const nav of this.navs.values()) nav.originTx = -1;
    const last = i === this.gates.length - 1;
    this.events.push({ t: 'banner', text: '문이 열렸다', sub: `${keeper} 처치! — ${last ? '이 너머에 흑룡이 기다린다' : `다음 → ${i + 2}구역 ${ZONE_NAMES[i + 1]}`}` });
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

  private hitEnemy(e: Enemy, raw: number, crit: boolean, kx: number, ky: number, by: Player | null, stun = 0) {
    if (e.hp <= 0) return;
    const dmg = Math.max(1, Math.round(raw - e.def * 0.5));
    e.hp -= dmg;
    e.hurt = 0.12;
    this.events.push({ t: 'dmg', x: e.x, y: e.y, v: dmg, crit, toPlayer: false });
    if (e.kind !== 'boss') {
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
    if (by && !e.elite && (ai === 'melee' || ai === 'heavy' || ai === 'hop' || ai === 'dash') && dist(e.x, e.y, by.x, by.y) > RUSH.minDist) {
      e.rush = RUSH.time;
      e.active = true;
      if (e.taunt <= 0) {
        // 쏜 플레이어를 노린다 (수호자의 도발이 걸려 있으면 도발이 우선)
        e.taunt = RUSH.time;
        e.tauntBy = by.id;
      }
    }
    if (e.hp <= 0) this.killEnemy(e, by);
  }

  private killEnemy(e: Enemy, by: Player | null) {
    if (by) by.kills++;
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
      return;
    }
    if (this.rng() < ENEMIES[e.kind].dropRate) {
      this.spawnDrop({ kind: 'item', item: makeItem(this.nextId++, e.zone, this.rng) }, e.x, e.y);
    } else if (this.rng() < 0.1) {
      this.spawnDrop({ kind: this.rng() < 0.5 ? 'hpFood' : 'mpFood' }, e.x, e.y);
    }
  }

  private enemyProjectile(e: Enemy, kind: Projectile['kind'], ang: number, speed: number, life: number, dmg: number): Projectile {
    return {
      id: this.nextId++, fromPlayer: false, ownerId: '', kind,
      x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r, z: 0,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: 0, gz: 0,
      r: kind === 'shockwave' ? 14 : 6, dmg, crit: false, life, aoe: 0, pierce: false, hitIds: [],
    };
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.hurt -= dt;
    e.stun -= dt;
    e.slow -= dt;
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
    const party = partyHpScale(this.players.length);
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
        const wa = a.kind === 'boss' ? 0 : b.kind === 'boss' ? 1 : 0.5;
        const nx = dx / d, ny = dy / d;
        // 벽 검사를 하며 민다: 그냥 옮기면 무리에 떠밀린 적이 얇은 문(한 칸) 속으로 들어가 반대편으로 빠져나간다
        pushBody(this.level, a, -nx * overlap * wa, -ny * overlap * wa);
        pushBody(this.level, b, nx * overlap * (1 - wa), ny * overlap * (1 - wa));
      }
  }

  private contactDamage() {
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || e.z > 20) continue;
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

  private explode(pr: Projectile) {
    const kind = pr.kind === 'meteor' || pr.kind === 'fireball' || pr.kind === 'rain' ? pr.kind : 'orb';
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
  snapshot(events: GameEvent[], viewer?: string): Snapshot {
    const near = (x: number, y: number) => this.players.some((p) => dist(p.x, p.y, x, y) < SNAPSHOT_RADIUS);
    const r = (v: number) => Math.round(v * 10) / 10;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const boss = this.enemies.find((e) => e.kind === 'boss' && e.active);
    // 화면에 필요한 값만 골라 반올림해서 보낸다 (스냅샷은 초당 20번, 참가자마다 전송된다)
    const enemyView = (e: Enemy): EnemyView => ({
      id: e.id, kind: e.kind, elite: e.elite, x: r(e.x), y: r(e.y), r: e.r, aim: r2(e.aim),
      hp: e.hp, maxHp: e.maxHp, hurt: r2(Math.max(0, e.hurt)), stun: r2(Math.max(0, e.stun)), slow: r2(Math.max(0, e.slow)),
      taunt: r2(Math.max(0, e.taunt)), state: e.state, timer: r2(e.timer), z: r(e.z), tx: r(e.tx), ty: r(e.ty),
    });
    const projView = (p: Projectile): ProjectileView => ({
      id: p.id, kind: p.kind, x: r(p.x), y: r(p.y), z: r(p.z), vx: r(p.vx), vy: r(p.vy), vz: r(p.vz), r: p.r, life: r2(p.life), aoe: p.aoe,
    });
    return {
      tick: this.tick,
      zone: this.zone,
      status: this.status,
      players: this.players.map((p) => ({
        ...p, x: r(p.x), y: r(p.y), aim: r2(p.aim), dashHits: [], inv: viewer && p.id !== viewer ? [] : p.inv,
      })),
      enemies: this.enemies.filter((e) => e.active && near(e.x, e.y)).map(enemyView),
      projectiles: this.projectiles.filter((p) => near(p.x, p.y)).map(projView),
      drops: this.drops.filter((d) => near(d.x, d.y)).map((d) => ({ id: d.id, kind: d.kind, x: r(d.x), y: r(d.y), z: r(d.z), item: d.item })),
      shops: this.shops.filter((sh) => near(sh.x, sh.y)),
      events,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
      gates: this.gates,
    };
  }
}
