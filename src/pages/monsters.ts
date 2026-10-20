// 몬스터 도감 페이지 (monsters.html): 몬스터·중간보스·문지기·흑룡의 능력치와 출현 구역을 게임 데이터로 계산해 보여 준다.
// 출현 구역과 마릿수는 지금 맵 파일(maps/world.json)에서 센다. 구역·파티 인원을 고르면 그 조건의 실제 능력치를 보여 준다.
import './pages.css';
import { ELITE, ELITES, ENEMIES, GATE_KEEPERS, ITEM_DROP_MULT, ZONE_NAMES, partyHpScale, partyAtkScale, partyDefScale, zoneScale, type EnemyAI } from '../game/data';
import { zoneAt, type MapFile } from '../game/mapfile';
import worldMap from '../game/maps/world.json';
import type { EnemyKind } from '../game/types';

/** 행동 방식 설명 */
const AI_TEXT: Record<EnemyAI, string> = {
  hop: '튀어 오르며 다가와 몸으로 부딪힌다',
  melee: '다가와 몸으로 친다',
  ranged: '거리를 두고 쏜다 (화살·돌)',
  heavy: '멈춰서 몸이 깜빡인 뒤 크게 내려친다',
  dash: '힘을 모았다가 빠르게 돌진하며 벤다',
  frost: '거리를 두고 냉기 구슬을 쏜다 (맞으면 느려짐)',
  bomb: '거리를 두고 발밑에 화염탄을 떨어뜨린다',
  boss: '도약·돌진·화염탄·부하 소환',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const map = worldMap as MapFile;
const ZONES = map.zoneStartsTx.length;

// 맵 파일에서 구역별 마릿수를 센다 ([kind][zone] = 마릿수). 중간보스·문지기는 따로
const counts = new Map<EnemyKind, number[]>();
for (const s of map.spawns) {
  if (s.t === 'elite1' || s.t === 'elite2' || s.t === 'keeper') continue;
  const z = Math.min(zoneAt(map.zoneStartsTx, Math.floor(s.x + 0.5)), ZONES);
  if (!counts.has(s.t)) counts.set(s.t, Array(ZONES + 1).fill(0));
  counts.get(s.t)![z]++;
}

/** 실제 능력치 (sim.ts의 createEnemy와 같은 계산) */
function scaled(base: { hp: number; atk: number; def: number; xp: number; gold: number }, zone: number, party: number, elite: boolean, boss = false) {
  const zs = boss ? { hp: 1, atk: 1, def: 0, xp: 1 } : zoneScale(zone);
  return {
    hp: Math.round(base.hp * zs.hp * partyHpScale(party)),
    atk: Math.round(base.atk * zs.atk * partyAtkScale(party)),
    def: Math.round((base.def + zs.def) * partyDefScale(party)),
    xp: Math.round(base.xp * zs.xp * (elite ? ELITE.xp : 1)),
    gold: Math.round(base.gold * zs.xp * (elite ? ELITE.gold : 1)), // 돈은 ±30% 흔들린다 (평균값)
  };
}

function render() {
  const zone = Number($<HTMLSelectElement>('zone').value);
  const party = Number($<HTMLSelectElement>('party').value);
  const q = $<HTMLInputElement>('q').value.trim();
  const hit = (name: string) => !q || name.includes(q);
  const zname = (z: number) => `${z}구역 ${ZONE_NAMES[z - 1]}`;

  // 일반 몬스터
  const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => k !== 'boss' && hit(ENEMIES[k].name));
  kinds.sort((a, b) => firstZone(a) - firstZone(b) || ENEMIES[a].hp - ENEMIES[b].hp);
  const mon = kinds.map((k) => {
    const d = ENEMIES[k];
    const s = scaled(d, zone, party, false);
    const c = counts.get(k) ?? [];
    const zones = c.map((n, z) => (n ? `<span class="chip ${z === zone ? 'hot' : ''}">${z}구역 ${n}</span>` : '')).join('');
    const total = c.reduce((a, b) => a + b, 0);
    return `<tr class="${c[zone] ? 'mark' : ''}">
      <td>${d.name}</td><td class="l muted">${AI_TEXT[d.ai]}${d.heavy ? ' · 잘 안 밀림' : ''}</td>
      <td>${d.hp}</td><td>${d.atk}</td><td>${d.def}</td><td>${d.speed}</td>
      <td class="main">${s.hp.toLocaleString()}</td><td class="main">${s.atk}</td><td class="main">${s.def}</td><td>${s.xp}</td><td>${s.gold}</td>
      <td>${(d.dropRate * ITEM_DROP_MULT * 100).toFixed(1)}%</td>
      <td class="l">${zones || '<span class="muted">맵에 없음</span>'} <span class="muted">(총 ${total})</span></td></tr>`;
  });

  // 중간보스·문지기 (각자 자기 구역 기준)
  const elites: string[] = [];
  for (let z = 1; z <= ZONES; z++) {
    const list = [
      ...(ELITES[z - 1] ?? []).map((e, i) => ({ e, role: i === 0 ? '중간보스 1 (첫째 꺾이는 곳)' : '중간보스 2 (둘째 꺾이는 곳)' })),
      ...(GATE_KEEPERS[z - 1] ? [{ e: GATE_KEEPERS[z - 1], role: '문지기 (구역 출구)' }] : []),
    ];
    for (const { e, role } of list) {
      if (!hit(e.name)) continue;
      const s = scaled({ ...e, xp: ENEMIES[e.kind].xp, gold: ENEMIES[e.kind].gold }, z, party, true);
      elites.push(`<tr class="${z === zone ? 'mark' : ''}"><td>${zname(z)}</td><td class="l">${e.name}</td><td class="l muted">${role}</td>
        <td class="l muted">${ENEMIES[e.kind].name} · ${AI_TEXT[ENEMIES[e.kind].ai]}${e.kind === 'skeleton' || e.kind === 'iceWitch' || e.kind === 'pyromancer' ? ' (3발)' : ''}</td>
        <td class="main">${s.hp.toLocaleString()}</td><td class="main">${s.atk}</td><td class="main">${s.def}</td><td>${s.xp}</td><td>${s.gold}</td></tr>`);
    }
  }

  // 흑룡
  const bd = ENEMIES.boss;
  const bs = scaled(bd, 1, party, false, true);
  $('out').innerHTML = `
    <div class="card"><h2>몬스터 (${kinds.length}종)</h2>
      <div class="sub">기본 = 1구역 기준 값. <b class="main">노란 칸</b> = ${zname(zone)} · ${party}인 파티에서의 실제 값 (HP·공격·방어는 인원이 많을수록 늘어난다).
        파란 줄 = 이 구역에 나오는 몬스터. 경험치·돈도 그 구역 기준(돈은 평균). 장비 드랍 = 쓰러뜨렸을 때 장비가 나올 확률.</div>
      <div class="scroll"><table>
        <thead><tr><th>이름</th><th class="l">행동</th><th>기본 HP</th><th>기본 공격</th><th>기본 방어</th><th>속도</th>
          <th>HP</th><th>공격</th><th>방어</th><th>경험치</th><th>돈</th><th>장비 드랍</th><th class="l">출현 구역 (마릿수)</th></tr></thead>
        <tbody>${mon.join('')}</tbody></table></div></div>
    <div class="card"><h2>중간보스 · 문지기</h2>
      <div class="sub">각자 자기 구역 기준 · ${party}인 파티 값. 넉백을 ${ELITE.knockResist * 100}%만 받고 기절은 절반, 경험치 ${ELITE.xp}배 · 돈 ${ELITE.gold}배, 장비를 반드시 떨어뜨린다. 문지기를 쓰러뜨려야 다음 구역 문이 열린다.</div>
      <div class="scroll"><table>
        <thead><tr><th>구역</th><th class="l">이름</th><th class="l">자리</th><th class="l">모양 · 행동</th><th>HP</th><th>공격</th><th>방어</th><th>경험치</th><th>돈</th></tr></thead>
        <tbody>${elites.join('') || '<tr><td colspan="9" class="muted">찾는 이름이 없습니다</td></tr>'}</tbody></table></div></div>
    ${hit(bd.name) ? `<div class="card"><h2>최종 보스: ${bd.name}</h2>
      <div class="sub">구역 배율 없이 자기 능력치 그대로 (HP·공격·방어에 인원 배율). ${AI_TEXT.boss}. 체력이 절반 아래로 떨어지면 빨라지고 고블린을 불러낸다.</div>
      <div class="scroll"><table><thead><tr><th>HP (${party}인)</th><th>공격</th><th>방어</th><th>속도</th></tr></thead>
        <tbody><tr><td class="main">${bs.hp.toLocaleString()}</td><td class="main">${bs.atk}</td><td class="main">${bs.def}</td><td>${bd.speed}</td></tr></tbody></table></div></div>` : ''}`;
}

/** 처음 나오는 구역 (정렬용, 없으면 맨 뒤) */
function firstZone(k: EnemyKind) {
  const i = (counts.get(k) ?? []).findIndex((n) => n > 0);
  return i < 0 ? 99 : i;
}

const zsel = $<HTMLSelectElement>('zone');
for (let z = 1; z <= ZONES; z++) zsel.add(new Option(`${z}구역 ${ZONE_NAMES[z - 1]}`, String(z)));
zsel.onchange = render;
$('party').onchange = render;
$('q').oninput = render;
$('note').innerHTML = `값은 <code>src/game/data/enemies.ts</code>(ENEMIES · ELITES · GATE_KEEPERS · ZONE_SCALE)와 지금 맵 파일에서 바로 계산합니다. 밸런스나 맵을 바꾸면 이 표도 바뀝니다.`;
render();
