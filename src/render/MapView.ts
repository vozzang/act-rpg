// 미니맵(오른쪽 아래)과 전체 지도(Tab 누르고 있기 / M 켜고 끄기).
// 3D 카메라와 같은 방향(북쪽이 위, 맵 진행 방향이 오른쪽)으로 위에서 내려다본 모습이다.
import Phaser from 'phaser';
import { CLASSES, ENEMIES, TILE, VIEW_H, VIEW_W, ZONE_NAMES } from '../game/data';
import { G_ROAD, G_STONE, T_FLOOR, type Level } from '../game/level';
import type { Snapshot } from '../game/types';
import { hex, makeText } from './ui';

const SCALE = 1.2; // 미니맵에서 타일 한 칸의 크기(px)
const MINIMAP_BOTTOM = 10;

export class MapView {
  readonly minimap: Phaser.GameObjects.Image;
  private bigMap: Phaser.GameObjects.Image;
  private bigMapG: Phaser.GameObjects.Graphics;
  private names: Phaser.GameObjects.Text[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private toggled = false;

  constructor(private scene: Phaser.Scene, private level: Level, private myId: string) {
    const { w, h, tiles, ground } = level;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x000000, 0.55).fillRect(0, 0, w * SCALE, h * SCALE);
    for (let ty = 0; ty < h; ty++)
      for (let tx = 0; tx < w; tx++) {
        const t = tiles[ty * w + tx];
        const gr = ground[ty * w + tx];
        const color = t !== T_FLOOR ? 0x24301e : gr === G_ROAD ? 0xb8a070 : gr === G_STONE ? 0x8a8a90 : 0x5a7a48;
        g.fillStyle(color, 1).fillRect(tx * SCALE, ty * SCALE, SCALE, SCALE);
      }
    g.generateTexture('minimap', Math.ceil(w * SCALE), Math.ceil(h * SCALE));
    g.destroy();

    // 위치 점(HUD, depth 100)보다 아래
    this.minimap = scene.add.image(VIEW_W - 10, VIEW_H - MINIMAP_BOTTOM, 'minimap').setOrigin(1, 1).setDepth(99).setAlpha(0.9);

    const zoom = (VIEW_W - 60) / (w * SCALE);
    this.bigMap = scene.add.image(VIEW_W / 2, VIEW_H / 2 + 20, 'minimap').setScale(zoom).setDepth(150).setVisible(false);
    this.bigMapG = scene.add.graphics().setDepth(151).setVisible(false);
    for (let i = 0; i < 4; i++) {
      this.names.push(makeText(scene, 0, 0, '', 13).setOrigin(0.5, 1).setStroke('#000', 4).setDepth(152).setVisible(false));
    }
    // 구역 이름은 지도 위쪽 바깥, 보스는 보스 방 위
    const top = this.bigMap.y - this.bigMap.displayHeight / 2 - 8;
    const zoneLabels = level.zoneStartsTx.map((tx, i) => ({ text: `${i + 1}구역 ${ZONE_NAMES[i]}`, x: (tx + 20) * TILE }));
    for (const l of [...zoneLabels, { text: ENEMIES.boss.name, x: level.arenaCenter.x }]) {
      const m = this.pos(this.bigMap, l.x, 0);
      this.labels.push(makeText(scene, m.x, top, l.text, 13).setOrigin(0.5, 1).setColor('#e8e0c0').setStroke('#000', 4).setDepth(152).setVisible(false));
    }
  }

  /** 미니맵 바로 위 y좌표 (조작 안내를 그 위에 둔다) */
  get top() {
    return this.minimap.y - this.minimap.displayHeight;
  }

  /** 월드 좌표 → 지도 이미지 위의 화면 좌표 */
  private pos(img: Phaser.GameObjects.Image, x: number, y: number) {
    const k = SCALE * img.scaleX;
    const left = img.x - img.displayWidth * img.originX, top = img.y - img.displayHeight * img.originY;
    return { x: left + (x / TILE) * k, y: top + (y / TILE) * k };
  }

  /** 매 프레임. g는 HUD 그래픽(미니맵 위 점을 그린다). */
  update(g: Phaser.GameObjects.Graphics, s: Snapshot, holdOpen: boolean, togglePressed: boolean) {
    this.drawMarkers(g, this.minimap, s, false);
    if (togglePressed) this.toggled = !this.toggled;
    const open = holdOpen || this.toggled;
    this.bigMap.setVisible(open);
    this.bigMapG.setVisible(open);
    for (const l of this.labels) l.setVisible(open);
    this.names.forEach((n, i) => n.setVisible(open && i < s.players.length));
    if (open) this.drawBigMap(s);
  }

