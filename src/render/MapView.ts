// 미니맵(오른쪽 아래)과 전체 지도(Tab 누르고 있기 / M 켜고 끄기).
// 3D 카메라와 같은 방향(북쪽이 위, 맵 진행 방향이 오른쪽)으로 위에서 내려다본 모습이다.
import Phaser from 'phaser';
import { CLASSES, ENEMIES, SHOP_TYPES, TILE, VIEW_H, VIEW_W, ZONE_NAMES, ZONE_PALETTE } from '../game/data';
import { G_ROAD, G_STONE, T_FLOOR, T_GATE, zoneOfTx, type Level } from '../game/level';
import type { Snapshot } from '../game/types';
import { hex, makeText } from './ui';

const SCALE = 1.2; // 미니맵에서 타일 한 칸의 크기(px)
const MINIMAP_BOTTOM = 10;
const MINIMAP_MAX_W = 216; // 미니맵이 이보다 넓으면 줄여서 보여준다 (맵이 길어져도 아이템 상자를 가리지 않게)

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
        // 구역별 색 (ZONE_PALETTE). 미니맵은 3D보다 조금 어둡게
        const pal = ZONE_PALETTE[zoneOfTx(level, tx) - 1];
        const shade = (c: number, k: number) => new Phaser.Display.Color((c >> 16) & 255, (c >> 8) & 255, c & 255).darken(k).color;
        const color = t !== T_FLOOR && t !== T_GATE ? pal.wall : gr === G_ROAD ? pal.road : gr === G_STONE ? 0x8a8a90 : shade(pal.ground, 12);
        g.fillStyle(color, 1).fillRect(tx * SCALE, ty * SCALE, SCALE, SCALE);
      }
    g.generateTexture('minimap', Math.ceil(w * SCALE), Math.ceil(h * SCALE));
    g.destroy();

    // 위치 점(HUD, depth 100)보다 아래
    this.minimap = scene.add.image(VIEW_W - 10, VIEW_H - MINIMAP_BOTTOM, 'minimap').setOrigin(1, 1).setDepth(99).setAlpha(0.9)
      .setScale(Math.min(1, MINIMAP_MAX_W / (w * SCALE)));

    const zoom = (VIEW_W - 60) / (w * SCALE);
    this.bigMap = scene.add.image(VIEW_W / 2, VIEW_H / 2 + 20, 'minimap').setScale(zoom).setDepth(150).setVisible(false);
    this.bigMapG = scene.add.graphics().setDepth(151).setVisible(false);
    for (let i = 0; i < 4; i++) {
      this.names.push(makeText(scene, 0, 0, '', 13).setOrigin(0.5, 1).setStroke('#000', 4).setDepth(152).setVisible(false));
    }
    // 구역 이름은 지도 위쪽 바깥, 보스는 보스 방 위
    const top = this.bigMap.y - this.bigMap.displayHeight / 2 - 8;
    const zoneLabels = level.zoneStartsTx.map((tx, i) => ({ text: `${i + 1}구역 ${ZONE_NAMES[i]}`, x: ((tx + (level.zoneStartsTx[i + 1] ?? level.arenaTx)) / 2) * TILE }));
    for (const l of [...zoneLabels, { text: ENEMIES.boss.name, x: level.arenaCenter.x }]) {
      const m = this.pos(this.bigMap, l.x, 0);
      this.labels.push(makeText(scene, m.x, top, l.text, 13).setOrigin(0.5, 1).setColor('#e8e0c0').setStroke('#000', 4).setDepth(152).setVisible(false));
    }
  }

  private minimapVisible = true;

  /** 터치 화면에서는 오른쪽 아래를 버튼이 쓰므로 미니맵을 숨긴다 (전체 지도는 지도 버튼으로) */
  setMinimapVisible(v: boolean) {
    this.minimapVisible = v;
    this.minimap.setVisible(v);
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
    if (this.minimapVisible) this.drawMarkers(g, this.minimap, s, false);
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
    // 상점: 종류별 색 점 (회복 초록 · 공격 빨강 · 방어 파랑)
    for (const sh of this.level.shops) {
      const m = this.pos(img, sh.x, sh.y);
      const r = big ? 5 : 2.5;
      g.fillStyle(0x000000, 1).fillCircle(m.x, m.y, r + 1.5);
      g.fillStyle(SHOP_TYPES[sh.type].color, 1).fillCircle(m.x, m.y, r);
    }
    // 닫힌 문: 빨간 막대 (문지기를 쓰러뜨리면 사라진다)
    this.level.gates.forEach((gate, i) => {
      if (s.gates?.[i]) return;
      const a = this.pos(img, (gate.tx + 0.5) * TILE, gate.ty0 * TILE);
      const b = this.pos(img, (gate.tx + 0.5) * TILE, (gate.ty1 + 1) * TILE);
      g.lineStyle(big ? 6 : 4, 0x000000, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(big ? 3 : 2, 0xff4040, 1).lineBetween(a.x, a.y, b.x, b.y);
    });
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
