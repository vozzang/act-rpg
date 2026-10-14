// HUD 공통: 글꼴과 글자 만들기
import Phaser from 'phaser';

export const FONT = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

export const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

export function makeText(scene: Phaser.Scene, x: number, y: number, str: string, size: number) {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: '#ffffff', resolution: 2 });
}
