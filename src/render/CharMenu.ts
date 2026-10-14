// 캐릭터 메뉴: 능력치 배분과 아이템 상자 관리. 게임패드(Menu 버튼)로 쓰기 위해 만들었고, 키보드 I로도 열린다.
// 방향패드로 고르고 A로 실행, B로 닫는다. 마우스로 줄을 클릭해도 된다. 온라인이라 게임은 멈추지 않는다.
import Phaser from 'phaser';
import { ATTR_DESC, ATTR_KEYS, ATTR_NAMES, CLASSES, FOOD, INV_SIZE, RARITY, VIEW_W, itemName, itemStatText } from '../game/data';
import type { AttrKey, InvSlot, Player } from '../game/types';
import type { Device } from './Hud';
import { makeText } from './ui';

const W = 620;
const H = 330;
const X = (VIEW_W - W) / 2;
const Y = 96;
const LEFT_W = 250;
const STAT_ROW = 46;
const INV_ROW = 34;
const DEPTH = 145;

export class CharMenu {
  private open = false;
  /** 마우스가 창 위에 있으면 클릭해도 공격하지 않는다 */
  pointerOver = false;
  private col: 0 | 1 = 1; // 0: 능력치, 1: 아이템 상자
  private row = 0;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private statTitle: Phaser.GameObjects.Text;
  private invTitle: Phaser.GameObjects.Text;
  private statRows: { name: Phaser.GameObjects.Text; desc: Phaser.GameObjects.Text }[] = [];
  private invRows: Phaser.GameObjects.Text[] = [];
  private detail: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;
  private zones: Phaser.GameObjects.Zone[] = [];

