// 게임 화면. 호스트는 Sim을 돌리며 그리고, 클라이언트는 받은 스냅샷을 보간해서 그린다.
//
// 화면은 두 겹이다.
//  - 아래: World3D (Three.js) — 지형, 캐릭터, 투사체
//  - 위: 이 Phaser 장면 (투명 배경) — HUD, 지도, 이름표, 데미지 숫자 같은 글자와 표시
// 이 장면은 카메라를 움직이지 않으므로 Phaser 좌표가 곧 화면 좌표다.
import Phaser from 'phaser';
import { ATTR_KEYS, ATTR_NAMES, CLASSES, ELITE, ENEMIES, INV_SIZE, RARITY, REVIVE_TIME, SHOP, SHOP_TYPES, SNAPSHOT_EVERY, TICK_RATE, TILE, VIEW_W, itemName, itemStatText } from '../game/data';
import { gameLevel } from '../game/world';
import { lineOfSight } from '../game/physics';
import type { Level } from '../game/level';
import { Sim } from '../game/sim';
import { EMPTY_INPUT, type AttrKey, type GameEvent, type InputState, type Player, type Shop, type Snapshot } from '../game/types';
import type { Session } from '../session';
import { Effects } from './Effects';
import { StoryPanel } from './StoryPanel';
import { ForgePanel } from './ForgePanel';
import { Sound } from './Sound';
import { playEventSound } from './sfxEvents';
import { STORY_BOSS, STORY_ENDING, STORY_INTRO, STORY_ZONES } from '../game/story';
import { CharMenu } from './CharMenu';
import { DevItemPanel } from './DevItemPanel';
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
  private story!: StoryPanel;
  private forgePanel!: ForgePanel;
  private sfx!: Sound;
  private uiSoundState = ''; // 상점·메뉴·스토리 쪽이 바뀌었는지 비교해 효과음을 낸다
  private endSoundPlayed = false;
  // 스토리 진행: 인트로를 띄웠는지, 몇 구역까지 이야기를 봤는지, 흑룡·엔딩 이야기를 봤는지
  private storyStarted = false;
  private storyZone = 0;
  private storyBoss = false;
  private endingDone = false;
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
  /** 참가자 혼자 끝난 게임 (내가 나갔거나 방장 연결이 끊김): 마지막 스냅샷으로 결과 화면을 보여 준다 */
  private localEnd: { snap: Snapshot; note: string } | null = null;
  private quitBtn!: Phaser.GameObjects.Text;
  // 키보드·마우스 조준 방식: 마우스를 움직이면 'mouse', 방향키를 누르면 'move'(이동 방향으로 공격)
  private aimMode: 'mouse' | 'move' = 'move';
  private lastAim = 0;
  /** 맵 (자동 조준이 벽 너머 적을 고르지 않게 쓴다. 열린 문은 World3D가 반영한다) */
  private level!: Level;

  constructor() {
    super('game');
  }

  init(session: Session) {
    this.session = session;
  }

  create() {
    const s = this.session;
    const level = gameLevel();
    this.level = level;

    this.world = new World3D(this.game.canvas, level);
    const destroyWorld = () => this.world.destroy();
    this.events.once('shutdown', destroyWorld);
    this.events.once('destroy', destroyWorld);
    this.world.load().then(() => (this.ready = true));
    if (!this.textures.exists('frostbow-icon')) {
      this.load.image('frostbow-icon', 'assets/frostbow/frostbow.jpg');
      this.load.start();
    }

    this.marks = this.add.graphics().setDepth(5);
    this.hintText = makeText(this, 0, 0, '', 13).setDepth(50).setOrigin(0.5, 1).setStroke('#000', 4);
    this.map = new MapView(this, level, s.myId);
    this.hud = new Hud(this, this.world, s.myId, (attr) => this.allocate(attr), (idx) => this.useSlot(idx), this.map.top);
    this.effects = new Effects(this, this.world, s.myId);
    // 끝내기 (오른쪽 위): 방장·혼자는 모두의 게임을 끝내고, 참가자는 혼자 나간다. 어느 쪽이든 결과 화면을 보여 준다
    this.quitBtn = makeText(this, VIEW_W - 8, 8, '⏹ 끝내기', 13).setOrigin(1, 0).setDepth(130).setAlpha(0.8)
      .setPadding(8, 4, 8, 4).setBackgroundColor('#1a2336').setInteractive({ useHandCursor: true });
    this.quitBtn.on('pointerdown', () => this.quit());
    s.onHostLost = () => {
      if (!this.lastSnap) return false;
      this.localEnd = { snap: { ...this.lastSnap, status: 'ended' }, note: '방장과의 연결이 끊어졌습니다' };
      return true;
    };
    this.shopPanel = new ShopPanel(this, (idx) => this.buy(idx));
    this.charMenu = new CharMenu(this, (attr) => this.allocate(attr), (idx) => this.useSlot(idx), (from, idx) => this.moveItem(from, idx), (from, idx) => this.dropItem(from, idx));
    this.forgePanel = new ForgePanel(this, (picks, random) => this.forge(picks, random));
    this.story = new StoryPanel(this);
    this.sfx = new Sound();
    const stopSfx = () => this.sfx.destroy();
    this.events.once('shutdown', stopSfx);
    this.events.once('destroy', stopSfx);
    if (s.skipStory) this.endingDone = true; // 건너뛰기를 골랐으면 엔딩 이야기 없이 바로 결과 화면
    if (isTouchDevice()) {
      this.touch = new TouchControls(this);
      this.device = 'touch';
    }
    for (let i = 0; i < level.shops.length; i++) {
      this.shopLabels.push(makeText(this, 0, 0, '', 13).setOrigin(0.5, 1).setDepth(20).setColor('#ffd040').setStroke('#000', 4));
    }

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,Z,X,C,Q,R,I,SPACE,E,F,ENTER,ESC,DELETE,TAB,M,ONE,TWO,THREE,FOUR,FIVE,SIX,SEVEN,EIGHT,NINE,ZERO,SHIFT,OPEN_BRACKET,CLOSED_BRACKET') as Record<string, Phaser.Input.Keyboard.Key>;
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
      // 개발용 장비 시험 창 (` 키). 열려 있는 동안은 게임 키 입력을 막는다 (검색 칸에 글을 쓸 수 있게)
      if (import.meta.env.DEV) {
        const kb = this.input.keyboard!;
        const panel = new DevItemPanel(this.sim, s.myId, (open) => {
          kb.enabled = !open;
          kb.resetKeys();
          // 게임이 잡아 두는 키(스페이스·방향키)도 풀어 줘야 검색 칸에 띄어쓰기를 할 수 있다
          if (kb.manager) kb.manager.preventDefault = !open;
        });
        this.events.once('shutdown', () => panel.destroy());
      }
      // 개발용 시작 구역: 그 구역 입구에서 (앞 구역 문은 열고 몬스터는 치운다)
      if (import.meta.env.DEV && (s.startZone ?? 1) > 1) this.sim.devStartZone(s.startZone!);
      // 개발용 시작 레벨: 모든 플레이어를 그 레벨로
      if (import.meta.env.DEV && (s.startLevel ?? 1) > 1) for (const p of s.players) this.sim.setLevel(p.id, s.startLevel!);
      s.onRemoteInput = (id, input) => this.sim!.setInput(id, input);
      s.onRemoteAlloc = (id, attr) => this.sim!.allocate(id, attr);
      s.onRemoteBuy = (id, shop, idx) => this.sim!.buy(id, shop, idx);
      s.onRemoteSlot = (id, idx) => this.sim!.useSlot(id, idx);
      s.onRemoteMove = (id, from, idx) => this.sim!.moveItem(id, from, idx);
      s.onRemoteDrop = (id, from, idx) => this.sim!.dropItem(id, from, idx);
      s.onRemoteForge = (id, shop, picks, random) => this.sim!.forge(id, shop, picks, random);
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
    if (this.localEnd) {
      // 참가자 혼자 끝남: 게임은 멈춘 채 결과 화면만 (메뉴로 나가기)
      this.pad.update(this.input.gamepad?.pad1);
      this.quitBtn.setVisible(false);
      this.effects.showEnd(this.localEnd.snap, this.session.leaveToMenu, this.localEnd.note, '처음 메뉴로 돌아가기');
      if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || this.pad.pressed(BTN.A)) this.session.leaveToMenu();
      return;
    }
    this.pad.update(this.input.gamepad?.pad1);
    if (this.pad.touched) this.device = 'pad';
    if (this.touch?.touched) this.device = 'touch';
    this.hud.setDevice(this.device);
    this.map.setMinimapVisible(this.device !== 'touch'); // 터치 화면에서는 오른쪽 아래를 버튼이 쓴다
    this.touch?.setVisible(this.device === 'touch');
    // 스토리 대화창이 열려 있으면 Enter·A로 넘기고 Esc·B로 건너뛴다 (그 키가 게임 조작으로 새지 않게 잠근다)
    if (this.story.isOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || this.pad.pressed(BTN.A)) this.story.next();
      if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) || this.pad.pressed(BTN.B)) this.story.skip();
      this.pad.lockHeld([BTN.A, BTN.B]);
    }
    const input = this.readInput();
    if (!this.story.isOpen) this.readHotkeys();
    let snap: Snapshot | undefined;
    let events: GameEvent[] = [];

    if (this.sim) {
      this.sim.setInput(this.session.myId, input);
      // 혼자 할 때는 스토리를 보는 동안 게임이 멈춘다 (여럿이 할 때는 멈추지 않는다)
      const paused = this.session.role === 'solo' && this.story.isOpen;
      events = paused ? [] : this.stepHost(dt);
      snap = this.sim.snapshot([], undefined, this.session.myId); // 상점 품절은 내 기준
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
    this.hud.update(snap, this.me, this.dungeonIdx(this.me));
    this.map.update(this.hud.g, snap, this.keys.TAB.isDown,
      Phaser.Input.Keyboard.JustDown(this.keys.M) || this.pad.pressed(BTN.VIEW) || !!this.touch?.consume('map'));
    for (const e of events) this.effects.play(e, snap, this.me);
    this.playSounds(events, snap);
    this.touch?.update(this.me); // 버튼 그리기, '방금 눌림' 초기화 (이번 프레임에 다 쓴 뒤에)
    this.updateStory(snap);
    this.story.update(dt, this.device);

    // 승리하면 엔딩 이야기를 다 본(또는 건너뛴) 뒤에 결과 화면을 띄운다. 전멸·도중에 끝냄은 바로
    if (snap.status !== 'playing' && (snap.status !== 'victory' || this.endingDone)) {
      const canReturn = this.session.role !== 'client';
      this.quitBtn.setVisible(false);
      this.effects.showEnd(snap, canReturn ? this.session.backToLobby : null, snap.status === 'ended' ? (canReturn ? '게임을 끝냈습니다' : '방장이 게임을 끝냈습니다') : '');
      if (canReturn && (Phaser.Input.Keyboard.JustDown(this.keys.ENTER) || this.pad.pressed(BTN.A))) this.session.backToLobby();
    }
  }

  /** 내가 들어가 있는 던전 투기장 번호 (맵 아래 줄에서 가장 가까운 투기장, 밖이면 -1) */
  private dungeonIdx(p?: Player) {
    if (!p || p.y <= this.level.mapH * TILE) return -1;
    let best = -1, bestD = Infinity;
    this.level.dungeons.forEach((d, i) => {
      const dd = Math.abs(p.x - d.center.x);
      if (dd < bestD) [best, bestD] = [i, dd];
    });
    return best;
  }

  /** 끝내기 버튼: 한 번 더 묻고, 방장·혼자는 게임을 끝내고(모두 결과 화면), 참가자는 연결을 끊고 혼자 결과 화면 */
  private quit() {
    if (this.effects.ended || this.localEnd || !this.lastSnap) return;
    const client = this.session.role === 'client';
    if (!window.confirm(client ? '게임에서 나갈까요? (다시 들어올 수 없어요)' : '게임을 끝낼까요? 모두의 게임이 끝나고 결과 화면이 나옵니다.')) return;
    if (client) {
      this.session.disconnect();
      this.localEnd = { snap: { ...this.lastSnap, status: 'ended' }, note: '게임에서 나왔습니다' };
    } else this.sim?.endEarly();
  }

  /** 이벤트·창 열고 닫기·스토리 쪽 넘김·승패에 맞는 효과음 */
  private playSounds(events: GameEvent[], s: Snapshot) {
    const sfx = this.sfx;
    if (this.me) sfx.listener = { x: this.me.x, y: this.me.y };
    for (const e of events) playEventSound(sfx, e, this.session.myId);
    // 창이 열리고 닫히거나 스토리 쪽이 넘어갈 때
    const st = `${this.shopPanel.openId}|${this.charMenu.isOpen}|${this.story.pageKey}`;
    if (st !== this.uiSoundState) {
      const [shop0, menu0, page0] = this.uiSoundState.split('|');
      const [shop1, menu1, page1] = st.split('|');
      if (this.uiSoundState && (shop0 !== shop1 || menu0 !== menu1)) sfx.play('ui1', { volume: 0.5 });
      if (page1 && page1 !== page0) sfx.pick(['page1', 'page2'], { volume: 0.45 });
      this.uiSoundState = st;
    }
    if (s.status !== 'playing' && !this.endSoundPlayed) {
      this.endSoundPlayed = true;
      if (s.status === 'ended') sfx.play('ui2', { volume: 0.6 });
      else sfx.play(s.status === 'victory' ? 'victory' : 'defeat', { volume: 0.8, vary: 0 });
    }
  }

  /** 스토리를 띄울 때인지 본다: 처음 시작(인트로), 새 구역에 처음 들어섰을 때, 흑룡이 깨어났을 때, 승리했을 때(엔딩) */
  private updateStory(s: Snapshot) {
    if (this.session.skipStory) return;
    if (!this.storyStarted) {
      this.storyStarted = true;
      this.story.play(STORY_INTRO, true);
    }
    while (this.storyZone < s.zone && this.storyZone < STORY_ZONES.length) {
      this.story.play(STORY_ZONES[this.storyZone]);
      this.storyZone++;
    }
    if (s.boss && !this.storyBoss) {
      this.storyBoss = true;
      this.story.play(STORY_BOSS);
    }
    if (s.status === 'victory' && !this.endingDone && !this.endingStarted) {
      this.endingStarted = true;
      this.story.play(STORY_ENDING, true, () => (this.endingDone = true));
    }
  }

  private endingStarted = false;

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
    return this.shopPanel.openId !== null || this.forgePanel.openId !== null || this.charMenu.isOpen || this.story.isOpen;
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
   * 각도가 많이 벌어진 적일수록 덜 고르고, 벽 너머의 적은 고르지 않는다. 없으면 null.
   * (궁수 화살은 쏠 때 sim이 한 번 더 자동 조준한다 — CLASSES.elf.attack.assist)
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
      if (score < bestScore && lineOfSight(this.level, me.x, me.y, e.x, e.y)) {
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
    // 개발용: ] 레벨 올리기, [ 내리기 (Shift와 함께 누르면 5씩). 게임을 계산하는 방장·혼자 하기에서만
    const mine = import.meta.env.DEV ? this.sim?.players.find((p) => p.id === this.session.myId) : undefined;
    if (mine) {
      const step = k.SHIFT.isDown ? 5 : 1;
      if (Phaser.Input.Keyboard.JustDown(k.CLOSED_BRACKET)) this.sim!.setLevel(mine.id, mine.level + step);
      if (Phaser.Input.Keyboard.JustDown(k.OPEN_BRACKET)) this.sim!.setLevel(mine.id, mine.level - step);
    }
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
      this.forgePanel.close();
      menu.toggle();
    } else if (menu.isOpen && backPressed) menu.close();
    if (menu.isOpen) {
      if (!me) return menu.close();
      if (dpad.x || dpad.y) menu.navigate(dpad.x, dpad.y);
      if (pad.pressed(BTN.A)) menu.confirm();
      if (pad.pressed(BTN.X) || just(this.keys.DELETE)) menu.drop();
      menu.update(me, this.device);
      return;
    }

    // 상점
    const near = this.nearShop(s);
    const itemUnderFoot = me && s.drops.some((d) => d.kind === 'item' && Math.hypot(d.x - me.x, d.y - me.y) < 36);
    const interact = just(this.keys.E) || just(this.keys.F) || pad.pressed(BTN.LT) || !!this.touch?.consume('interact');
    // 대장간
    const forge = this.forgePanel;
    if (forge.openId !== null) {
      const shop = s.shops.find((sh) => sh.id === forge.openId);
      if (!shop || !me || me.dead || Math.hypot(shop.x - me.x, shop.y - me.y) > SHOP.range + 30 || interact || backPressed) {
        forge.close();
        return;
      }
      if (dpad.y) forge.navigate(dpad.y);
      if (pad.pressed(BTN.A)) forge.toggleCursor();
      if (pad.pressed(BTN.X)) forge.submit(false);
      if (pad.pressed(BTN.Y)) forge.submit(true);
      forge.update(shop, me, this.device);
      return;
    }
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
      if (near.type === 'forge') forge.open(near.id);
      else shopPanel.open(near.id);
    }
  }

  /** 아이템 상자 칸 클릭: 음식은 먹고, 장비는 내려놓는다 */
  private useSlot(idx: number) {
    if (this.sim) this.sim.useSlot(this.session.myId, idx);
    else this.session.client!.send({ t: 'slot', idx });
  }

  /** 장비를 상자 ↔ 가방으로 */
  private moveItem(from: 'inv' | 'bag', idx: number) {
    if (this.sim) this.sim.moveItem(this.session.myId, from, idx);
    else this.session.client!.send({ t: 'move', from, idx });
  }

  private dropItem(from: 'inv' | 'bag', idx: number) {
    if (this.sim) this.sim.dropItem(this.session.myId, from, idx);
    else this.session.client!.send({ t: 'dropItem', from, idx });
  }

  private forge(picks: { from: 'inv' | 'bag'; idx: number }[], random: boolean) {
    const id = this.forgePanel.openId;
    if (id === null) return;
    if (this.sim) this.sim.forge(this.session.myId, id, picks, random);
    else this.session.client!.send({ t: 'forge', shop: id, picks, random });
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
        label.setText(e.shielded ? `${e.elite} · 보호막` : e.elite).setColor(e.shielded ? '#c8a0ff' : '#ffd060').setPosition(sx, top - 10).setVisible(true);
      } else if (e.tomb) {
        // 묘비: 보랏빛 체력바를 늘 보여준다 (부숴야 할 목표)
        g.fillStyle(0x000000, 0.7).fillRect(sx - 26, top - 6, 52, 6);
        g.fillStyle(0xa060ff, 1).fillRect(sx - 26, top - 6, (52 * e.hp) / e.maxHp, 6);
        g.lineStyle(1, 0xd0b0ff, 0.9).strokeRect(sx - 26, top - 6, 52, 6);
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
      const name = SHOP_TYPES[sh.type].name;
      t.setColor(`#${SHOP_TYPES[sh.type].color.toString(16).padStart(6, '0')}`);
      t.setText(near?.id === i && !open ? `${name}\n[${this.device === 'pad' ? 'LT' : this.device === 'touch' ? '줍기' : 'E'}] 열기` : name).setAlign('center')
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
