// 캐릭터 메뉴: 능력치 배분, 아이템 상자(착용 중 — 능력치에 더해진다), 가방(보관만). 게임패드 Menu 버튼, 키보드 I로 연다.
// 방향패드로 고르고 A로 실행, X로 버리기, B로 닫는다. 마우스는 줄 클릭 = 실행, 오른쪽 클릭 = 버리기. 터치는 줄을 누르고 [버리기] 버튼.
// 온라인이라 게임은 멈추지 않는다.
import Phaser from 'phaser';
import { ATTR_DESC, ATTR_KEYS, ATTR_NAMES, BAG_SIZE, CLASSES, FOOD, INV_SIZE, RARITY, VIEW_W, itemName, itemStatText } from '../game/data';
import type { AttrKey, InvSlot, Item, Player } from '../game/types';
import type { Device } from './Hud';
import { makeText } from './ui';

const W = 900;
const H = 330;
const X = (VIEW_W - W) / 2;
const Y = 96;
const LEFT_W = 230; // 능력치 칸 너비
const COL_W = (W - LEFT_W - 40) / 2; // 상자·가방 칸 너비
const STAT_ROW = 46;
const INV_ROW = 34;
const DEPTH = 145;

type Col = 0 | 1 | 2; // 0: 능력치, 1: 아이템 상자, 2: 가방
const colX = (c: 1 | 2) => X + LEFT_W + 24 + (c - 1) * (COL_W + 8);

export class CharMenu {
  private open = false;
  /** 마우스가 창 위에 있으면 클릭해도 공격하지 않는다 */
  pointerOver = false;
  private col: Col = 1;
  private row = 0;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private statTitle: Phaser.GameObjects.Text;
  private invTitle: Phaser.GameObjects.Text;
  private bagTitle: Phaser.GameObjects.Text;
  private statRows: { name: Phaser.GameObjects.Text; desc: Phaser.GameObjects.Text }[] = [];
  private invRows: Phaser.GameObjects.Text[] = [];
  private bagRows: Phaser.GameObjects.Text[] = [];
  private detail: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;
  private dropBtn: Phaser.GameObjects.Text;
  private zones: Phaser.GameObjects.Zone[] = [];