  constructor(scene: Phaser.Scene, private onAllocate: (attr: AttrKey) => void, private onSlot: (idx: number) => void) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    const t = (x: number, y: number, size: number) => {
      const txt = makeText(scene, x, y, '', size).setDepth(DEPTH + 1);
      this.texts.push(txt);
      return txt;
    };
    this.statTitle = t(X + 18, Y + 14, 16);
    this.invTitle = t(X + LEFT_W + 34, Y + 14, 16);
    ATTR_KEYS.forEach((_, i) => {
      const y = Y + 46 + i * STAT_ROW;
      this.statRows.push({ name: t(X + 26, y + 6, 15), desc: t(X + 26, y + 26, 11) });
      this.zones.push(this.zone(scene, X + 12, y, LEFT_W - 12, STAT_ROW - 4, 0, i));
    });
    for (let i = 0; i < INV_SIZE; i++) {
      const y = Y + 46 + i * INV_ROW;
      this.invRows.push(t(X + LEFT_W + 40, y + 8, 13));
      this.zones.push(this.zone(scene, X + LEFT_W + 28, y, W - LEFT_W - 40, INV_ROW - 4, 1, i));
    }
    this.detail = t(X + 18, Y + H - 52, 12).setWordWrapWidth(W - 36);
    this.footer = t(X + W / 2, Y + H - 16, 12).setOrigin(0.5).setAlpha(0.7);
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerOver = this.open && p.x >= X && p.x <= X + W && p.y >= Y && p.y <= Y + H;
    });
    this.setVisible(false);
  }

  private zone(scene: Phaser.Scene, x: number, y: number, w: number, h: number, col: 0 | 1, row: number) {
    return scene.add.zone(x, y, w, h).setOrigin(0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.col = col;
        this.row = row;
        this.confirm();
      });
  }

  get isOpen() {
    return this.open;
  }

  toggle() {
    this.open = !this.open;
    if (!this.open) this.pointerOver = false;
    this.setVisible(this.open);
  }

  close() {
    if (this.open) this.toggle();
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    for (const t of this.texts) t.setVisible(v);
    for (const z of this.zones) (v ? z.setInteractive() : z.disableInteractive());
  }

  /** 방향패드: 위·아래로 줄, 좌·우로 칸(능력치 ↔ 아이템 상자) 이동 */
  navigate(dx: number, dy: number) {
    if (dx) {
      this.col = dx < 0 ? 0 : 1;
      this.row = Math.min(this.row, this.rowCount - 1);
    }
    if (dy) this.row = (this.row + dy + this.rowCount) % this.rowCount;
  }

  private get rowCount() {
    return this.col === 0 ? ATTR_KEYS.length : INV_SIZE;
  }

  /** A 버튼 / 클릭: 능력치는 포인트 배분, 상자 칸은 음식 먹기·장비 내려놓기 */
  confirm() {
    if (this.col === 0) this.onAllocate(ATTR_KEYS[this.row]);
    else this.onSlot(this.row);
  }

  update(me: Player, device: Device) {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0d1420, 0.94).fillRoundedRect(X, Y, W, H, 10);
    g.lineStyle(2, 0x8fb4ff, 0.8).strokeRoundedRect(X, Y, W, H, 10);
    g.lineStyle(1, 0xffffff, 0.15).lineBetween(X + LEFT_W + 16, Y + 16, X + LEFT_W + 16, Y + H - 64);

    // 능력치
    const main = CLASSES[me.cls].mainAttr;
    this.statTitle.setText(`능력치   남은 포인트 ${me.points}`).setColor(me.points > 0 ? '#ffd040' : '#ffffff');
    ATTR_KEYS.forEach((k, i) => {
      const y = Y + 46 + i * STAT_ROW;
      const sel = this.col === 0 && this.row === i;
      if (sel) g.fillStyle(0xffffff, 0.12).fillRoundedRect(X + 12, y, LEFT_W - 12, STAT_ROW - 4, 6);
      this.statRows[i].name.setText(`${k === main ? '★' : ''}${ATTR_NAMES[k]} ${me.attrs[k]}${me.points > 0 ? '   +' : ''}`);
      this.statRows[i].desc.setText(ATTR_DESC[k]).setAlpha(0.7);
    });

    // 아이템 상자
    this.invTitle.setText(`아이템 상자   ${me.inv.filter(Boolean).length}/${INV_SIZE}`);
    me.inv.forEach((sl, i) => {
      const y = Y + 46 + i * INV_ROW;
      const sel = this.col === 1 && this.row === i;
      if (sel) g.fillStyle(0xffffff, 0.12).fillRoundedRect(X + LEFT_W + 28, y, W - LEFT_W - 40, INV_ROW - 4, 6);
      const { text, color } = slotLine(sl, me);
      this.invRows[i].setText(text).setColor(color);
    });

    this.detail.setText(this.detailText(me));
    this.footer.setText(device === 'pad'
      ? '방향패드: 고르기     A: 실행     B · Menu: 닫기     (왼쪽 스틱 이동은 그대로 된다)'
      : device === 'touch' ? '줄을 눌러 실행     메뉴 버튼: 닫기' : '클릭: 실행     I · Esc: 닫기');
  }

  private detailText(me: Player): string {
    if (this.col === 0) {
      const k = ATTR_KEYS[this.row];
      return me.points > 0 ? `A: ${ATTR_NAMES[k]}에 포인트 1 배분 — ${ATTR_DESC[k]}` : `레벨이 오르면 포인트를 받는다 — ${ATTR_NAMES[k]}: ${ATTR_DESC[k]}`;
    }
    const sl = me.inv[this.row];
    if (!sl) return '빈 칸';
    if (sl.kind === 'item') return `A: 내려놓기 (능력치에서 빠진다) — ${itemStatText(sl.item)}`;
    const hp = sl.kind === 'hpFood';
    return `A: 먹기 — ${hp ? 'HP' : 'MP'} ${Math.round((hp ? FOOD.hp : FOOD.mp) * 100)}% 회복 (최대 ${FOOD.stackMax}개)`;
  }
}

function slotLine(sl: InvSlot | null, me: Player): { text: string; color: string } {
  if (!sl) return { text: '(빈 칸)', color: '#556677' };
  if (sl.kind !== 'item') {
    const hp = sl.kind === 'hpFood';
    return { text: `${hp ? 'HP' : 'MP'} 회복 음식 ×${sl.count}`, color: hp ? '#ff8090' : '#8fb4ff' };
  }
  const it = sl.item;
  return { text: `[${RARITY[it.rarity].name}] ${itemName(it, me.cls)}   ${itemStatText(it)}`, color: RARITY[it.rarity].color };
}
