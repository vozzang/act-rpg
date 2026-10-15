// 대장간 창: 대장간 곁에서 E(게임패드 LT, 터치 줍기)로 연다. 아이템 상자·가방의 장비 2~3개를 골라
// [조합하기](맞는 조합법이 있으면 정해진 고유 장비) 또는 [랜덤 조합하기](무작위 장비)를 누른다. 오른쪽에 조합법 목록이 있다.
// 게임패드: 방향패드 고르기, A 고르기·풀기, X 조합하기, Y 랜덤 조합하기, B 닫기.
import Phaser from 'phaser';
import { FORGE, RARITY, RECIPES, SHOP_TYPES, VIEW_W, itemName, itemStatText, matchRecipe, recipeText } from '../game/data';
import type { Item, Player, Shop } from '../game/types';
import type { Device } from './Hud';
import { makeText } from './ui';

const W = 900;
const H = 420;
const X = (VIEW_W - W) / 2;
const Y = 64;
const LIST_W = 470;
const ROW_H = 26;
const ROWS = 12; // 상자 6 + 가방 6
const DEPTH = 140;

/** 조합 재료 하나: 어디(아이템 상자·가방)의 몇 번째 칸인지 */
export type ForgePick = {
  from: 'inv' | 'bag'; // 아이템 상자 · 가방
  idx: number; // 칸 번호
};

/** 창 목록의 한 줄: 장비와 그 장비가 있는 칸 */
type Entry = {
  item: Item;
  pick: ForgePick;
};

export class ForgePanel {
  /** 열려 있는 대장간 id (닫혀 있으면 null) */
  openId: number | null = null;
  pointerOver = false;
  private g: Phaser.GameObjects.Graphics;
  private texts: Phaser.GameObjects.Text[] = [];
  private title: Phaser.GameObjects.Text;
  private gold: Phaser.GameObjects.Text;
  private rows: { name: Phaser.GameObjects.Text; stat: Phaser.GameObjects.Text; zone: Phaser.GameObjects.Zone }[] = [];
  private recipeTitle: Phaser.GameObjects.Text;
  private recipeRows: Phaser.GameObjects.Text[] = [];
  private status: Phaser.GameObjects.Text;
  private btnRecipe: Phaser.GameObjects.Text;
  private btnRandom: Phaser.GameObjects.Text;
  private footer: Phaser.GameObjects.Text;
  private picked = new Set<number>(); // 고른 장비 id
  private cursor = 0; // 게임패드로 가리키는 줄
  private entries: Entry[] = [];

