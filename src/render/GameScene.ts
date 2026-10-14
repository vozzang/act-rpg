// 게임 화면. 호스트는 Sim을 돌리며 그리고, 클라이언트는 받은 스냅샷을 보간해서 그린다.
//
// 화면은 두 겹이다.
//  - 아래: World3D (Three.js) — 지형, 캐릭터, 투사체
//  - 위: 이 Phaser 장면 (투명 배경) — HUD, 지도, 이름표, 데미지 숫자 같은 글자와 표시
// 이 장면은 카메라를 움직이지 않으므로 Phaser 좌표가 곧 화면 좌표다.
import Phaser from 'phaser';
import { ATTR_KEYS, ATTR_NAMES, CLASSES, ELITE, ENEMIES, INV_SIZE, RARITY, REVIVE_TIME, SHOP, SNAPSHOT_EVERY, TICK_RATE, itemName, itemStatText } from '../game/data';
import { gameLevel } from '../game/world';
import { Sim } from '../game/sim';
import { EMPTY_INPUT, type AttrKey, type GameEvent, type InputState, type Player, type Shop, type Snapshot } from '../game/types';
import type { Session } from '../session';
import { Effects } from './Effects';
import { CharMenu } from './CharMenu';
import { Hud, type Device } from './Hud';
import { MapView } from './MapView';
import { BTN, PadInput } from './PadInput';
import { ShopPanel } from './ShopPanel';
import { TouchControls, isTouchDevice } from './TouchControls';
import { hex, makeText } from './ui';
import { World3D } from './World3D';

const DT = 1 / TICK_RATE;
const SNAP_MS = (1000 / TICK_RATE) * SNAPSHOT_EVERY;

export class GameScene extends Phaser.Scene {
  private session!: Session;
  private sim?: Sim;
  private world!: World3D;
  private ready = false; // 3D 모델을 다 불러왔는지
  private hud!: Hud;
  private map!: MapView;
  private effects!: Effects;
  private shopPanel!: ShopPanel;
  private charMenu!: CharMenu;
  private touch?: TouchControls; // 터치 기기에서만 만든다

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

  // 월드 위에 겹치는 표시
  private marks!: Phaser.GameObjects.Graphics; // 조준 화살표, 경고 원, 적 체력바
  private nameTexts = new Map<string, Phaser.GameObjects.Text>();
  private hintText!: Phaser.GameObjects.Text;
  private shopLabels: Phaser.GameObjects.Text[] = [];
  private eliteLabels = new Map<number, Phaser.GameObjects.Text>(); // 중간보스 이름표

  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pad = new PadInput();
  /** 마지막으로 쓴 입력 장치. 화면의 버튼 안내와 조준 방식이 이걸 따른다. */
  private device: Device = 'kbm';
  private me?: Player;
  private lastSnap?: Snapshot;
  // 키보드·마우스 조준 방식: 마우스를 움직이면 'mouse', 방향키를 누르면 'move'(이동 방향으로 공격)
  private aimMode: 'mouse' | 'move' = 'move';
  private lastAim = 0;

  constructor() {
    super('game');
  }

  init(session: Session) {
    this.session = session;
  }

