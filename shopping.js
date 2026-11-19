// ─────────────────────────────────────────────────────────────
// COURSES + CHEZ MOI (spec §6, §14.4)   (v1.1)
//
//  🛒 Liste    : générée depuis le planning, moins ce qui est déjà à la maison,
//                + articles manuels, articles fréquents, rayons dans votre ordre.
//  🧊 Chez moi : stock frigo / congélateur / placard, alimenté automatiquement
//                quand on coche un article, péremptions, « utilisé », « jeté ».
// Chaque action propose « Annuler ».
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import {
  shopping, buyItem, unbuyItem, removePurchase, addManualItem, clearBought, newShoppingSession, saveSettings, settings,
  memberName, recipe, frequentItems, aisleOrder, stockGroups, addToStock, consumeStock, updateLots,
} from '../model.js';
import { fmtQty, parseQuickItem, SHOP_RANGES, SLOT, UNIT_LIST, normalizeUnit, round3, STOCK_LOCATIONS, STOCK_LOCATION, guessLocation } from '../domain.js';
import { CATEGORIES, CATEGORY } from '../data/ingredients.js';
import { esc, fmtDate, relDay, timeAgo, haptic, todayISO, addDays, daysBetween, norm } from '../utils.js';
import { icon } from '../icons.js';
import { sheet, actionSheet, confirmDialog, toast, undoToast, avatar, confetti, cover, keepAwake } from '../ui.js';
import { emptyState } from './shared.js';

let tab = 'list';
let showDone = true;
let showPantry = false;
let showHome = false;
let storeMode = false;
let stockFilter = 'all';
let stockQ = '';

