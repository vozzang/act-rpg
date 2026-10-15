// 상점 창: 상인 곁에서 E(게임패드 LT)로 열고, 숫자키·클릭(게임패드는 방향패드로 고르고 A)으로 산다.
// E·Esc(게임패드 B) 또는 멀어지면 닫힌다.
import Phaser from 'phaser';
import { FOOD, INV_SIZE, RARITY, SHOP_TYPES, VIEW_W, ZONE_NAMES, itemName, itemStatText } from '../game/data';
import type { Player, Shop, ShopEntry } from '../game/types';
import type { Device } from './Hud';
import { makeText } from './ui';

const W = 520;
const ROW_H = 54;
const X = (VIEW_W - W) / 2;
const Y = 96;
const ROWS = 4; // 가장 많이 파는 상점(공격 상점)의 줄 수. 줄이 적은 상점은 창이 짧아진다
const panelH = (rows: number) => 70 + rows * ROW_H + 34;
const H = panelH(ROWS);

type Row = { zone: Phaser.GameObjects.Zone; title: Phaser.GameObjects.Text; detail: Phaser.GameObjects.Text; price: Phaser.GameObjects.Text };

export class ShopPanel {
  /** 열려 있는 상점 id (닫혀 있으면 null) */
  openId: number | null = null;
  /** 마우스가 창 위에 있으면 클릭해도 공격하지 않는다 */
  pointerOver = false;
  private g: Phaser.GameObjects.Graphics;
  private title: Phaser.GameObjects.Text;
  private goldText: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;
  private rows: Row[] = [];
  private hoverRow = -1;
  private selected = 0; // 게임패드로 고른 줄
  private count = ROWS; // 지금 열린 상점의 줄 수

