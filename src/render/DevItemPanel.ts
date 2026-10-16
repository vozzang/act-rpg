// 개발용 장비 시험 창 (개발 서버에서만): 아이템 목록의 아무 장비나 골라 아이템 상자·가방에 넣고 바로 플레이해 본다.
// ` 키 또는 화면 오른쪽 위 [🛠 장비] 버튼으로 연다. 게임을 계산하는 방장·혼자 하기에서만 만든다 (참가자 화면에는 없다).
// 게임 화면(Phaser)이 아닌 HTML 창이라 검색 칸에 글을 쓸 수 있다. 열려 있는 동안은 게임 키 입력을 막는다.
import { CLASSES, ITEM_LIST, RARITY, itemFromDef, itemStatText, type ItemDef } from '../game/data';
import type { Sim } from '../game/sim';
import type { ClassId, Item, Rarity, Slot } from '../game/types';

const SLOT_NAME: Record<Slot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** 직업별 장비 점수 (자동 장착용): 공격력·공격 능력치·치명 + 방어·HP·체력 (수호자는 방어 쪽을 두 배로) */
function score(cls: ClassId, d: ItemDef) {
  const c = CLASSES[cls], s = d.stats, k = c.atkAttr ?? c.mainAttr, tank = cls === 'dwarf' ? 2 : 1;
  return (s.atk ?? 0) + (s[k] ?? 0) * 0.5 + (s.crit ?? 0) * 150 + ((s.def ?? 0) * 0.8 + (s.maxHp ?? 0) * 0.06 + (s.vit ?? 0) * 0.8) * tank;
}

/** 장비 칸 하나: 아이템 상자 또는 가방의 몇 번째 칸 */
type Target = { where: 'inv' | 'bag'; idx: number };

export class DevItemPanel {
  private root: HTMLDivElement;
  private toggleBtn: HTMLButtonElement;
  private slotsEl: HTMLDivElement;
  private listEl: HTMLDivElement;
  private target: Target | null = null; // 고른 칸 (없으면 빈 칸에 자동으로)
  private timer = 0;
  isOpen = false;

  constructor(private sim: Sim, private myId: string, private onToggle: (open: boolean) => void) {
    const css = (el: HTMLElement, s: string) => (el.style.cssText = s, el);
    this.toggleBtn = css(document.createElement('button'), 'position:fixed;top:48px;right:8px;z-index:1001;padding:6px 10px;border-radius:6px;border:1px solid #2c3a56;background:#1a2336;color:#e8ecf4;font:13px sans-serif;cursor:pointer;opacity:.85') as HTMLButtonElement;
    this.toggleBtn.textContent = '🛠 장비 (`)';
    this.toggleBtn.onclick = () => this.toggle();
    this.root = css(document.createElement('div'), 'position:fixed;top:84px;right:8px;bottom:8px;width:820px;max-width:calc(100vw - 16px);z-index:1000;background:#0f1522f2;border:1px solid #2c3a56;border-radius:10px;color:#e8ecf4;font:13px "Apple SD Gothic Neo","Malgun Gothic",sans-serif;display:none;flex-direction:column;overflow:hidden') as HTMLDivElement;
    const sel = (id: string, opts: [string, string][]) => `<select id="${id}" style="background:#0e1420;color:#e8ecf4;border:1px solid #2c3a56;border-radius:5px;padding:3px">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const tiers: [string, string][] = [['0', '단계 전체'], ...[1, 2, 3, 4, 5].map((t): [string, string] => [String(t), `${t}단계`])];
    const rars: [string, string][] = [['', '등급 전체'], ...RARITIES.map((r): [string, string] => [r, RARITY[r].name]), ['unique', '유니크']];
    this.root.innerHTML = `
      <div style="padding:10px 12px;border-bottom:1px solid #2c3a56;display:flex;align-items:center;gap:8px">
        <b style="flex:1">🛠 장비 시험 <span style="color:#8d9ab3;font-weight:400">(개발용 · \` 키로 닫기)</span></b>
        <button data-act="clear" style="${BTN}">모두 비우기</button>
      </div>
      <div style="flex:1;display:flex;flex-wrap:wrap;overflow:auto;min-height:0">
      <div style="flex:1 1 360px;padding:8px 12px;border-right:1px solid #2c3a56;min-width:0">
        <div style="color:#8d9ab3;margin-bottom:4px">칸을 누르면 그 칸에 넣는다 (안 고르면 빈 칸부터). ✕ = 빼기</div>
        <div data-slots></div>
        <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          자동 장착 ${sel('auto-tier', [1, 2, 3, 4, 5].map((t): [string, string] => [String(t), `${t}단계`]))} ${sel('auto-rar', [...RARITIES.map((r): [string, string] => [r, RARITY[r].name])].reverse())}
          <button data-act="auto" style="${BTN}">내 직업에 맞는 6개 착용</button>
        </div>
      </div>
      <div style="flex:1 1 360px;display:flex;flex-direction:column;min-width:0;min-height:300px">
      <div style="padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #2c3a56">
        <input id="dev-q" placeholder="이름 찾기" style="flex:1;min-width:100px;background:#0e1420;color:#e8ecf4;border:1px solid #2c3a56;border-radius:5px;padding:4px 6px" />
        ${sel('dev-tier', tiers)} ${sel('dev-rar', rars)} ${sel('dev-slot', [['', '종류 전체'], ['weapon', '무기'], ['armor', '방어구'], ['accessory', '장신구']])}
      </div>
      <div data-list style="flex:1;overflow:auto;padding:4px 8px 10px"></div>
      </div></div>`;
    document.body.append(this.toggleBtn, this.root);
    this.slotsEl = this.root.querySelector('[data-slots]')!;
    this.listEl = this.root.querySelector('[data-list]')!;
    this.root.querySelector<HTMLButtonElement>('[data-act="clear"]')!.onclick = () => this.clearAll();
    this.root.querySelector<HTMLButtonElement>('[data-act="auto"]')!.onclick = () => this.autoEquip();
    for (const id of ['dev-q', 'dev-tier', 'dev-rar', 'dev-slot']) {
      const el = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      el.oninput = el.onchange = () => this.renderList();
    }
    window.addEventListener('keydown', this.onKey);
    this.renderList();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === '`' && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      this.toggle();
    } else if (e.key === 'Escape' && this.isOpen) this.toggle();
  };