export function mount(root, params = {}) {
  if (params.v === 'stock') tab = 'stock';
  else if (params.v === 'list') tab = 'list';

  const paint = () => {
    root.innerHTML = `
      <div>
        <header class="page-head"><div><div class="eyebrow">${tab === 'list' ? 'Courses' : 'Chez moi'}</div><h1>${tab === 'list' ? 'La liste' : 'Le stock'}</h1></div>
          <div class="row" style="flex:none">${tab === 'list' ? `<button class="icon-btn ${storeMode ? 'on' : ''}" data-act="store-mode" aria-label="Mode magasin" title="Mode magasin : écran toujours allumé">${icon('sun', 21)}</button>` : ''}
          <button class="icon-btn" data-act="menu" aria-label="Options">${icon('more', 22)}</button></div></header>
        <div class="seg seg-tabs" role="tablist">
          <button class="${tab === 'list' ? 'on' : ''}" data-tab="list" role="tab">🛒 Liste</button>
          <button class="${tab === 'stock' ? 'on' : ''}" data-tab="stock" role="tab">🧊 Chez moi</button>
        </div>
        <div id="pane" class="view-in"></div>
      </div>`;
    if (tab === 'list') paintList(root.querySelector('#pane'));
    else paintStock(root.querySelector('#pane'));
  };
  const refresh = () => {
    const pane = root.querySelector('#pane');
    if (!pane) return paint();
    const focused = document.activeElement?.id;
    const val = focused ? document.activeElement.value : null;
    const y = scrollY;
    pane.classList.remove('view-in');
    if (tab === 'list') paintList(pane); else paintStock(pane);
    if (focused && document.getElementById(focused)) { const f = document.getElementById(focused); f.focus(); if (val != null) f.value = val; }
    scrollTo(0, y);
  };

  // ════════════════════════ LISTE ════════════════════════
  const paintList = (pane) => {
    const sh = shopping();
    const toBuy = sh.toBuy.filter((i) => !i.pantry);
    const pantry = sh.toBuy.filter((i) => i.pantry);
    const done = sh.done.filter((i) => !i.cleared);
    const home = sh.home.filter((i) => !i.pantry);
    const total = toBuy.length + done.filter((i) => !i.noLongerNeeded).length;
    const pct = total ? Math.round(((total - toBuy.length) / total) * 100) : 0;
    const freq = frequentItems(8);

    pane.innerHTML = `
      <div class="shop-hero">
        <div class="sh-top"><button class="period" data-act="period">${icon('calendar', 16)} ${SHOP_RANGES[sh.range]} ${icon('down', 14)}</button>
          <span style="font-size:12.5px;font-weight:700;opacity:.7">${fmtDate(sh.from, { noDay: true, shortMonth: true })} → ${fmtDate(sh.to, { noDay: true, shortMonth: true })}</span></div>
        <div class="sh-count"><b>${toBuy.length}</b><span>article${toBuy.length > 1 ? 's' : ''} à acheter · ${total - toBuy.length} dans le panier${home.length ? ` · ${home.length} déjà à la maison` : ''}</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
      <form class="quick-add" id="qa" autocomplete="off">
        <input id="qai" placeholder="Ajouter : « 2 l lait », « 6 œufs », « lessive »…" enterkeyhint="done" aria-label="Ajouter un article">
        <button class="btn primary" aria-label="Ajouter">${icon('plus', 22)}</button>
      </form>
      ${freq.length ? `<div class="freq" aria-label="Articles fréquents">${freq.map((f, i) => `<button class="chip" data-freq="${i}">${icon('plus', 14)} ${esc(f.name)}</button>`).join('')}</div>` : ''}
      <p class="qa-hint">Cochez = tout acheté · touchez le nom pour « acheté en partie », l’origine ou corriger</p>
      ${!toBuy.length && !done.length && !pantry.length && !home.length ? emptyState('🧺', 'Liste vide', 'Planifiez des repas avec des recettes : les ingrédients apparaîtront ici automatiquement. Ou ajoutez un article ci-dessus.', `<a class="btn primary" href="#/planning" style="margin-top:14px">${icon('calendar', 18)} Ouvrir le planning</a>`) : ''}
      ${!toBuy.length && (done.length || pantry.length || home.length) ? `<div class="all-done"><div class="big">🎉</div><h2 style="font-size:26px">Tout est dans le panier !</h2><p class="muted">Bravo l'équipe.</p></div>` : ''}
      ${group(toBuy).map(([cat, items]) => `
        <section class="aisle"><div class="aisle-head"><span class="ae">${CATEGORY[cat]?.emoji || '🛍️'}</span>${esc(CATEGORY[cat]?.label || 'Autres')}<span class="cnt">${items.length}</span></div>
          <div class="aisle-list">${items.map(row).join('')}</div></section>`).join('')}
      ${home.length ? `
        <button class="collapser ${showHome ? '' : 'closed'}" data-act="toggle-home">${icon('down', 18)} 🏠 Déjà à la maison (${home.length})</button>
        ${showHome ? `<div class="aisle-list">${home.map(homeRow).join('')}</div>` : ''}` : ''}
      ${pantry.length ? `
        <button class="collapser ${showPantry ? '' : 'closed'}" data-act="toggle-pantry">${icon('down', 18)} 🫙 Probablement au placard · à vérifier (${pantry.length})</button>
        ${showPantry ? `<div class="aisle-list">${pantry.map(row).join('')}</div>` : ''}` : ''}
      ${done.length ? `
        <button class="collapser ${showDone ? '' : 'closed'}" data-act="toggle-done">${icon('down', 18)} ✅ Dans le panier (${done.length}) · touchez pour corriger</button>
        ${showDone ? `<div class="aisle-list">${done.map(row).join('')}</div>` : ''}` : ''}
      ${toBuy.length + done.length ? `<div class="shop-actions">
        <button class="btn ghost" data-act="clear">${icon('check', 18)} Vider le panier</button>
        <button class="btn ghost" data-act="share">${icon('share', 18)} Partager</button></div>` : ''}`;

    pane.querySelector('#qa').onsubmit = (e) => {
      e.preventDefault();
      const inp = pane.querySelector('#qai');
      const p = parseQuickItem(inp.value);
      if (!p) return;
      const added = addManualItem(p);
      haptic(10);
      inp.value = '';
      undoToast(`${esc(p.name)} ajouté · ${CATEGORY[p.category]?.emoji || ''} ${CATEGORY[p.category]?.label || ''}`, () => store.del('items', added.id), { icon: 'cart' });
    };
    pane.querySelector('.freq')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-freq]'); if (!b) return;
      const f = freq[+b.dataset.freq];
      const added = addManualItem({ name: f.name, qty: f.qty, unit: f.unit, category: f.category || 'autres', ing: f.ing });
      haptic(10);
      undoToast(`${esc(f.name)} ajouté`, () => store.del('items', added.id), { icon: 'cart' });
    });
  };

  const group = (items) => {
    const by = new Map();
    for (const it of items) { const c = CATEGORY[it.category] ? it.category : 'autres'; if (!by.has(c)) by.set(c, []); by.get(c).push(it); }
    return aisleOrder().map((id) => [id, by.get(id)]).filter(([, v]) => v);
  };

  const qtyLabel = (it) => {
    if (it.kind === 'manual') return it.qty != null ? fmtQty(it.qty, it.unit) : '';
    if (!it.hasQty) return '';
    if (it.partial) return `${fmtQty(it.remaining, it.unit)}<small>sur ${fmtQty(it.need ?? it.qty, it.unit)}</small>`;
    if (it.noLongerNeeded) return it.bought ? fmtQty(it.bought, it.unit) : '';
    if (it.purchases?.length) return fmtQty(it.bought, it.unit);
    return fmtQty(it.remaining ?? it.qty, it.unit);
  };
  const sub = (it) => {
    const bits = [];
    if (it.kind === 'manual') {
      bits.push(`${avatar(store.getAny('members', it.addedBy), 16)} ajouté par ${esc(memberName(it.addedBy) || '—')}`);
      if (it.note) bits.push(`📝 ${esc(it.note)}`);
      if (it.bought && !it.checked) bits.push(`<span class="tagx warn">déjà ${fmtQty(it.bought, it.unit)} acheté</span>`);
    } else if (it.sources?.length) {
      const titles = [...new Set(it.sources.map((s) => s.recipeTitle))];
      bits.push(`${titles.slice(0, 2).map(esc).join(', ')}${titles.length > 2 ? ` +${titles.length - 2}` : ''}`);
      if (it.optional) bits.push('<span class="tagx plum">facultatif</span>');
    }
    if (it.inStock > 0 && !it.purchases?.length) bits.push(`<span class="tagx sage">🏠 ${fmtQty(it.inStock, it.unit)} à la maison</span>`);
    if (it.stockUnknown) bits.push('<span class="tagx sage">🏠 en stock ? à vérifier</span>');
    if (it.partial) bits.push(`<span class="tagx warn">déjà ${fmtQty(it.bought, it.unit)} acheté</span>`);
    if (it.surplus) bits.push(`<span class="tagx info">besoin actuel ${fmtQty(it.need ?? it.qty, it.unit)}</span>`);
    if (it.noLongerNeeded) bits.push('<span class="tagx warn">n’est plus nécessaire</span>');
    if ((it.checkedBy || it.purchases?.length) && (it.kind === 'manual' ? it.checked : !it.partial)) {
      const by = it.checkedBy || it.purchases?.at(-1)?.by;
      if (by) bits.push(`${avatar(store.getAny('members', by), 16)} ${esc(memberName(by))} ${timeAgo(it.checkedAt || it.purchases?.at(-1)?.at)}`);
    }
    return bits.join('<span>·</span>');
  };
  const isDone = (it) => (it.kind === 'manual' ? it.checked : !it.partial && !!it.purchases?.length);
  const row = (it) => `
    <div class="item ${isDone(it) ? 'done' : ''}" data-id="${esc(it.id)}" data-kind="${it.kind}">
      <button class="check" data-act="check" aria-label="${isDone(it) ? 'Décocher' : 'Cocher'}">${icon('check', 17)}</button>
      <div class="it-body" data-act="detail"><div class="it-name">${esc(it.name)}</div><div class="it-sub">${sub(it)}</div></div>
      <div class="it-q" data-act="detail">${qtyLabel(it)}</div>
    </div>`;
  const homeRow = (it) => `
    <div class="item" data-id="${esc(it.id)}" data-kind="home">
      <span class="check home-ic">${icon('home', 16)}</span>
      <div class="it-body" data-act="detail"><div class="it-name">${esc(it.name)}</div><div class="it-sub">${it.hasQty ? `besoin ${fmtQty(it.qty, it.unit)} · en stock ${fmtQty(it.inStock, it.unit)}` : 'en stock'}</div></div>
      <div class="it-q" data-act="detail">${it.hasQty ? fmtQty(it.qty, it.unit) : ''}</div>
    </div>`;

  const find = (id) => { const sh = shopping(); return [...sh.toBuy, ...sh.done, ...sh.home].find((i) => i.id === id); };

  // ════════════════════════ CHEZ MOI ════════════════════════
  const expiryTag = (g) => {
    if (!g.expires) return '';
    const d = daysBetween(todayISO(), g.expires);
    if (d < 0) return `<span class="tagx red">périmé depuis ${-d} j</span>`;
    if (d === 0) return `<span class="tagx red">à consommer aujourd’hui</span>`;
    if (d <= 2) return `<span class="tagx warn">à consommer vite · ${d === 1 ? 'demain' : 'dans 2 j'}</span>`;
    return `<span class="tagx">jusqu’au ${fmtDate(g.expires, { noDay: true, shortMonth: true })}</span>`;
  };
  const isSoon = (g) => g.expires && daysBetween(todayISO(), g.expires) <= 2;

  const paintStock = (pane) => {
    const all = stockGroups();
    const soon = all.filter(isSoon);
    const nq = norm(stockQ);
    const list = all.filter((g) => (stockFilter === 'all' || (stockFilter === 'soon' ? isSoon(g) : g.location === stockFilter)) && (!nq || norm(g.name).includes(nq)));
    pane.innerHTML = `
      <div class="shop-hero stock-hero">
        <div class="sh-count"><b>${all.length}</b><span>produit${all.length > 1 ? 's' : ''} à la maison${soon.length ? ` · <b style="font-size:inherit;font-family:inherit;color:var(--saffron)">${soon.length} à consommer vite</b>` : ''}</span></div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${STOCK_LOCATIONS.map((l) => `<span class="period" style="height:32px">${l.emoji} ${all.filter((g) => g.location === l.id).length} ${l.label.toLowerCase()}</span>`).join('')}</div>
        <a class="btn primary block" href="#/recettes?f=stock" style="margin-top:14px">${icon('chef', 18)} Que cuisiner avec ça ?</a>
      </div>
      <form class="quick-add" id="sa" autocomplete="off">
        <input id="sai" placeholder="J’ai : « 6 œufs », « 1 kg riz », « reste de lasagnes »…" value="${esc(stockQ)}" enterkeyhint="done" aria-label="Ajouter au stock ou chercher">
        <button class="btn primary" aria-label="Ajouter au stock">${icon('plus', 22)}</button>
      </form>
      <p class="qa-hint">Ce que vous cochez dans la liste arrive ici automatiquement · tapez pour chercher, ➕ pour ajouter</p>
      <div class="filters" id="sfilters" style="margin-top:4px">${[['all', 'Tout'], ['soon', '⏰ À consommer vite'], ...STOCK_LOCATIONS.map((l) => [l.id, `${l.emoji} ${l.label}`])]
        .map(([v, l]) => `<button class="chip ${v === stockFilter ? 'on' : ''}" data-sf="${v}">${l}</button>`).join('')}</div>
      ${!all.length ? emptyState('🧊', 'Rien à la maison… pour l’instant', 'Cochez vos courses : les produits arrivent ici tout seuls. Vous pouvez aussi ajouter ce que vous avez déjà, ci-dessus.') : ''}
      ${all.length && !list.length ? emptyState('🔍', 'Aucun produit', 'Rien ne correspond à ce filtre.') : ''}
      ${STOCK_LOCATIONS.map((l) => {
        const items = list.filter((g) => g.location === l.id).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999') || a.name.localeCompare(b.name, 'fr'));
        if (!items.length) return '';
        return `<section class="aisle"><div class="aisle-head"><span class="ae">${l.emoji}</span>${l.label}<span class="cnt">${items.length}</span></div>
          <div class="aisle-list">${items.map(stockRow).join('')}</div></section>`;
      }).join('')}`;

    const inp = pane.querySelector('#sai');
    inp.addEventListener('input', () => {
      stockQ = inp.value;
      const pos = inp.selectionStart;
      refresh();
      const f = document.getElementById('sai'); f.setSelectionRange(pos, pos);
    });
    pane.querySelector('#sa').onsubmit = (e) => {
      e.preventDefault();
      const p = parseQuickItem(inp.value);
      if (!p) return;
      const res = addToStock({ name: p.name, ing: p.ing, qty: p.qty, unit: p.unit, category: p.category, force: true });
      stockQ = '';
      haptic(10);
      refresh();
      undoToast(`${esc(p.name)} → ${STOCK_LOCATION[guessLocation(p.category)].label.toLowerCase()}`, res?.undo, { icon: 'fridge' });
      if (res) setTimeout(() => { const g = stockGroups().find((x) => x.lots.some((l) => l.id === res.id)); if (g) openStock(g, { justAdded: true }); }, 250);
    };
  };
  const stockRow = (g) => `
    <div class="item stock-item" data-sg="${esc(g.id)}">
      <span class="check home-ic">${CATEGORY[g.category]?.emoji || '🛍️'}</span>
      <div class="it-body" data-act="stock"><div class="it-name">${esc(g.name)}</div>
        <div class="it-sub">${expiryTag(g)}${g.expires ? '<span>·</span>' : ''}${avatar(store.getAny('members', g.addedBy), 16)} ${timeAgo(g.addedAt)}${g.lots.length > 1 ? `<span>·</span>${g.lots.length} lots` : ''}</div></div>
      <div class="it-q" data-act="stock">${g.hasQty ? fmtQty(g.qty, g.unit) : ''}${g.unknown && g.hasQty ? '<small>+ ?</small>' : ''}</div>
    </div>`;

  // ════════════════════════ ÉVÉNEMENTS ════════════════════════
  root.onclick = async (e) => {
    const tb = e.target.closest('[data-tab]');
    if (tb) { if (tab !== tb.dataset.tab) { tab = tb.dataset.tab; haptic(6); paint(); } return; }
    const sf = e.target.closest('[data-sf]');
    if (sf) { stockFilter = sf.dataset.sf; haptic(4); refresh(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const itemEl = t.closest('.item');
    switch (t.dataset.act) {
      case 'check': {
        const it = itemEl ? find(itemEl.dataset.id) : null;
        if (!it) return;
        const wasDone = itemEl.classList.contains('done');
        if (!wasDone) {
          haptic(14);
          itemEl.classList.add('done'); t.classList.add('burst');
          const remainingBefore = shopping().toBuy.filter((i) => !i.pantry).length;
          setTimeout(() => {
            const undo = buyItem(it);
            if (remainingBefore === 1 && !it.pantry) { confetti(); undoToast('Courses terminées ! 🎉', undo); }
            else undoToast(`${esc(it.name)} → dans le panier`, undo);
          }, 380);
        } else {
          haptic(6);
          itemEl.classList.remove('done');
          setTimeout(() => undoToast(`${esc(it.name)} → remis à acheter`, unbuyItem(it), { icon: 'undo' }), 200);
        }
        return;
      }
      case 'detail': { const it = itemEl ? find(itemEl.dataset.id) : null; return it && openItem(it); }
      case 'stock': { const g = stockGroups().find((x) => x.id === itemEl.dataset.sg); return g && openStock(g); }
      case 'toggle-done': showDone = !showDone; return refresh();
      case 'toggle-pantry': showPantry = !showPantry; return refresh();
      case 'toggle-home': showHome = !showHome; return refresh();
      case 'period': return actionSheet({
        title: 'Période des courses', subtitle: 'Les ingrédients des repas planifiés sur cette période sont ajoutés.',
        actions: Object.entries(SHOP_RANGES).map(([k, l]) => ({ icon: k === settings().shopRange ? 'check' : 'calendar', label: l, run: () => saveSettings({ shopRange: k }) })),
      });
      case 'clear': return clearBought(), toast('Panier vidé · l’historique des achats est conservé', { icon: 'check' });
      case 'share': return shareList();
      case 'store-mode': {
        storeMode = !storeMode;
        const ok = await keepAwake(storeMode);
        t.classList.toggle('on', storeMode);
        return toast(storeMode ? (ok ? 'Mode magasin : l’écran reste allumé ☀️' : 'Mode magasin activé') : 'Mode magasin désactivé', { icon: 'sun' });
      }
      case 'menu': return tab === 'list' ? listMenu() : stockMenu();
    }
  };

  const listMenu = () => actionSheet({
    title: 'Liste de courses',
    actions: [
      { icon: 'plus', label: 'Ajouter un article détaillé', run: () => openQuickAdd() },
      { icon: 'share', label: 'Partager la liste (SMS, WhatsApp…)', run: shareList },
      { icon: 'list', label: 'Ordre des rayons…', hint: 'Suivre le chemin de votre magasin', run: () => openAisleOrder() },
      { icon: 'check', label: 'Vider le panier', hint: 'Masque les articles achetés', run: clearBought },
      { sep: true },
      { icon: 'reset', label: 'Nouvelle session de courses', hint: 'Repart de zéro, l’historique est conservé', danger: true, run: async () => {
        if (await confirmDialog({ title: 'Nouvelle session ?', text: 'Les besoins du planning seront recalculés, moins ce qui est déjà à la maison. Les articles manuels non achetés restent dans la liste.', ok: 'Recommencer', icon: 'reset' })) { newShoppingSession(); toast('Nouvelle liste prête 🛒'); }
      } },
    ],
  });
  const stockMenu = () => actionSheet({
    title: 'Chez moi',
    actions: [
      { icon: 'chef', label: 'Que cuisiner avec ce que j’ai ?', run: () => (location.hash = '#/recettes?f=stock') },
      { icon: 'trash', label: 'Retirer les produits périmés', danger: true, run: () => {
        const exp = stockGroups().filter((g) => g.expires && g.expires < todayISO());
        if (!exp.length) return toast('Aucun produit périmé 👍', { icon: 'check' });
        const undos = exp.map((g) => consumeStock(g.key, null, g.lots));
        undoToast(`${exp.length} produit${exp.length > 1 ? 's' : ''} retiré${exp.length > 1 ? 's' : ''}`, () => undos.forEach((u) => u()), { icon: 'trash' });
      } },
    ],
  });

  const shareList = async () => {
    const sh = shopping();
    const g = group(sh.toBuy.filter((i) => !i.pantry));
    const text = `🛒 Courses — ${settings().name}\n\n${g.map(([c, items]) => `${CATEGORY[c].emoji} ${CATEGORY[c].label}\n${items.map((i) => `☐ ${i.name}${qtyLabel(i) ? ' — ' + qtyLabel(i).replace(/<[^>]+>/g, ' ') : ''}`).join('\n')}`).join('\n\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Liste de courses', text });
      else { await navigator.clipboard.writeText(text); toast('Liste copiée dans le presse-papiers'); }
    } catch {}
  };

  paint();
  return { refresh, destroy: () => { if (storeMode) { keepAwake(false); storeMode = false; } } };
}

