// 게임 시뮬레이션. 호스트에서만 실행되고, 클라이언트는 스냅샷을 받아 그리기만 한다.
import {
  type AttackDef, CLASSES, ENEMIES, GRAVITY, REVIVE_TIME, SKILL, TILE, VIEW_W, ZONE_NAMES,
  makeItem, partyHpScale, xpForLevel, zoneScale,
} from './data';
import { buildLevel, mulberry32, T_SOLID, tileAt, type Level } from './level';
import { approach, moveBody, rectsOverlap, unstick } from './physics';
import {
  EMPTY_INPUT,
  type Drop, type Enemy, type EnemyKind, type GameEvent, type GameStatus, type InputState,
  type LobbyPlayer, type Player, type Projectile, type Snapshot,
} from './types';

type ProjectileAttack = Extract<AttackDef, { kind: 'projectile' }>;

export class Sim {
  readonly level: Level;
  private rng: () => number;
  tick = 0;
  camX = 0;
  zone = 0;
  status: GameStatus = 'playing';
  players: Player[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  drops: Drop[] = [];
  private events: GameEvent[] = [];
  private inputs = new Map<string, InputState>();
  private prevInputs = new Map<string, InputState>();
  private nextId = 1;
  private arenaLocked = false;
  private endTimer = 0;
  private pendingStatus: GameStatus | null = null;

  constructor(seed: number, lobby: LobbyPlayer[]) {
    this.level = buildLevel(seed);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    lobby.forEach((lp, i) => this.players.push(this.createPlayer(lp, i)));
    const party = partyHpScale(this.players.length);
    for (const s of this.level.spawns) {
      const e = this.createEnemy(s.kind, s.zone, party);
      e.x = s.tx * TILE + (TILE - e.w) / 2;
      e.y = s.ty * TILE - e.h;
      this.enemies.push(e);
    }
  }

  setInput(id: string, input: InputState) {
    this.inputs.set(id, input);
  }

  removePlayer(id: string) {
    this.players = this.players.filter((p) => p.id !== id);
    this.inputs.delete(id);
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ─── 생성 ──────────────────────────────────────────

  private createPlayer(lp: LobbyPlayer, index: number): Player {
    const def = CLASSES[lp.cls!];
    const p: Player = {
      id: lp.id, name: lp.name, cls: lp.cls!,
      x: 80 + index * 44, y: 14 * TILE - def.h, vx: 0, vy: 0, w: def.w, h: def.h, onGround: false,
      facing: 1, hp: 0, level: 1, xp: 0, xpNext: xpForLevel(1),
      stats: { ...def.base }, equip: {},
      atkCd: 0, atkAnim: 0, skillCd: 0, dashTime: 0, dashHits: [], guard: 0,
      invuln: 0, dead: false, revive: 0, kills: 0,
    };
    this.recalcStats(p);
    p.hp = p.stats.maxHp;
    return p;
  }

  private createEnemy(kind: EnemyKind, zone: number, party: number): Enemy {
    const def = ENEMIES[kind];
    const zs = kind === 'boss' ? zoneScale(1) : zoneScale(zone);
    const hp = Math.round(def.hp * zs.hp * party);
    return {
      id: this.nextId++, kind, zone, active: false,
      x: 0, y: 0, vx: 0, vy: 0, w: def.w, h: def.h, onGround: false, facing: -1,
      hp, maxHp: hp, atk: Math.round(def.atk * zs.atk), def: def.def + zs.def, xp: Math.round(def.xp * zs.xp),
      hurt: 0, stun: 0, taunt: 0, tauntBy: '', timer: 1 + this.rng(), state: 'move', stateTime: 0,
    };
  }

  private recalcStats(p: Player) {
    const def = CLASSES[p.cls];
    const lv = p.level - 1;
    const s = {
      maxHp: def.base.maxHp + def.growth.maxHp * lv,
      atk: def.base.atk + def.growth.atk * lv,
      def: def.base.def + def.growth.def * lv,
      crit: def.base.crit + def.growth.crit * lv,
    };
    for (const item of Object.values(p.equip)) {
      if (!item) continue;
      s.maxHp += item.stats.maxHp ?? 0;
      s.atk += item.stats.atk ?? 0;
      s.def += item.stats.def ?? 0;
      s.crit += item.stats.crit ?? 0;
    }
    const oldMax = p.stats.maxHp;
    p.stats = { maxHp: Math.round(s.maxHp), atk: Math.round(s.atk), def: Math.round(s.def), crit: Math.min(0.75, s.crit) };
    if (p.hp > 0) p.hp = Math.min(p.stats.maxHp, p.hp + Math.max(0, p.stats.maxHp - oldMax));
  }

  // ─── 메인 루프 ──────────────────────────────────────

  step(dt: number) {
    if (this.status !== 'playing') return;
    this.tick++;

    if (this.pendingStatus) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.status = this.pendingStatus;
    }

    for (const p of this.players) this.updatePlayer(p, dt);
    this.updateCamera(dt);
    this.updateZone();

    for (const e of this.enemies) {
      if (!e.active) {
        if (e.kind === 'boss' ? this.arenaLocked : e.x < this.camX + VIEW_W + 64) e.active = true;
        else continue;
      }
      this.updateEnemy(e, dt);
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);

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

  // ─── 플레이어 ───────────────────────────────────────

  private updatePlayer(p: Player, dt: number) {
    const inp = this.inputs.get(p.id) ?? EMPTY_INPUT;
    const prev = this.prevInputs.get(p.id) ?? EMPTY_INPUT;
    const def = CLASSES[p.cls];
    p.atkCd -= dt;
    p.atkAnim -= dt;
    p.skillCd -= dt;
    p.guard -= dt;
    p.invuln -= dt;

    if (p.dead) {
      p.vx = approach(p.vx, 0, 1200 * dt);
      p.vy += GRAVITY * dt;
      moveBody(this.level, p, dt);
      return;
    }

    if (p.dashTime > 0) {
      this.updateDash(p, dt);
      return;
    }

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) p.facing = dir as 1 | -1;
    p.vx = approach(p.vx, dir * def.speed, (p.onGround ? 2400 : 1400) * dt);

    if (inp.jump && !prev.jump && p.onGround) p.vy = -def.jump;
    // 점프 키를 일찍 떼면 낮게 뛴다
    p.vy += GRAVITY * dt * (p.vy < 0 && !inp.jump ? 2 : 1);
    moveBody(this.level, p, dt);

    if (inp.skill && !prev.skill && p.skillCd <= 0) this.useSkill(p);
    else if (inp.attack && p.atkCd <= 0) this.playerAttack(p);
    if (inp.down && !prev.down) this.tryPickup(p);
  }

  private rollDamage(p: Player, mult: number) {
    let v = p.stats.atk * mult * (0.9 + this.rng() * 0.2);
    const crit = this.rng() < p.stats.crit;
    if (crit) v *= 1.6;
    return { v, crit };
  }

  private playerAttack(p: Player) {
    const a = CLASSES[p.cls].attack;
    p.atkCd = a.cd;
    p.atkAnim = 0.18;
    const cx = p.x + p.w / 2;

    if (a.kind === 'melee') {
      const hx = p.facing > 0 ? cx : cx - a.range;
      const hy = p.y + p.h / 2 - a.height / 2;
      for (const e of this.enemies) {
        if (!e.active || e.hp <= 0) continue;
        if (rectsOverlap(hx, hy, a.range, a.height, e.x, e.y, e.w, e.h)) {
          const d = this.rollDamage(p, a.mult);
          this.hitEnemy(e, d.v, d.crit, p.facing * a.knock, p);
        }
      }
    } else {
      const d = this.rollDamage(p, a.mult);
      const sx = cx + p.facing * p.w / 2, sy = p.y + p.h * 0.4;
      this.projectiles.push({
        id: this.nextId++, fromPlayer: true, ownerId: p.id, kind: a.proj,
        x: sx, y: sy,
        vx: p.facing * a.speed, vy: -this.aimLift(p, a, sx, sy), r: a.proj === 'orb' ? 9 : 5,
        dmg: d.v, crit: d.crit, life: 1.2, grav: a.grav, aoe: a.aoe, pierce: false, hitIds: [],
      });
    }
  }

  // ─── 스킬 ─────────────────────────────────────────

  private useSkill(p: Player) {
    p.skillCd = CLASSES[p.cls].skill.cd;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    switch (p.cls) {
      case 'swordsman':
        p.dashTime = SKILL.dash.time;
        p.dashHits = [];
        p.invuln = Math.max(p.invuln, SKILL.dash.time + 0.15);
        p.atkAnim = SKILL.dash.time;
        this.events.push({ t: 'skill', pid: p.id, x: cx, y: cy, r: 0 });
        break;

      case 'dwarf': {
        const { radius, time, guard } = SKILL.taunt;
        p.guard = guard;
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0) continue;
          if (Math.hypot(e.x + e.w / 2 - cx, e.y + e.h / 2 - cy) <= radius) {
            e.taunt = e.kind === 'boss' ? time / 2 : time;
            e.tauntBy = p.id;
          }
        }
        this.events.push({ t: 'skill', pid: p.id, x: cx, y: cy, r: radius });
        break;
      }

      case 'elf': {
        const { arrows, spread, mult } = SKILL.volley;
        const a = CLASSES.elf.attack as ProjectileAttack;
        const { speed, grav } = a;
        const sx = cx + p.facing * p.w / 2, sy = p.y + p.h * 0.4;
        const lift = this.aimLift(p, a, sx, sy);
        p.atkAnim = 0.25;
        for (let i = 0; i < arrows; i++) {
          const ang = -spread / 2 + (spread * i) / (arrows - 1);
          const d = this.rollDamage(p, mult);
          this.projectiles.push({
            id: this.nextId++, fromPlayer: true, ownerId: p.id, kind: 'arrow',
            x: sx, y: sy,
            vx: Math.cos(ang) * speed * p.facing, vy: Math.sin(ang) * speed - lift, r: 6,
            dmg: d.v, crit: d.crit, life: 1.2, grav, aoe: 0, pierce: true, hitIds: [],
          });
        }
        this.events.push({ t: 'skill', pid: p.id, x: cx, y: cy, r: 0 });
        break;
      }

      case 'gnome': {
        const { radius, ratio } = SKILL.heal;
        for (const o of this.players) {
          if (Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) > radius) continue;
          if (o.dead) this.revivePlayer(o, ratio);
          else this.healPlayer(o, Math.round(o.stats.maxHp * ratio));
        }
        p.atkAnim = 0.3;
        this.events.push({ t: 'skill', pid: p.id, x: cx, y: cy, r: radius });
        break;
      }
    }
  }

  /** 검사 돌진: 중력 없이 앞으로 미끄러지며 닿는 적을 한 번씩 벤다. */
  private updateDash(p: Player, dt: number) {
    p.dashTime -= dt;
    p.vx = p.facing * SKILL.dash.speed;
    p.vy = 0;
    moveBody(this.level, p, dt);
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0 || p.dashHits.includes(e.id)) continue;
      if (rectsOverlap(p.x - 10, p.y, p.w + 20, p.h, e.x, e.y, e.w, e.h)) {
        p.dashHits.push(e.id);
        const d = this.rollDamage(p, SKILL.dash.mult);
        this.hitEnemy(e, d.v, d.crit, p.facing * 260, p);
      }
    }
    if (p.dashTime <= 0) p.vx = p.facing * CLASSES[p.cls].speed;
  }

  /**
   * 포물선 투사체의 위쪽 초속을 구한다. 앞쪽 가장 가까운 적의 중심에 떨어지도록 계산하므로
   * 가까운 적에게는 거의 직선으로, 먼 적에게는 높게 휘어 날아간다.
   */
  private aimLift(p: Player, a: ProjectileAttack, sx: number, sy: number): number {
    if (a.grav <= 0) return a.lift;
    let best: Enemy | null = null;
    let bestDx = a.aimRange;
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0) continue;
      const dx = (e.x + e.w / 2 - sx) * p.facing;
      if (dx > 0 && dx < bestDx && Math.abs(e.y + e.h / 2 - sy) < 260) {
        bestDx = dx;
        best = e;
      }
    }
    if (!best) return a.lift;
    const t = bestDx / a.speed;
    const dy = best.y + best.h / 2 - sy; // 아래가 +
    const lift = ((a.grav * t * t) / 2 - dy) / t;
    return Math.max(-200, Math.min(600, lift));
  }

  private tryPickup(p: Player) {
    const cx = p.x + p.w / 2;
    const feet = p.y + p.h;
    const drop = this.drops.find((d) => d.kind === 'item' && Math.abs(d.x - cx) < 32 && Math.abs(d.y - feet) < 48);
    if (!drop || !drop.item) return;
    const item = drop.item;
    const old = p.equip[item.slot];
    p.equip[item.slot] = item;
    this.recalcStats(p);
    this.events.push({ t: 'equip', pid: p.id, item });
    this.drops = this.drops.filter((d) => d !== drop);
    if (old) this.drops.push({ id: this.nextId++, kind: 'item', item: old, x: cx, y: feet - 4, vy: -250 });
  }

  private gainXp(p: Player, amount: number) {
    p.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level++;
      p.xpNext = xpForLevel(p.level);
      this.recalcStats(p);
      p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.3));
      this.events.push({ t: 'levelup', pid: p.id, level: p.level });
    }
  }

  private damagePlayer(p: Player, raw: number, dirX: number) {
    if (p.dead || p.invuln > 0) return;
    let scaled = raw * (0.9 + this.rng() * 0.2);
    if (p.guard > 0) scaled *= 1 - SKILL.taunt.reduce;
    const dmg = Math.max(1, Math.round(scaled * 0.15), Math.round(scaled - p.stats.def * 0.5));
    p.hp -= dmg;
    p.invuln = 0.7;
    p.vx = dirX * 260;
    p.vy = -260;
    this.events.push({ t: 'dmg', x: p.x + p.w / 2, y: p.y, v: dmg, crit: false, toPlayer: true });
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
      const helper = this.players.some(
        (o) => !o.dead && Math.abs(o.x + o.w / 2 - (p.x + p.w / 2)) < 50 && Math.abs(o.y + o.h - (p.y + p.h)) < 60,
      );
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

  // ─── 카메라 / 구역 ──────────────────────────────────

  private updateCamera(dt: number) {
    const alive = this.players.filter((p) => !p.dead);
    const arenaX = this.level.arenaTx * TILE;
    if (!this.arenaLocked && alive.some((p) => p.x > arenaX + 64)) {
      this.arenaLocked = true;
      this.events.push({ t: 'banner', text: ENEMIES.boss.name, sub: '최종 보스' });
    }

    let target = this.camX;
    if (this.arenaLocked) target = arenaX;
    else if (alive.length > 0) {
      const xs = alive.map((p) => p.x + p.w / 2);
      target = (Math.min(...xs) + Math.max(...xs)) / 2 - VIEW_W / 2;
    }
    target = Math.max(0, Math.min(this.level.w * TILE - VIEW_W, target));
    this.camX += (target - this.camX) * Math.min(1, dt * 6);
    if (this.arenaLocked && Math.abs(this.camX - target) < 1) this.camX = target;

    // 공유 화면: 모든 플레이어는 카메라 안에 머문다
    for (const p of this.players) {
      const minX = this.camX + 2;
      const maxX = this.camX + VIEW_W - p.w - 2;
      if (p.x < minX || p.x > maxX) {
        p.x = Math.max(minX, Math.min(maxX, p.x));
        unstick(this.level, p);
      }
    }
  }

  private updateZone() {
    const alive = this.players.filter((p) => !p.dead);
    if (alive.length === 0) return;
    const front = Math.max(...alive.map((p) => p.x));
    let zone = 0;
    this.level.zoneStartsTx.forEach((tx, i) => {
      if (front >= tx * TILE) zone = i + 1;
    });
    if (zone === 0) zone = 1;
    if (zone <= this.zone) return;
    const first = this.zone === 0;
    this.zone = zone;
    this.events.push({ t: 'banner', text: `${zone}구역`, sub: ZONE_NAMES[zone - 1] });
    if (first) return;
    // 체크포인트: 쓰러진 동료 부활 + 체력 회복
    for (const p of this.players) {
      if (p.dead) this.revivePlayer(p, 0.5);
      else this.healPlayer(p, Math.round(p.stats.maxHp * 0.25));
    }
  }

  private healPlayer(p: Player, amount: number) {
    const before = p.hp;
    p.hp = Math.min(p.stats.maxHp, p.hp + amount);
    if (p.hp > before) this.events.push({ t: 'heal', x: p.x + p.w / 2, y: p.y, v: p.hp - before });
  }

  // ─── 적 ────────────────────────────────────────────

  private pickTarget(e: Enemy): Player | null {
    if (e.taunt > 0) {
      const t = this.players.find((p) => p.id === e.tauntBy && !p.dead);
      if (t) return t;
    }
    let best: Player | null = null;
    let bestD = Infinity;
    const ex = e.x + e.w / 2;
    for (const p of this.players) {
      if (p.dead) continue;
      const d = Math.abs(p.x + p.w / 2 - ex) * CLASSES[p.cls].aggro + Math.abs(p.y - e.y) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private hitEnemy(e: Enemy, raw: number, crit: boolean, knockX: number, by: Player | null) {
    if (e.hp <= 0) return;
    const dmg = Math.max(1, Math.round(raw - e.def * 0.5));
    e.hp -= dmg;
    e.hurt = 0.12;
    this.events.push({ t: 'dmg', x: e.x + e.w / 2, y: e.y, v: dmg, crit, toPlayer: false });
    if (e.kind !== 'boss') {
      const resist = e.kind === 'orc' ? 0.35 : 1;
      e.vx = knockX * resist;
      if (e.onGround) e.vy = -160 * resist;
      e.stun = e.kind === 'orc' ? 0.1 : 0.25;
      if (e.state === 'windup' && e.kind !== 'orc') e.state = 'move';
    }
    if (e.hp <= 0) this.killEnemy(e, by);
  }

  private killEnemy(e: Enemy, by: Player | null) {
    if (by) by.kills++;
    for (const p of this.players) if (!p.dead) this.gainXp(p, e.xp);

    const cx = e.x + e.w / 2;
    const feet = e.y + e.h;
    if (e.kind === 'boss') {
      this.events.push({ t: 'boom', x: cx, y: e.y + e.h / 2, r: 140, shake: true });
      this.events.push({ t: 'banner', text: '승리!', sub: `${ENEMIES.boss.name}을(를) 쓰러뜨렸다` });
      this.endWith('victory', 3);
      return;
    }
    if (this.rng() < ENEMIES[e.kind].dropRate) {
      const item = makeItem(this.nextId++, e.zone, this.rng);
      this.drops.push({ id: this.nextId++, kind: 'item', item, x: cx, y: feet - 4, vy: -300 });
    } else if (this.rng() < 0.1) {
      this.drops.push({ id: this.nextId++, kind: 'potion', x: cx, y: feet - 4, vy: -300 });
    }
  }

  private shoot(e: Enemy, target: Player, speed: number, kind: Projectile['kind'], dmgMult: number) {
    const sx = e.x + e.w / 2, sy = e.y + e.h * 0.35;
    const tx = target.x + target.w / 2, ty = target.y + target.h / 2;
    const ang = Math.atan2(ty - sy, tx - sx);
    this.projectiles.push({
      id: this.nextId++, fromPlayer: false, ownerId: '', kind, x: sx, y: sy,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 5,
      dmg: e.atk * dmgMult, crit: false, life: 2, grav: 0, aoe: 0, pierce: false, hitIds: [],
    });
  }

  private updateEnemy(e: Enemy, dt: number) {
    e.hurt -= dt;
    e.stun -= dt;
    e.taunt -= dt;
    e.timer -= dt;
    e.stateTime += dt;
    const def = ENEMIES[e.kind];
    const target = this.pickTarget(e);
    const ex = e.x + e.w / 2;
    const dx = target ? target.x + target.w / 2 - ex : 0;
    const dist = Math.abs(dx);
    const dir = (dx >= 0 ? 1 : -1) as 1 | -1;
    let wantsMove = false;

    if (e.stun > 0 || !target) {
      if (e.onGround) e.vx = approach(e.vx, 0, 900 * dt);
    } else {
      switch (e.kind) {
        case 'slime':
          if (e.onGround) {
            e.vx = approach(e.vx, 0, 600 * dt);
            if (e.timer <= 0 && dist < 450) {
              e.facing = dir;
              e.vy = -380 - this.rng() * 120;
              e.vx = dir * def.speed * 1.8;
              e.timer = 0.9 + this.rng() * 0.8;
            }
          }
          break;

        case 'goblin':
          if (dist < 520 && dist > 6) {
            e.facing = dir;
            e.vx = dir * def.speed;
            wantsMove = true;
          } else e.vx = approach(e.vx, 0, 900 * dt);
          break;

        case 'skeleton':
          e.facing = dir;
          if (dist < 220) e.vx = -dir * def.speed;
          else if (dist > 400 && dist < 700) e.vx = dir * def.speed;
          else e.vx = 0;
          wantsMove = e.vx !== 0;
          if (e.timer <= 0 && dist < 500) {
            this.shoot(e, target, 380, 'enemyArrow', 1);
            e.timer = 2 + this.rng() * 0.6;
          }
          break;

        case 'orc':
          this.updateOrc(e, target, dir, dist, dt);
          wantsMove = e.state === 'move';
          break;

        case 'boss':
          this.updateBoss(e, target, dir, dist, dx, dt);
          wantsMove = e.state === 'move';
          break;
      }
    }

    e.vy += GRAVITY * dt;
    const hitWall = moveBody(this.level, e, dt);
    if (hitWall && wantsMove && e.onGround) e.vy = -560;
  }

  private setState(e: Enemy, s: Enemy['state']) {
    e.state = s;
    e.stateTime = 0;
  }

  private updateOrc(e: Enemy, target: Player, dir: 1 | -1, dist: number, dt: number) {
    const def = ENEMIES.orc;
    if (e.state === 'move') {
      if (dist < 600) {
        e.facing = dir;
        e.vx = dist > 50 ? dir * def.speed : 0;
      } else e.vx = approach(e.vx, 0, 900 * dt);
      if (dist < 85 && e.timer <= 0) {
        this.setState(e, 'windup');
        e.vx = 0;
      }
    } else if (e.state === 'windup') {
      e.vx = 0;
      if (e.stateTime > 0.55) {
        this.meleeSweep(e, 74, 60, 1.6);
        this.events.push({ t: 'boom', x: e.x + e.w / 2 + e.facing * 50, y: e.y + e.h - 10, r: 34 });
        this.setState(e, 'attack');
      }
    } else if (e.stateTime > 0.3) {
      this.setState(e, 'move');
      e.timer = 1.6;
    }
    void target;
  }

  /** 적이 바라보는 방향 앞쪽에 근접 공격 판정을 만든다. */
  private meleeSweep(e: Enemy, range: number, height: number, mult: number) {
    const cx = e.x + e.w / 2;
    const hx = e.facing > 0 ? cx : cx - range;
    const hy = e.y + e.h - height;
    for (const p of this.players) {
      if (rectsOverlap(hx, hy, range, height, p.x, p.y, p.w, p.h)) this.damagePlayer(p, e.atk * mult, e.facing);
    }
  }

  private updateBoss(e: Enemy, target: Player, dir: 1 | -1, dist: number, dx: number, dt: number) {
    const def = ENEMIES.boss;
    const enraged = e.hp < e.maxHp / 2;
    const speed = def.speed * (enraged ? 1.3 : 1);
    const cooldown = () => (enraged ? 1.3 : 2.1) + this.rng() * 0.6;

    switch (e.state) {
      case 'move': {
        e.facing = dir;
        e.vx = dist > 40 ? dir * speed : 0;
        if (e.timer > 0) break;
        const options: Enemy['state'][] = ['leap', 'windup', 'attack'];
        const roll = this.rng();
        if (enraged && roll < 0.2 && this.enemies.filter((o) => o.kind !== 'boss').length < 4) {
          this.summonAdds(e);
          e.timer = cooldown();
          break;
        }
        const next = options[Math.floor(this.rng() * options.length)];
        this.setState(e, next);
        if (next === 'leap') {
          e.vy = -820;
          e.vx = Math.max(-420, Math.min(420, dx * 1.1));
        } else if (next === 'attack') {
          // 바위 던지기
          for (let i = 0; i < (enraged ? 5 : 3); i++) {
            const sx = e.x + e.w / 2, sy = e.y + 20;
            this.projectiles.push({
              id: this.nextId++, fromPlayer: false, ownerId: '', kind: 'rock', x: sx, y: sy,
              vx: dir * (180 + i * 110), vy: -520 - this.rng() * 200, r: 12,
              dmg: e.atk * 0.8, crit: false, life: 3, grav: 1200, aoe: 0, pierce: false, hitIds: [],
            });
          }
        }
        break;
      }
      case 'leap':
        if (e.onGround && e.stateTime > 0.2) {
          e.vx = 0;
          const fy = e.y + e.h - 14;
          for (const sdir of [-1, 1]) {
            this.projectiles.push({
              id: this.nextId++, fromPlayer: false, ownerId: '', kind: 'shockwave', x: e.x + e.w / 2, y: fy,
              vx: sdir * 420, vy: 0, r: 14, dmg: e.atk, crit: false, life: 1.4, grav: 0, aoe: 0, pierce: false, hitIds: [],
            });
          }
          this.events.push({ t: 'boom', x: e.x + e.w / 2, y: e.y + e.h, r: 70, shake: true });
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
      case 'windup':
        e.vx = 0;
        if (e.stateTime > 0.6) this.setState(e, 'charge');
        break;
      case 'charge':
        e.vx = e.facing * 480 * (enraged ? 1.2 : 1);
        if (e.stateTime > 0.9) {
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
      case 'attack':
        if (e.stateTime > 0.5) {
          this.setState(e, 'move');
          e.timer = cooldown();
        }
        break;
      default:
        this.setState(e, 'move');
    }
    void dt;
  }

  private summonAdds(boss: Enemy) {
    const party = partyHpScale(this.players.length);
    for (const side of [-1, 1]) {
      const g = this.createEnemy('goblin', 4, party);
      g.active = true;
      g.x = Math.max(this.camX + 40, Math.min(this.camX + VIEW_W - 60, boss.x + boss.w / 2 + side * 120));
      g.y = boss.y;
      this.enemies.push(g);
    }
    this.events.push({ t: 'banner', text: '', sub: '오우거 군주가 부하를 불렀다!' });
  }

  private contactDamage() {
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0) continue;
      const mult = e.kind === 'boss' ? (e.state === 'charge' ? 1.4 : 1) : 0.8;
      for (const p of this.players) {
        if (p.dead || p.invuln > 0) continue;
        if (rectsOverlap(e.x + 4, e.y + 4, e.w - 8, e.h - 4, p.x, p.y, p.w, p.h)) {
          this.damagePlayer(p, e.atk * mult, p.x + p.w / 2 >= e.x + e.w / 2 ? 1 : -1);
        }
      }
    }
  }

  // ─── 투사체 / 드랍 ──────────────────────────────────

  private updateProjectiles(dt: number) {
    const alive: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.vy += pr.grav * dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      let gone = pr.life <= 0;

      if (!gone && tileAt(this.level, Math.floor(pr.x / TILE), Math.floor(pr.y / TILE)) === T_SOLID) {
        gone = true;
        if (pr.kind === 'orb') this.explode(pr);
      }

      if (!gone && pr.fromPlayer) {
        for (const e of this.enemies) {
          if (!e.active || e.hp <= 0) continue;
          if (pr.hitIds.includes(e.id)) continue;
          if (rectsOverlap(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2, e.x, e.y, e.w, e.h)) {
            if (pr.kind === 'orb') this.explode(pr);
            else this.hitEnemy(e, pr.dmg, pr.crit, Math.sign(pr.vx) * 140, this.playerById(pr.ownerId));
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
          if (rectsOverlap(pr.x - pr.r, pr.y - pr.r, pr.r * 2, pr.r * 2, p.x, p.y, p.w, p.h)) {
            this.damagePlayer(p, pr.dmg, Math.sign(pr.vx) || 1);
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
    this.events.push({ t: 'boom', x: pr.x, y: pr.y, r: pr.aoe });
    const by = this.playerById(pr.ownerId);
    for (const e of this.enemies) {
      if (!e.active || e.hp <= 0) continue;
      const nx = Math.max(e.x, Math.min(pr.x, e.x + e.w));
      const ny = Math.max(e.y, Math.min(pr.y, e.y + e.h));
      if (Math.hypot(nx - pr.x, ny - pr.y) <= pr.aoe) {
        this.hitEnemy(e, pr.dmg, pr.crit, (e.x + e.w / 2 >= pr.x ? 1 : -1) * 180, by);
      }
    }
  }

  private playerById(id: string): Player | null {
    return this.players.find((p) => p.id === id) ?? null;
  }

  private updateDrops(dt: number) {
    for (const d of this.drops) {
      if (d.vy === 0 && this.isFloor(d.x, d.y)) continue;
      const prevY = d.y;
      d.vy = Math.min(d.vy + GRAVITY * dt, 900);
      d.y += d.vy * dt;
      const ty = Math.floor(d.y / TILE);
      const t = tileAt(this.level, Math.floor(d.x / TILE), ty);
      if (d.vy > 0 && t !== 0 && (t === T_SOLID || prevY <= ty * TILE + 0.5)) {
        d.y = ty * TILE;
        d.vy = 0;
      }
    }
    // 물약은 닿으면 바로 사용
    this.drops = this.drops.filter((d) => {
      if (d.kind !== 'potion') return true;
      const p = this.players.find((p) => !p.dead && rectsOverlap(p.x, p.y, p.w, p.h, d.x - 10, d.y - 20, 20, 20));
      if (!p) return true;
      this.healPlayer(p, Math.round(p.stats.maxHp * 0.35));
      return false;
    });
  }

  private isFloor(x: number, y: number) {
    return tileAt(this.level, Math.floor(x / TILE), Math.floor(y / TILE)) !== 0;
  }

  // ─── 스냅샷 ────────────────────────────────────────

  snapshot(events: GameEvent[]): Snapshot {
    const lo = this.camX - 200;
    const hi = this.camX + VIEW_W + 200;
    const r = (v: number) => Math.round(v * 10) / 10;
    const boss = this.enemies.find((e) => e.kind === 'boss' && e.active);
    return {
      tick: this.tick,
      camX: r(this.camX),
      zone: this.zone,
      status: this.status,
      players: this.players.map((p) => ({ ...p, x: r(p.x), y: r(p.y) })),
      enemies: this.enemies
        .filter((e) => e.active && e.x + e.w > lo && e.x < hi)
        .map((e) => ({ ...e, x: r(e.x), y: r(e.y) })),
      projectiles: this.projectiles
        .filter((p) => p.x > lo && p.x < hi)
        .map((p) => ({ ...p, x: r(p.x), y: r(p.y) })),
      drops: this.drops.filter((d) => d.x > lo && d.x < hi),
      events,
      boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
    };
  }
}