  private get me() {
    return this.sim.players.find((p) => p.id === this.myId);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    this.root.style.display = this.isOpen ? 'flex' : 'none';
    this.onToggle(this.isOpen);
    clearInterval(this.timer);
    if (this.isOpen) {
      this.renderSlots();
      this.timer = window.setInterval(() => this.renderSlots(), 500); // 게임에서 주운 장비도 보이게
    }
  }

  /** 장비를 넣는다: 고른 칸, 없으면 아이템 상자 → 가방의 빈 칸, 다 차 있으면 상자 첫 칸 */
  private put(key: string) {
    const me = this.me;
    if (!me) return;
    let t = this.target;
    if (!t) {
      const i = me.inv.indexOf(null), b = me.bag.indexOf(null);
      t = i >= 0 ? { where: 'inv', idx: i } : b >= 0 ? { where: 'bag', idx: b } : { where: 'inv', idx: 0 };
    }
    this.sim.devSetSlot(this.myId, t.where, t.idx, key);
    this.target = null;
    this.renderSlots();
  }

  private clearAll() {
    for (let i = 0; i < 6; i++) {
      this.sim.devSetSlot(this.myId, 'inv', i, null);
      this.sim.devSetSlot(this.myId, 'bag', i, null);
    }
    this.renderSlots();
  }

  /** 고른 단계·등급에서 내 직업 점수가 높은 장비 6개를 아이템 상자에 (같은 장비는 두 개까지) */
  private autoEquip() {
    const me = this.me;
    if (!me) return;
    const tier = Number(this.val('auto-tier')), rar = this.val('auto-rar') as Rarity;
    const pool = ITEM_LIST.filter((d) => d.tier === tier && d.rarity === rar && !d.from.includes('unique')).sort((a, b) => score(me.cls, b) - score(me.cls, a));
    if (!pool.length) return;
    const picks: ItemDef[] = [];
    for (let i = 0; picks.length < 6; i++) picks.push(pool[i % Math.min(pool.length, 3)]);
    picks.forEach((d, i) => this.sim.devSetSlot(this.myId, 'inv', i, d.key));
    this.renderSlots();
  }

