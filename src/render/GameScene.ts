// 게임 화면. 호스트는 Sim을 돌리며 그리고, 클라이언트는 받은 스냅샷을 보간해서 그린다.
import Phaser from 'phaser';
import {
  CLASSES, ENEMIES, RARITY, SLOT_NAMES, SNAPSHOT_EVERY, TICK_RATE, TILE, VIEW_H, VIEW_W,
  itemName, itemScore, itemStatText, REVIVE_TIME,
} from '../game/data';
import { buildLevel, T_PLATFORM, T_SOLID, type Level } from '../game/level';
import { Sim } from '../game/sim';
import type { Enemy, GameEvent, InputState, Player, Snapshot } from '../game/types';
import type { Session } from '../session';

const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const DT = 1 / TICK_RATE;
const SNAP_MS = (1000 / TICK_RATE) * SNAPSHOT_EVERY;

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export class GameScene extends Phaser.Scene {
  private session!: Session;
  private level!: Level;
  private sim?: Sim;

  // 호스트
  private acc = 0;
  private netEvents: GameEvent[] = [];
  // 클라이언트
  private prevSnap?: Snapshot;
  private curSnap?: Snapshot;
  private curAt = 0;
  private lastSent = '';
  private lastSentAt = 0;
  private pendingEvents: GameEvent[] = [];

  private world!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private nameTexts = new Map<string, Phaser.GameObjects.Text>();
  private hudTexts: Phaser.GameObjects.Text[] = [];
  private equipText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private endShown = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super('game');
  }

  init(session: Session) {
    this.session = session;
  }

  create() {
    const s = this.session;
    this.level = buildLevel(s.seed);
    this.drawBackground();
    this.drawTiles();
    this.world = this.add.graphics().setDepth(10);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);

    for (let i = 0; i < 4; i++) {
      this.hudTexts.push(this.text(16 + i * 236, 12, '', 13).setScrollFactor(0).setDepth(101));
    }
    this.equipText = this.text(12, VIEW_H - 62, '', 12).setScrollFactor(0).setDepth(101).setLineSpacing(3);
    this.hintText = this.text(0, 0, '', 13).setDepth(50).setOrigin(0.5, 1).setStroke('#000', 4);
    this.bossText = this.text(VIEW_W / 2, VIEW_H - 46, '', 14).setScrollFactor(0).setDepth(101).setOrigin(0.5, 1);
    this.text(VIEW_W - 12, VIEW_H - 10, '이동 A/D  점프 W·Space  공격 J  스킬 K  줍기 S', 12)
      .setScrollFactor(0).setDepth(101).setOrigin(1, 1).setAlpha(0.6);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('A,D,W,S,J,K,X,Z,SPACE,UP,DOWN,LEFT,RIGHT,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    if (s.role !== 'client') {
      this.sim = new Sim(s.seed, s.players);
      s.onRemoteInput = (id, input) => this.sim!.setInput(id, input);
      s.onPlayerLeft = (id) => this.sim!.removePlayer(id);
    } else {
      s.onSnap = (snap) => {
        this.prevSnap = this.curSnap;
        this.curSnap = snap;
        this.curAt = performance.now();
        this.pendingEvents.push(...snap.events);
      };
    }
  }

  // ─── 메인 루프 ──────────────────────────────────────

  update(_time: number, deltaMs: number) {
    const input = this.readInput();
    let snap: Snapshot | undefined;
    let events: GameEvent[] = [];

    if (this.sim) {
      this.sim.setInput(this.session.myId, input);
      this.acc += Math.min(deltaMs / 1000, 0.1);
      while (this.acc >= DT) {
        this.acc -= DT;
        this.sim.step(DT);
        const ev = this.sim.drainEvents();
        events.push(...ev);
        this.netEvents.push(...ev);
        if (this.session.host && this.sim.tick % SNAPSHOT_EVERY === 0) {
          this.session.host.broadcast({ t: 'snap', s: this.sim.snapshot(this.netEvents) });
          this.netEvents = [];
        }
      }
      snap = this.sim.snapshot([]);
    } else {
      this.sendInput(input);
      snap = this.interpolated();
      events = this.pendingEvents;
      this.pendingEvents = [];
    }

    if (!snap) return;
    this.cameras.main.scrollX = snap.camX;
    this.renderWorld(snap);
    this.renderHud(snap);
    for (const e of events) this.playEvent(e, snap);
    if (snap.status !== 'playing') this.showEnd(snap);
    if (this.endShown && this.session.role !== 'client' && Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
      this.session.backToLobby();
    }
  }

  private readInput(): InputState {
    const k = this.keys;
    const pad = this.input.gamepad?.pad1;
    const axis = pad ? pad.leftStick.x : 0;
    return {
      left: k.A.isDown || k.LEFT.isDown || axis < -0.4 || !!pad?.left,
      right: k.D.isDown || k.RIGHT.isDown || axis > 0.4 || !!pad?.right,
      jump: k.W.isDown || k.UP.isDown || k.SPACE.isDown || !!pad?.A,
      attack: k.J.isDown || k.Z.isDown || !!pad?.X,
      down: k.S.isDown || k.DOWN.isDown || !!pad?.down || !!pad?.B,
      skill: k.K.isDown || k.X.isDown || !!pad?.Y,
    };
  }

  private sendInput(input: InputState) {
    const key = JSON.stringify(input);
    const now = performance.now();
    if (key !== this.lastSent || now - this.lastSentAt > 200) {
      this.session.client!.send({ t: 'input', input });
      this.lastSent = key;
      this.lastSentAt = now;
    }
  }

  /** 마지막 두 스냅샷 사이를 보간해 움직임을 부드럽게 만든다. */
  private interpolated(): Snapshot | undefined {
    const cur = this.curSnap;
    const prev = this.prevSnap;
    if (!cur) return undefined;
    if (!prev) return cur;
    const a = Math.min(1, (performance.now() - this.curAt) / SNAP_MS);
    const lerp = (p: number, c: number) => p + (c - p) * a;
    const lerpList = <T extends { id: string | number; x: number; y: number }>(cl: T[], pl: T[]) => {
      const byId = new Map(pl.map((e) => [e.id, e]));
      return cl.map((c) => {
        const p = byId.get(c.id);
        return p ? { ...c, x: lerp(p.x, c.x), y: lerp(p.y, c.y) } : c;
      });
    };
    return {
      ...cur,
      camX: lerp(prev.camX, cur.camX),
      players: lerpList(cur.players, prev.players),
      enemies: lerpList(cur.enemies, prev.enemies),
      projectiles: lerpList(cur.projectiles, prev.projectiles),
    };
  }

  // ─── 배경 / 지형 ────────────────────────────────────

  private drawBackground() {
    const sky = this.add.graphics().setScrollFactor(0).setDepth(0);
    sky.fillGradientStyle(0x1b2a4a, 0x1b2a4a, 0x4a6a8a, 0x4a6a8a, 1);
    sky.fillRect(0, 0, VIEW_W, VIEW_H);

    const worldW = this.level.w * TILE;
    const layers = [
      { f: 0.2, color: 0x2c3e5c, base: 360, amp: 120, step: 220 },
      { f: 0.45, color: 0x24364f, base: 400, amp: 90, step: 140 },
    ];
    layers.forEach((l, i) => {
      const g = this.add.graphics().setScrollFactor(l.f, 0).setDepth(1 + i);
      g.fillStyle(l.color, 1);
      const w = worldW * l.f + VIEW_W + l.step;
      g.beginPath();
      g.moveTo(0, VIEW_H);
      for (let x = 0; x <= w; x += l.step) {
        const h = l.base - Math.abs(Math.sin(x * 0.013 + i * 2)) * l.amp;
        g.lineTo(x, h);
        g.lineTo(x + l.step / 2, h + l.amp * 0.5);
      }
      g.lineTo(w, VIEW_H);
      g.closePath();
      g.fillPath();
    });
  }

  private drawTiles() {
    const g = this.add.graphics().setDepth(5);
    const { w, h, tiles } = this.level;
    for (let ty = 0; ty < h; ty++) {
      let tx = 0;
      while (tx < w) {
        const t = tiles[ty * w + tx];
        if (t === 0) {
          tx++;
          continue;
        }
        let run = 1;
        while (tx + run < w && tiles[ty * w + tx + run] === t) run++;
        const x = tx * TILE, y = ty * TILE;
        if (t === T_SOLID) {
          g.fillStyle(0x4a3a2c, 1).fillRect(x, y, run * TILE, TILE);
          // 위가 비어 있는 칸만 잔디를 그린다
          for (let i = 0; i < run; i++) {
            if (ty === 0 || tiles[(ty - 1) * w + tx + i] !== T_SOLID) {
              g.fillStyle(0x5d9b3a, 1).fillRect(x + i * TILE, y, TILE, 8);
              g.fillStyle(0x47802c, 1).fillRect(x + i * TILE, y + 8, TILE, 3);
            }
          }
        } else if (t === T_PLATFORM) {
          g.fillStyle(0x8a6a44, 1).fillRect(x, y, run * TILE, 10);
          g.fillStyle(0x6a4e30, 1).fillRect(x, y + 10, run * TILE, 4);
        }
        tx += run;
      }
    }
    // 보스 방 입구 표시
    const ax = this.level.arenaTx * TILE;
    g.fillStyle(0x3a2020, 1).fillRect(ax - 8, 14 * TILE - 120, 8, 120);
    g.fillStyle(0x3a2020, 1).fillRect(ax - 36, 14 * TILE - 128, 64, 10);
  }

  // ─── 월드 렌더 ─────────────────────────────────────

  private renderWorld(s: Snapshot) {
    const g = this.world;
    g.clear();
    const t = this.time.now / 1000;

    for (const d of s.drops) {
      const bob = Math.sin(t * 4 + d.id) * 3;
      if (d.kind === 'potion') {
        g.fillStyle(0xe03a4a, 1).fillCircle(d.x, d.y - 9 + bob, 7);
        g.fillStyle(0xcccccc, 1).fillRect(d.x - 3, d.y - 20 + bob, 6, 5);
      } else if (d.item) {
        const c = Phaser.Display.Color.HexStringToColor(RARITY[d.item.rarity].color).color;
        g.fillStyle(c, 0.25).fillCircle(d.x, d.y - 10 + bob, 14);
        g.fillStyle(c, 1).fillRect(d.x - 7, d.y - 17 + bob, 14, 14);
        g.lineStyle(2, 0x000000, 0.6).strokeRect(d.x - 7, d.y - 17 + bob, 14, 14);
      }
    }

    for (const e of s.enemies) this.drawEnemy(g, e, t);
    for (const p of s.players) this.drawPlayer(g, p, t);

    for (const pr of s.projectiles) {
      switch (pr.kind) {
        case 'arrow':
        case 'enemyArrow': {
          const len = 18;
          const ang = Math.atan2(pr.vy, pr.vx);
          g.lineStyle(3, pr.kind === 'arrow' ? 0xe8e0b0 : 0xff6a50, 1);
          g.lineBetween(pr.x - Math.cos(ang) * len, pr.y - Math.sin(ang) * len, pr.x, pr.y);
          break;
        }
        case 'orb':
          g.fillStyle(0xc89aff, 0.35).fillCircle(pr.x, pr.y, pr.r + 6);
          g.fillStyle(0xf0e0ff, 1).fillCircle(pr.x, pr.y, pr.r);
          break;
        case 'rock':
          g.fillStyle(0x7a6a5a, 1).fillCircle(pr.x, pr.y, pr.r);
          break;
        case 'shockwave':
          g.fillStyle(0xff9a40, 0.8).fillEllipse(pr.x, pr.y + 4, pr.r * 2.4, pr.r * 2);
          break;
      }
    }

    this.renderNames(s);
    this.renderPickupHint(s);
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, t: number) {
    const def = CLASSES[p.cls];
    const cx = p.x + p.w / 2;
    const f = p.facing;

    if (p.dead) {
      g.fillStyle(0x666666, 0.8).fillRect(cx - p.h / 2, p.y + p.h - p.w * 0.6, p.h, p.w * 0.6);
      if (p.revive > 0) {
        g.fillStyle(0x000000, 0.6).fillRect(cx - 24, p.y + p.h - 34, 48, 6);
        g.fillStyle(0x6aff8a, 1).fillRect(cx - 24, p.y + p.h - 34, (48 * p.revive) / REVIVE_TIME, 6);
      }
      return;
    }
    if (p.dashTime > 0) {
      for (let i = 1; i <= 3; i++) {
        g.fillStyle(def.color, 0.35 / i).fillRoundedRect(p.x - f * i * 16, p.y + p.h * 0.28, p.w, p.h * 0.72, 4);
      }
    } else if (p.invuln > 0 && Math.floor(t * 20) % 2 === 0) return;
    if (p.guard > 0) {
      g.lineStyle(3, 0xffd060, 0.5 + 0.3 * Math.sin(t * 10));
      g.strokeEllipse(cx, p.y + p.h / 2, p.w + 26, p.h + 22);
    }

    // 몸통
    g.fillStyle(def.color, 1).fillRoundedRect(p.x, p.y + p.h * 0.28, p.w, p.h * 0.72, 4);
    // 머리
    const headR = Math.min(p.w * 0.45, 11);
    const headY = p.y + headR;
    g.fillStyle(0xf2c9a0, 1).fillCircle(cx, headY, headR);
    g.fillStyle(0x000000, 1).fillCircle(cx + f * headR * 0.45, headY - 1, 2);

    switch (p.cls) {
      case 'swordsman':
        g.lineStyle(4, 0xd8dde6, 1);
        if (p.atkAnim > 0) g.lineBetween(cx, p.y + p.h * 0.5, cx + f * 44, p.y + p.h * 0.45);
        else g.lineBetween(cx + f * 8, p.y + p.h * 0.55, cx + f * 14, p.y + p.h * 0.1);
        break;
      case 'dwarf':
        g.fillStyle(0x8a5a2a, 1).fillTriangle(cx - 6 + f * 4, headY + 4, cx + 6 + f * 4, headY + 4, cx + f * 4, headY + 18);
        g.fillStyle(0x9aa0a8, 1).fillRect(f > 0 ? p.x + p.w - 6 : p.x - 4, p.y + p.h * 0.35, 10, p.h * 0.5);
        if (p.atkAnim > 0) {
          g.lineStyle(5, 0x707880, 1).lineBetween(cx, p.y + p.h * 0.3, cx + f * 38, p.y + p.h * 0.6);
        }
        break;
      case 'elf':
        g.fillStyle(0xf2c9a0, 1).fillTriangle(cx - f * 4, headY - 2, cx - f * 14, headY - 10, cx - f * 6, headY + 3);
        g.lineStyle(2, 0x9a6a3a, 1);
        g.beginPath();
        g.arc(cx + f * 6, p.y + p.h * 0.5, 14, f > 0 ? -1.2 : Math.PI - 1.2, f > 0 ? 1.2 : Math.PI + 1.2);
        g.strokePath();
        break;
      case 'gnome':
        g.fillStyle(0x5a2a8a, 1).fillTriangle(cx - 14, headY - headR + 4, cx + 14, headY - headR + 4, cx - f * 6, headY - headR - 24);
        g.lineStyle(3, 0x8a6a3a, 1).lineBetween(cx + f * 10, p.y + p.h, cx + f * 12, p.y + 2);
        g.fillStyle(p.atkAnim > 0 ? 0xffffff : 0xc89aff, 1).fillCircle(cx + f * 12, p.y + 2, 4);
        break;
    }

    // 근접 공격 이펙트
    const a = def.attack;
    if (a.kind === 'melee' && p.atkAnim > 0) {
      g.lineStyle(3, 0xffffff, p.atkAnim / 0.18);
      g.beginPath();
      const cy = p.y + p.h / 2;
      if (f > 0) g.arc(cx, cy, a.range, -1.1, 1.1);
      else g.arc(cx, cy, a.range, Math.PI - 1.1, Math.PI + 1.1);
      g.strokePath();
    }
  }

  private drawEnemy(g: Phaser.GameObjects.Graphics, e: Enemy, t: number) {
    const def = ENEMIES[e.kind];
    const flash = e.hurt > 0;
    const telegraph = e.state === 'windup' && Math.floor(t * 12) % 2 === 0;
    const color = flash ? 0xffffff : telegraph ? 0xff5040 : def.color;
    const cx = e.x + e.w / 2;
    const f = e.facing;
    g.fillStyle(color, 1);

    switch (e.kind) {
      case 'slime':
        g.fillEllipse(cx, e.y + e.h * 0.55, e.w, e.h * 1.1);
        g.fillStyle(0x000000, 1).fillCircle(cx + f * 6, e.y + e.h * 0.45, 2);
        break;
      case 'goblin':
        g.fillRoundedRect(e.x, e.y + 8, e.w, e.h - 8, 3);
        g.fillCircle(cx, e.y + 10, 10);
        g.fillTriangle(cx - 8, e.y + 8, cx - 18, e.y + 2, cx - 6, e.y + 14);
        g.fillTriangle(cx + 8, e.y + 8, cx + 18, e.y + 2, cx + 6, e.y + 14);
        g.fillStyle(0xffe040, 1).fillCircle(cx + f * 4, e.y + 9, 2);
        break;
      case 'skeleton':
        g.fillRect(e.x + 4, e.y + 14, e.w - 8, e.h - 14);
        g.fillCircle(cx, e.y + 9, 9);
        g.fillStyle(0x222222, 1).fillCircle(cx + f * 3, e.y + 8, 2.5);
        g.lineStyle(2, 0x6a4a2a, 1);
        g.beginPath();
        g.arc(cx + f * 8, e.y + e.h * 0.45, 12, f > 0 ? -1.2 : Math.PI - 1.2, f > 0 ? 1.2 : Math.PI + 1.2);
        g.strokePath();
        break;
      case 'orc':
        g.fillRoundedRect(e.x, e.y + 12, e.w, e.h - 12, 5);
        g.fillCircle(cx + f * 4, e.y + 14, 14);
        g.fillStyle(0xf0f0e0, 1).fillTriangle(cx + f * 8, e.y + 22, cx + f * 12, e.y + 22, cx + f * 10, e.y + 14);
        g.fillStyle(0xff3020, 1).fillCircle(cx + f * 10, e.y + 10, 2.5);
        break;
      case 'boss':
        g.fillRoundedRect(e.x, e.y + 24, e.w, e.h - 24, 10);
        g.fillCircle(cx + f * 6, e.y + 26, 26);
        g.fillStyle(0xffd040, 1);
        for (let i = -1; i <= 1; i++) g.fillTriangle(cx + i * 14 - 8, e.y + 4, cx + i * 14 + 8, e.y + 4, cx + i * 14, e.y - 14);
        g.fillStyle(0xffee00, 1).fillCircle(cx + f * 16, e.y + 22, 4);
        break;
    }

    if (e.taunt > 0) {
      g.fillStyle(0xff4030, 1).fillRect(cx - 2, e.y - 26, 4, 10).fillRect(cx - 2, e.y - 14, 4, 3);
    }

    if (e.kind !== 'boss' && e.hp < e.maxHp) {
      g.fillStyle(0x000000, 0.6).fillRect(cx - 18, e.y - 10, 36, 4);
      g.fillStyle(0xe04040, 1).fillRect(cx - 18, e.y - 10, (36 * e.hp) / e.maxHp, 4);
    }
  }

  private renderNames(s: Snapshot) {
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let t = this.nameTexts.get(p.id);
      if (!t) {
        t = this.text(0, 0, '', 12).setOrigin(0.5, 1).setDepth(20).setStroke('#000', 3);
        this.nameTexts.set(p.id, t);
      }
      const me = p.id === this.session.myId;
      t.setText(`${me ? '▼ ' : ''}${p.name}`).setColor(hex(CLASSES[p.cls].color));
      const top = p.cls === 'gnome' ? p.y - 26 : p.y - 4;
      t.setPosition(p.x + p.w / 2, top).setVisible(!p.dead);
    }
    for (const [id, t] of this.nameTexts) if (!seen.has(id)) t.setVisible(false);
  }

  private renderPickupHint(s: Snapshot) {
    const me = s.players.find((p) => p.id === this.session.myId);
    const cx = me ? me.x + me.w / 2 : 0;
    const drop = me && !me.dead
      ? s.drops.find((d) => d.kind === 'item' && Math.abs(d.x - cx) < 32 && Math.abs(d.y - (me.y + me.h)) < 48)
      : undefined;
    if (!me || !drop?.item) {
      this.hintText.setVisible(false);
      return;
    }
    const item = drop.item;
    const cur = me.equip[item.slot];
    const better = itemScore(item) > itemScore(cur);
    const lines = [
      `[S] 장착  [${RARITY[item.rarity].name}] ${itemName(item, me.cls)}`,
      itemStatText(item) + (cur ? `   (현재 ${itemStatText(cur)})` : '   (빈 슬롯)'),
    ];
    this.hintText
      .setText(lines)
      .setColor(better ? RARITY[item.rarity].color : '#9a9a9a')
      .setPosition(drop.x, drop.y - 34)
      .setVisible(true);
  }

  // ─── HUD ──────────────────────────────────────────

  private renderHud(s: Snapshot) {
    const g = this.hud;
    g.clear();
    s.players.forEach((p, i) => {
      const x = 8 + i * 236, y = 8;
      const def = CLASSES[p.cls];
      const me = p.id === this.session.myId;
      g.fillStyle(0x000000, 0.55).fillRoundedRect(x, y, 228, 62, 6);
      if (me) g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, y, 228, 62, 6);
      g.fillStyle(def.color, 1).fillRect(x, y + 4, 4, 54);
      // HP
      g.fillStyle(0x331111, 1).fillRect(x + 10, y + 30, 210, 12);
      g.fillStyle(p.dead ? 0x555555 : 0xe04848, 1).fillRect(x + 10, y + 30, (210 * p.hp) / p.stats.maxHp, 12);
      // XP
      g.fillStyle(0x112233, 1).fillRect(x + 10, y + 47, 150, 6);
      g.fillStyle(0x4ab0ff, 1).fillRect(x + 10, y + 47, (150 * p.xp) / p.xpNext, 6);
      // 스킬 쿨타임: 경험치 막대 오른쪽 (노랗게 가득 차면 사용 가능)
      const ready = 1 - Math.max(0, p.skillCd) / def.skill.cd;
      g.fillStyle(0x2a2a1a, 1).fillRect(x + 168, y + 46, 52, 8);
      g.fillStyle(ready >= 1 ? 0xffd040 : 0x7a6a30, 1).fillRect(x + 168, y + 46, 52 * ready, 8);
      this.hudTexts[i]
        .setText(`Lv.${p.level} ${def.name} ${p.name}  ${Math.ceil(p.hp)}/${p.stats.maxHp}`)
        .setPosition(x + 10, y + 8)
        .setVisible(true);
    });
    for (let i = s.players.length; i < 4; i++) this.hudTexts[i].setVisible(false);

    const me = s.players.find((p) => p.id === this.session.myId);
    if (me) {
      const lines = (['weapon', 'armor', 'accessory'] as const).map((slot) => {
        const it = me.equip[slot];
        return `${SLOT_NAMES[slot]}: ${it ? `[${RARITY[it.rarity].name}] ${itemName(it, me.cls)}  ${itemStatText(it)}` : '-'}`;
      });
      const sk = CLASSES[me.cls].skill;
      const skState = me.skillCd > 0 ? `${me.skillCd.toFixed(1)}초` : '준비됨';
      lines.unshift(`공격 ${me.stats.atk}  방어 ${me.stats.def}  치명 ${Math.round(me.stats.crit * 100)}%   [K] ${sk.name}: ${skState}`);
      g.fillStyle(0x000000, 0.45).fillRoundedRect(4, VIEW_H - 70, 360, 66, 6);
      this.equipText.setText(lines);
    }

    if (s.boss) {
      const bw = 480, bx = (VIEW_W - bw) / 2, by = VIEW_H - 40;
      g.fillStyle(0x000000, 0.7).fillRect(bx - 4, by - 4, bw + 8, 22);
      g.fillStyle(0x8a1a1a, 1).fillRect(bx, by, (bw * Math.max(0, s.boss.hp)) / s.boss.maxHp, 14);
      this.bossText.setText(ENEMIES.boss.name).setVisible(true);
    } else this.bossText.setVisible(false);
  }

  // ─── 이벤트 연출 ────────────────────────────────────

  private playEvent(e: GameEvent, s: Snapshot) {
    const playerPos = (pid: string) => {
      const p = s.players.find((p) => p.id === pid);
      return p ? { x: p.x + p.w / 2, y: p.y - 18, p } : null;
    };
    switch (e.t) {
      case 'dmg':
        this.floatText(e.x, e.y, String(e.v), e.toPlayer ? '#ff5050' : e.crit ? '#ffe040' : '#ffffff', e.crit ? 20 : 15);
        break;
      case 'heal':
        this.floatText(e.x, e.y, `+${e.v}`, '#60ff80', 15);
        break;
      case 'boom': {
        const c = this.add.circle(e.x, e.y, e.r, 0xffc070, 0.45).setDepth(30);
        c.setScale(0.3);
        this.tweens.add({ targets: c, scale: 1, alpha: 0, duration: 300, onComplete: () => c.destroy() });
        if (e.shake) this.cameras.main.shake(150, 0.006);
        break;
      }
      case 'levelup': {
        const pos = playerPos(e.pid);
        if (pos) this.floatText(pos.x, pos.y - 10, `LEVEL UP! Lv.${e.level}`, '#ffd040', 18, 1400);
        break;
      }
      case 'equip': {
        const pos = playerPos(e.pid);
        if (pos) this.floatText(pos.x, pos.y - 10, itemName(e.item, pos.p.cls), RARITY[e.item.rarity].color, 14, 1200);
        break;
      }
      case 'down': {
        const pos = playerPos(e.pid);
        if (pos) this.floatText(pos.x, pos.y, '쓰러짐! 가까이 가서 부활', '#ff8080', 14, 1600);
        break;
      }
      case 'revive': {
        const pos = playerPos(e.pid);
        if (pos) this.floatText(pos.x, pos.y, '부활!', '#80ff90', 16);
        break;
      }
      case 'banner':
        this.banner(e.text, e.sub);
        break;
      case 'skill': {
        const pos = playerPos(e.pid);
        if (!pos) break;
        this.floatText(pos.x, pos.y - 6, CLASSES[pos.p.cls].skill.name, hex(CLASSES[pos.p.cls].color), 15, 900);
        if (e.r > 0) {
          const color = pos.p.cls === 'gnome' ? 0x70ff90 : 0xff6040;
          const ring = this.add.circle(e.x, e.y, e.r).setStrokeStyle(4, color, 0.9).setDepth(30).setScale(0.2);
          this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
        }
        break;
      }
    }
  }

  private floatText(x: number, y: number, str: string, color: string, size: number, duration = 800) {
    const t = this.text(x, y, str, size).setOrigin(0.5).setColor(color).setStroke('#000', 4).setDepth(40);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private banner(title: string, sub?: string) {
    const items: Phaser.GameObjects.Text[] = [];
    if (title) items.push(this.text(VIEW_W / 2, 190, title, 44).setOrigin(0.5).setStroke('#000', 6));
    if (sub) items.push(this.text(VIEW_W / 2, title ? 240 : 200, sub, 20).setOrigin(0.5).setStroke('#000', 4));
    for (const t of items) {
      t.setScrollFactor(0).setDepth(120).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1600, onComplete: () => t.destroy() });
    }
  }

  private showEnd(s: Snapshot) {
    if (this.endShown) return;
    this.endShown = true;
    const win = s.status === 'victory';
    const g = this.add.graphics().setScrollFactor(0).setDepth(200);
    g.fillStyle(0x000000, 0.75).fillRect(0, 0, VIEW_W, VIEW_H);
    this.text(VIEW_W / 2, 130, win ? '승리!' : '전멸...', 52)
      .setOrigin(0.5).setScrollFactor(0).setDepth(201).setColor(win ? '#ffd040' : '#ff6060');
    const rows = s.players.map((p) => `${CLASSES[p.cls].race} ${CLASSES[p.cls].name}  ${p.name}   Lv.${p.level}   처치 ${p.kills}`);
    this.text(VIEW_W / 2, 230, rows.join('\n'), 18).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201).setLineSpacing(10).setAlign('center');
    const msg = this.session.role === 'client'
      ? '방장이 로비로 돌아가기를 기다리는 중...'
      : '클릭 또는 Enter: 로비로 돌아가기 (처음부터 다시)';
    const btn = this.text(VIEW_W / 2, 440, msg, 18).setOrigin(0.5).setScrollFactor(0).setDepth(201).setColor('#a0d0ff');
    if (this.session.role !== 'client') {
      btn.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.session.backToLobby());
    }
  }

  private text(x: number, y: number, str: string, size: number) {
    return this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff', resolution: 2 });
  }
}
