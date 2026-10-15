// 게임 이벤트 연출: 떠오르는 숫자, 배너, 공격 범위, 끝 화면 (스킬·폭발의 3D 효과는 SkillFx)
import Phaser from 'phaser';
import { CLASSES, POINTS_PER_LEVEL, RARITY, VIEW_H, VIEW_W, itemName } from '../game/data';
import type { GameEvent, Player, Snapshot } from '../game/types';
import { hex, makeText } from './ui';
import type { World3D } from './World3D';

const DEPTH_GROUND = 9; // 바닥 효과 (월드 위, 글자 아래)
const DEPTH_FLOAT = 40;

export class Effects {
  private endShown = false;

  constructor(private scene: Phaser.Scene, private world: World3D, private myId: string) {}

  play(e: GameEvent, s: Snapshot, me: Player | undefined) {
    const w = this.world;
    const playerPos = (pid: string) => {
      const p = s.players.find((p) => p.id === pid);
      if (!p) return null;
      const { sx, sy } = w.toScreen(p.x, p.y);
      return { x: sx, y: sy - w.heightPx(CLASSES[p.cls].height + 18), p };
    };
    const at = (x: number, y: number, lift = 50) => {
      const { sx, sy } = w.toScreen(x, y);
      return { x: sx, y: sy - w.heightPx(lift) };
    };

    switch (e.t) {
      case 'dmg': {
        const p = at(e.x, e.y);
        this.floatText(p.x, p.y, String(e.v), e.toPlayer ? '#ff5050' : e.crit ? '#ffe040' : '#ffffff', e.crit ? 20 : 15);
        break;
      }
      case 'dodge': {
        const p = at(e.x, e.y);
        this.floatText(p.x, p.y, '회피!', '#a0e8ff', 15, 600);
        break;
      }
      case 'heal': {
        const p = at(e.x, e.y);
        this.floatText(p.x, p.y, `+${e.v}`, '#60ff80', 15);
        break;
      }
      case 'gold': {
        if (e.pid !== this.myId) break; // 남이 주운 돈은 표시하지 않는다
        const p = at(e.x, e.y, 70);
        this.floatText(p.x, p.y, `+${e.v} G`, '#ffd040', 15, 700);
        break;
      }
      case 'stash': {
        const pos = playerPos(e.pid);
        if (pos && e.pid === this.myId) this.floatText(pos.x, pos.y, `${e.kind === 'hpFood' ? 'HP' : 'MP'} 음식을 상자에 넣었다`, '#e0e0e0', 13, 900);
        break;
      }
      case 'bought': {
        const pos = playerPos(e.pid);
        if (!pos || e.entry.kind === 'item') break; // 장비는 'equip' 이벤트가 이름을 띄운다
        this.floatText(pos.x, pos.y, `${e.entry.kind === 'hpFood' ? 'HP' : 'MP'} 음식 구매`, '#ffd040', 14, 800);
        break;
      }
      case 'notice': {
        const pos = playerPos(e.pid);
        if (pos && e.pid === this.myId) this.floatText(pos.x, pos.y, e.text, '#ffb0a0', 15, 900);
        break;
      }
      case 'mana': {
        const p = at(e.x, e.y);
        this.floatText(p.x + 20, p.y, `+${e.v} MP`, '#80a8ff', 14);
        break;
      }
      case 'boom':
        w.fx.boom(e.x, e.y, e.r, e.kind);
        if (e.shake) this.scene.cameras.main.shake(e.kind === 'meteor' ? 220 : 150, e.kind === 'meteor' ? 0.008 : 0.006);
        break;
      case 'swing':
        this.swingArc(e.x, e.y, e.aim, e.range, e.arc, e.enemy ? 0xff5040 : 0xffffff);
        if (!e.enemy) w.fx.slash(e.x, e.y, e.aim, e.range, e.arc, 0xdff0ff); // 플레이어 근접 공격은 공중에 칼자국
        break;
      case 'levelup': {
        const pos = playerPos(e.pid);
        if (!pos) break;
        const mine = e.pid === this.myId ? `  (능력치 포인트 +${POINTS_PER_LEVEL})` : '';
        this.floatText(pos.x, pos.y - 10, `LEVEL UP! Lv.${e.level}${mine}`, '#ffd040', 18, 1600);
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
        const sk = CLASSES[pos.p.cls].skills[e.idx];
        const ultimate = e.idx === 3;
        this.floatText(pos.x, pos.y - 6, sk.name, ultimate ? '#ffb030' : hex(CLASSES[pos.p.cls].color), ultimate ? 20 : 15, 900);
        w.fx.skill(pos.p.cls, e.idx, e.x, e.y, e.aim ?? pos.p.aim, s.players, pos.p);
        break;
      }
      case 'unlock': {
        if (e.pid !== this.myId || !me) break;
        const sk = CLASSES[me.cls].skills[e.idx];
        this.banner(e.idx === 3 ? '최종 스킬 습득!' : '새 스킬 습득!', `${sk.name} — ${sk.desc}`);
        break;
      }
      case 'nomp': {
        const pos = playerPos(e.pid);
        if (pos && e.pid === this.myId) this.floatText(pos.x, pos.y, 'MP 부족', '#7090ff', 15, 600);
        break;
      }
    }
  }

