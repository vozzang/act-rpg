// 화면에 고정된 정보: 파티 패널, 내 정보창, 능력치 버튼, 스킬 바, 아이템 상자, 보스 체력, 화면 밖 동료 표시
import Phaser from 'phaser';
import {
  ATTR_KEYS, ATTR_NAMES, CLASSES, ENEMIES, FOOD, INV_SIZE, RARITY, VIEW_H, VIEW_W, itemName, itemStatText,
} from '../game/data';
import type { AttrKey, InvSlot, Player, Snapshot } from '../game/types';
import { makeText } from './ui';
import type { World3D } from './World3D';

// 스킬 바와 그 아래 아이템 상자는 화면 아래 가운데(정보창과 미니맵 사이)에 놓는다
const BAR_CENTER = 560;
const SKILL_SLOT = 46;
const SKILL_GAP = 6;
const SKILL_X = BAR_CENTER - (4 * SKILL_SLOT + 3 * SKILL_GAP) / 2;
const INV_SLOT = 40;
const INV_GAP = 5;
const INV_X = BAR_CENTER - (INV_SIZE * INV_SLOT + (INV_SIZE - 1) * INV_GAP) / 2;
const INV_Y = VIEW_H - INV_SLOT - 8;
const SKILL_Y = INV_Y - 6 - SKILL_SLOT;
const INFO_H = 76;
/** 아이템 상자 칸 단축키 (GameScene.readHotkeys와 같은 순서) */
const SLOT_KEYS = ['5', '6', '7', '8', '9', '0'];
/** 스킬 칸에 표시할 키: 키보드 / 게임패드 (GameScene.readInput의 배치와 같다) */
const SKILL_LABELS = { kbm: ['1', '2', '3', '4'], pad: ['A', 'B', 'Y', 'RT'] };
const CONTROLS = {
  kbm: '이동 WASD·방향키  공격 좌클릭·Z\n스킬 1~4 (우클릭·X = 1번)  줍기·상점 E\n상자 5~0  음식 Q·R  능력치 Shift+1~4  메뉴 I  지도 Tab',
  pad: '이동 왼쪽 스틱  조준 오른쪽 스틱(안 쓰면 자동)\n공격 X  스킬 A·B·Y·RT  줍기·상점 LT\n음식 LB·RB  캐릭터 메뉴 Menu  지도 View',
};

export type Device = 'kbm' | 'pad';

type Rect = { x: number; y: number; w: number; h: number };
type Tip = { text: string; x: number; y: number };
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const skillRect = (i: number): Rect => ({ x: SKILL_X + i * (SKILL_SLOT + SKILL_GAP), y: SKILL_Y, w: SKILL_SLOT, h: SKILL_SLOT });
const invRect = (i: number): Rect => ({ x: INV_X + i * (INV_SLOT + INV_GAP), y: INV_Y, w: INV_SLOT, h: INV_SLOT });

export class Hud {
  readonly g: Phaser.GameObjects.Graphics;
  /** 마우스가 HUD 버튼·칸 위에 있으면 클릭해도 공격하지 않는다 */
  overButton = false;
  private panelTexts: Phaser.GameObjects.Text[] = [];
  private infoText: Phaser.GameObjects.Text;
  private pointsText: Phaser.GameObjects.Text;
  private attrButtons: Phaser.GameObjects.Text[] = [];
  private skillTexts: { name: Phaser.GameObjects.Text; info: Phaser.GameObjects.Text }[] = [];
  private invTexts: { label: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text }[] = [];
  private tooltip: Phaser.GameObjects.Text;
  private bossText: Phaser.GameObjects.Text;
  private skillKeyTexts: Phaser.GameObjects.Text[] = [];
  private slotKeyTexts: Phaser.GameObjects.Text[] = [];
  private controlsText: Phaser.GameObjects.Text;
  private device: Device = 'kbm';

