// 모바일 터치 조작: 왼쪽은 누른 자리에 생기는 조이스틱, 오른쪽은 공격·스킬·줍기·음식·메뉴·지도 버튼.
// 여러 손가락을 동시에 쓸 수 있다 (이동하면서 공격·스킬). 조준은 게임패드처럼 자동 조준을 쓴다.
import Phaser from 'phaser';
import { CLASSES, VIEW_H, VIEW_W } from '../game/data';
import type { Player } from '../game/types';
import { makeText } from './ui';

const DEPTH = 160;
const STICK_R = 56; // 조이스틱이 움직이는 반경
const ATTACK = { x: VIEW_W - 92, y: VIEW_H - 92, r: 46 };
const SKILL_R = 30;
const SKILL_RING = 96; // 공격 버튼 중심에서 스킬 버튼까지 거리
const SKILL_ANGLES = [180, 220, 260, 300].map((d) => (d * Math.PI) / 180);

type ButtonId = 'attack' | 'skill0' | 'skill1' | 'skill2' | 'skill3' | 'interact' | 'hp' | 'mp' | 'menu' | 'map';
type Button = { id: ButtonId; x: number; y: number; r: number; label: string };

const BUTTONS: Button[] = [
  { id: 'attack', ...ATTACK, label: '공격' },
  ...SKILL_ANGLES.map((a, i) => ({
    id: `skill${i}` as ButtonId,
    x: ATTACK.x + Math.cos(a) * SKILL_RING, y: ATTACK.y + Math.sin(a) * SKILL_RING, r: SKILL_R, label: String(i + 1),
  })),
  { id: 'interact', x: VIEW_W - 180, y: VIEW_H - 250, r: 26, label: '줍기' },
  { id: 'hp', x: VIEW_W - 40, y: VIEW_H - 250, r: 22, label: 'HP' },
  { id: 'mp', x: VIEW_W - 40, y: VIEW_H - 300, r: 22, label: 'MP' },
  { id: 'map', x: VIEW_W - 92, y: 104, r: 22, label: '지도' },
  { id: 'menu', x: VIEW_W - 40, y: 104, r: 22, label: '메뉴' },
];

/** 이 기기에서 터치 조작을 보여줄지 */
export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class TouchControls {
  /** 조이스틱 방향 (화면 기준, 길이 0~1) */
  move = { x: 0, y: 0 };
  private held = new Set<ButtonId>();
  private justPressed = new Set<ButtonId>();
  private owners = new Map<number, ButtonId | 'stick'>(); // 손가락(pointer id)별로 무엇을 누르고 있는지
  private stick: { x: number; y: number; px: number; py: number } | null = null;
  private g: Phaser.GameObjects.Graphics;
  private labels = new Map<ButtonId, Phaser.GameObjects.Text>();
  /** 이번 프레임에 터치가 있었는지 (입력 장치 판단용) */
  touched = false;

  constructor(scene: Phaser.Scene) {
    scene.input.addPointer(3); // 기본 1개 + 3개 = 손가락 4개까지
    this.g = scene.add.graphics().setDepth(DEPTH);
    for (const b of BUTTONS) {
      this.labels.set(b.id, makeText(scene, b.x, b.y, b.label, b.id === 'attack' ? 16 : 12).setOrigin(0.5).setDepth(DEPTH + 1).setStroke('#000', 3));
    }

    scene.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (!p.wasTouch) return;
      this.touched = true;
      const btn = BUTTONS.find((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r + 8);
      if (btn) {
        this.owners.set(p.id, btn.id);
        this.held.add(btn.id);
        this.justPressed.add(btn.id);
        return;
      }
      // 아이템 상자 칸·상점 줄 같은 HUD를 누른 것이면 조이스틱을 만들지 않는다
      if (over.length > 0) return;
      if (p.x < VIEW_W * 0.5 && p.y > 80 && !this.stick) {
        this.stick = { x: p.x, y: p.y, px: p.x, py: p.y };
        this.owners.set(p.id, 'stick');
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.owners.get(p.id) !== 'stick' || !this.stick) return;
      this.stick.px = p.x;
      this.stick.py = p.y;
    });
    const release = (p: Phaser.Input.Pointer) => {
      const owner = this.owners.get(p.id);
      if (!owner) return;
      this.owners.delete(p.id);
      if (owner === 'stick') this.stick = null;
      else this.held.delete(owner);
    };
    scene.input.on('pointerup', release);
    scene.input.on('pointerupoutside', release);
  }

  isHeld(id: ButtonId) {
    return this.held.has(id);
  }

  /** 방금 눌렀는지 (한 번만 true) */
  consume(id: ButtonId) {
    return this.justPressed.delete(id);
  }

  setVisible(v: boolean) {
    this.g.setVisible(v);
    for (const t of this.labels.values()) t.setVisible(v);
  }

  /** 매 프레임: 조이스틱 방향 계산과 버튼 그리기 (스킬 버튼은 쓸 수 없으면 어둡게) */
  update(me: Player | undefined) {
    this.touched = false;
    this.justPressed.clear();
    const g = this.g;
    g.clear();

    if (this.stick) {
      const dx = this.stick.px - this.stick.x, dy = this.stick.py - this.stick.y;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_R ? STICK_R / len : 1;
      this.move = len < 8 ? { x: 0, y: 0 } : { x: (dx * k) / STICK_R, y: (dy * k) / STICK_R };
      g.fillStyle(0xffffff, 0.12).fillCircle(this.stick.x, this.stick.y, STICK_R + 10);
      g.lineStyle(2, 0xffffff, 0.35).strokeCircle(this.stick.x, this.stick.y, STICK_R + 10);
      g.fillStyle(0xffffff, 0.5).fillCircle(this.stick.x + dx * k, this.stick.y + dy * k, 24);
    } else {
      this.move = { x: 0, y: 0 };
      // 어디를 누르면 되는지 흐릿하게 알려준다
      g.lineStyle(2, 0xffffff, 0.12).strokeCircle(130, VIEW_H - 200, STICK_R + 10);
    }

    const skills = me ? CLASSES[me.cls].skills : [];
    for (const b of BUTTONS) {
      let usable = true;
      let fill = 0x203048;
      if (b.id.startsWith('skill') && me) {
        const i = Number(b.id.slice(5));
        const sk = skills[i];
        usable = me.level >= sk.unlock && me.skillCds[i] <= 0 && me.mp >= sk.mp;
        this.labels.get(b.id)!.setText(me.level < sk.unlock ? '🔒' : sk.name.slice(0, 2));
        fill = i === 3 ? 0x4a3410 : 0x203048;
      }
      if (b.id === 'attack') fill = 0x5a2020;
      if (b.id === 'hp') fill = 0x5a1a24;
      if (b.id === 'mp') fill = 0x1a2a5a;
      const pressed = this.held.has(b.id);
      g.fillStyle(fill, pressed ? 0.95 : usable ? 0.7 : 0.35).fillCircle(b.x, b.y, b.r);
      g.lineStyle(2, pressed ? 0xffffff : 0xffd060, usable ? 0.9 : 0.3).strokeCircle(b.x, b.y, b.r);
      this.labels.get(b.id)!.setAlpha(usable ? 1 : 0.5);
    }
  }
}
