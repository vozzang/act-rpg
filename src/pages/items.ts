// 아이템 도감 페이지 (items.html): 아이템 목록(data/items.ts)의 모든 장비를 수치·얻는 곳과 함께 보여 준다.
// 드랍 확률·상점 값·조합법은 게임 코드(data/)의 규칙으로 바로 계산하므로, 목록이나 규칙을 고치면 페이지도 바뀐다.
import './pages.css';
import {
  ATTR_KEYS, ATTR_NAMES, BAG_SIZE, CLASSES, FORGE, FOOD, INV_SIZE, ITEM_DROP_MULT, ITEM_LIST, RARITY, RECIPES, SHOP, UNIQUE_DROP, ZONE_NAMES, effectText, recipeText, shopItemPrice,
  type ItemDef, type ItemSource,
} from '../game/data';
import type { ItemStats, Rarity, Slot } from '../game/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const SLOT_NAME: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
/** 표에 보이는 수치 열 */
const STAT_COLS: { key: keyof ItemStats; name: string }[] = [
  { key: 'atk', name: '공격' }, { key: 'def', name: '방어' }, { key: 'maxHp', name: '최대 HP' }, { key: 'crit', name: '치명' },
  ...ATTR_KEYS.map((k) => ({ key: k, name: ATTR_NAMES[k] })),
];
/** 상점에서 파는 장비 키 → 상점 이름 (data/shop.ts의 SHOP_ITEMS와 같다) */
const SHOP_OF: Record<string, string> = {
  greatsword: '공격 상점', longbow: '공격 상점', staff: '공격 상점', ring: '공격 상점',
  armor: '방어 상점', plate: '방어 상점', amulet: '방어 상점',
};

const tierZones = (t: number) => [t * 2 - 1, t * 2].filter((z) => z <= ZONE_NAMES.length);
const tierText = (t: number) => tierZones(t).map((z) => `${z}구역`).join('·');

/**
 * 장비가 한 번 떨어질 때 그 장비일 확률 (makeItem과 같은 계산):
 * 등급을 굴리고, 그 단계에 그 등급의 '드랍' 장비가 없으면 한 단계씩 낮춰 찾은 뒤 그중 하나를 고른다.
 */
function dropChance(d: ItemDef, weights: Record<Rarity, number>): number {
  if (!d.from.includes('drop')) return 0;
  const pool = (r: Rarity) => ITEM_LIST.filter((x) => x.tier === d.tier && x.rarity === r && x.from.includes('drop')).length;
  const total = ORDER.reduce((s, r) => s + weights[r], 0);
  let p = 0;
  for (let rolled = 0; rolled < ORDER.length; rolled++) {
    let r = rolled;
    while (r >= 0 && !pool(ORDER[r])) r--;
    if (r >= 0 && ORDER[r] === d.rarity) p += weights[ORDER[rolled]] / total;
  }
  return p / pool(d.rarity);
}

const DROP_W = Object.fromEntries(ORDER.map((r) => [r, RARITY[r].weight])) as Record<Rarity, number>;
const pct = (p: number) => (p >= 0.1 ? `${(p * 100).toFixed(0)}%` : p >= 0.01 ? `${(p * 100).toFixed(1)}%` : `${(p * 100).toFixed(2)}%`);

/** 이 장비가 결과로 나오는 조합법 (키의 단계 숫자를 뺀 것이 조합법 키) */
const recipeOf = (d: ItemDef) => RECIPES.find((r) => d.key === `${r.key}${d.tier}`);

function statCell(d: ItemDef, k: keyof ItemStats) {
  const v = d.stats[k];
  if (!v) return '<td class="muted">·</td>';
  return `<td>${k === 'crit' ? `${Math.round(v * 100)}%` : v}</td>`;
}