  constructor(
    scene: Phaser.Scene,
    private onAllocate: (attr: AttrKey) => void,
    private onSlot: (idx: number) => void,
    private onMove: (from: 'inv' | 'bag', idx: number) => void,
    private onDrop: (from: 'inv' | 'bag', idx: number) => void,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    const t = (x: number, y: number, size: number) => {
      const txt = makeText(scene, x, y, '', size).setDepth(DEPTH + 1);
      this.texts.push(txt);
      return txt;
    };
    this.statTitle = t(X + 18, Y + 14, 16);
    this.invTitle = t(colX(1) + 6, Y + 14, 16);
    this.bagTitle = t(colX(2) + 6, Y + 14, 16);
    ATTR_KEYS.forEach((_, i) => {
      const y = Y + 46 + i * STAT_ROW;
      this.statRows.push({ name: t(X + 26, y + 6, 15), desc: t(X + 26, y + 26, 11) });
      this.zones.push(this.zone(scene, X + 12, y, LEFT_W - 12, STAT_ROW - 4, 0, i));
    });
    for (let i = 0; i < INV_SIZE; i++) {
      const y = Y + 46 + i * INV_ROW;
      this.invRows.push(t(colX(1) + 10, y + 8, 12));
      this.zones.push(this.zone(scene, colX(1), y, COL_W, INV_ROW - 4, 1, i));
    }
    for (let i = 0; i < BAG_SIZE; i++) {
      const y = Y + 46 + i * INV_ROW;
      this.bagRows.push(t(colX(2) + 10, y + 8, 12));
      this.zones.push(this.zone(scene, colX(2), y, COL_W, INV_ROW - 4, 2, i));
    }
    this.detail = t(X + 18, Y + H - 52, 12).setWordWrapWidth(W - 160);
    this.footer = t(X + W / 2, Y + H - 16, 12).setOrigin(0.5).setAlpha(0.7);
    // 고른 장비 버리기 (터치·마우스용 버튼)
    this.dropBtn = t(X + W - 18, Y + H - 52, 13).setOrigin(1, 0).setColor('#ff9080').setInteractive({ useHandCursor: true });
    this.dropBtn.on('pointerdown', () => this.drop());
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerOver = this.open && p.x >= X && p.x <= X + W && p.y >= Y && p.y <= Y + H;
    });
    this.setVisible(false);
  }

  private zone(scene: Phaser.Scene, x: number, y: number, w: number, h: number, col: Col, row: number) {
    return scene.add.zone(x, y, w, h).setOrigin(0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.col = col;
        this.row = row;
        if (p.rightButtonDown()) this.drop();
        else this.confirm();
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
    if (v) this.dropBtn.setInteractive();
    else this.dropBtn.disableInteractive();
  }

  /** 방향패드: 위·아래로 줄, 좌·우로 칸(능력치 ↔ 아이템 상자 ↔ 가방) 이동 */
  navigate(dx: number, dy: number) {
    if (dx) {
      this.col = Math.max(0, Math.min(2, this.col + dx)) as Col;
      this.row = Math.min(this.row, this.rowCount - 1);
    }
    if (dy) this.row = (this.row + dy + this.rowCount) % this.rowCount;
  }

  private get rowCount() {
    return this.col === 0 ? ATTR_KEYS.length : this.col === 1 ? INV_SIZE : BAG_SIZE;
  }

  /** A 버튼 / 클릭: 능력치는 포인트 배분, 상자 칸은 음식 먹기·장비를 가방에, 가방 칸은 꺼내서 착용 */
  confirm() {
    if (this.col === 0) this.onAllocate(ATTR_KEYS[this.row]);
    else if (this.col === 1) this.onSlot(this.row);
    else this.onMove('bag', this.row);
  }

  /** X 버튼 / 오른쪽 클릭 / [버리기]: 고른 장비를 버린다 (음식은 버리지 않는다) */
  drop() {
    if (this.col === 1) this.onDrop('inv', this.row);
    else if (this.col === 2) this.onDrop('bag', this.row);
  }

  update(me: Player, device: Device) {
    const g = this.g;
    g.clear();
    g.fillStyle(0x0d1420, 0.94).fillRoundedRect(X, Y, W, H, 10);
    g.lineStyle(2, 0x8fb4ff, 0.8).strokeRoundedRect(X, Y, W, H, 10);
    g.lineStyle(1, 0xffffff, 0.15).lineBetween(colX(1) - 10, Y + 16, colX(1) - 10, Y + H - 64).lineBetween(colX(2) - 4, Y + 16, colX(2) - 4, Y + H - 64);

    // 능력치
    const main = CLASSES[me.cls].mainAttr;
    this.statTitle.setText(`능력치   남은 포인트 ${me.points}`).setColor(me.points > 0 ? '#ffd040' : '#ffffff');
    ATTR_KEYS.forEach((k, i) => {
      const y = Y + 46 + i * STAT_ROW;
      if (this.col === 0 && this.row === i) g.fillStyle(0xffffff, 0.12).fillRoundedRect(X + 12, y, LEFT_W - 12, STAT_ROW - 4, 6);
      this.statRows[i].name.setText(`${k === main ? '★' : ''}${ATTR_NAMES[k]} ${me.attrs[k]}${me.points > 0 ? '   +' : ''}`);
      this.statRows[i].desc.setText(ATTR_DESC[k]).setAlpha(0.7);
    });

    // 아이템 상자 (착용 중)
    this.invTitle.setText(`아이템 상자 · 착용 중   ${me.inv.filter(Boolean).length}/${INV_SIZE}`);
    me.inv.forEach((sl, i) => {
      const y = Y + 46 + i * INV_ROW;
      if (this.col === 1 && this.row === i) g.fillStyle(0xffffff, 0.12).fillRoundedRect(colX(1), y, COL_W, INV_ROW - 4, 6);
      const { text, color } = slotLine(sl, me);
      this.invRows[i].setText(text).setColor(color);
    });

    // 가방 (보관만, 능력치에 더해지지 않는다)
    const bag = me.bag ?? [];
    this.bagTitle.setText(`가방 · 보관   ${bag.filter(Boolean).length}/${BAG_SIZE}`);
    for (let i = 0; i < BAG_SIZE; i++) {
      const y = Y + 46 + i * INV_ROW;
      if (this.col === 2 && this.row === i) g.fillStyle(0xffffff, 0.12).fillRoundedRect(colX(2), y, COL_W, INV_ROW - 4, 6);
      const it = bag[i];
      const { text, color } = it ? itemLine(it, me) : { text: '(빈 칸)', color: '#556677' };
      this.bagRows[i].setText(text).setColor(color).setAlpha(it ? 0.85 : 1);
    }

    this.detail.setText(this.detailText(me));
    const canDrop = (this.col === 1 && me.inv[this.row]?.kind === 'item') || (this.col === 2 && !!bag[this.row]);
    this.dropBtn.setText(canDrop ? (device === 'pad' ? '[X] 버리기' : '[버리기]') : '').setVisible(this.open && canDrop);
    this.footer.setText(device === 'pad'
      ? '방향패드: 고르기     A: 실행     X: 버리기     B · Menu: 닫기'
      : device === 'touch' ? '줄을 눌러 실행     [버리기]: 고른 장비 버리기     메뉴 버튼: 닫기' : '클릭: 실행     오른쪽 클릭: 버리기     I · Esc: 닫기');
  }

  private detailText(me: Player): string {
    if (this.col === 0) {
      const k = ATTR_KEYS[this.row];
      return me.points > 0 ? `A: ${ATTR_NAMES[k]}에 포인트 1 배분 — ${ATTR_DESC[k]}` : `레벨이 오르면 포인트를 받는다 — ${ATTR_NAMES[k]}: ${ATTR_DESC[k]}`;
    }
    if (this.col === 2) {
      const it = (me.bag ?? [])[this.row];
      return it ? `실행: 꺼내서 착용 (아이템 상자로) — ${itemStatText(it)}` : '빈 칸 — 아이템 상자의 장비를 고르고 실행하면 가방에 넣는다';
    }
    const sl = me.inv[this.row];
    if (!sl) return '빈 칸';
    if (sl.kind === 'item') return `실행: 가방에 넣기 (능력치에서 빠진다) — ${itemStatText(sl.item)}`;
    const hp = sl.kind === 'hpFood';
    return `실행: 먹기 — ${hp ? 'HP' : 'MP'} ${Math.round((hp ? FOOD.hp : FOOD.mp) * 100)}% 회복 (최대 ${FOOD.stackMax}개)`;
  }
}

function itemLine(it: Item, me: Player) {
  return { text: `[${RARITY[it.rarity].name}] ${itemName(it, me.cls)}`, color: RARITY[it.rarity].color };
}

function slotLine(sl: InvSlot | null, me: Player): { text: string; color: string } {
  if (!sl) return { text: '(빈 칸)', color: '#556677' };
  if (sl.kind !== 'item') {
    const hp = sl.kind === 'hpFood';
    return { text: `${hp ? 'HP' : 'MP'} 회복 음식 ×${sl.count}`, color: hp ? '#ff8090' : '#8fb4ff' };
  }
  return itemLine(sl.item, me);
}