// ── Saisie d'une quantité (achat partiel / utilisé en partie) ──
function qtyBlock({ title, hint, max, unit, cta }) {
  if (max == null || !(max > 0)) return '';
  const u = unit && unit !== 'unité' ? unit : '';
  const step = ['g', 'ml'].includes(unit) ? (max >= 100 ? 50 : 10) : (max < 1 ? 0.25 : 1);
  const def = Math.max(step, round3(Math.floor((max / 2) / step) * step));
  return `
    <div class="card pad" style="margin:4px 0 18px">
      <b style="display:block;margin-bottom:4px">${title}</b>
      <small class="muted" style="display:block;margin-bottom:12px">${hint}</small>
      <div class="row" style="gap:8px">
        <button type="button" class="st-btn" data-pq="-1" aria-label="Moins">${icon('minus', 18)}</button>
        <input class="input" id="pq" inputmode="decimal" value="${String(def).replace('.', ',')}" style="text-align:center;font-weight:800;font-size:18px" data-step="${step}" data-max="${max}">
        <button type="button" class="st-btn" data-pq="1" aria-label="Plus">${icon('plus', 18)}</button>
        <span style="flex:none;font-weight:700;color:var(--ink-2);min-width:24px">${esc(u)}</span>
      </div>
      <button type="button" class="btn dark block" data-a="part" style="margin-top:12px">${icon('check', 18)} ${cta}</button>
    </div>`;
}
function readQty(el) {
  const inp = el.querySelector('#pq');
  if (!inp) return null;
  const v = parseFloat(String(inp.value).replace(',', '.'));
  const max = +inp.dataset.max;
  if (!(v > 0)) { toast('Indiquez une quantité supérieure à 0', { icon: 'info' }); return null; }
  return { v: round3(Math.min(v, max)), full: v >= max - 1e-9 };
}
function wireQty(el) {
  el.querySelectorAll('[data-pq]').forEach((b) => (b.onclick = () => {
    const inp = el.querySelector('#pq');
    const step = +inp.dataset.step, max = +inp.dataset.max;
    let v = parseFloat(String(inp.value).replace(',', '.')) || 0;
    v = round3(Math.min(max, Math.max(step, v + step * +b.dataset.pq)));
    inp.value = String(v).replace('.', ',');
    haptic(4);
  }));
}

