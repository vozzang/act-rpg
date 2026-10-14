// 게임패드 입력. 표준 배치(Xbox 기준 이름) 버튼을 매 프레임 읽어서 "누르고 있음"과 "방금 눌림"을 구분한다.
// 트리거(LT·RT)는 아날로그 값이라 절반 이상 당기면 누른 것으로 본다.
import type Phaser from 'phaser';

/** 표준 게임패드 버튼 번호 (괄호는 PlayStation) */
export const BTN = {
  A: 0, // ✕
  B: 1, // ○
  X: 2, // □
  Y: 3, // △
  LB: 4, // L1
  RB: 5, // R1
  LT: 6, // L2
  RT: 7, // R2
  VIEW: 8, // Share
  MENU: 9, // Options
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

const PRESS = 0.5;
const STICK_DEAD = 0.3;

export class PadInput {
  private cur: boolean[] = [];
  private prev: boolean[] = [];
  left = { x: 0, y: 0 };
  right = { x: 0, y: 0 };
  /** 이번 프레임에 패드를 만졌는지 (버튼이나 스틱) */
  touched = false;

  update(pad: Phaser.Input.Gamepad.Gamepad | undefined) {
    this.prev = this.cur;
    this.cur = pad ? pad.buttons.map((b) => b.value > PRESS) : [];
    const dead = (v: number) => (Math.abs(v) > STICK_DEAD ? v : 0);
    this.left = pad ? { x: dead(pad.leftStick.x), y: dead(pad.leftStick.y) } : { x: 0, y: 0 };
    this.right = pad ? { x: dead(pad.rightStick.x), y: dead(pad.rightStick.y) } : { x: 0, y: 0 };
    this.touched = this.cur.some(Boolean) || !!(this.left.x || this.left.y || this.right.x || this.right.y);
  }

  /** 메뉴를 쓰는 동안 누른 버튼: 손을 뗄 때까지 게임 조작으로 치지 않는다 (B로 메뉴를 닫자마자 스킬이 나가지 않도록) */
  private locked = new Set<number>();

  /** 지금 누르고 있는 버튼 중 btns를 잠근다 */
  lockHeld(btns: number[]) {
    for (const b of btns) if (this.cur[b]) this.locked.add(b);
  }

  held(btn: number) {
    if (this.locked.has(btn)) {
      if (this.cur[btn]) return false;
      this.locked.delete(btn);
    }
    return !!this.cur[btn];
  }

  pressed(btn: number) {
    return !!this.cur[btn] && !this.prev[btn];
  }

  get aiming() {
    return Math.hypot(this.right.x, this.right.y) > 0.4;
  }
}