function render() {
  const tier = Number($<HTMLSelectElement>('tier').value);
  const slot = $<HTMLSelectElement>('slot').value as Slot | '';
  const rarity = $<HTMLSelectElement>('rarity').value as Rarity | '';
  const from = $<HTMLSelectElement>('from').value as ItemSource | '';
  const stat = $<HTMLSelectElement>('stat').value as keyof ItemStats | '';
  const q = $<HTMLInputElement>('q').value.trim();

  const list = ITEM_LIST.filter((d) => (!tier || d.tier === tier) && (!slot || d.slot === slot) && (!rarity || d.rarity === rarity)
    && (!from || d.from.includes(from)) && (!stat || d.stats[stat]) && (!q || d.name.includes(q) || d.base.includes(q)));

  const rows = list.map((d) => {
    const how: string[] = [];
    if (d.from.includes('drop')) {
      how.push(`<span class="chip">드랍 ${pct(dropChance(d, DROP_W))}</span><span class="chip">보스 ${pct(dropChance(d, SHOP.rarityWeight))}</span>`);
    }
    if (d.from.includes('shop')) {
      const base = d.key.replace(/\d+$/, '');
      how.push(`<span class="chip hot">${SHOP_OF[base] ?? '상점'} ${shopItemPrice(d.rarity, d.tier * 2 - 1).toLocaleString()} G</span>`);
    }
    const rc = recipeOf(d);
    if (rc) how.push(`<span class="chip hot">조합: ${recipeText(rc)}</span>`);
    if (d.from.includes('unique')) how.push(`<span class="chip hot">${UNIQUE_DROP.fromZone}구역부터 중간보스·문지기 ${Math.round(UNIQUE_DROP.chance * 100)}% (한 판에 하나)</span>`);
    if (d.cls) how.push(`<span class="chip">${CLASSES[d.cls].name} 전용</span>`);
    return `<tr><td style="color:${RARITY[d.rarity].color};font-weight:600">${d.name}${d.effect ? `<div class="muted" style="font-weight:400;font-size:12px;white-space:normal;min-width:220px">✦ ${effectText(d.effect)}</div>` : ''}</td>
      <td class="l" style="color:${RARITY[d.rarity].color}">${RARITY[d.rarity].name}</td>
      <td class="l muted">${SLOT_NAME[d.slot]} · ${d.base}</td><td class="l">${d.from.includes('unique') ? `유니크 <span class="muted">(${UNIQUE_DROP.fromZone}구역~)</span>` : `${d.tier}단계 <span class="muted">(${tierText(d.tier)})</span>`}</td>
      ${STAT_COLS.map((c) => statCell(d, c.key)).join('')}
      <td class="l wrap">${how.join('')}</td></tr>`;
  });

  // 등급 표: 몬스터 드랍과 중간보스·문지기(확정 드랍) 등급 확률
  const sum = (w: Record<Rarity, number>) => ORDER.reduce((s, r) => s + w[r], 0);
  const rarityRows = ORDER.map((r) => `<tr><td style="color:${RARITY[r].color};font-weight:700">${RARITY[r].name}</td>
    <td>${pct(RARITY[r].weight / sum(DROP_W))}</td><td>${pct(SHOP.rarityWeight[r] / sum(SHOP.rarityWeight))}</td>
    <td>${ITEM_LIST.filter((d) => d.rarity === r).length}개</td><td>${SHOP.itemPrice[r]} G</td></tr>`).join('');

  // 조합법 표
  const recipeRows = RECIPES.map((r) => {
    const results = ITEM_LIST.filter((d) => recipeOf(d) === r).sort((a, b) => a.tier - b.tier);
    return `<tr><td>${r.title}</td><td class="l">${recipeText(r)}</td>
      <td class="l wrap">${results.map((d) => `<span class="chip" title="${tierText(d.tier)}">${d.tier}단계: ${statText(d.stats)}</span>`).join('')}</td></tr>`;
  }).join('');

  $('out').innerHTML = `
    <div class="card"><h2>장비 (${list.length} / ${ITEM_LIST.length}개)</h2>
      <div class="sub">단계 = 그 단계 구역의 몬스터·상점에서 나온다 (1단계 1·2구역 … 5단계 9·10구역).
        <b>드랍</b> = 그 단계 몬스터가 장비를 떨어뜨렸을 때 이 장비일 확률, <b>보스</b> = 중간보스·문지기의 확정 드랍에서 이 장비일 확률.
        상점 값은 장비 단계 기준이라 어느 지점에서 사든 같다.</div>
      <div class="scroll"><table>
        <thead><tr><th>이름</th><th class="l">등급</th><th class="l">종류</th><th class="l">단계</th>
          ${STAT_COLS.map((c) => `<th>${c.name}</th>`).join('')}<th class="l">얻는 곳</th></tr></thead>
        <tbody>${rows.join('') || `<tr><td colspan="${STAT_COLS.length + 5}" class="muted">조건에 맞는 장비가 없습니다</td></tr>`}</tbody></table></div></div>
    <div class="card"><h2>등급</h2>
      <div class="sub">일반 몬스터는 쓰러질 때 몬스터마다 정해진 확률(몬스터 도감의 '장비 드랍', 기본 값 × ${ITEM_DROP_MULT})로 장비를 떨어뜨리고, 그때 아래 확률로 등급이 정해진다.
        중간보스·문지기는 장비를 반드시 떨어뜨리고 좋은 등급이 더 잘 나온다. 그 단계에 굴린 등급의 드랍 장비가 없으면 한 등급 낮은 장비가 나온다.</div>
      <div class="scroll"><table><thead><tr><th>등급</th><th>몬스터 드랍</th><th>중간보스·문지기</th><th>장비 수</th><th>상점 기본 값 (1단계)</th></tr></thead>
        <tbody>${rarityRows}</tbody></table></div></div>
    <div class="card"><h2>대장간 조합법</h2>
      <div class="sub">짝수 구역 상점 옆 대장간에서 아이템 상자·가방의 장비 ${FORGE.min}~${FORGE.max}개를 넣는다 (값: 구역 × ${FORGE.feePerZone} G, 재료는 사라진다).
        <b>조합하기</b>: 재료가 정확히 맞으면 아래 전설 장비가 나온다 — 결과 단계는 재료 중 가장 깊은 단계와 대장간 구역의 단계 중 높은 쪽.
        <b>랜덤 조합하기</b>: 재료 중 가장 좋은 등급에서 시작해 재료 3개면 55%, 2개면 25% 확률로 한 등급 오른다 (재료가 모두 같은 등급이면 +15%). 그 등급·단계의 드랍 장비 중 하나가 나온다.</div>
      <div class="scroll"><table><thead><tr><th>결과</th><th class="l">재료</th><th class="l">단계별 수치</th></tr></thead>
        <tbody>${recipeRows}</tbody></table></div></div>
    <div class="card"><h2>그 밖의 것</h2>
      <div class="sub">아이템 상자 ${INV_SIZE}칸(착용 중 — 수치가 능력치에 더해진다) · 가방 ${BAG_SIZE}칸(보관만). 상자가 차면 주운 장비는 가방으로 간다.<br>
        회복 상점: HP 음식(최대 HP의 ${FOOD.hp * 100}% 회복) · MP 음식(최대 MP의 ${FOOD.mp * 100}% 회복), 각 ${SHOP.foodPrice} G, 종류별 최대 ${FOOD.stackMax}개.</div></div>`;
}

function statText(s: ItemStats) {
  return STAT_COLS.filter((c) => s[c.key]).map((c) => `${c.name} +${c.key === 'crit' ? `${Math.round(s[c.key]! * 100)}%` : s[c.key]}`).join(' ');
}

const tsel = $<HTMLSelectElement>('tier');
tsel.add(new Option('전체', '0'));
for (let t = 1; t <= 5; t++) tsel.add(new Option(`${t}단계 (${tierText(t)})`, String(t)));
const rsel = $<HTMLSelectElement>('rarity');
for (const r of ORDER) rsel.add(new Option(RARITY[r].name, r));
const ssel = $<HTMLSelectElement>('stat');
for (const c of STAT_COLS) ssel.add(new Option(c.name, c.key));
for (const id of ['tier', 'slot', 'rarity', 'from', 'stat']) $(id).onchange = render;
$('q').oninput = render;
$('note').innerHTML = `장비 목록은 <code>src/game/data/items.ts</code>, 드랍·상점·대장간 규칙은 <code>src/game/data/</code>의 gear·shop·forge에서 바로 계산합니다.`;
render();
