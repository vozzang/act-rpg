// 맵 편집기의 3D 보기: 편집 중인 맵을 게임과 같은 3D 화면으로 둘러본다 (플레이 없이 카메라만 자유롭게).
// 몬스터는 놓인 자리에 가만히 서 있고, 문은 닫혀 있다. 열 때마다 지금 맵으로 새로 만든다.
import { ELITES, ENEMIES, GATE_KEEPERS, TILE } from '../game/data';
import { levelFromMap, type MapFile } from '../game/mapfile';
import type { EnemyView, Snapshot } from '../game/types';
import { World3D } from '../render/World3D';

const MIN_DIST = 6, MAX_DIST = 60, DEFAULT_DIST = 16;
const SHOW_RADIUS = 30; // 카메라에서 이만큼(타일 × 거리 배율) 안의 몬스터만 그린다 (수백 마리를 다 움직이면 무겁다)

export class View3D {
  private world: World3D | null = null;
  private host: HTMLDivElement;
  private surface: HTMLCanvasElement; // World3D가 자리·크기를 맞추는 기준 (입력도 여기서 받는다)
  private enemies: EnemyView[] = [];
  private raf = 0;
  private last = 0;
  private keys = new Set<string>();
  private drag: { x: number; y: number; cx: number; cy: number } | null = null;
  private dist = DEFAULT_DIST;
  private bounds = { w: 0, h: 0 }; // 맵 크기 (월드 px). 카메라가 맵 밖 허공을 보지 않게 한다
  private snap: Snapshot = {
    tick: 0, zone: 1, status: 'playing', players: [], enemies: [], projectiles: [], drops: [], shops: [], events: [], boss: null, gates: [], dungeons: [],
  };
  isOpen = false;

  constructor(parent: HTMLElement, private status: (text: string) => void) {
    this.host = document.createElement('div');
    this.host.style.cssText = 'position:absolute;inset:0;display:none;background:#000';
    this.surface = document.createElement('canvas');
    this.surface.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;cursor:grab';
    this.host.appendChild(this.surface);
    parent.appendChild(this.host);

    this.surface.addEventListener('mousedown', (e) => {
      if (!this.world) return;
      const c = this.world.lookAtPx;
      this.drag = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y };
      this.surface.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag || !this.world) return;
      // 끈 만큼 지도를 끌어당긴다 (화면 1px ≈ 거리에 비례한 월드 크기)
      const k = (this.dist / DEFAULT_DIST) * 1.6;
      this.look(this.drag.cx - (e.clientX - this.drag.x) * k, this.drag.cy - (e.clientY - this.drag.y) * k * 1.3);
    });
    window.addEventListener('mouseup', () => {
      this.drag = null;
      this.surface.style.cursor = 'grab';
    });
    this.surface.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.world) return;
      if (e.ctrlKey || e.metaKey) this.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12);
      else {
        const c = this.world.lookAtPx;
        const k = this.dist / DEFAULT_DIST;
        const [dx, dy] = e.shiftKey && !e.deltaX ? [e.deltaY, 0] : [e.deltaX, e.deltaY];
        this.look(c.x + dx * k * 1.2, c.y + dy * k * 1.2);
      }
    }, { passive: false });
    window.addEventListener('keydown', (e) => this.isOpen && this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', () => this.fit());
  }

  /** 지금 맵을 3D로 만들고 (tx, ty) 타일 근처를 보여준다 */
  async open(m: MapFile, tx: number, ty: number) {
    this.close();
    this.isOpen = true;
    this.host.style.display = 'block';
    this.status('3D 화면을 만드는 중…');
    const level = levelFromMap(m);
    const world = new World3D(this.surface, level);
    this.world = world;
    world.freeCamera = true;
    world.setCamDist(this.dist);
    this.fit();
    this.bounds = { w: level.w * TILE, h: level.h * TILE };
    this.look((tx + 0.5) * TILE, (ty + 0.5) * TILE);
    // 몬스터: 놓인 자리에 서서 카메라 쪽(아래)을 본다
    this.enemies = level.spawns.map((s, i) => {
      const elite = s.gate !== undefined ? GATE_KEEPERS[s.gate].name : s.elite !== undefined ? ELITES[s.zone - 1][s.elite].name : null;
      const hp = ENEMIES[s.kind].hp;
      return {
        id: i + 1, kind: s.kind, elite, x: s.x, y: s.y, r: ENEMIES[s.kind].r, aim: Math.PI / 2, hp, maxHp: hp,
        hurt: 0, stun: 0, slow: 0, taunt: 0, state: 'move', timer: 0, z: 0, tx: 0, ty: 0,
      } as EnemyView;
    });
    this.snap.gates = level.gates.map(() => false);
    await world.load();
    if (this.world !== world) return; // 만드는 동안 닫았거나 다시 열었다
    this.status('');
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.world !== world) return;
      this.step(Math.min(0.1, (now - this.last) / 1000));
      this.last = now;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 닫는다. 3D에서 보던 곳(타일)을 돌려준다 (2D 편집기를 그 자리로 옮기려고) */
  close(): { x: number; y: number } | null {
    cancelAnimationFrame(this.raf);
    const at = this.world ? { x: this.world.lookAtPx.x / TILE, y: this.world.lookAtPx.y / TILE } : null;
    this.world?.destroy();
    this.world = null;
    this.isOpen = false;
    this.host.style.display = 'none';
    this.keys.clear();
    return at;
  }

  /** 카메라가 (x, y) 월드 px를 보게 한다. 맵 가장자리 너머로는 가지 않는다 */
  private look(x: number, y: number) {
    const my = Math.min(this.bounds.h / 2, 4 * TILE);
    this.world?.lookAtWorld(Math.max(0, Math.min(this.bounds.w, x)), Math.max(my, Math.min(this.bounds.h - my, y)));
  }

  private zoom(f: number) {
    this.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, this.dist * f));
    this.world?.setCamDist(this.dist);
  }

  private fit() {
    if (!this.world) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.world.setViewport(Math.max(1, w * Math.min(2, devicePixelRatio)), Math.max(1, h * Math.min(2, devicePixelRatio)));
  }

  private step(dt: number) {
    const world = this.world!;
    // WASD·방향키로 이동, +/- (또는 Q/E)로 확대·축소
    const k = this.dist / DEFAULT_DIST;
    const speed = 700 * k * (this.keys.has('shift') ? 2.5 : 1);
    let dx = 0, dy = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx--;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx++;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy--;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy++;
    const c = world.lookAtPx;
    if (dx || dy) this.look(c.x + dx * speed * dt, c.y + dy * speed * dt);
    if (this.keys.has('=') || this.keys.has('+') || this.keys.has('e')) this.zoom(1 - dt * 1.5);
    if (this.keys.has('-') || this.keys.has('q')) this.zoom(1 + dt * 1.5);

    const r = SHOW_RADIUS * TILE * Math.max(1, k);
    this.snap.enemies = this.enemies.filter((e) => Math.abs(e.x - c.x) < r * 1.4 && Math.abs(e.y - c.y) < r);
    world.update(this.snap, '', dt);
    this.status(`3D 보기 · (${Math.floor(c.x / TILE)}, ${Math.floor(c.y / TILE)}) · 끌기/휠/WASD 이동 · Ctrl+휠·Q/E 확대 · Tab·Esc 2D로`);
  }
}
