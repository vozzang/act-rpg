// 결과 이미지: 결과 화면의 기록(걸린 시간·처치·사람마다 기록과 장비)을 PNG 한 장으로 그려 내려받게 한다.
// 오른쪽 아래 QR 코드는 게임 사이트(SITE_URL)로 연결된다. QR 라이브러리(qrcode-generator, MIT)는 저장할 때만 불러온다.
import { CLASSES, RARITY, itemName } from '../game/data';
import type { Player, Snapshot } from '../game/types';
import { FONT, hex } from './ui';

/** QR 코드가 여는 주소 (배포된 게임) */
export const SITE_URL = 'https://vozzang.github.io/act-rpg/';

const W = 1080;
const PAD = 56;

/** 걸린 시간 (h:mm:ss 또는 m:ss) */
export function playTime(tick: number) {
  const sec = Math.floor(tick / 60);
  const mm = String(Math.floor(sec / 60) % 60).padStart(2, '0'), ss = String(sec % 60).padStart(2, '0');
  return sec >= 3600 ? `${Math.floor(sec / 3600)}:${mm}:${ss}` : `${Math.floor(sec / 60)}:${ss}`;
}

/** 결과 이미지를 그려 PNG로 내려받는다. myId: 내 줄을 금색 테두리로 */
export async function downloadResultImage(s: Snapshot, myId: string) {
  const { default: qrcode } = await import('qrcode-generator');
  const win = s.status === 'victory';
  const cardH = 236;
  const H = 330 + s.players.length * (cardH + 20) + 290;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  const font = (size: number, bold = false) => (c.font = `${bold ? '700 ' : ''}${size}px ${FONT}`);
  const text = (str: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', bold = false) => {
    font(size, bold);
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(str, x, y);
    return c.measureText(str).width;
  };
  const round = (x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  };

  // 배경
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0f1522');
  bg.addColorStop(1, win ? '#2a1a3a' : s.status === 'ended' ? '#1a2236' : '#2a1218');
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';

  // 머리말
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  text('ACT RPG', PAD, 78, 30, '#8fb4ff', 'left', true);
  text(date, W - PAD, 78, 24, '#8d9ab3', 'right');
  text(win ? '흑룡 처치!' : s.status === 'ended' ? '게임 종료' : '전멸...', W / 2, 168, 76, win ? '#ffd040' : s.status === 'ended' ? '#c8d0e0' : '#ff6060', 'center', true);
  const kills = s.players.reduce((n, p) => n + p.kills, 0);
  const dg = s.dungeon ? (s.dungeon.cleared ? '던전 클리어' : s.dungeon.state === 'open' ? '' : '던전 실패') : '';
  const summary = [`${win ? '클리어' : '플레이'} 시간 ${playTime(s.tick)}`, `처치 ${kills.toLocaleString()}`, win ? '10구역 완주' : `${s.zone}구역까지`, dg].filter(Boolean).join('   ·   ');
  text(summary, W / 2, 236, 28, '#d8e4ff', 'center');

  // 사람마다 카드
  let y = 290;
  const best = Math.max(...s.players.map((p) => p.record.dmg));
  for (const p of s.players) {
    drawCard(p, y);
    y += cardH + 20;
  }

  function drawCard(p: Player, top: number) {
    const def = CLASSES[p.cls], mine = p.id === myId;
    round(PAD, top, W - PAD * 2, cardH, 18);
    c.fillStyle = '#ffffff12';
    c.fill();
    if (mine) {
      c.strokeStyle = '#ffd040';
      c.lineWidth = 3;
      c.stroke();
    }
    c.fillStyle = hex(def.color);
    c.fillRect(PAD, top + 18, 8, cardH - 36);
    const x = PAD + 32;
    text(`${p.name}${mine ? '  (나)' : ''}${p.record.dmg === best && best > 0 && s.players.length > 1 ? '  ★' : ''}`, x, top + 50, 34, '#ffffff', 'left', true);
    text(`Lv.${p.level}  ${def.race} ${def.name}`, W - PAD - 28, top + 50, 26, hex(def.color), 'right', true);
    const stats: [string, string][] = [
      ['처치', p.kills.toLocaleString()], ['중간보스', String(p.record.eliteKills)], ['준 피해', p.record.dmg.toLocaleString()], ['받은 피해', p.record.taken.toLocaleString()],
      ['쓰러짐', String(p.record.downs)], ['부활', String(p.record.revives)], ['경험치', p.record.xp.toLocaleString()], ['돈', `${p.record.gold.toLocaleString()} G`],
    ];
    const colW = (W - PAD * 2 - 64) / 4;
    stats.forEach(([k, v], i) => {
      const cx = x + (i % 4) * colW, cy = top + 96 + Math.floor(i / 4) * 52;
      text(k, cx, cy, 20, '#8d9ab3');
      text(v, cx + colW - 24, cy + 4, 28, '#ffffff', 'right', true);
    });
    // 착용 장비 (등급 색, 넘치면 …)
    let ix = x;
    const iy = top + 196;
    const items = p.inv.flatMap((sl) => (sl?.kind === 'item' ? [sl.item] : []));
    if (!items.length) text('착용 장비 없음', ix, iy, 20, '#667788');
    for (const it of items) {
      const name = itemName(it, p.cls);
      font(20);
      const w = c.measureText(name).width;
      if (ix + w > W - PAD - 60) {
        text('…', ix, iy, 20, '#8d9ab3');
        break;
      }
      text(name, ix, iy, 20, RARITY[it.rarity].color);
      ix += w + 18;
    }
  }

  // 꼬리말: 안내 + QR 코드 (게임 사이트)
  const qr = qrcode(0, 'M');
  qr.addData(SITE_URL);
  qr.make();
  const n = qr.getModuleCount(), qs = 220, cell = qs / n, qx = W - PAD - qs - 20, qy = H - qs - 60;
  round(qx - 20, qy - 20, qs + 40, qs + 40, 16);
  c.fillStyle = '#ffffff';
  c.fill();
  c.fillStyle = '#000000';
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) c.fillRect(qx + col * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
  text('지금 플레이하기', PAD, qy + 50, 40, '#ffffff', 'left', true);
  text(SITE_URL.replace(/^https:\/\//, ''), PAD, qy + 100, 28, '#8fb4ff');
  text('4인 협동 3D 액션 RPG — QR 코드로 바로 시작', PAD, qy + 200, 22, '#8d9ab3');

  // 내려받기
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `actrpg-${win ? 'clear' : 'result'}-${date.replace(/[.: ]/g, '').slice(0, 12)}.png`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
