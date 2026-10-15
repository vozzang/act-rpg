// 직업 능력치 페이지 (classes.html): 직업별·레벨별 능력치와 전투 수치를 게임 데이터(data/)로 계산해 표로 보여 준다.
// 장비는 없는 상태로 계산한다. 레벨업 포인트를 어디에 배분하는지 고를 수 있다.
import './pages.css';
import {
  ATTR_EFFECT, ATTR_KEYS, ATTR_NAMES, CLASSES, CLASS_ORDER, POINTS_PER_LEVEL, SKILL_UNLOCKS, deriveStats, totalAttrs, xpForLevel,
} from '../game/data';
import type { AttrKey, Attrs, ClassId } from '../game/types';

/** 포인트 배분 방식: 주 능력치 · 공격 능력치 · 체력 · 4가지에 고르게 · 배분하지 않음 */
type AllocMode = 'main' | 'atk' | 'vit' | 'even' | 'none';
const ALLOC_LABEL: Record<AllocMode, string> = {
  main: '모두 주 능력치에', atk: '모두 공격 능력치에', vit: '모두 체력에', even: '4가지에 고르게', none: '배분하지 않음',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let cls: ClassId | 'all' = 'all';

/** lv레벨까지 mode대로 포인트를 배분했을 때의 배분량 */
function allocAt(c: ClassId, lv: number, mode: AllocMode): Attrs {
  const a: Attrs = { str: 0, dex: 0, int: 0, vit: 0 };
  const pts = (lv - 1) * POINTS_PER_LEVEL;
  const def = CLASSES[c];
  if (mode === 'none') return a;
  if (mode === 'even') {
    ATTR_KEYS.forEach((k, i) => (a[k] = Math.floor(pts / 4) + (i < pts % 4 ? 1 : 0)));
    return a;
  }
  const key: AttrKey = mode === 'main' ? def.mainAttr : mode === 'atk' ? def.atkAttr ?? def.mainAttr : 'vit';
  a[key] = pts;
  return a;
}

function table(c: ClassId, mode: AllocMode, maxLv: number) {
  const def = CLASSES[c];
  const atkKey = def.atkAttr ?? def.mainAttr;
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const rows: string[] = [];
  let xpTotal = 0;
  for (let lv = 1; lv <= maxLv; lv++) {
    const at = totalAttrs(c, lv, allocAt(c, lv, mode), []);
    const st = deriveStats(c, lv, at, []);
    const skill = SKILL_UNLOCKS.indexOf(lv);
    rows.push(`<tr class="${skill >= 0 ? 'mark' : ''}">
      <td>${lv}${skill >= 0 ? ` <span class="chip hot">${def.skills[skill].name}</span>` : ''}</td>
      ${ATTR_KEYS.map((k) => `<td class="${k === def.mainAttr || k === atkKey ? 'main' : ''}">${at[k]}</td>`).join('')}
      <td>${st.maxHp}</td><td>${st.maxMp}</td><td class="main">${st.atk}</td><td>${st.def}</td>
      <td>${pct(st.crit)}</td><td>${pct(st.dodge)}</td><td>+${pct(st.haste)}</td><td>+${pct(st.cdr)}</td><td>${st.mpRegen.toFixed(1)}</td>
      <td class="muted">${xpTotal.toLocaleString()}</td><td class="muted">${xpForLevel(lv).toLocaleString()}</td>
    </tr>`);
    xpTotal += xpForLevel(lv);
  }
  const atk = def.attack;
  return `<div class="card">
    <h2>${def.race} ${def.name}</h2>
    <div class="sub">주 능력치 <b class="main">${ATTR_NAMES[def.mainAttr]}</b>${atkKey !== def.mainAttr ? ` · 공격은 <b class="main">${ATTR_NAMES[atkKey]}</b>` : ''}
      · 레벨당 자동 상승 ${ATTR_KEYS.map((k) => `${ATTR_NAMES[k]} +${def.attrGrowth[k]}`).join(', ')}
      · 이동 속도 ${def.speed} · 기본 공격 ${atk.kind === 'melee' ? `근접 (간격 ${atk.cd}초, 배율 ×${atk.mult}, 사거리 ${atk.range})` : `원거리 (간격 ${atk.cd}초, 배율 ×${atk.mult}, 사거리 ${atk.range}${atk.aoe ? `, 범위 ${atk.aoe}` : ''})`}<br />
      스킬: ${def.skills.map((s) => `Lv${s.unlock} ${s.name} (MP ${s.mp}, ${s.cd}초)`).join(' · ')}</div>
    <div class="scroll"><table>
      <thead><tr><th>레벨</th>${ATTR_KEYS.map((k) => `<th>${ATTR_NAMES[k]}</th>`).join('')}<th>최대 HP</th><th>최대 MP</th><th>공격</th><th>방어</th>
        <th>치명</th><th>회피</th><th>공속</th><th>스킬가속</th><th>MP 회복/초</th><th>누적 경험치</th><th>다음 레벨까지</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>
  </div>`;
}

function render() {
  const mode = $<HTMLSelectElement>('alloc').value as AllocMode;
  const maxLv = Math.max(5, Math.min(60, Number($<HTMLInputElement>('maxlv').value) || 30));
  const list = cls === 'all' ? CLASS_ORDER : [cls];
  $('out').innerHTML = list.map((c) => table(c, mode, maxLv)).join('');
  document.querySelectorAll<HTMLButtonElement>('#cls-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.cls === cls));
}

// 직업 탭
const tabs = $('cls-tabs');
for (const c of ['all', ...CLASS_ORDER] as const) {
  const b = document.createElement('button');
  b.dataset.cls = c;
  b.textContent = c === 'all' ? '전체' : `${CLASSES[c].race} ${CLASSES[c].name}`;
  b.onclick = () => {
    cls = c;
    render();
  };
  tabs.appendChild(b);
}
const sel = $<HTMLSelectElement>('alloc');
for (const [k, v] of Object.entries(ALLOC_LABEL)) sel.add(new Option(v, k));
sel.onchange = render;
$('maxlv').oninput = render;
$('note').innerHTML = `장비 없이 계산한 값입니다(장비 수치는 그대로 더해집니다). 레벨업마다 능력치 포인트 ${POINTS_PER_LEVEL}을 받습니다.
  계산식: 공격 = 직업 기본값 + 공격 능력치 × ${ATTR_EFFECT.mainAtk} · 최대 HP = 직업 기본값 + 체력 × ${ATTR_EFFECT.vitHp} + (레벨−1) × ${ATTR_EFFECT.levelHp}
  · 방어 = 직업 기본값 + 체력 × ${ATTR_EFFECT.vitDef} + 힘 × ${ATTR_EFFECT.strDef} · 치명 = 직업 기본값 + 민첩 × ${ATTR_EFFECT.dexCrit}
  · 회피 = 민첩 × ${ATTR_EFFECT.dexDodge} · 최대 MP = 직업 기본값 + 지능 × ${ATTR_EFFECT.intMp} + (레벨−1) × 직업 MP 성장.
  색칠한 줄은 스킬을 배우는 레벨, 노란 칸은 주 능력치·공격 능력치입니다. 값은 <code>src/game/data/</code>(classes·stats)에서 바로 계산하므로 밸런스를 바꾸면 이 표도 바뀝니다.`;
render();