// ── Détail d'un article : achat partiel, traçabilité, corrections ──
function openItem(it) {
  if (it.kind === 'manual') return openManual(it);
  const purchases = it.purchases || [];
  const isHome = !purchases.length && it.remaining === 0 && (it.inStock > 0 || !it.hasQty) && !it.noLongerNeeded;
  const canBuy = !isHome && (!purchases.length || it.partial);
  sheet({
    title: it.name,
    subtitle: `${CATEGORY[it.category]?.emoji || ''} ${CATEGORY[it.category]?.label || ''}`,
    body: `
      <div class="grid3" style="margin-bottom:18px">
        <div class="stat"><small>Besoin</small><b>${it.hasQty ? fmtQty(it.qty, it.unit) : it.noLongerNeeded ? '0' : '—'}</b></div>
        <div class="stat"><small>${it.inStock > 0 ? 'Maison' : 'Acheté'}</small><b>${it.inStock > 0 ? fmtQty(it.inStock, it.unit) : purchases.length ? (it.bought ? fmtQty(it.bought, it.unit) : '✓') : '0'}</b></div>
        <div class="stat"><small>Reste</small><b>${it.remaining ? fmtQty(it.remaining, it.unit) : '0'}</b></div>
      </div>
      ${isHome ? `<div class="warn" style="background:var(--sage-soft)">🏠 <span>Déjà à la maison : rien à acheter. Si ce n’est plus le cas, mettez à jour « Chez moi » ou achetez quand même.</span></div>` : ''}
      ${it.inStock > 0 && !isHome ? `<div class="warn" style="background:var(--sage-soft)">🏠 <span>${fmtQty(it.inStock, it.unit)} déjà à la maison : seul le reste est à acheter.</span></div>` : ''}
      ${it.noLongerNeeded ? `<div class="warn">ℹ️ <span>Le planning a changé : cet article n’est plus nécessaire, mais son achat est conservé.</span></div>` : ''}
      ${it.surplus ? `<div class="warn">ℹ️ <span>Le besoin a diminué : ${fmtQty(it.surplus, it.unit)} en trop par rapport au planning actuel.</span></div>` : ''}
      ${canBuy && it.hasQty ? qtyBlock({ title: 'Acheté en partie ?', hint: `Reste à acheter : <b>${fmtQty(it.remaining, it.unit)}</b>. Indiquez ce que vous avez pris : le reste restera dans la liste.`, max: it.remaining, unit: it.unit, cta: 'Valider l’achat partiel' }) : ''}
      ${purchases.length ? `<h3 style="font-size:19px;margin:6px 0 4px">Achats</h3>
        <p class="muted" style="margin:0 0 10px;font-size:13.5px">Une erreur ? Retirez l’achat concerné avec ${icon('trash', 13)}.</p>
        <div class="src-list" id="plist">${purchases.map((p) => `<div class="src">${avatar(store.getAny('members', p.by), 40)}<span style="flex:1;min-width:0"><b>${esc(memberName(p.by) || '—')}</b><small>${timeAgo(p.at)}</small></span><span class="q">${p.qty != null ? fmtQty(p.qty, p.unit) : '✓'}</span>
          <button type="button" class="icon-btn ghost sm" data-rm="${esc(p.id)}" aria-label="Retirer cet achat">${icon('trash', 17)}</button></div>`).join('')}</div>` : ''}
      <h3 style="font-size:19px;margin:20px 0 10px">Pourquoi cet article ?</h3>
      <div class="src-list">${(it.sources || []).map((s) => `
        <a class="src" href="#/recette/${s.recipeId}?s=${s.servings}" data-close>${cover(recipe(s.recipeId))}
          <span style="min-width:0"><b>${esc(s.recipeTitle)}</b><small>${relDay(s.date)} · ${SLOT[s.slot].label} · ${s.servings} pers.${s.optional ? ' · facultatif' : ''}</small></span>
          <span class="q">${s.qty != null ? fmtQty(s.qty, it.unit) : ''}</span></a>`).join('') || '<p class="note">Aucun repas planifié n’utilise plus cet ingrédient.</p>'}</div>`,
    footer: `${purchases.length ? `<button class="btn ghost" data-a="uncheck">${icon('undo', 18)} Tout décocher</button>` : ''}${canBuy ? `<button class="btn primary" data-a="all">${icon('check', 18)} ${it.partial ? 'Acheter le reste' : 'Tout acheté'}</button>` : ''}${isHome ? `<button class="btn ghost" data-a="anyway">${icon('cart', 18)} Acheter quand même</button>` : ''}`,
    onMount(el, close) {
      wireQty(el);
      el.querySelector('[data-a=all]')?.addEventListener('click', () => { const u = buyItem(it); haptic(12); close(); undoToast(`${esc(it.name)} → dans le panier`, u); });
      el.querySelector('[data-a=anyway]')?.addEventListener('click', () => { const u = buyItem({ ...it, remaining: it.qty }, it.hasQty ? it.qty : null); haptic(12); close(); undoToast(`${esc(it.name)} → dans le panier`, u); });
      el.querySelector('[data-a=part]')?.addEventListener('click', () => {
        const r = readQty(el); if (!r) return;
        const u = r.full ? buyItem(it) : buyItem(it, r.v);
        haptic(12); close();
        undoToast(r.full ? `${esc(it.name)} → dans le panier` : `${fmtQty(r.v, it.unit)} de ${esc(it.name)} acheté · reste ${fmtQty(round3(it.remaining - r.v), it.unit)}`, u);
      });
      el.querySelector('[data-a=uncheck]')?.addEventListener('click', () => { const u = unbuyItem(it); close(); undoToast(`${esc(it.name)} → remis à acheter`, u, { icon: 'undo' }); });
      el.querySelector('#plist')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        const u = removePurchase(b.dataset.rm); haptic(8); close();
        undoToast('Achat retiré', u, { icon: 'trash' });
      });
    },
  });
}