  constructor(
    private scene: Phaser.Scene, private world: World3D, private myId: string,
    onAllocate: (attr: AttrKey) => void, onSlot: (idx: number) => void, hintBottom: number,
  ) {
    this.g = scene.add.graphics().setDepth(100);
    for (let i = 0; i < 4; i++) this.panelTexts.push(makeText(scene, 16 + i * 236, 12, '', 13).setDepth(101));
    this.infoText = makeText(scene, 12, VIEW_H - INFO_H + 4, '', 12).setDepth(101).setLineSpacing(3);
    this.pointsText = makeText(scene, 12, VIEW_H - INFO_H - 52, '', 14).setDepth(101).setColor('#ffd040').setStroke('#000', 4);

    // 능력치 배분 버튼 (Shift+숫자키와 같음)
    ATTR_KEYS.forEach((attr, i) => {
      const b = makeText(scene, 12 + i * 74, VIEW_H - INFO_H - 30, `${ATTR_NAMES[attr]} +`, 13)
        .setDepth(102).setPadding(8, 3, 8, 3).setBackgroundColor('#5a4410').setColor('#ffe9a0')
        .setInteractive({ useHandCursor: true });
      b.on('pointerdown', () => onAllocate(attr));
      this.attrButtons.push(b);
    });

    for (let i = 0; i < 4; i++) {
      const r = skillRect(i);
      this.skillKeyTexts.push(makeText(scene, r.x + 4, r.y + 2, SKILL_LABELS.kbm[i], 12).setDepth(102).setStroke('#000', 3));
      this.skillTexts.push({
        name: makeText(scene, r.x + r.w / 2, r.y + r.h / 2 - 3, '', 11).setOrigin(0.5).setDepth(102)
          .setAlign('center').setWordWrapWidth(r.w - 4).setStroke('#000', 3),
        info: makeText(scene, r.x + r.w / 2, r.y + r.h - 8, '', 10).setOrigin(0.5).setDepth(102).setStroke('#000', 3),
      });
    }

    for (let i = 0; i < INV_SIZE; i++) {
      const r = invRect(i);
      scene.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setDepth(102).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => onSlot(i));
      this.slotKeyTexts.push(makeText(scene, r.x + 3, r.y + 1, SLOT_KEYS[i], 10).setDepth(102).setAlpha(0.7).setStroke('#000', 3));
      this.invTexts.push({
        label: makeText(scene, r.x + r.w / 2, r.y + r.h / 2 - 2, '', 11).setOrigin(0.5).setDepth(102).setStroke('#000', 3),
        count: makeText(scene, r.x + r.w - 3, r.y + r.h - 2, '', 12).setOrigin(1, 1).setDepth(102).setStroke('#000', 3),
      });
    }

    this.tooltip = makeText(scene, 0, 0, '', 12).setDepth(130).setOrigin(0.5, 1)
      .setPadding(8, 6, 8, 6).setBackgroundColor('#101820').setWordWrapWidth(280).setVisible(false);
    this.bossText = makeText(scene, VIEW_W / 2, 98, '', 14).setDepth(101).setOrigin(0.5, 1);

