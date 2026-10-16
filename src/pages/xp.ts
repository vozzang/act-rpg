// 경험치 표 페이지 (xp.html): 구역마다 얻을 수 있는 경험치와, 몬스터를 잡으며 지나갔을 때 각 구역에 도착·통과하는 레벨을 보여 준다.
// 몬스터 자리는 게임이 쓰는 맵(maps/world.json), 경험치는 sim.ts의 createEnemy와 같은 계산(종류별 경험치 × 구역 배율 × 중간보스 배율)이다.
// 경험치는 파티 인원으로 나누지 않고 살아 있는 파티원이 각자 다 받으므로, 인원수와 상관없이 같은 표가 된다.
import './pages.css';
import { DUNGEON, ELITE, ELITES, ENEMIES, GATE_KEEPERS, ZONE_NAMES, xpForLevel, zoneScale } from '../game/data';
import { gameLevel } from '../game/world';
import type { EnemyKind } from '../game/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const level = gameLevel();
const ZONES = ZONE_NAMES.length;

/** 구역 하나의 몬스터 경험치: 일반 몬스터 종류별(마릿수·마리당), 중간보스·문지기 */
type ZoneXp = {
  normal: Map<EnemyKind, { n: number; each: number }>;
  bosses: { name: string; role: string; xp: number }[];
};
const zones: ZoneXp[] = Array.from({ length: ZONES }, () => ({ normal: new Map(), bosses: [] }));
for (const s of level.spawns) {
  if (s.kind === 'boss') continue; // 흑룡은 경험치를 주지 않는다
  const z = zones[s.zone - 1];
  const elite = s.gate !== undefined || s.elite !== undefined;
  const xp = Math.round(ENEMIES[s.kind].xp * zoneScale(s.zone).xp * (elite ? ELITE.xp : 1));
  if (s.gate !== undefined) z.bosses.push({ name: GATE_KEEPERS[s.zone - 1].name, role: '문지기', xp });
  else if (s.elite !== undefined) z.bosses.push({ name: ELITES[s.zone - 1][s.elite].name, role: `중간보스 ${s.elite + 1}`, xp });
  else {
    const e = z.normal.get(s.kind) ?? { n: 0, each: xp };
    e.n++;
    z.normal.set(s.kind, e);
  }
}

/** 누적 경험치 → 레벨과 다음 레벨까지 찬 비율 */
function levelAt(total: number) {
  let lv = 1, x = total;
  while (x >= xpForLevel(lv)) x -= xpForLevel(lv++);
  return { lv, frac: x / xpForLevel(lv) };
}
const lvText = (total: number) => {
  const { lv, frac } = levelAt(total);
  return `Lv${lv} <span class="muted">(+${Math.floor(frac * 100)}%)</span>`;
};