/** Article manuel : acheter tout / en partie, modifier, supprimer. */
function openManual(it) {
  if (it.checked) {
    return actionSheet({
      title: it.name, subtitle: `Acheté par ${esc(memberName(it.checkedBy) || '—')} ${timeAgo(it.checkedAt)}`,
      actions: [
        { icon: 'undo', label: 'Remettre à acheter', run: () => undoToast(`${esc(it.name)} → remis à acheter`, unbuyItem(it), { icon: 'undo' }) },
        { icon: 'edit', label: 'Modifier l’article', run: () => openQuickAdd(it) },
        { sep: true },
        { icon: 'trash', label: 'Supprimer', danger: true, run: () => { store.del('items', it.id); undoToast('Article supprimé', () => store.put('items', it.id, { deleted: false }), { icon: 'trash' }); } },
      ],
    });
  }
  sheet({
    title: it.name,
    subtitle: `Ajouté par ${esc(memberName(it.addedBy) || '—')} ${timeAgo(it.createdAt)}${it.bought ? ` · déjà ${fmtQty(it.bought, it.unit)} acheté` : ''}`,
    body: `${qtyBlock({ title: 'Acheté en partie ?', hint: `Reste à acheter : <b>${fmtQty(it.qty, it.unit)}</b>. Le reste restera dans la liste.`, max: it.qty, unit: it.unit, cta: 'Valider l’achat partiel' })}
      <div class="action-list">
        <button class="action-row" data-a="edit"><span class="action-ic">${icon('edit', 20)}</span><span class="action-label">Modifier l’article</span></button>
        ${it.bought ? `<button class="action-row" data-a="resetbought"><span class="action-ic">${icon('undo', 20)}</span><span class="action-label">Annuler les achats partiels<small>Remet la quantité d’origine (${fmtQty(round3((it.qty || 0) + it.bought), it.unit)})</small></span></button>` : ''}
        <button class="action-row danger" data-a="del"><span class="action-ic">${icon('trash', 20)}</span><span class="action-label">Supprimer</span></button>
      </div>`,
    footer: `<button class="btn primary" data-a="all">${icon('check', 18)} Tout acheté</button>`,
    onMount(el, close) {
      wireQty(el);
      el.querySelector('[data-a=all]').onclick = () => { const u = buyItem(it); haptic(12); close(); undoToast(`${esc(it.name)} → dans le panier`, u); };
      el.querySelector('[data-a=part]')?.addEventListener('click', () => {
        const r = readQty(el); if (!r) return;
        const u = r.full ? buyItem(it) : buyItem(it, r.v);
        haptic(12); close();
        undoToast(r.full ? `${esc(it.name)} → dans le panier` : `${fmtQty(r.v, it.unit)} acheté · reste ${fmtQty(round3(it.qty - r.v), it.unit)}`, u);
      });
      el.querySelector('[data-a=edit]').onclick = () => { close(); setTimeout(() => openQuickAdd(it), 350); };
      el.querySelector('[data-a=resetbought]')?.addEventListener('click', () => {
        const prev = { qty: it.qty, bought: it.bought };
        store.put('items', it.id, { qty: round3((it.qty || 0) + it.bought), bought: 0 }); close();
        undoToast('Achats partiels annulés', () => store.put('items', it.id, prev));
      });
      el.querySelector('[data-a=del]').onclick = () => { store.del('items', it.id); close(); undoToast('Article supprimé', () => store.put('items', it.id, { deleted: false }), { icon: 'trash' }); };
    },
  });
}