    this.controlsText = makeText(scene, VIEW_W - 12, hintBottom - 4, CONTROLS.kbm, 11)
      .setDepth(101).setOrigin(1, 1).setAlign('right').setAlpha(0.6).setStroke('#000', 3);
  }

  /** 마지막으로 쓴 입력 장치에 맞춰 화면의 키 안내를 바꾼다. */
  setDevice(d: Device) {
    if (d === this.device) return;
    this.device = d;
    this.skillKeyTexts.forEach((t, i) => t.setText(SKILL_LABELS[d][i]));
    // 게임패드는 상자 칸을 캐릭터 메뉴에서 다루므로 칸 번호를 숨긴다
    for (const t of this.slotKeyTexts) t.setVisible(d === 'kbm');
    this.controlsText.setText(CONTROLS[d]);
  }

  /** 매 프레임. 그래픽은 여기서 지우고 다시 그린다 (미니맵 점은 MapView가 같은 그래픽에 덧그림). */
  update(s: Snapshot, me: Player | undefined) {
    const g = this.g;
    g.clear();
    this.drawPanels(s);
    let tip: Tip | null = null;
    if (me) {
      this.drawInfo(me);
      const skillTip = this.drawSkillBar(me);
      const invTip = this.drawInventory(me);
      tip = skillTip ?? invTip;
      this.drawOffscreenAllies(s, me);
    }
    if (tip) this.tooltip.setText(tip.text).setPosition(Phaser.Math.Clamp(tip.x, 150, VIEW_W - 150), tip.y - 6).setVisible(true);
    else this.tooltip.setVisible(false);

    const ptr = this.scene.input.activePointer;
    this.overButton = this.attrButtons.some((b) => b.visible && b.getBounds().contains(ptr.x, ptr.y))
      || Array.from({ length: INV_SIZE }, (_, i) => invRect(i)).some((r) => inside(r, ptr.x, ptr.y));

    if (s.boss) {
      const bw = 480, bx = (VIEW_W - bw) / 2, by = 102;
      g.fillStyle(0x000000, 0.7).fillRect(bx - 4, by - 4, bw + 8, 22);
      g.fillStyle(0x8a1a1a, 1).fillRect(bx, by, (bw * Math.max(0, s.boss.hp)) / s.boss.maxHp, 14);
      this.bossText.setText(ENEMIES.boss.name).setVisible(true);
    } else this.bossText.setVisible(false);
  }

  /** 위쪽 파티 패널: 이름, HP / MP / 경험치 막대 */
  private drawPanels(s: Snapshot) {
    const g = this.g;
    s.players.forEach((p, i) => {
      const x = 8 + i * 236, y = 8;
      const def = CLASSES[p.cls];
      g.fillStyle(0x000000, 0.55).fillRoundedRect(x, y, 228, 62, 6);
      if (p.id === this.myId) g.lineStyle(2, 0xffffff, 0.8).strokeRoundedRect(x, y, 228, 62, 6);
      g.fillStyle(def.color, 1).fillRect(x, y + 4, 4, 54);
      g.fillStyle(0x331111, 1).fillRect(x + 10, y + 28, 210, 11);
      g.fillStyle(p.dead ? 0x555555 : 0xe04848, 1).fillRect(x + 10, y + 28, (210 * p.hp) / p.stats.maxHp, 11);
      g.fillStyle(0x111a33, 1).fillRect(x + 10, y + 42, 210, 7);
      g.fillStyle(0x3a6aff, 1).fillRect(x + 10, y + 42, (210 * p.mp) / Math.max(1, p.stats.maxMp), 7);
      g.fillStyle(0x112222, 1).fillRect(x + 10, y + 52, 210, 4);
      g.fillStyle(0xd0c040, 1).fillRect(x + 10, y + 52, (210 * p.xp) / p.xpNext, 4);
      this.panelTexts[i]
        .setText(`Lv.${p.level} ${def.name} ${p.name}  ${Math.ceil(p.hp)}/${p.stats.maxHp}`)
        .setPosition(x + 10, y + 8)
        .setVisible(true);
    });
    for (let i = s.players.length; i < 4; i++) this.panelTexts[i].setVisible(false);
  }

  /** 왼쪽 아래 내 정보: 능력치, 전투 수치, MP, 돈 + 남은 능력치 포인트 */
  private drawInfo(me: Player) {
    const main = CLASSES[me.cls].mainAttr;
    const pct = (v: number) => Math.round(v * 100);
    this.infoText.setText([
      ATTR_KEYS.map((k) => `${k === main ? '★' : ''}${ATTR_NAMES[k]} ${me.attrs[k]}`).join('   '),
      `공격 ${me.stats.atk}  방어 ${me.stats.def}  치명 ${pct(me.stats.crit)}%  공속 +${pct(me.stats.haste)}%  스킬가속 +${pct(me.stats.cdr)}%`,
      `MP ${Math.floor(me.mp)}/${me.stats.maxMp}  (초당 +${me.stats.mpRegen.toFixed(1)})`,
      `${me.gold} G`,
    ]);
    this.g.fillStyle(0x000000, 0.45).fillRoundedRect(4, VIEW_H - INFO_H - 4, 400, INFO_H, 6);

    const hasPoints = me.points > 0;
    this.pointsText
      .setText(`능력치 포인트 ${me.points}  (${this.device === 'pad' ? 'Menu 버튼: 캐릭터 메뉴' : 'Shift+1~4 또는 클릭'})`)
      .setVisible(hasPoints)
      .setAlpha(0.75 + 0.25 * Math.sin(this.scene.time.now / 150));
    for (const b of this.attrButtons) b.setVisible(hasPoints);
  }

  /** 스킬 4칸: 재사용 대기, 필요 MP, 잠김 표시. 마우스를 올린 칸의 설명을 돌려준다. */
  private drawSkillBar(me: Player) {
    const g = this.g;
    const skills = CLASSES[me.cls].skills;
    const ptr = this.scene.input.activePointer;
    let tip = null as Tip | null; // forEach 안에서 채운다
    skills.forEach((sk, i) => {
      const { x, y, w, h } = skillRect(i);
      const t = this.skillTexts[i];
      const locked = me.level < sk.unlock;
      const cd = Math.max(0, me.skillCds[i]);
      const cdMax = sk.cd / (1 + me.stats.cdr);
      const noMp = me.mp < sk.mp;
      const ultimate = i === skills.length - 1;
      g.fillStyle(locked ? 0x1a1a1a : ultimate ? 0x3a2a10 : 0x1e2a3a, 0.9).fillRoundedRect(x, y, w, h, 6);
      if (!locked && cd > 0) {
        // 남은 시간만큼 아래에서 위로 어둡게 덮는다
        const ch = h * (cd / cdMax);
        g.fillStyle(0x000000, 0.6).fillRect(x, y + h - ch, w, ch);
      }
      if (!locked && noMp) g.fillStyle(0x2040ff, 0.25).fillRoundedRect(x, y, w, h, 6);
      const ready = !locked && cd <= 0 && !noMp;
      g.lineStyle(2, ready ? (ultimate ? 0xffb030 : 0xffd040) : 0x445566, ready ? 1 : 0.7).strokeRoundedRect(x, y, w, h, 6);
      t.name.setText(locked ? `🔒\nLv.${sk.unlock}` : sk.name).setColor(locked ? '#777777' : '#ffffff');
      t.info
        .setText(locked ? '' : cd > 0 ? `${cd.toFixed(1)}초` : `MP ${sk.mp}`)
        .setColor(cd > 0 ? '#ffffff' : noMp ? '#ff7070' : '#8fb4ff');
      if (inside({ x, y, w, h }, ptr.x, ptr.y)) {
        const ult = ultimate ? '  ★최종 스킬' : '';
        tip = { text: `[${i + 1}] ${sk.name}${ult}\nMP ${sk.mp} · 재사용 ${sk.cd}초 · Lv.${sk.unlock}에 배움\n${sk.desc}`, x: x + w / 2, y };
      }
    });
    return tip;
  }

  /** 아이템 상자 6칸: 장비는 등급 색, 음식은 HP 빨강·MP 파랑과 개수. 마우스를 올린 칸의 설명을 돌려준다. */
  private drawInventory(me: Player) {
    const g = this.g;
    const ptr = this.scene.input.activePointer;
    let tip = null as Tip | null; // forEach 안에서 채운다
    me.inv.forEach((sl, i) => {
      const r = invRect(i);
      const t = this.invTexts[i];
      const hover = inside(r, ptr.x, ptr.y);
      const color = slotColor(sl);
      g.fillStyle(0x10161f, 0.9).fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      if (sl) g.fillStyle(color, hover ? 0.45 : 0.3).fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      g.lineStyle(2, sl ? color : 0x334455, sl ? 1 : 0.7).strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
      t.label.setText(slotLabel(sl, me));
      t.count.setText(sl && sl.kind !== 'item' ? `×${sl.count}` : '');
      if (hover && sl) tip = { text: slotTooltip(sl, me, SLOT_KEYS[i]), x: r.x + r.w / 2, y: r.y };
    });
    return tip;
  }

  /** 화면 밖에 있는 동료 쪽으로 가장자리에 화살표를 그린다. */
  private drawOffscreenAllies(s: Snapshot, me: Player) {
    for (const p of s.players) {
      if (p.id === me.id) continue;
      const { sx, sy } = this.world.toScreen(p.x, p.y);
      const vy = sy - 30;
      if (sx > 0 && sx < VIEW_W && vy > 0 && vy < VIEW_H) continue;
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      const ang = Math.atan2(vy - cy, sx - cx);
      const ex = Phaser.Math.Clamp(cx + Math.cos(ang) * 1000, 24, VIEW_W - 24);
      const ey = Phaser.Math.Clamp(cy + Math.sin(ang) * 1000, 84, VIEW_H - 24);
      this.g.fillStyle(p.dead ? 0x777777 : CLASSES[p.cls].color, 0.9).fillTriangle(
        ex + Math.cos(ang) * 12, ey + Math.sin(ang) * 12,
        ex + Math.cos(ang + 2.4) * 10, ey + Math.sin(ang + 2.4) * 10,
        ex + Math.cos(ang - 2.4) * 10, ey + Math.sin(ang - 2.4) * 10,
      );
    }
  }
}

