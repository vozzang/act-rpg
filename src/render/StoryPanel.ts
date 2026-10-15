// 스토리 대화창: 화면 아래쪽 상자에 한 쪽씩 글자가 타자 치듯 나온다.
// 다음 쪽: 클릭·터치(창 위)·Enter·게임패드 A. 건너뛰기: 버튼·Esc·게임패드 B (그 장면 전체를 넘긴다).
// 장면이 여러 개 쌓이면 차례로 보여 준다. 끝나면 onDone을 부른다.
import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../game/data';
import type { StoryScene } from '../game/story';
import { makeText } from './ui';

const DEPTH = 190;
const BOX = { x: 60, y: VIEW_H - 232, w: VIEW_W - 120, h: 120 }; // 아래쪽 스킬 바·아이템 상자를 가리지 않는 높이
const CHARS_PER_SEC = 45;

type Queued = { scene: StoryScene; full: boolean; onDone?: () => void };

export class StoryPanel {
  private queue: Queued[] = [];
  private cur: Queued | null = null;
  private page = 0;
  private shown = 0; // 지금 쪽에서 보인 글자 수 (타자 효과)
  private g: Phaser.GameObjects.Graphics;
  private dim: Phaser.GameObjects.Graphics; // 인트로·엔딩처럼 화면 전체를 어둡게 하는 장면용
  private title: Phaser.GameObjects.Text;
  private speaker: Phaser.GameObjects.Text;
  private body: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private skipBtn: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;

  constructor(private scene: Phaser.Scene) {
    this.dim = scene.add.graphics().setDepth(DEPTH - 1);
    this.g = scene.add.graphics().setDepth(DEPTH);
    this.title = makeText(scene, BOX.x + 18, BOX.y - 26, '', 14).setDepth(DEPTH + 1).setColor('#ffd040').setStroke('#000', 4);
    this.speaker = makeText(scene, BOX.x + 22, BOX.y + 14, '', 16).setDepth(DEPTH + 1).setColor('#8fd0ff');
    this.body = makeText(scene, BOX.x + 22, BOX.y + 40, '', 17).setDepth(DEPTH + 1).setWordWrapWidth(BOX.w - 44).setLineSpacing(6);
    this.hint = makeText(scene, BOX.x + BOX.w - 16, BOX.y + BOX.h - 12, '', 12).setOrigin(1, 1).setDepth(DEPTH + 1).setAlpha(0.7);
    this.skipBtn = makeText(scene, BOX.x + BOX.w - 12, BOX.y - 10, '건너뛰기 ▶▶', 14).setOrigin(1, 1).setDepth(DEPTH + 2)
      .setColor('#e0e0e0').setStroke('#000', 4).setInteractive({ useHandCursor: true });
    this.skipBtn.on('pointerdown', (_p: unknown, _x: unknown, _y: unknown, e: Phaser.Types.Input.EventData) => {
      e?.stopPropagation();
      this.skip();
    });
    // 창 위를 누르면 다음 쪽 (창 밖은 게임 조작에 쓴다)
    this.zone = scene.add.zone(BOX.x, BOX.y, BOX.w, BOX.h).setOrigin(0).setDepth(DEPTH + 1).setInteractive({ useHandCursor: true });
    this.zone.on('pointerdown', () => this.next());
    this.setVisible(false);
  }

  /** 지금 보이는 장면·쪽 (효과음용, 닫혀 있으면 빈 글자) */
  get pageKey() {
    return this.cur ? `${this.cur.scene.title}:${this.page}` : '';
  }

  /** 열려 있는지 (조작을 막거나 혼자 할 때 게임을 멈추는 데 쓴다) */
  get isOpen() {
    return this.cur !== null;
  }

  /** 장면을 보여 준다. full이면 화면 전체를 어둡게(인트로·엔딩). 이미 보여 주는 중이면 뒤에 쌓인다 */
  play(scene: StoryScene, full = false, onDone?: () => void) {
    this.queue.push({ scene, full, onDone });
    if (!this.cur) this.advanceScene();
  }

  /** 다음 쪽 (글자가 아직 나오는 중이면 그 쪽을 한 번에 다 보여 준다) */
  next() {
    if (!this.cur) return;
    const line = this.cur.scene.lines[this.page];
    if (this.shown < line.text.length) {
      this.shown = line.text.length;
      return;
    }
    this.page++;
    this.shown = 0;
    if (this.page >= this.cur.scene.lines.length) this.finishScene();
  }

  /** 지금 장면을 통째로 넘긴다 */
  skip() {
    if (this.cur) this.finishScene();
  }

  private finishScene() {
    const done = this.cur?.onDone;
    this.cur = null;
    this.advanceScene();
    done?.();
  }

  private advanceScene() {
    this.cur = this.queue.shift() ?? null;
    this.page = 0;
    this.shown = 0;
    this.setVisible(!!this.cur);
  }

  private setVisible(v: boolean) {
    for (const o of [this.g, this.dim, this.title, this.speaker, this.body, this.hint, this.skipBtn]) o.setVisible(v);
    if (v) this.zone.setInteractive();
    else this.zone.disableInteractive();
  }

  update(dt: number, device: 'kbm' | 'pad' | 'touch') {
    if (!this.cur) return;
    const { scene, full } = this.cur;
    const line = scene.lines[this.page];
    this.shown = Math.min(line.text.length, this.shown + dt * CHARS_PER_SEC);
    const t = this.scene.time.now / 1000;

    this.dim.clear();
    if (full) this.dim.fillStyle(0x000000, 0.72).fillRect(0, 0, VIEW_W, VIEW_H);
    const g = this.g;
    g.clear();
    g.fillStyle(0x0b1018, 0.9).fillRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 10);
    g.lineStyle(2, 0xc8a050, 0.9).strokeRoundedRect(BOX.x, BOX.y, BOX.w, BOX.h, 10);

    this.title.setText(scene.title);
    this.speaker.setText(line.speaker ?? '');
    this.body.setY(line.speaker ? BOX.y + 40 : BOX.y + 26).setColor(line.speaker ? '#ffffff' : '#e8e0c8');
    this.body.setText(line.text.slice(0, Math.floor(this.shown)));
    const done = this.shown >= line.text.length;
    const key = device === 'pad' ? 'A' : device === 'touch' ? '터치' : 'Enter·클릭';
    const last = this.page === scene.lines.length - 1;
    this.hint.setText(done ? `${this.page + 1}/${scene.lines.length}   ${key}: ${last ? '닫기' : '다음'}${Math.floor(t * 2) % 2 ? ' ▼' : '  '}` : `${this.page + 1}/${scene.lines.length}`);
    this.skipBtn.setText(device === 'pad' ? '건너뛰기 (B)' : device === 'touch' ? '건너뛰기 ▶▶' : '건너뛰기 (Esc) ▶▶');
  }
}