// ── Produit du stock : utilisé, utilisé en partie, jeté, rangement, péremption ──
function openStock(g, { justAdded = false } = {}) {
  sheet({
    title: g.name,
    subtitle: `${STOCK_LOCATION[g.location]?.emoji} ${STOCK_LOCATION[g.location]?.label}${g.hasQty ? ` · ${fmtQty(g.qty, g.unit)}` : ''}${g.lots.length > 1 ? ` · ${g.lots.length} lots` : ''}`,
    body: `
      ${justAdded ? `<div class="warn" style="background:var(--sage-soft)">✅ <span>Ajouté. Précisez le rangement ou la date de péremption si vous voulez.</span></div>` : ''}
      ${!justAdded && g.hasQty ? qtyBlock({ title: 'Utilisé en partie ?', hint: `En stock : <b>${fmtQty(g.qty, g.unit)}</b>. Indiquez ce qui a été utilisé.`, max: g.qty, unit: g.unit, cta: 'Retirer cette quantité' }) : ''}
      <div class="field"><span>Rangement</span><div class="seg" id="loc">${STOCK_LOCATIONS.map((l) => `<button type="button" data-l="${l.id}" class="${l.id === g.location ? 'on' : ''}">${l.emoji} ${l.label}</button>`).join('')}</div></div>
      <div class="field"><span>À consommer avant (facultatif)</span>
        <div class="row"><input class="input" type="date" id="exp" value="${esc(g.expires || '')}">
        <button type="button" class="btn ghost sm" data-exp="3" style="flex:none">+3 j</button><button type="button" class="btn ghost sm" data-exp="7" style="flex:none">+7 j</button></div></div>
      <div class="field"><span>Quantité totale</span>
        <div class="row"><input class="input" id="tq" inputmode="decimal" value="${g.hasQty ? String(g.qty).replace('.', ',') : ''}" placeholder="Inconnue"><span style="flex:none;font-weight:700;color:var(--ink-2)">${esc(g.unit === 'unité' ? 'unité(s)' : g.unit)}</span></div></div>
      ${g.lots.length > 1 ? `<p class="muted" style="font-size:13px">Lots : ${g.lots.map((l) => `${l.qty != null ? fmtQty(l.qty, l.unit) : '?'}${l.expires ? ` (${fmtDate(l.expires, { noDay: true, shortMonth: true })})` : ''}`).join(' · ')}</p>` : ''}
      <div class="action-list" style="margin-top:6px">
        <button class="action-row danger" data-a="waste"><span class="action-ic">${icon('trash', 20)}</span><span class="action-label">Jeté / perdu<small>Retire tout le produit du stock</small></span></button>
      </div>`,
    footer: `<button class="btn ghost" data-a="save">${icon('check', 18)} Enregistrer</button><button class="btn primary" data-a="used">${icon('chef', 18)} Tout utilisé</button>`,
    onMount(el, close) {
      wireQty(el);
      let loc = g.location;
      el.querySelector('#loc').onclick = (e) => { const b = e.target.closest('[data-l]'); if (!b) return; loc = b.dataset.l; el.querySelectorAll('#loc button').forEach((x) => x.classList.toggle('on', x === b)); haptic(4); };
      el.querySelectorAll('[data-exp]').forEach((b) => (b.onclick = () => { el.querySelector('#exp').value = addDays(todayISO(), +b.dataset.exp); }));
      el.querySelector('[data-a=part]')?.addEventListener('click', () => {
        const r = readQty(el); if (!r) return;
        const u = consumeStock(g.key, r.full ? null : r.v, g.lots);
        haptic(10); close();
        undoToast(r.full ? `${esc(g.name)} terminé` : `${fmtQty(r.v, g.unit)} de ${esc(g.name)} utilisé`, u, { icon: 'chef' });
      });
      el.querySelector('[data-a=used]').onclick = () => { const u = consumeStock(g.key, null, g.lots); haptic(10); close(); undoToast(`${esc(g.name)} terminé`, u, { icon: 'chef' }); };
      el.querySelector('[data-a=waste]').onclick = () => { const u = consumeStock(g.key, null, g.lots); haptic(10); close(); undoToast(`${esc(g.name)} retiré du stock`, u, { icon: 'trash' }); };
      el.querySelector('[data-a=save]').onclick = () => {
        const undos = [];
        const exp = el.querySelector('#exp').value || null;
        const patch = {};
        if (loc !== g.location) patch.location = loc;
        if ((exp || null) !== (g.expires || null)) patch.expires = exp;
        store.batch(() => {
          if (Object.keys(patch).length) undos.push(updateLots(g.lots, patch));
          const tqRaw = el.querySelector('#tq').value.trim().replace(',', '.');
          const tq = tqRaw === '' ? null : +tqRaw;
          if (tqRaw !== '' && !isNaN(tq) && (!g.hasQty || Math.abs(tq - g.qty) > 1e-6)) {
            const [first, ...rest] = g.lots;
            undos.push(updateLots([first], { qty: round3(tq) }));
            if (rest.length) undos.push(consumeStock(g.key, null, rest));
          }
        });
        haptic(8); close();
        if (undos.length) undoToast('Produit mis à jour', () => undos.reverse().forEach((u) => u()), { icon: 'fridge' });
      };
    },
  });
}