  private val(id: string) {
    return this.root.querySelector<HTMLInputElement>(`#${id}`)!.value;
  }

  private renderSlots() {
    const me = this.me;
    if (!me) return;
    const row = (where: 'inv' | 'bag', idx: number, item: Item | null, food?: string) => {
      const on = this.target?.where === where && this.target.idx === idx;
      const name = item ? `<span style="color:${RARITY[item.rarity].color}">${item.title ?? item.noun}</span> <span style="color:#8d9ab3;font-size:11px">${itemStatText(item)}</span>` : food ?? '<span style="color:#556677">(빈 칸)</span>';
      return `<div data-where="${where}" data-idx="${idx}" style="display:flex;gap:6px;align-items:center;padding:3px 6px;border-radius:5px;cursor:pointer;${on ? 'background:#5aa8ff33;outline:1px solid #5aa8ff' : ''}">
        <span style="color:#8d9ab3;width:30px">${where === 'inv' ? '상자' : '가방'}${idx + 1}</span><span style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${name}</span>
        ${item || food ? `<span data-del style="color:#ff9080;padding:0 4px">✕</span>` : ''}</div>`;
    };
    this.slotsEl.innerHTML =
      `<div style="color:#ffd040;margin:2px 0">착용 중 (능력치에 더해짐) — 공격 ${me.stats.atk} · 방어 ${me.stats.def} · HP ${me.stats.maxHp} · 치명 ${Math.round(me.stats.crit * 100)}%</div>` +
      me.inv.map((sl, i) => row('inv', i, sl?.kind === 'item' ? sl.item : null, sl && sl.kind !== 'item' ? `${sl.kind === 'hpFood' ? 'HP' : 'MP'} 음식 ×${sl.count}` : undefined)).join('') +
      `<div style="color:#8d9ab3;margin:6px 0 2px">가방 (보관만)</div>` +
      me.bag.map((it, i) => row('bag', i, it)).join('');
    this.slotsEl.querySelectorAll<HTMLDivElement>('[data-where]').forEach((el) => {
      const t: Target = { where: el.dataset.where as 'inv' | 'bag', idx: Number(el.dataset.idx) };
      el.onclick = (ev) => {
        if ((ev.target as HTMLElement).hasAttribute('data-del')) this.sim.devSetSlot(this.myId, t.where, t.idx, null);
        else this.target = this.target?.where === t.where && this.target.idx === t.idx ? null : t;
        this.renderSlots();
      };
    });
  }

  private renderList() {
    const q = this.val('dev-q').trim(), tier = Number(this.val('dev-tier')), rar = this.val('dev-rar'), slot = this.val('dev-slot');
    const list = ITEM_LIST.filter((d) => (!q || d.name.includes(q) || d.base.includes(q)) && (!tier || d.tier === tier)
      && (!rar || (rar === 'unique' ? d.from.includes('unique') : d.rarity === rar)) && (!slot || d.slot === slot));
    this.listEl.innerHTML = list.map((d) => `<div data-key="${d.key}" style="padding:4px 6px;border-radius:5px;cursor:pointer;border-bottom:1px solid #1c2638">
      <span style="color:${RARITY[d.rarity].color};font-weight:600">${d.name}</span>
      <span style="color:#8d9ab3;font-size:11px"> ${d.from.includes('unique') ? '유니크' : `${d.tier}단계`} · ${SLOT_NAME[d.slot]}</span><br />
      <span style="color:#b8c0d0;font-size:11px">${itemStatText(itemFromDef(d, 0))}</span></div>`).join('') || '<div style="color:#8d9ab3;padding:8px">조건에 맞는 장비가 없습니다</div>';
    this.listEl.querySelectorAll<HTMLDivElement>('[data-key]').forEach((el) => {
      el.onmouseenter = () => (el.style.background = '#ffffff10');
      el.onmouseleave = () => (el.style.background = '');
      el.onclick = () => this.put(el.dataset.key!);
    });
  }

  destroy() {
    clearInterval(this.timer);
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
    this.toggleBtn.remove();
  }
}

const BTN = 'background:#24314c;color:#e8ecf4;border:1px solid #2c3a56;border-radius:5px;padding:4px 8px;cursor:pointer;font:inherit';