  constructor(scene: Phaser.Scene, private onForge: (picks: ForgePick[], random: boolean) => void) {
    this.g = scene.add.graphics().setDepth(DEPTH);
    const t = (x: number, y: number, size: number) => {
      const txt = makeText(scene, x, y, '', size).setDepth(DEPTH + 1);
      this.texts.push(txt);
      return txt;
    };
    this.title = t(X + 18, Y + 14, 20);
    this.gold = t(X + W - 18, Y + 18, 16).setOrigin(1, 0).setColor('#ffd040');
    for (let i = 0; i < ROWS; i++) {
      const y = Y + 56 + i * ROW_H;
      const zone = scene.add.zone(X + 12, y, LIST_W - 12, ROW_H - 2).setOrigin(0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        this.cursor = i;
        this.toggle(i);
      });
      this.rows.push({ name: t(X + 20, y + 5, 13), stat: t(X + LIST_W - 8, y + 6, 11).setOrigin(1, 0).setAlpha(0.75), zone });
    }
    this.recipeTitle = t(X + LIST_W + 20, Y + 56, 14).setColor('#ffd040');
    RECIPES.forEach((_, i) => this.recipeRows.push(t(X + LIST_W + 20, Y + 80 + i * 22, 12)));
    this.status = t(X + 18, Y + H - 78, 13).setWordWrapWidth(W - 36);
    const btn = (x: number, label: string, random: boolean) => {
      const b = t(x, Y + H - 50, 16).setPadding(14, 6, 14, 6).setBackgroundColor('#3a2a14').setInteractive({ useHandCursor: true });
      b.setText(label);
      b.on('pointerdown', () => this.submit(random));
      return b;
    };
    this.btnRecipe = btn(X + 18, '조합하기', false);
    this.btnRandom = btn(X + 160, '랜덤 조합하기', true);
    this.footer = t(X + W - 18, Y + H - 40, 12).setOrigin(1, 0).setAlpha(0.7);
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.pointerOver = this.openId !== null && p.x >= X && p.x <= X + W && p.y >= Y && p.y <= Y + H;
    });
    this.setVisible(false);
  }

  open(id: number) {
    this.openId = id;
    this.picked.clear();
    this.cursor = 0;
    this.setVisible(true);
  }

  close() {
    this.openId = null;
    this.pointerOver = false;
    this.setVisible(false);
  }

  private setVisible(v: boolean) {
    this.g.setVisible(v);
    for (const t of this.texts) t.setVisible(v);
    for (const r of this.rows) (v ? r.zone.setInteractive() : r.zone.disableInteractive());
    for (const b of [this.btnRecipe, this.btnRandom]) (v ? b.setInteractive() : b.disableInteractive());
  }

  /** 게임패드 방향패드 위·아래 */
  navigate(dy: number) {
    const n = Math.max(1, this.entries.length);
    this.cursor = (this.cursor + dy + n) % n;
  }

  /** 게임패드 A: 가리킨 장비를 고르거나 푼다 */
  toggleCursor() {
    this.toggle(this.cursor);
  }

  private toggle(i: number) {
    const e = this.entries[i];
    if (!e) return;
    if (this.picked.has(e.item.id)) this.picked.delete(e.item.id);
    else if (this.picked.size < FORGE.max) this.picked.add(e.item.id);
  }

  /** 조합하기 / 랜덤 조합하기 */
  submit(random: boolean) {
    const picks = this.entries.filter((e) => this.picked.has(e.item.id)).map((e) => e.pick);
    if (picks.length < FORGE.min) return;
    this.onForge(picks, random);
  }

  private selected(): Item[] {
    return this.entries.filter((e) => this.picked.has(e.item.id)).map((e) => e.item);
  }

  update(shop: Shop, me: Player, device: Device) {
    // 내 장비 목록 (상자 → 가방 순). 없어진 장비는 고른 목록에서도 뺀다 (조합으로 사라졌을 때)
    this.entries = [
      ...me.inv.flatMap((sl, idx) => (sl?.kind === 'item' ? [{ item: sl.item, pick: { from: 'inv' as const, idx } }] : [])),
      ...(me.bag ?? []).flatMap((it, idx) => (it ? [{ item: it, pick: { from: 'bag' as const, idx } }] : [])),
    ];
    const ids = new Set(this.entries.map((e) => e.item.id));
    for (const id of this.picked) if (!ids.has(id)) this.picked.delete(id);
    if (this.cursor >= this.entries.length) this.cursor = Math.max(0, this.entries.length - 1);

    const g = this.g;
    g.clear();
    g.fillStyle(0x0d1420, 0.95).fillRoundedRect(X, Y, W, H, 10);
    g.lineStyle(2, SHOP_TYPES.forge.color, 0.9).strokeRoundedRect(X, Y, W, H, 10);
    g.lineStyle(1, 0xffffff, 0.15).lineBetween(X + LIST_W + 8, Y + 56, X + LIST_W + 8, Y + H - 90);
    const fee = FORGE.feePerZone * shop.zone;
    this.title.setText(`대장간 · ${shop.zone}구역   장비 ${FORGE.min}~${FORGE.max}개를 골라 조합 (${fee} G)`).setColor('#ffb060');
    this.gold.setText(`보유 ${me.gold} G`);

    this.rows.forEach((r, i) => {
      const e = this.entries[i];
      const y = Y + 56 + i * ROW_H;
      if (!e) {
        r.name.setText(i === 0 ? '조합할 장비가 없습니다 (상자나 가방에 장비가 있어야 합니다)' : '').setColor('#778899');
        r.stat.setText('');
        return;
      }
      const on = this.picked.has(e.item.id);
      if (on) g.fillStyle(0xffa040, 0.22).fillRoundedRect(X + 12, y, LIST_W - 12, ROW_H - 2, 5);
      if (device === 'pad' && i === this.cursor) g.lineStyle(2, 0xffd040, 0.8).strokeRoundedRect(X + 12, y, LIST_W - 12, ROW_H - 2, 5);
      const where = e.pick.from === 'inv' ? '착용' : '가방';
      r.name.setText(`${on ? '☑' : '☐'} [${where}] [${RARITY[e.item.rarity].name}] ${itemName(e.item, me.cls)}`).setColor(RARITY[e.item.rarity].color);
      r.stat.setText(itemStatText(e.item));
    });

    // 조합법 목록: 지금 고른 장비에 맞는 조합법은 밝게
    const sel = this.selected();
    const match = sel.length >= FORGE.min ? matchRecipe(sel) : null;
    this.recipeTitle.setText('조합법 (재료 → 결과, 모두 전설 등급)');
    RECIPES.forEach((rc, i) => {
      const hit = match === rc;
      this.recipeRows[i].setText(`${hit ? '▶ ' : ''}${recipeText(rc)}  →  ${rc.title}`).setColor(hit ? '#ffd040' : '#c8ccd8').setAlpha(hit ? 1 : 0.75);
    });

    // 상태와 버튼
    const enough = sel.length >= FORGE.min;
    const rich = me.gold >= fee;
    this.status.setText(!enough ? `장비를 ${FORGE.min}개 이상 고르세요 (지금 ${sel.length}개)`
      : !rich ? `돈이 부족합니다 (${fee} G 필요)`
      : match ? `조합하기: [전설] ${match.title} 을(를) 만듭니다. 랜덤 조합하기: 무작위 장비 (재료가 많고 같은 등급일수록 한 단계 위 등급이 잘 나옴)`
      : '맞는 조합법이 없습니다. 랜덤 조합하기로 무작위 장비를 만들 수 있습니다 (재료는 사라집니다)');
    this.btnRecipe.setAlpha(enough && rich && match ? 1 : 0.4);
    this.btnRandom.setAlpha(enough && rich ? 1 : 0.4);
    this.footer.setText(device === 'pad' ? '방향패드: 고르기   A: 선택   X: 조합하기   Y: 랜덤 조합   B: 닫기'
      : device === 'touch' ? '줄을 눌러 선택   줍기 버튼·멀어지면 닫힘' : '클릭: 선택   E · Esc: 닫기');
  }
}