/** Ordre des rayons (suivre le parcours de votre magasin). */
export function openAisleOrder() {
  let order = aisleOrder();
  const draw = (el) => {
    el.querySelector('#ao').innerHTML = order.map((id, i) => `
      <div class="set-row"><span class="sr-ic" style="background:var(--surface-2);color:var(--ink);font-size:20px">${CATEGORY[id].emoji}</span>
        <span class="sr-body"><b>${esc(CATEGORY[id].label)}</b></span>
        <button type="button" class="icon-btn ghost sm" data-mv="${i}" data-d="-1" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Monter">${icon('up', 18)}</button>
        <button type="button" class="icon-btn ghost sm" data-mv="${i}" data-d="1" ${i === order.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Descendre">${icon('down', 18)}</button></div>`).join('');
  };
  sheet({
    title: 'Ordre des rayons',
    subtitle: 'Rangez les rayons dans l’ordre de votre parcours en magasin. Partagé avec toute la famille.',
    body: `<div class="set-list" id="ao"></div>`,
    footer: `<button class="btn ghost" data-a="reset">Par défaut</button><button class="btn primary" data-a="ok">Enregistrer</button>`,
    onMount(el, close) {
      draw(el);
      el.querySelector('#ao').onclick = (e) => {
        const b = e.target.closest('[data-mv]'); if (!b) return;
        const i = +b.dataset.mv, j = i + +b.dataset.d;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]]; haptic(4); draw(el);
      };
      el.querySelector('[data-a=reset]').onclick = () => { order = CATEGORIES.map((c) => c.id); draw(el); };
      el.querySelector('[data-a=ok]').onclick = () => { saveSettings({ aisleOrder: order }); close(); toast('Ordre des rayons enregistré', { icon: 'list' }); };
    },
  });
}