function render() {
  const rate = Number($<HTMLInputElement>('rate').value) / 100;
  $('rate-v').textContent = `${Math.round(rate * 100)}%`;

  let total = 0;
  const rows: string[] = [];
  const ends: number[] = []; // 구역을 마칠 때 레벨 (아래 레벨 표 강조용)
  zones.forEach((z, i) => {
    const zone = i + 1;
    const normalN = [...z.normal.values()].reduce((s, e) => s + e.n, 0);
    const normalXp = [...z.normal.values()].reduce((s, e) => s + e.n * e.each, 0) * rate;
    const bossXp = z.bosses.reduce((s, b) => s + b.xp, 0);
    const zoneXp = Math.round(normalXp + bossXp);
    const start = total;
    total += zoneXp;
    ends.push(levelAt(total).lv);
    const kinds = [...z.normal.entries()].sort((a, b) => b[1].n * b[1].each - a[1].n * a[1].each)
      .map(([k, e]) => `<span class="chip">${ENEMIES[k].name} ×${e.n} <span class="muted">(${e.each})</span></span>`).join('');
    const bosses = z.bosses.map((b) => `<span class="chip hot">${b.name} <span class="muted">(${b.xp})</span></span>`).join('');
    const { frac } = levelAt(total);
    rows.push(`<tr>
      <td>${zone}구역 <span class="muted">${ZONE_NAMES[i]}</span></td>
      <td>${normalN}</td><td>×${zoneScale(zone).xp.toFixed(1)}</td>
      <td>${Math.round(normalXp).toLocaleString()}</td><td>${bossXp.toLocaleString()}</td>
      <td class="main">${zoneXp.toLocaleString()}</td><td>${total.toLocaleString()}</td>
      <td>${lvText(start)}</td><td class="main">${lvText(total)}</td>
      <td class="l"><div style="width:120px;height:8px;background:#0e1420;border-radius:4px"><div style="width:${Math.round(frac * 100)}%;height:100%;background:var(--gold);border-radius:4px"></div></div></td>
    </tr>
    <tr><td></td><td colspan="9" class="l wrap" style="padding-top:0">${kinds}${bosses}</td></tr>`);
  });

  // 레벨 표: 레벨마다 필요한 경험치와 누적. 구역을 마칠 때의 레벨에 구역 표시
  const maxLv = levelAt(Math.round(total)).lv + 2;
  let acc = 0;
  const lvRows: string[] = [];
  for (let lv = 1; lv <= Math.max(maxLv, 10); lv++) {
    const at = ends.map((l, i) => (l === lv ? `${i + 1}구역` : '')).filter(Boolean).join(', ');
    lvRows.push(`<tr class="${at ? 'mark' : ''}"><td>Lv${lv}</td><td>${acc.toLocaleString()}</td><td>${xpForLevel(lv).toLocaleString()}</td><td class="l">${at ? `<span class="chip hot">${at} 마칠 때</span>` : ''}</td></tr>`);
    acc += xpForLevel(lv);
  }

  // 던전 (5구역 던전 문, 들어가면): 웨이브 몬스터는 무작위라 평균값
  const zx = zoneScale(DUNGEON.zone).xp;
  const avg = DUNGEON.pool.reduce((s, k) => s + ENEMIES[k].xp, 0) / DUNGEON.pool.length;
  const dNormal = DUNGEON.waves.reduce((s, w) => s + w.count, 0);
  const dElites = DUNGEON.waves.flatMap((w) => w.elites ?? []);
  const dXp = Math.round(dNormal * avg * zx + dElites.reduce((s, e) => s + ENEMIES[e.kind].xp * zx * ELITE.xp, 0));

  $('out').innerHTML = `
    <div class="card"><h2>구역별 경험치와 레벨 (처치 비율 ${Math.round(rate * 100)}%)</h2>
      <div class="sub">경험치는 파티 인원으로 나누지 않고 <b>살아 있는 파티원이 각자 다 받는다</b> — 1명이든 4명이든 같은 표다. 몬스터가 쓰러질 때 쓰러져 있던 사람은 받지 못한다.
        구역 배율은 그 구역 몬스터 경험치에 곱해지고, 중간보스·문지기는 여기에 ×${ELITE.xp}. 흑룡은 경험치를 주지 않는다.
        아래 칩은 그 구역 몬스터 (괄호 = 마리당 경험치).</div>
      <div class="scroll"><table>
        <thead><tr><th>구역</th><th>일반 몬스터</th><th>경험치 배율</th><th>일반 경험치</th><th>중간보스·문지기</th><th>구역 합계</th><th>누적</th>
          <th>들어갈 때</th><th>마칠 때</th><th class="l">다음 레벨까지</th></tr></thead>
        <tbody>${rows.join('')}</tbody></table></div>
      <div class="sub" style="margin-top:8px">+ <b>던전</b> (5구역 던전 문, 한 판에 한 번): 일반 몬스터 ${dNormal}마리 + 중간보스 ${dElites.length}마리 ≈ <b class="main">${dXp.toLocaleString()}</b> 경험치 (몬스터가 무작위라 평균값, 위 표에는 넣지 않았다).</div></div>
    <div class="card"><h2>레벨별 필요 경험치</h2>
      <div class="sub">누적 = 1레벨부터 그 레벨에 오르기까지 모은 경험치, 필요 = 다음 레벨까지 필요한 경험치.</div>
      <div class="scroll"><table style="max-width:560px">
        <thead><tr><th>레벨</th><th>누적</th><th>필요</th><th class="l"></th></tr></thead>
        <tbody>${lvRows.join('')}</tbody></table></div></div>`;
}

$('rate').oninput = render;
$('note').innerHTML = `몬스터 자리는 <code>src/game/maps/world.json</code>, 경험치는 <code>src/game/data/enemies.ts</code>(ENEMIES의 xp · ELITE.xp)와 구역 배율(zoneScale), 레벨 곡선은 <code>stats.ts</code>의 xpForLevel에서 바로 계산합니다.`;
render();
