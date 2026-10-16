// 게임 이벤트 연출: 떠오르는 숫자, 배너, 공격 범위, 끝 화면 (스킬·폭발의 3D 효과는 SkillFx)
import Phaser from 'phaser';
import { CLASSES, POINTS_PER_LEVEL, RARITY, VIEW_H, VIEW_W, itemName } from '../game/data';
import type { GameEvent, Player, Snapshot } from '../game/types';
import { downloadResultImage, dungeonSummary, playTime } from './resultImage';
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
        if (e.dot) {
          // 화염·출혈 지속 피해: 작은 주황·빨간 숫자
          this.floatText(p.x + 14, p.y + 6, String(e.v), e.dot === 'burn' ? '#ff9a40' : '#ff4a5a', 12);
          break;
        }
        if (e.crit && !e.toPlayer) {
          // 치명타: 큰 주황 숫자가 튀어나오고 위에 '치명타!', 맞은 자리에 불꽃
          this.popText(p.x, p.y - 4, String(e.v), '#ffb020', 26, 900);
          this.popText(p.x, p.y - 30, '치명타!', '#ffe060', 15, 800);
          w.fx.critSpark(e.x, e.y);
        } else this.floatText(p.x, p.y, String(e.v), e.toPlayer ? '#ff5050' : '#ffffff', 15);
        break;
      }
      case 'proc':
        w.fx.procHit(e.effect, e.x, e.y);
        break;
      case 'warp':
        w.fx.warp(e.x, e.y);
        break;
      case 'undying': {
        // 불사: 보랏빛 '불사!'와 솟구치는 불꽃
        const p = at(e.x, e.y, 60);
        this.popText(p.x, p.y, '불사!', '#d0a0ff', 22, 900);
        w.fx.undying(e.x, e.y);
        break;
      }
      case 'block': {
        // 절대방어: 금빛 '절대방어!'가 튀어나오고 몸 앞에 방패 빛
        const p = at(e.x, e.y, 60);
        this.popText(p.x, p.y, '절대방어!', '#ffd860', 20, 800);
        w.fx.aegis(e.x, e.y);
        break;
      }
      case 'dodge': {
        // 회피: 하늘색 '회피!'가 튀어나오고 몸 주위에 바람 고리
        const p = at(e.x, e.y, 60);
        this.popText(p.x, p.y, '회피!', '#80e8ff', 20, 800);
        w.fx.dodgeWisp(e.x, e.y);
        break;
      }
      case 'forged': {
        const pos = playerPos(e.pid);
        if (!pos) break;
        const name = itemName(e.item, pos.p.cls);
        this.floatText(pos.x, pos.y - 10, `${e.recipe ? '조합 성공!' : '랜덤 조합!'} [${RARITY[e.item.rarity].name}] ${name}`, RARITY[e.item.rarity].color, 17, 1800);
        break;
      }
      case 'heal': {
        const p = at(e.x, e.y);
        this.floatText(p.x, p.y, `+${e.v}`, '#60ff80', e.passive ? 12 : 15); // 패시브 흡혈은 작게
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
        this.floatText(p.x + 20, p.y, `+${e.v} MP`, '#80a8ff', e.passive ? 12 : 14);
        break;
      }
      case 'boom':
        w.fx.boom(e.x, e.y, e.r, e.kind);
        if (e.shake) this.scene.cameras.main.shake(e.kind === 'meteor' ? 220 : 150, e.kind === 'meteor' ? 0.008 : 0.006);
        break;
      case 'swing':
        this.swingArc(e.x, e.y, e.aim, e.range, e.arc, e.enemy ? 0xff5040 : 0xffffff);
        if (!e.enemy) {
          // 플레이어 근접 공격은 공중에 칼자국 (선혈의 검은 핏빛, 대지 분쇄 도끼는 흙빛)
          w.fx.slash(e.x, e.y, e.aim, e.range, e.arc, e.look === 'bleed' ? 0xff2a3a : e.look === 'quake' ? 0xe0a050 : 0xdff0ff);
          if (e.look) w.fx.slashFx(e.x, e.y, e.aim, e.range, e.look);
        }
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

  /** 튀어나오는 글자: 크게 시작해 제 크기로 줄어든 뒤 떠오르며 사라진다 (치명타·회피처럼 눈에 띄어야 하는 것) */
  popText(x: number, y: number, str: string, color: string, size: number, duration = 800) {
    const t = makeText(this.scene, x, y, str, size).setOrigin(0.5).setColor(color).setStroke('#000', 5).setDepth(DEPTH_FLOAT + 1).setScale(1.8);
    this.scene.tweens.add({ targets: t, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 46, alpha: 0, delay: 220, duration: duration - 220, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
  }

  floatText(x: number, y: number, str: string, color: string, size: number, duration = 800) {
    const t = makeText(this.scene, x, y, str, size).setOrigin(0.5).setColor(color).setStroke('#000', 4).setDepth(DEPTH_FLOAT);
    this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  /** 떠 있는 배너 글자 (결과 화면이 뜨면 지운다) */
  private banners = new Set<Phaser.GameObjects.Text>();

  banner(title: string, sub?: string) {
    if (this.endShown) return; // 결과 화면 위에는 배너를 띄우지 않는다
    const items: Phaser.GameObjects.Text[] = [];
    if (title) items.push(makeText(this.scene, VIEW_W / 2, 190, title, 44).setOrigin(0.5).setStroke('#000', 6));
    if (sub) items.push(makeText(this.scene, VIEW_W / 2, title ? 240 : 200, sub, 20).setOrigin(0.5).setStroke('#000', 4));
    for (const t of items) {
      t.setDepth(120).setAlpha(0);
      this.banners.add(t);
      this.scene.tweens.add({ targets: t, alpha: 1, duration: 300, yoyo: true, hold: 1600, onComplete: () => (this.banners.delete(t), t.destroy()) });
    }
  }

  /**
   * 결과 화면 (승리·전멸·도중에 끝냄). onBack이 있으면 그 버튼으로 돌아간다 (방장·혼자는 로비, 혼자 끝난 참가자는 메뉴). note: 제목 아래 한 줄 설명
   * 위에 걸린 시간·처치 수·던전 결과, 아래에 사람마다 기록(처치·준 피해·받은 피해·쓰러짐·부활·경험치·돈)과 착용 장비.
   */
  showEnd(s: Snapshot, onBack: (() => void) | null, note = '', backLabel = '로비로 돌아가기 (처음부터 다시)') {
    if (this.endShown) return;
    this.endShown = true;
    for (const t of this.banners) t.destroy();
    this.banners.clear();
    const sc = this.scene;
    const win = s.status === 'victory';
    const D = 200;
    const g = sc.add.graphics().setDepth(D);
    g.fillStyle(0x000000, 0.82).fillRect(0, 0, VIEW_W, VIEW_H);
    const text = (x: number, y: number, str: string, size: number, color = '#ffffff') => makeText(sc, x, y, str, size).setDepth(D + 1).setColor(color);
    const ended = s.status === 'ended';
    text(VIEW_W / 2, 44, win ? '승리!' : ended ? '게임 종료' : '전멸...', 40, win ? '#ffd040' : ended ? '#c8d0e0' : '#ff6060').setOrigin(0.5);
    if (note) text(VIEW_W / 2, 66, note, 12, '#8d9ab3').setOrigin(0.5, 0);

    // 전체 요약
    const time = playTime(s.tick);
    const kills = s.players.reduce((n, p) => n + p.kills, 0);
    const dg = dungeonSummary(s);
    text(VIEW_W / 2, 92, [`${win ? '클리어 시간' : '플레이 시간'} ${time}`, `처치 ${kills.toLocaleString()}마리`, `${win ? '흑룡 처치' : `${s.zone}구역까지`}`, dg].filter(Boolean).join('   ·   '), 15, '#d8e4ff').setOrigin(0.5);

    // 사람마다 기록 표
    const cols: { key: string; x: number; v: (p: Player) => string }[] = [
      { key: '처치', x: 330, v: (p) => p.kills.toLocaleString() },
      { key: '중간보스', x: 405, v: (p) => String(p.record.eliteKills) },
      { key: '준 피해', x: 505, v: (p) => p.record.dmg.toLocaleString() },
      { key: '받은 피해', x: 600, v: (p) => p.record.taken.toLocaleString() },
      { key: '쓰러짐', x: 660, v: (p) => String(p.record.downs) },
      { key: '부활', x: 710, v: (p) => String(p.record.revives) },
      { key: '경험치', x: 805, v: (p) => p.record.xp.toLocaleString() },
      { key: '돈', x: 900, v: (p) => `${p.record.gold.toLocaleString()} G` },
    ];
    const top = 112;
    for (const c of cols) text(c.x, top, c.key, 12, '#8d9ab3').setOrigin(1, 0);
    const best = Math.max(...s.players.map((p) => p.record.dmg));
    const rowH = Math.min(92, (VIEW_H - top - 104) / Math.max(1, s.players.length)); // 아래에 버튼 줄
    s.players.forEach((p, i) => {
      const y = top + 22 + i * rowH;
      g.fillStyle(0xffffff, i % 2 ? 0.03 : 0.07).fillRoundedRect(36, y - 6, VIEW_W - 72, rowH - 6, 6);
      const def = CLASSES[p.cls];
      text(48, y, `${def.race} ${def.name}  ${p.name}${p.record.dmg === best && best > 0 && s.players.length > 1 ? '  ★' : ''}`, 15, hex(def.color)).setOrigin(0, 0);
      text(48, y + 20, `Lv.${p.level}`, 13, '#ffd040').setOrigin(0, 0);
      for (const c of cols) text(c.x, y + 2, c.v(p), 14).setOrigin(1, 0);
      // 착용 장비 (등급 색) + 가방
      let x = 110;
      const iy = y + 22;
      const items = p.inv.flatMap((sl) => (sl?.kind === 'item' ? [sl.item] : []));
      const bag = p.bag.filter(Boolean).length;
      for (const it of items) {
        const t = text(x, iy, itemName(it, p.cls), 12, RARITY[it.rarity].color).setOrigin(0, 0);
        x += t.width + 12;
        if (x > VIEW_W - 140) {
          t.setText('…');
          break;
        }
      }
      if (!items.length) text(x, iy, '착용 장비 없음', 12, '#667788').setOrigin(0, 0);
      if (bag) text(VIEW_W - 48, iy, `가방 ${bag}개`, 12, '#8d9ab3').setOrigin(1, 0);
    });

    // 버튼: 결과 이미지 저장
    const button = (x: number, label: string, onClick: (b: Phaser.GameObjects.Text) => void) => {
      const b = text(x, VIEW_H - 64, label, 15, '#ffffff').setOrigin(0.5).setPadding(14, 6, 14, 6).setBackgroundColor('#2a3a5a').setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => onClick(b));
      return b;
    };
    button(VIEW_W / 2, '📷 결과 이미지 저장', (b) => {
      b.setText('이미지 만드는 중...');
      downloadResultImage(s, this.myId).then(() => b.setText('📷 결과 이미지 저장')).catch(() => b.setText('저장하지 못했어요'));
    });
    if (s.players.length > 1) text(VIEW_W - 40, VIEW_H - 52, '★ 가장 많은 피해', 11, '#8d9ab3').setOrigin(1, 0);

    const msg = onBack ? `클릭 또는 Enter: ${backLabel}` : '방장이 로비로 돌아가기를 기다리는 중...';
    const btn = text(VIEW_W / 2, VIEW_H - 26, msg, 17, '#a0d0ff').setOrigin(0.5);
    if (onBack) btn.setInteractive({ useHandCursor: true }).on('pointerdown', onBack);
  }

  get ended() {
    return this.endShown;
  }
}