/** Ajout / modification d'un article manuel (spec §6.6). */
export function openQuickAdd(item = null) {
  const editing = !!item;
  sheet({
    title: editing ? 'Modifier l’article' : 'Ajouter aux courses',
    subtitle: editing ? `Ajouté par ${esc(memberName(item.addedBy) || '—')} ${timeAgo(item.createdAt)}` : 'Article manuel : jamais supprimé par le recalcul du planning',
    body: `
      <label class="field"><span>Article *</span><input class="input" id="n" value="${esc(item?.name || '')}" placeholder="Ex. Papier toilette" autocomplete="off"></label>
      <div class="grid2">
        <label class="field"><span>Quantité</span><input class="input" id="q" inputmode="decimal" value="${item?.qty ?? ''}" placeholder="Facultatif"></label>
        <label class="field"><span>Unité</span><input class="input" id="u" list="units2" value="${esc(item?.unit || '')}" placeholder="Facultatif"></label>
      </div>
      <datalist id="units2">${UNIT_LIST.map((u) => `<option value="${u}">`).join('')}</datalist>
      <label class="field"><span>Rayon</span><select class="select input" id="c">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === (item?.category || 'autres') ? 'selected' : ''}>${c.emoji} ${c.label}</option>`).join('')}</select></label>
      <label class="field"><span>Note</span><input class="input" id="no" value="${esc(item?.note || '')}" placeholder="Ex. marque, format…"></label>`,
    footer: `${editing ? `<button class="btn ghost" data-a="del" style="flex:0 0 56px;padding:0">${icon('trash', 20)}</button>` : ''}<button class="btn primary" data-a="ok">${editing ? 'Enregistrer' : 'Ajouter'}</button>`,
    onMount(el, close) {
      const n = el.querySelector('#n');
      if (!editing) setTimeout(() => n.focus(), 350);
      n.addEventListener('input', () => { if (!editing) { const p = parseQuickItem(n.value); if (p) el.querySelector('#c').value = p.category; } });
      el.querySelector('[data-a=ok]').onclick = () => {
        const name = n.value.trim();
        if (!name) return n.focus();
        const q = el.querySelector('#q').value.replace(',', '.');
        const p = parseQuickItem(name);
        const data = { name, qty: q === '' || isNaN(+q) ? null : +q, unit: el.querySelector('#u').value.trim() ? normalizeUnit(el.querySelector('#u').value.trim()) : null, category: el.querySelector('#c').value, note: el.querySelector('#no').value.trim(), ing: p?.ing || null };
        if (editing) store.put('items', item.id, data); else addManualItem(data);
        haptic(10); close();
        toast(editing ? 'Article mis à jour' : `${esc(name)} ajouté aux courses`, { icon: 'cart' });
      };
      el.querySelector('[data-a=del]')?.addEventListener('click', () => {
        store.del('items', item.id); close();
        undoToast('Article supprimé', () => store.put('items', item.id, { deleted: false }), { icon: 'trash' });
      });
    },
  });
}