  /** 근접 공격 범위를 바닥에 부채꼴로 잠깐 보여준다. */
  private swingArc(x: number, y: number, aim: number, range: number, arc: number, color: number) {
    const pts: Phaser.Math.Vector2[] = [];
    const c = this.world.toScreen(x, y);
    pts.push(new Phaser.Math.Vector2(c.sx, c.sy));
    for (let i = 0; i <= 10; i++) {
      const a = aim - arc + (2 * arc * i) / 10;
      const p = this.world.toScreen(x + Math.cos(a) * range, y + Math.sin(a) * range);
      pts.push(new Phaser.Math.Vector2(p.sx, p.sy));
    }
    const g = this.scene.add.graphics().setDepth(DEPTH_GROUND);
    g.fillStyle(color, 0.28).fillPoints(pts, true);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  floatText(x: number, y: number, str: string, color: string, size: number, duration = 800) {
    const t = makeText(this.scene, x, y, str, size).setOrigin(0.5).setColor(color).setStroke('#000', 4).setDepth(DEPTH_FLOAT);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  banner(title: string, sub?: string) {
    const items: Phaser.GameObjects.Text[] = [];
    if (title) items.push(makeText(this.scene, VIEW_W / 2, 190, title, 44).setOrigin(0.5).setStroke('#000', 6));
    if (sub) items.push(makeText(this.scene, VIEW_W / 2, title ? 240 : 200, sub, 20).setOrigin(0.5).setStroke('#000', 4));
    for (const t of items) {
      t.setDepth(120).setAlpha(0);
      this.scene.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1600, onComplete: () => t.destroy() });
    }
  }

  /** 승리/전멸 화면. 방장(또는 혼자)이면 onBack으로 로비에 돌아간다. */
  showEnd(s: Snapshot, onBack: (() => void) | null) {
    if (this.endShown) return;
    this.endShown = true;
    const win = s.status === 'victory';
    const g = this.scene.add.graphics().setDepth(200);
    g.fillStyle(0x000000, 0.75).fillRect(0, 0, VIEW_W, VIEW_H);
    makeText(this.scene, VIEW_W / 2, 130, win ? '승리!' : '전멸...', 52)
      .setOrigin(0.5).setDepth(201).setColor(win ? '#ffd040' : '#ff6060');
    const rows = s.players.map((p) => `${CLASSES[p.cls].race} ${CLASSES[p.cls].name}  ${p.name}   Lv.${p.level}   처치 ${p.kills}`);
    makeText(this.scene, VIEW_W / 2, 230, rows.join('\n'), 18).setOrigin(0.5, 0).setDepth(201).setLineSpacing(10).setAlign('center');
    const msg = onBack ? '클릭 또는 Enter: 로비로 돌아가기 (처음부터 다시)' : '방장이 로비로 돌아가기를 기다리는 중...';
    const btn = makeText(this.scene, VIEW_W / 2, 440, msg, 18).setOrigin(0.5).setDepth(201).setColor('#a0d0ff');
    if (onBack) btn.setInteractive({ useHandCursor: true }).on('pointerdown', onBack);
  }

  get ended() {
    return this.endShown;
  }
}