  constructor(scene: Phaser.Scene, private onBuy: (idx: number) => void) {
    const depth = 140;
    this.g = scene.add.graphics().setDepth(depth);
    this.title = makeText(scene, X + 18, Y + 14, '', 20).setDepth(depth + 1);
    this.goldText = makeText(scene, X + W - 18, Y + 18, '', 16).setOrigin(1, 0).setDepth(depth + 1).setColor('#ffd040');
    this.footer = makeText(scene, X + W / 2, Y + H - 22, '', 12)
      .setOrigin(0.5).setDepth(depth + 1).setAlpha(0.7);
    for (let i = 0; i < ROWS; i++) {
      const ry = Y + 60 + i * ROW_H;
      const zone = scene.add.zone(X + 10, ry, W - 20, ROW_H - 6).setOrigin(0).setDepth(depth + 2).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => onBuy(i));
      zone.on('pointerover', () => (this.hoverRow = i));
      zone.on('pointerout', () => this.hoverRow === i && (this.hoverRow = -1));
      this.rows.push({
        zone,
        title: makeText(scene, X + 22, ry + 7, '', 15).setDepth(depth + 1),
        detail: makeText(scene, X + 22, ry + 28, '', 12).setDepth(depth + 1).setAlpha(0.85),
        price: makeText(scene, X + W - 22, ry + 16, '', 16).setOrigin(1, 0).setDepth(depth + 1),
      });
    }
    // 창 위에 마우스가 있는지 (공격 클릭 막기)
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerOver = this.openId !== null && p.x >= X && p.x <= X + W && p.y >= Y && p.y <= Y + H;
    });
    this.setVisible(false);
  }

  open(id: number) {
    this.openId = id;
    this.selected = 0;
    this.setVisible(true);
  }

  /** 방향패드 위·아래 */
  navigate(dy: number) {
    this.selected = (this.selected + dy + this.count) % this.count;
  }

  /** 게임패드 A: 고른 줄을 산다 */
  confirm() {
    this.onBuy(this.selected);
  }

  close() {
    this.openId = null;
    this.pointerOver = false;
    this.setVisible(false);
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    this.title.setVisible(v);
    this.goldText.setVisible(v);
    this.footer.setVisible(v);
    for (const r of this.rows) {
      r.title.setVisible(v);
      r.detail.setVisible(v);
      r.price.setVisible(v);
      r.zone.setVisible(v);
      if (v) r.zone.setInteractive();
      else r.zone.disableInteractive();
    }
  }

  update(shop: Shop, me: Player, device: Device) {
    const g = this.g;
    g.clear();
    this.count = shop.stock.length;
    const h = panelH(this.count);
    const color = SHOP_TYPES[shop.type].color;
    g.fillStyle(0x0d1420, 0.94).fillRoundedRect(X, Y, W, h, 10);
    g.lineStyle(2, color, 0.9).strokeRoundedRect(X, Y, W, h, 10);
    this.footer.setY(Y + h - 22);
    this.rows.forEach((r, i) => {
      const on = i < this.count;
      r.title.setVisible(on);
      r.detail.setVisible(on);
      r.price.setVisible(on);
      if (on) r.zone.setInteractive();
      else r.zone.disableInteractive();
    });
    this.title.setText(`${SHOP_TYPES[shop.type].name} · ${shop.zone}구역 ${ZONE_NAMES[shop.zone - 1]}`).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.footer.setText(device === 'pad' ? '방향패드: 고르기     A: 구매     B: 닫기'
      : device === 'touch' ? '줄을 눌러 구매     줍기 버튼 · 멀어지면 닫힘' : `숫자키 1~${this.count} 또는 클릭: 구매     E · Esc: 닫기`);
    this.goldText.setText(`보유 ${me.gold} G`);

    shop.stock.forEach((e, i) => {
      const r = this.rows[i];
      const ry = Y + 60 + i * ROW_H;
      const affordable = me.gold >= e.price;
      const highlighted = device === 'pad' ? i === this.selected : i === this.hoverRow && !e.sold;
      if (highlighted) g.fillStyle(0xffffff, 0.12).fillRoundedRect(X + 10, ry, W - 20, ROW_H - 6, 6);
      if (device === 'pad' && i === this.selected) g.lineStyle(2, 0xffd040, 0.8).strokeRoundedRect(X + 10, ry, W - 20, ROW_H - 6, 6);
      g.fillStyle(0xffffff, 0.04).fillRoundedRect(X + 10, ry, W - 20, ROW_H - 6, 6);
      const { title, detail, color } = describe(e, me);
      r.title.setText(`[${i + 1}] ${title}`).setColor(e.sold ? '#666666' : color);
      r.detail.setText(e.sold ? '' : detail);
      r.price
        .setText(e.sold ? '구매함' : `${e.price} G`)
        .setColor(e.sold ? '#666666' : affordable ? '#ffd040' : '#ff6060');
    });
  }
}

/** 진열대 한 칸의 이름·설명. 산 물건은 아이템 상자에 들어가고, 장비는 상자에 있는 동안 능력치에 더해진다. */
function describe(e: ShopEntry, me: Player): { title: string; detail: string; color: string } {
  const used = me.inv.filter(Boolean).length;
  if (e.kind !== 'item') {
    const hp = e.kind === 'hpFood';
    const have = me.inv.find((sl) => sl?.kind === e.kind);
    const count = have && have.kind !== 'item' ? have.count : 0;
    return {
      title: `${hp ? 'HP' : 'MP'} 회복 음식`,
      detail: `${hp ? 'HP' : 'MP'} ${Math.round((hp ? FOOD.hp : FOOD.mp) * 100)}% 회복 (지금 ${count}/${FOOD.stackMax}개)`,
      color: hp ? '#ff8090' : '#8fb4ff',
    };
  }
  const item = e.item!;
  return {
    title: `[${RARITY[item.rarity].name}] ${itemName(item, me.cls)}`,
    detail: `${itemStatText(item)}    (상자 ${used}/${INV_SIZE}칸)`,
    color: RARITY[item.rarity].color,
  };
}