  /** 플레이어 위치와 보스 방 표시. big이면 전체 지도용으로 크게 그린다. */
  private drawMarkers(g: Phaser.GameObjects.Graphics, img: Phaser.GameObjects.Image, s: Snapshot, big: boolean) {
    const t = this.scene.time.now / 1000;
    // 상점: 노란 동전 모양
    for (const sh of this.level.shops) {
      const m = this.pos(img, sh.x, sh.y);
      const r = big ? 6 : 3;
      g.fillStyle(0x000000, 1).fillCircle(m.x, m.y, r + 1.5);
      g.fillStyle(0xffcc33, 1).fillCircle(m.x, m.y, r);
    }
    const boss = this.pos(img, this.level.arenaCenter.x, this.level.arenaCenter.y);
    const br = big ? 8 : 4;
    g.fillStyle(0x000000, 1).fillCircle(boss.x, boss.y, br + 1.5);
    g.fillStyle(0xd02020, 1).fillCircle(boss.x, boss.y, br);
    g.fillStyle(0xffd040, 1).fillTriangle(boss.x - br * 0.6, boss.y - br * 0.2, boss.x + br * 0.6, boss.y - br * 0.2, boss.x, boss.y - br * 1.1);

    // 내 표시가 맨 위에 오도록 마지막에 그린다
    const ordered = [...s.players].sort((a, b) => Number(a.id === this.myId) - Number(b.id === this.myId));
    for (const p of ordered) {
      const m = this.pos(img, p.x, p.y);
      const r = big ? 6 : 4;
      const mine = p.id === this.myId;
      if (mine) {
        const pulse = (t * 1.5) % 1;
        g.lineStyle(2, 0xffffff, 1 - pulse).strokeCircle(m.x, m.y, r + 2 + pulse * (big ? 12 : 7));
      }
      if (p.dead) {
        g.lineStyle(big ? 3 : 2, 0x000000, 1).lineBetween(m.x - r, m.y - r, m.x + r, m.y + r).lineBetween(m.x - r, m.y + r, m.x + r, m.y - r);
        g.lineStyle(big ? 2 : 1.5, 0xaaaaaa, 1).lineBetween(m.x - r, m.y - r, m.x + r, m.y + r).lineBetween(m.x - r, m.y + r, m.x + r, m.y - r);
      } else {
        g.fillStyle(0x000000, 1).fillCircle(m.x, m.y, r + 1.5);
        g.fillStyle(CLASSES[p.cls].color, 1).fillCircle(m.x, m.y, r);
        if (mine) g.fillStyle(0xffffff, 1).fillCircle(m.x, m.y, r * 0.4);
      }
    }
  }

  private drawBigMap(s: Snapshot) {
    const g = this.bigMapG;
    const img = this.bigMap;
    g.clear();
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, VIEW_W, VIEW_H);
    g.lineStyle(2, 0xe8e0c0, 0.6).strokeRect(
      img.x - img.displayWidth / 2 - 4, img.y - img.displayHeight / 2 - 4, img.displayWidth + 8, img.displayHeight + 8,
    );
    this.drawMarkers(g, img, s, true);
    // 가까이 모인 동료의 이름표는 위로 쌓고, 점까지 선을 긋는다
    const placed: { x: number; y: number }[] = [];
    s.players.forEach((p, i) => {
      const m = this.pos(img, p.x, p.y);
      const mine = p.id === this.myId;
      const base = m.y - (mine ? 14 : 10);
      let y = base;
      while (placed.some((q) => Math.abs(q.x - m.x) < 60 && Math.abs(q.y - y) < 15)) y -= 15;
      placed.push({ x: m.x, y });
      if (y !== base) g.lineStyle(1, 0xffffff, 0.5).lineBetween(m.x, y, m.x, m.y - 6);
      this.names[i]
        .setText(`${mine ? '나 · ' : ''}${p.name}${p.dead ? ' (쓰러짐)' : ''}`)
        .setColor(p.dead ? '#aaaaaa' : hex(CLASSES[p.cls].color))
        .setPosition(m.x, y);
    });
  }
}