function slotColor(sl: InvSlot | null): number {
  if (!sl) return 0x334455;
  if (sl.kind !== 'item') return sl.kind === 'hpFood' ? 0xe04050 : 0x4a80ff;
  return Phaser.Display.Color.HexStringToColor(RARITY[sl.item.rarity].color).color;
}

/** 칸 안에 쓰는 짧은 이름 (장비는 "강철 장검"의 "장검") */
function slotLabel(sl: InvSlot | null, me: Player): string {
  if (!sl) return '';
  if (sl.kind !== 'item') return sl.kind === 'hpFood' ? 'HP' : 'MP';
  return itemName(sl.item, me.cls).split(' ').pop()!;
}

function slotTooltip(sl: InvSlot, me: Player, key: string): string {
  if (sl.kind === 'item') {
    const it = sl.item;
    return `[${RARITY[it.rarity].name}] ${itemName(it, me.cls)}\n${itemStatText(it)}\n[${key}] 또는 클릭: 내려놓기 (능력치에서 빠진다)`;
  }
  const hp = sl.kind === 'hpFood';
  const pct = Math.round((hp ? FOOD.hp : FOOD.mp) * 100);
  return `${hp ? 'HP' : 'MP'} 회복 음식 ×${sl.count} (최대 ${FOOD.stackMax}개)\n${hp ? 'HP' : 'MP'} ${pct}% 회복\n[${key}] · ${hp ? 'Q' : 'R'} 또는 클릭: 먹기`;
}