  create() {
    const s = this.session;
    const level = gameLevel();

    this.world = new World3D(this.game.canvas, level);
    const destroyWorld = () => this.world.destroy();
    this.events.once('shutdown', destroyWorld);
    this.events.once('destroy', destroyWorld);
    this.world.load().then(() => (this.ready = true));

    this.marks = this.add.graphics().setDepth(5);
    this.hintText = makeText(this, 0, 0, '', 13).setDepth(50).setOrigin(0.5, 1).setStroke('#000', 4);
    this.map = new MapView(this, level, s.myId);
    this.hud = new Hud(this, this.world, s.myId, (attr) => this.allocate(attr), (idx) => this.useSlot(idx), this.map.top);
    this.effects = new Effects(this, this.world, s.myId);
    this.shopPanel = new ShopPanel(this, (idx) => this.buy(idx));
    this.charMenu = new CharMenu(this, (attr) => this.allocate(attr), (idx) => this.useSlot(idx));
    if (isTouchDevice()) {
      this.touch = new TouchControls(this);
      this.device = 'touch';
    }
    for (let i = 0; i < level.shops.length; i++) {
      this.shopLabels.push(makeText(this, 0, 0, '', 13).setOrigin(0.5, 1).setDepth(20).setColor('#ffd040').setStroke('#000', 4));
    }

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,Z,X,C,Q,R,I,SPACE,E,F,ENTER,ESC,TAB,M,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT,TAB');
    this.input.mouse?.disableContextMenu();
    kb.on('keydown', () => (this.device = 'kbm'));
    // 터치도 포인터 이벤트로 들어오므로 마우스와 구분한다
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => (this.device = p.wasTouch ? 'touch' : 'kbm'));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      this.aimMode = 'mouse';
      this.device = 'kbm';
    });
    for (const key of [this.keys.UP, this.keys.DOWN, this.keys.LEFT, this.keys.RIGHT]) key.on('down', () => (this.aimMode = 'move'));

    if (s.role !== 'client') {
      this.sim = new Sim(s.seed, s.players);
      // 개발 중 콘솔에서 상태를 살펴볼 수 있게 노출 (sim: 게임 상태, scene: 화면·입력)
      if (import.meta.env.DEV) Object.assign(window, { sim: this.sim, scene: this });
      s.onRemoteInput = (id, input) => this.sim!.setInput(id, input);
      s.onRemoteAlloc = (id, attr) => this.sim!.allocate(id, attr);
      s.onRemoteBuy = (id, shop, idx) => this.sim!.buy(id, shop, idx);
      s.onRemoteSlot = (id, idx) => this.sim!.useSlot(id, idx);
      s.onPlayerLeft = (id) => this.sim!.removePlayer(id);
      if (s.host) this.startBackgroundTicker();
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
    if (!this.ready) return; // 모델을 다 불러올 때까지 대기
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.pad.update(this.input.gamepad?.pad1);
    if (this.pad.touched) this.device = 'pad';
    if (this.touch?.touched) this.device = 'touch';
    this.hud.setDevice(this.device);
    this.map.setMinimapVisible(this.device !== 'touch'); // 터치 화면에서는 오른쪽 아래를 버튼이 쓴다
    this.touch?.setVisible(this.device === 'touch');
    const input = this.readInput();
    this.readHotkeys();
    let snap: Snapshot | undefined;
    let events: GameEvent[] = [];

    if (this.sim) {
      this.sim.setInput(this.session.myId, input);
      events = this.stepHost(dt);
      snap = this.sim.snapshot([]);
    } else {
      this.sendInput(input);
      snap = this.interpolated();
      events = this.pendingEvents;
      this.pendingEvents = [];
    }
    if (!snap) return;

    this.me = snap.players.find((p) => p.id === this.session.myId);
    this.lastSnap = snap;
    this.updateMenus(snap);
    this.world.update(snap, this.session.myId, dt);
    this.drawOverlays(snap);
    this.hud.update(snap, this.me);
    this.map.update(this.hud.g, snap, this.keys.TAB.isDown,
      Phaser.Input.Keyboard.JustDown(this.keys.M) || this.pad.pressed(BTN.VIEW) || !!this.touch?.consume('map'));
    for (const e of events) this.effects.play(e, snap, this.me);
    this.touch?.update(this.me); // 버튼 그리기, '방금 눌림' 초기화 (이번 프레임에 다 쓴 뒤에)

    if (snap.status !== 'playing') {
      const canReturn = this.session.role !== 'client';
      this.effects.showEnd(snap, canReturn ? this.session.backToLobby : null);
      if (canReturn && (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || this.pad.pressed(BTN.A))) this.session.backToLobby();
    }
  }

  /** 호스트: 게임을 dt초만큼 진행하고, 참가자에게 스냅샷을 보낸다. 생긴 이벤트를 돌려준다. */
  private stepHost(dt: number): GameEvent[] {
    const sim = this.sim!;
    const events: GameEvent[] = [];
    this.acc += dt;
    while (this.acc >= DT) {
      this.acc -= DT;
      sim.step(DT);
      const ev = sim.drainEvents();
      events.push(...ev);
      this.netEvents.push(...ev);
      if (this.session.host && sim.tick % SNAPSHOT_EVERY === 0) {
        // 참가자마다 자기 아이템 상자만 담아서 따로 보낸다 (전송량 절약)
        for (const p of sim.players) {
          if (p.id !== this.session.myId) this.session.host.send(p.id, { t: 'snap', s: sim.snapshot(this.netEvents, p.id) });
        }
        this.netEvents = [];
      }
    }
    return events;
  }

  /**
   * 방장 탭이 뒤로 가면(다른 창·최소화) 브라우저가 화면 갱신을 멈춰 모두의 게임이 멈춘다.
   * 그래서 브라우저가 멈추지 않는 Web Worker 타이머로 그동안 게임 진행과 전송을 이어간다.
   */
  private startBackgroundTicker() {
    const src = 'setInterval(() => postMessage(0), 25);';
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    let last = performance.now();
    worker.onmessage = () => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (!document.hidden || !this.ready || !this.sim) return; // 보이는 동안은 update()가 진행한다
      this.sim.setInput(this.session.myId, EMPTY_INPUT); // 방장 캐릭터는 그동안 멈춰 있는다
      this.stepHost(dt);
    };
    const stop = () => worker.terminate();
    this.events.once('shutdown', stop);
    this.events.once('destroy', stop);
  }

  // ─── 입력 ─────────────────────────────────────────
  //
  // 게임패드 배치 (Xbox 이름, 괄호는 PlayStation)
  //   왼쪽 스틱 이동 · 오른쪽 스틱 조준(안 쓰면 자동 조준)
  //   X(□) 기본 공격 · A(✕)·B(○)·Y(△) 스킬 1~3 · RT(R2) 스킬 4
  //   LB(L1) HP 음식 · RB(R1) MP 음식 · LT(L2) 줍기·상점
  //   View 전체 지도 · Menu 캐릭터 메뉴 · 메뉴/상점 안에서는 방향패드 고르기, A 실행, B 닫기

  private get uiOpen() {
    return this.shopPanel.openId !== null || this.charMenu.isOpen;
  }

  private readInput(): InputState {
    const k = this.keys;
    const pad = this.pad;
    let dx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
    let dy = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
    if (pad.left.x || pad.left.y) {
      dx = pad.left.x;
      dy = pad.left.y;
    }
    const touch = this.touch;
    if (touch && (touch.move.x || touch.move.y)) {
      dx = touch.move.x;
      dy = touch.move.y;
    }
    const move = this.world.screenDirToWorld(dx, dy);
    const moving = move.x !== 0 || move.y !== 0;

    // 조준
    //  게임패드: 오른쪽 스틱 > 자동 조준(앞쪽 가장 가까운 적) > 이동 방향
    //  키보드·마우스: 마우스 위치(마우스 모드) > 이동 방향(방향키)
    // 멈춰 있으면 마지막으로 바라본 방향을 유지한다.
    const ptr = this.input.activePointer;
    if (this.device === 'pad' || this.device === 'touch') {
      if (this.device === 'pad' && pad.aiming) {
        const w = this.world.screenDirToWorld(pad.right.x, pad.right.y);
        this.lastAim = Math.atan2(w.y, w.x);
      } else {
        const ref = moving ? Math.atan2(move.y, move.x) : this.lastAim;
        this.lastAim = this.autoAim(ref) ?? ref;
      }
    } else if (this.aimMode === 'mouse' && this.me) {
      // 카메라가 움직여도 맞도록 매 프레임 다시 계산한다
      const target = this.world.toWorld(ptr.x, ptr.y);
      this.lastAim = Math.atan2(target.y - this.me.y, target.x - this.me.x);
    } else if (moving) {
      this.lastAim = Math.atan2(move.y, move.x);
    }

    // 메뉴·상점이 열려 있으면 공격·스킬은 막고 이동과 음식만 된다 (버튼과 숫자키를 메뉴가 쓴다)
    if (this.uiOpen) pad.lockHeld([BTN.A, BTN.B, BTN.X, BTN.Y, BTN.RT]);
    const blockMouse = this.hud.overButton || this.shopPanel.pointerOver || this.charMenu.pointerOver;
    let skills = 0;
    let attack = false;
    if (!this.uiOpen) {
      if (!k.SHIFT.isDown) [k.ONE, k.TWO, k.THREE, k.FOUR].forEach((key, i) => key.isDown && (skills |= 1 << i));
      const mouse = this.device === 'kbm' && !blockMouse; // 터치도 '왼쪽 버튼'으로 잡히므로 마우스일 때만
      if ((mouse && ptr.rightButtonDown()) || k.X.isDown || k.SPACE.isDown || k.K.isDown) skills |= 1;
      [0, 1, 2, 3].forEach((i) => touch?.isHeld(`skill${i}` as 'skill0') && (skills |= 1 << i));
      if (pad.held(BTN.A)) skills |= 1;
      if (pad.held(BTN.B)) skills |= 2;
      if (pad.held(BTN.Y)) skills |= 4;
      if (pad.held(BTN.RT)) skills |= 8;
      attack = (mouse && ptr.leftButtonDown()) || k.Z.isDown || k.J.isDown || pad.held(BTN.X) || !!touch?.isHeld('attack');
    }

    return {
      mx: Math.round(move.x * 100) / 100,
      my: Math.round(move.y * 100) / 100,
      aim: Math.round(this.lastAim * 100) / 100,
      attack,
      skills,
      pickup: k.E.isDown || k.C.isDown || k.F.isDown || pad.held(BTN.LT) || !!touch?.isHeld('interact'),
      use: (k.Q.isDown || pad.held(BTN.LB) || touch?.isHeld('hp') ? 1 : 0) | (k.R.isDown || pad.held(BTN.RB) || touch?.isHeld('mp') ? 2 : 0),
    };
  }

  /**
   * 게임패드 자동 조준: ref 방향 앞쪽 부채꼴(좌우 70°) 안에서 사거리 안의 가장 가까운 적.
   * 각도가 많이 벌어진 적일수록 덜 고른다. 없으면 null.
   */
  private autoAim(ref: number): number | null {
    const me = this.me;
    if (!me || !this.lastSnap) return null;
    const atk = CLASSES[me.cls].attack;
    const range = atk.kind === 'melee' ? 170 : atk.range;
    const cone = (70 * Math.PI) / 180;
    let best: number | null = null;
    let bestScore = Infinity;
    for (const e of this.lastSnap.enemies) {
      const d = Math.hypot(e.x - me.x, e.y - me.y);
      if (d > range) continue;
      const ang = Math.atan2(e.y - me.y, e.x - me.x);
      const off = Math.abs(Math.atan2(Math.sin(ang - ref), Math.cos(ang - ref)));
      if (off > cone) continue;
      const score = d * (1 + off);
      if (score < bestScore) {
        bestScore = score;
        best = ang;
      }
    }
    return best;
  }

  /**
   * 숫자키 단축키 (스킬 1~4는 readInput에서 따로 읽는다)
   *  - Shift+1~4: 능력치 배분
   *  - 5·6·7·8·9·0: 아이템 상자 1~6칸 사용 (음식은 먹기, 장비는 내려놓기)
   * JustDown은 한 번 확인하면 소진되므로 조건을 먼저 본다. 상점이 열려 있으면 숫자키는 상점이 쓴다.
   */
  private readHotkeys() {
    const k = this.keys;
    [k.ONE, k.TWO, k.THREE, k.FOUR].forEach((key, i) => {
      if (k.SHIFT.isDown && Phaser.Input.Keyboard.JustDown(key)) this.allocate(ATTR_KEYS[i]);
    });
    if (this.uiOpen) return;
    [k.FIVE, k.SIX, k.SEVEN, k.EIGHT, k.NINE, k.ZERO].forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(key)) this.useSlot(i);
    });
  }

  private allocate(attr: AttrKey) {
    if (!this.me || this.me.points <= 0) return;
    if (this.sim) this.sim.allocate(this.session.myId, attr);
    else this.session.client!.send({ t: 'alloc', attr });
    const { sx, sy } = this.world.toScreen(this.me.x, this.me.y);
    this.effects.floatText(sx, sy - this.world.heightPx(CLASSES[this.me.cls].height + 24), `${ATTR_NAMES[attr]} +1`, '#ffd040', 15, 700);
  }

  // ─── 상점 ─────────────────────────────────────────

  /** 가까운 상점 (상인과 SHOP.range 안). 스냅샷에는 플레이어 근처 상점만 들어 있다. */
  private nearShop(s: Snapshot): Shop | undefined {
    const me = this.me;
    if (!me || me.dead) return undefined;
    return s.shops.find((sh) => Math.hypot(sh.x - me.x, sh.y - me.y) < SHOP.range);
  }

  /**
   * 캐릭터 메뉴와 상점 창 열고 닫기·조작.
   *  - 캐릭터 메뉴: I / 게임패드 Menu로 열고 닫기, Esc·B로 닫기, 방향패드로 고르고 A로 실행
   *  - 상점: 상인 곁에서 E / LT로 열기, E·Esc·B로 닫기, 숫자키·클릭 또는 방향패드+A로 사기. 멀어지면 닫힌다.
   * 둘은 동시에 열리지 않는다.
   */
  private updateMenus(s: Snapshot) {
    const pad = this.pad;
    const just = (key: Phaser.Input.Keyboard.Key) => Phaser.Input.Keyboard.JustDown(key);
    const me = this.me;
    const shopPanel = this.shopPanel;
    const menu = this.charMenu;
    const escPressed = just(this.keys.ESC);
    const backPressed = escPressed || pad.pressed(BTN.B);
    const dpad = { x: (pad.pressed(BTN.RIGHT) ? 1 : 0) - (pad.pressed(BTN.LEFT) ? 1 : 0), y: (pad.pressed(BTN.DOWN) ? 1 : 0) - (pad.pressed(BTN.UP) ? 1 : 0) };

    // 캐릭터 메뉴
    if (just(this.keys.I) || pad.pressed(BTN.MENU) || this.touch?.consume('menu')) {
      shopPanel.close();
      menu.toggle();
    } else if (menu.isOpen && backPressed) menu.close();
    if (menu.isOpen) {
      if (!me) return menu.close();
      if (dpad.x || dpad.y) menu.navigate(dpad.x, dpad.y);
      if (pad.pressed(BTN.A)) menu.confirm();
      menu.update(me, this.device);
      return;
    }

    // 상점
    const near = this.nearShop(s);
    const itemUnderFoot = me && s.drops.some((d) => d.kind === 'item' && Math.hypot(d.x - me.x, d.y - me.y) < 36);
    const interact = just(this.keys.E) || just(this.keys.F) || pad.pressed(BTN.LT) || !!this.touch?.consume('interact');
    if (shopPanel.openId !== null) {
      const shop = s.shops.find((sh) => sh.id === shopPanel.openId);
      if (!shop || !me || me.dead || Math.hypot(shop.x - me.x, shop.y - me.y) > SHOP.range + 30 || interact || backPressed) {
        shopPanel.close();
        return;
      }
      [this.keys.ONE, this.keys.TWO, this.keys.THREE, this.keys.FOUR, this.keys.FIVE].forEach((key, i) => {
        if (just(key)) this.buy(i);
      });
      if (dpad.y) shopPanel.navigate(dpad.y);
      if (pad.pressed(BTN.A)) shopPanel.confirm();
      shopPanel.update(shop, me, this.device);
    } else if (interact && near && !itemUnderFoot) {
      shopPanel.open(near.id);
    }
  }

  /** 아이템 상자 칸 클릭: 음식은 먹고, 장비는 내려놓는다 */
  private useSlot(idx: number) {
    if (this.sim) this.sim.useSlot(this.session.myId, idx);
    else this.session.client!.send({ t: 'slot', idx });
  }

  private buy(idx: number) {
    const id = this.shopPanel.openId;
    if (id === null) return;
    if (this.sim) this.sim.buy(this.session.myId, id, idx);
    else this.session.client!.send({ t: 'buy', shop: id, idx });
  }

  // ─── 네트워크 ──────────────────────────────────────

  private sendInput(input: InputState) {
    const key = JSON.stringify(input);
    const now = performance.now();
    // 바뀌었을 때 보내되 초당 30회를 넘지 않게. 안 바뀌어도 0.2초마다 한 번.
    if ((key !== this.lastSent && now - this.lastSentAt > 33) || now - this.lastSentAt > 200) {
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
      players: lerpList(cur.players, prev.players),
      enemies: lerpList(cur.enemies, prev.enemies),
      projectiles: lerpList(cur.projectiles, prev.projectiles),
    };
  }

  // ─── 월드 위 표시 ───────────────────────────────────

  private drawOverlays(s: Snapshot) {
    const g = this.marks;
    const w = this.world;
    const t = this.time.now / 1000;
    g.clear();

    const groundCircle = (x: number, y: number, r: number, color: number, alpha: number) => {
      const { sx, sy } = w.toScreen(x, y);
      const e = w.groundEllipse(r);
      g.fillStyle(color, alpha).fillEllipse(sx, sy, e.w, e.h);
    };

    // 위험 경고: 보스 도약 착지점, 바위·운석 낙하 지점
    for (const e of s.enemies) if (e.kind === 'boss' && e.state === 'leap') groundCircle(e.tx, e.ty, e.r + 30, 0xff3020, 0.3);
    for (const pr of s.projectiles) {
      if (pr.kind === 'firebomb') groundCircle(pr.x + pr.vx * pr.life, pr.y + pr.vy * pr.life, pr.aoe, 0xff3020, 0.18 + 0.15 * Math.sin(t * 20));
      if (pr.kind === 'meteor') groundCircle(pr.x, pr.y, pr.aoe, 0xff9020, 0.15 + 0.1 * Math.sin(t * 16));
    }

    // 내 조준 방향 화살표
    if (this.me && !this.me.dead) {
      const p = this.me;
      const d = p.r + 22;
      const tip = w.toScreen(p.x + Math.cos(p.aim) * (d + 10), p.y + Math.sin(p.aim) * (d + 10));
      const l = w.toScreen(p.x + Math.cos(p.aim + 0.25) * d, p.y + Math.sin(p.aim + 0.25) * d);
      const r = w.toScreen(p.x + Math.cos(p.aim - 0.25) * d, p.y + Math.sin(p.aim - 0.25) * d);
      g.fillStyle(0xffffff, 0.55).fillTriangle(tip.sx, tip.sy, l.sx, l.sy, r.sx, r.sy);
    }

    // 적 머리 위: 체력바, 도발(!), 기절(별). 중간보스는 이름과 큰 체력바를 늘 보여준다
    const seenElites = new Set<number>();
    for (const e of s.enemies) {
      const { sx, sy } = w.toScreen(e.x, e.y);
      const top = sy - w.heightPx(ENEMIES[e.kind].height * (e.elite ? ELITE.scale : 1) + (e.kind === 'boss' ? 60 : 16) + e.z);
      if (e.elite) {
        seenElites.add(e.id);
        g.fillStyle(0x000000, 0.7).fillRect(sx - 36, top - 8, 72, 7);
        g.fillStyle(0xe8a020, 1).fillRect(sx - 36, top - 8, (72 * e.hp) / e.maxHp, 7);
        g.lineStyle(1, 0xffd060, 0.9).strokeRect(sx - 36, top - 8, 72, 7);
        let label = this.eliteLabels.get(e.id);
        if (!label) {
          label = makeText(this, 0, 0, e.elite, 13).setOrigin(0.5, 1).setDepth(20).setColor('#ffd060').setStroke('#000', 4);
          this.eliteLabels.set(e.id, label);
        }
        label.setPosition(sx, top - 10).setVisible(true);
      } else if (e.kind !== 'boss' && e.hp < e.maxHp) {
        g.fillStyle(0x000000, 0.6).fillRect(sx - 18, top - 6, 36, 4);
        g.fillStyle(0xe04040, 1).fillRect(sx - 18, top - 6, (36 * e.hp) / e.maxHp, 4);
      }
      if (e.taunt > 0) g.fillStyle(0xff4030, 1).fillRect(sx - 2, top - 22, 4, 10).fillRect(sx - 2, top - 10, 4, 3);
      if (e.stun > 0.3) {
        for (let i = 0; i < 3; i++) {
          const a = t * 6 + (i * Math.PI * 2) / 3;
          g.fillStyle(0xffe040, 1).fillCircle(sx + Math.cos(a) * 12, top - 2 + Math.sin(a) * 4, 2.5);
        }
      }
    }

    for (const [id, label] of this.eliteLabels) {
      if (seenElites.has(id)) continue;
      label.destroy();
      this.eliteLabels.delete(id);
    }

    // 쓰러진 동료의 부활 게이지
    for (const p of s.players) {
      if (!p.dead || p.revive <= 0) continue;
      const { sx, sy } = w.toScreen(p.x, p.y);
      g.fillStyle(0x000000, 0.6).fillRect(sx - 24, sy - 30, 48, 6);
      g.fillStyle(0x6aff8a, 1).fillRect(sx - 24, sy - 30, (48 * p.revive) / REVIVE_TIME, 6);
    }

    this.drawNames(s);
    this.drawShopLabels(s);
    this.drawPickupHint(s);
  }

  /** 상인 머리 위 간판. 가까이 가면 여는 방법을 알려 준다. */
  private drawShopLabels(s: Snapshot) {
    const near = this.nearShop(s);
    this.shopLabels.forEach((t, i) => {
      const sh = s.shops.find((x) => x.id === i);
      if (!sh) return void t.setVisible(false);
      const { sx, sy } = this.world.toScreen(sh.x, sh.y - 14);
      const open = this.shopPanel.openId === i;
      t.setText(near?.id === i && !open ? `상점\n[${this.device === 'pad' ? 'LT' : this.device === 'touch' ? '줍기' : 'E'}] 열기` : '상점').setAlign('center')
        .setPosition(sx, sy - this.world.heightPx(70)).setVisible(!open);
    });
  }

  private drawNames(s: Snapshot) {
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let t = this.nameTexts.get(p.id);
      if (!t) {
        t = makeText(this, 0, 0, '', 12).setOrigin(0.5, 1).setDepth(20).setStroke('#000', 3);
        this.nameTexts.set(p.id, t);
      }
      const def = CLASSES[p.cls];
      const { sx, sy } = this.world.toScreen(p.x, p.y);
      t.setText(`${p.id === this.session.myId ? '▼ ' : ''}${p.name}`).setColor(hex(def.color));
      t.setPosition(sx, sy - this.world.heightPx(def.height + 6)).setVisible(!p.dead);
    }
    for (const [id, t] of this.nameTexts) if (!seen.has(id)) t.setVisible(false);
  }

  /** 발밑 장비의 이름·수치와 상자 남은 칸을 보여준다. */
  private drawPickupHint(s: Snapshot) {
    const me = this.me;
    const drop = me && !me.dead
      ? s.drops.find((d) => d.kind === 'item' && Math.hypot(d.x - me.x, d.y - me.y) < 36)
      : undefined;
    if (!me || !drop?.item) {
      this.hintText.setVisible(false);
      return;
    }
    const item = drop.item;
    const used = me.inv.filter(Boolean).length;
    const full = used >= INV_SIZE;
    const { sx, sy } = this.world.toScreen(drop.x, drop.y);
    this.hintText
      .setText([
        `${full ? '상자가 가득 참' : `[${this.device === 'pad' ? 'LT' : this.device === 'touch' ? '줍기 버튼' : 'E'}] 줍기`}  [${RARITY[item.rarity].name}] ${itemName(item, me.cls)}`,
        `${itemStatText(item)}   (상자 ${used}/${INV_SIZE}칸)`,
      ])
      .setColor(full ? '#9a9a9a' : RARITY[item.rarity].color)
      .setPosition(sx, sy - 34)
      .setVisible(true);
  }
}
