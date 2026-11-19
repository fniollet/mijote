// ─────────────────────────────────────────────────────────────
// COURSES (spec §6) — liste générée + manuelle, collaborative   (v1.0.3)
//
// v1.0.3 :
//  - « Annuler » après chaque article coché (plus d'article qui « disparaît ») ;
//  - achat partiel : « j'en ai pris 2 sur 3 » → le reste reste à acheter ;
//  - corriger les erreurs : retirer un achat précis de l'historique,
//    décocher, ou modifier la quantité achetée.
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { shopping, checkItem, uncheckItem, addManualItem, clearBought, newShoppingSession, saveSettings, settings, memberName, recipe } from '../model.js';
import { fmtQty, parseQuickItem, SHOP_RANGES, SLOT, UNIT_LIST, normalizeUnit, purchaseFor, round3 } from '../domain.js';
import { CATEGORIES, CATEGORY } from '../data/ingredients.js';
import { esc, fmtDate, relDay, timeAgo, haptic, uid } from '../utils.js';
import { icon } from '../icons.js';
import { sheet, actionSheet, confirmDialog, toast, avatar, confetti, cover, keepAwake } from '../ui.js';
import { emptyState } from './shared.js';

let showDone = true;
let showPantry = false;
let storeMode = false;

// ── Actions d'achat (avec annulation) ─────────────────────────
/** Achète tout le reste d'un article. Retourne une fonction d'annulation. */
function buyAll(it) {
  if (it.kind === 'manual') {
    const prev = { checked: !!it.checked, checkedBy: it.checkedBy || null, checkedAt: it.checkedAt || null };
    store.put('items', it.id, { checked: true, checkedBy: store.memberId, checkedAt: new Date().toISOString() });
    return () => store.put('items', it.id, prev);
  }
  const id = uid('p-');
  store.put('purchases', id, purchaseFor(it, { session: settings().shopSession, memberId: store.memberId }));
  return () => store.del('purchases', id);
}

/** Achète une partie seulement (quantité dans l'unité de l'article). */
function buyPart(it, qty) {
  qty = round3(qty);
  if (it.kind === 'manual') {
    const prev = { qty: it.qty, bought: it.bought || 0, checked: false };
    store.put('items', it.id, {
      qty: round3(it.qty - qty), bought: round3((it.bought || 0) + qty),
      lastBoughtBy: store.memberId, lastBoughtAt: new Date().toISOString(),
    });
    return () => store.put('items', it.id, prev);
  }
  const id = uid('p-');
  store.put('purchases', id, { ...purchaseFor(it, { session: settings().shopSession, memberId: store.memberId }), qty });
  return () => store.del('purchases', id);
}

const undoToast = (msg, undo) => toast(msg, { icon: 'check', action: 'Annuler', onAction: () => { undo(); haptic(8); toast('Annulé', { icon: 'undo', duration: 1600 }); }, duration: 5000 });

export function mount(root) {
  root.innerHTML = `
    <div class="view-in">
      <header class="page-head"><div><div class="eyebrow">Courses</div><h1>La liste</h1></div>
        <div class="row" style="flex:none"><button class="icon-btn ${storeMode ? 'on' : ''}" data-act="store-mode" aria-label="Mode magasin" title="Mode magasin : écran toujours allumé">${icon('sun', 21)}</button>
        <button class="icon-btn" data-act="menu" aria-label="Options">${icon('more', 22)}</button></div></header>
      <div id="hero"></div>
      <form class="quick-add" id="qa" autocomplete="off">
        <input id="qai" placeholder="Ajouter : « 2 l lait », « 6 œufs », « lessive »…" enterkeyhint="done" aria-label="Ajouter un article">
        <button class="btn primary" aria-label="Ajouter">${icon('plus', 22)}</button>
      </form>
      <p class="qa-hint">Cochez = tout acheté · touchez le nom pour « acheté en partie », l'origine ou corriger</p>
      <div id="list"></div>
    </div>`;

  const paint = () => {
    const sh = shopping();
    const toBuy = sh.toBuy.filter((i) => !i.pantry);
    const pantry = sh.toBuy.filter((i) => i.pantry);
    const done = sh.done.filter((i) => !i.cleared);
    const total = toBuy.length + done.filter((i) => !i.noLongerNeeded).length;
    const pct = total ? Math.round(((total - toBuy.length) / total) * 100) : 0;

    root.querySelector('#hero').innerHTML = `
      <div class="shop-hero">
        <div class="sh-top"><button class="period" data-act="period">${icon('calendar', 16)} ${SHOP_RANGES[sh.range]} ${icon('down', 14)}</button>
          <span style="font-size:12.5px;font-weight:700;opacity:.7">${fmtDate(sh.from, { noDay: true, shortMonth: true })} → ${fmtDate(sh.to, { noDay: true, shortMonth: true })}</span></div>
        <div class="sh-count"><b>${toBuy.length}</b><span>article${toBuy.length > 1 ? 's' : ''} à acheter · ${total - toBuy.length} dans le panier</span></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>`;

    const groups = group(toBuy);
    root.querySelector('#list').innerHTML = `
      ${!toBuy.length && !done.length && !pantry.length ? emptyState('🧺', 'Liste vide', 'Planifiez des repas avec des recettes : les ingrédients apparaîtront ici automatiquement. Ou ajoutez un article ci-dessus.', `<a class="btn primary" href="#/planning" style="margin-top:14px">${icon('calendar', 18)} Ouvrir le planning</a>`) : ''}
      ${!toBuy.length && (done.length || pantry.length) ? `<div class="all-done"><div class="big">🎉</div><h2 style="font-size:26px">Tout est dans le panier !</h2><p class="muted">Bravo l'équipe.</p></div>` : ''}
      ${groups.map(([cat, items]) => `
        <section class="aisle"><div class="aisle-head"><span class="ae">${CATEGORY[cat]?.emoji || '🛍️'}</span>${esc(CATEGORY[cat]?.label || 'Autres')}<span class="cnt">${items.length}</span></div>
          <div class="aisle-list">${items.map(row).join('')}</div></section>`).join('')}
      ${pantry.length ? `
        <button class="collapser ${showPantry ? '' : 'closed'}" data-act="toggle-pantry">${icon('down', 18)} 🫙 Probablement au placard · à vérifier (${pantry.length})</button>
        ${showPantry ? `<div class="aisle-list">${pantry.map(row).join('')}</div>` : ''}` : ''}
      ${done.length ? `
        <button class="collapser ${showDone ? '' : 'closed'}" data-act="toggle-done">${icon('down', 18)} ✅ Dans le panier (${done.length}) · touchez pour corriger</button>
        ${showDone ? `<div class="aisle-list">${done.map(row).join('')}</div>` : ''}` : ''}
      ${toBuy.length + done.length ? `<div class="shop-actions">
        <button class="btn ghost" data-act="clear">${icon('check', 18)} Vider le panier</button>
        <button class="btn ghost" data-act="share">${icon('upload', 18)} Partager</button></div>` : ''}`;
  };

  const group = (items) => {
    const by = new Map();
    for (const it of items) { const c = CATEGORY[it.category] ? it.category : 'autres'; if (!by.has(c)) by.set(c, []); by.get(c).push(it); }
    return CATEGORIES.map((c) => [c.id, by.get(c.id)]).filter(([, v]) => v);
  };

  const qtyLabel = (it) => {
    if (it.kind === 'manual') return it.qty != null ? fmtQty(it.qty, it.unit) : '';
    if (!it.hasQty) return '';
    if (it.partial) return `${fmtQty(it.remaining, it.unit)}<small>sur ${fmtQty(it.qty, it.unit)}</small>`;
    if (it.noLongerNeeded) return it.bought ? fmtQty(it.bought, it.unit) : '';
    return fmtQty(it.purchases?.length ? it.bought : it.qty, it.unit);
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
    if (it.partial) bits.push(`<span class="tagx warn">déjà ${fmtQty(it.bought, it.unit)} acheté</span>`);
    if (it.surplus) bits.push(`<span class="tagx info">besoin actuel ${fmtQty(it.qty, it.unit)}</span>`);
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

  const find = (id) => { const sh = shopping(); return [...sh.toBuy, ...sh.done].find((i) => i.id === id); };

  root.onclick = async (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const itemEl = t.closest('.item');
    const it = itemEl ? find(itemEl.dataset.id) : null;
    switch (t.dataset.act) {
      case 'check': {
        if (!it) return;
        const wasDone = itemEl.classList.contains('done');
        if (!wasDone) {
          haptic(14);
          itemEl.classList.add('done'); t.classList.add('burst');
          const remainingBefore = shopping().toBuy.filter((i) => !i.pantry).length;
          setTimeout(() => {
            const undo = buyAll(it);
            if (remainingBefore === 1 && !it.pantry) { confetti(); undoToast('Courses terminées ! 🎉', undo); }
            else undoToast(`${esc(it.name)} → dans le panier`, undo);
          }, 380);
        } else {
          haptic(6);
          itemEl.classList.remove('done');
          const snapshot = it.kind === 'manual' ? null : (it.purchases || []).map((p) => ({ ...p }));
          setTimeout(() => {
            uncheckItem(it);
            undoToast(`${esc(it.name)} → remis à acheter`, () => {
              if (it.kind === 'manual') store.put('items', it.id, { checked: true, checkedBy: it.checkedBy, checkedAt: it.checkedAt });
              else store.batch(() => snapshot.forEach((p) => store.put('purchases', p.id, { deleted: false })));
            });
          }, 200);
        }
        return;
      }
      case 'detail': return it && openItem(it);
      case 'toggle-done': showDone = !showDone; return paint();
      case 'toggle-pantry': showPantry = !showPantry; return paint();
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
      case 'menu': return actionSheet({
        title: 'Liste de courses',
        actions: [
          { icon: 'plus', label: 'Ajouter un article détaillé', run: () => openQuickAdd() },
          { icon: 'upload', label: 'Partager la liste (SMS, WhatsApp…)', run: shareList },
          { icon: 'check', label: 'Vider le panier', hint: 'Masque les articles achetés', run: clearBought },
          { sep: true },
          { icon: 'reset', label: 'Nouvelle session de courses', hint: 'Repart de zéro, l’historique est conservé', danger: true, run: async () => {
            if (await confirmDialog({ title: 'Nouvelle session ?', text: 'Les besoins du planning seront à nouveau « à acheter ». Les articles manuels non achetés restent dans la liste.', ok: 'Recommencer', icon: 'reset' })) { newShoppingSession(); toast('Nouvelle liste prête 🛒'); }
          } },
        ],
      });
    }
  };

  root.querySelector('#qa').onsubmit = (e) => {
    e.preventDefault();
    const inp = root.querySelector('#qai');
    const p = parseQuickItem(inp.value);
    if (!p) return;
    const added = addManualItem(p);
    haptic(10);
    toast(`${esc(p.name)} ajouté · ${CATEGORY[p.category]?.emoji || ''} ${CATEGORY[p.category]?.label || ''}`, { icon: 'cart', action: 'Annuler', onAction: () => store.del('items', added.id) });
    inp.value = '';
  };

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
  return { refresh: paint, destroy: () => { if (storeMode) { keepAwake(false); storeMode = false; } } };
}

// ── Saisie « acheté en partie » ────────────────────────────────
function partialBlock(it) {
  const rest = it.kind === 'manual' ? it.qty : it.remaining ?? it.qty;
  if (rest == null || !(rest > 0) || (it.kind !== 'manual' && !it.hasQty)) return '';
  const u = it.unit && it.unit !== 'unité' ? it.unit : '';
  const step = ['g', 'ml'].includes(it.unit) ? (rest >= 100 ? 50 : 10) : (rest < 1 ? 0.25 : 1);
  const def = Math.max(step, round3(Math.floor((rest / 2) / step) * step)) ;
  return `
    <div class="card pad" style="margin:4px 0 18px">
      <b style="display:block;margin-bottom:4px">Acheté en partie ?</b>
      <small class="muted" style="display:block;margin-bottom:12px">Reste à acheter : <b>${fmtQty(rest, it.unit)}</b>. Indiquez ce que vous avez pris : le reste restera dans la liste.</small>
      <div class="row" style="gap:8px">
        <button type="button" class="st-btn" data-pq="-1" aria-label="Moins">${icon('minus', 18)}</button>
        <input class="input" id="pq" inputmode="decimal" value="${String(def).replace('.', ',')}" style="text-align:center;font-weight:800;font-size:18px" data-step="${step}" data-max="${rest}">
        <button type="button" class="st-btn" data-pq="1" aria-label="Plus">${icon('plus', 18)}</button>
        <span style="flex:none;font-weight:700;color:var(--ink-2);min-width:24px">${esc(u)}</span>
      </div>
      <button type="button" class="btn dark block" data-a="part" style="margin-top:12px">${icon('check', 18)} Valider l’achat partiel</button>
    </div>`;
}
function readPartial(el, it) {
  const inp = el.querySelector('#pq');
  if (!inp) return null;
  const v = parseFloat(String(inp.value).replace(',', '.'));
  const max = +inp.dataset.max;
  if (!(v > 0)) { toast('Indiquez une quantité supérieure à 0', { icon: 'info' }); return null; }
  return { v: Math.min(v, max), full: v >= max - 1e-9 };
}
function wirePartial(el) {
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
  const canBuy = !purchases.length || it.partial;
  sheet({
    title: it.name,
    subtitle: `${CATEGORY[it.category]?.emoji || ''} ${CATEGORY[it.category]?.label || ''}`,
    body: `
      <div class="grid3" style="margin-bottom:18px">
        <div class="stat"><small>Besoin</small><b>${it.hasQty ? fmtQty(it.qty, it.unit) : it.noLongerNeeded ? '0' : '—'}</b></div>
        <div class="stat"><small>Acheté</small><b>${purchases.length ? (it.bought ? fmtQty(it.bought, it.unit) : '✓') : '0'}</b></div>
        <div class="stat"><small>Reste</small><b>${it.remaining ? fmtQty(it.remaining, it.unit) : '0'}</b></div>
      </div>
      ${it.noLongerNeeded ? `<div class="warn">ℹ️ <span>Le planning a changé : cet article n’est plus nécessaire, mais son achat est conservé.</span></div>` : ''}
      ${it.surplus ? `<div class="warn">ℹ️ <span>Le besoin a diminué : ${fmtQty(it.surplus, it.unit)} en trop par rapport au planning actuel.</span></div>` : ''}
      ${canBuy ? partialBlock(it) : ''}
      ${purchases.length ? `<h3 style="font-size:19px;margin:6px 0 4px">Achats</h3>
        <p class="muted" style="margin:0 0 10px;font-size:13.5px">Une erreur ? Retirez l’achat concerné avec ${icon('trash', 13)}.</p>
        <div class="src-list" id="plist">${purchases.map((p) => `<div class="src">${avatar(store.getAny('members', p.by), 40)}<span style="flex:1;min-width:0"><b>${esc(memberName(p.by) || '—')}</b><small>${timeAgo(p.at)}</small></span><span class="q">${p.qty != null ? fmtQty(p.qty, p.unit) : '✓'}</span>
          <button type="button" class="icon-btn ghost sm" data-rm="${esc(p.id)}" aria-label="Retirer cet achat">${icon('trash', 17)}</button></div>`).join('')}</div>` : ''}
      <h3 style="font-size:19px;margin:20px 0 10px">Pourquoi cet article ?</h3>
      <div class="src-list">${(it.sources || []).map((s) => `
        <a class="src" href="#/recette/${s.recipeId}?s=${s.servings}" data-close>${cover(recipe(s.recipeId))}
          <span style="min-width:0"><b>${esc(s.recipeTitle)}</b><small>${relDay(s.date)} · ${SLOT[s.slot].label} · ${s.servings} pers.${s.optional ? ' · facultatif' : ''}</small></span>
          <span class="q">${s.qty != null ? fmtQty(s.qty, it.unit) : ''}</span></a>`).join('') || '<p class="note">Aucun repas planifié n’utilise plus cet ingrédient.</p>'}</div>`,
    footer: `${purchases.length ? `<button class="btn ghost" data-a="uncheck">${icon('undo', 18)} Tout décocher</button>` : ''}${canBuy ? `<button class="btn primary" data-a="all">${icon('check', 18)} ${it.partial ? 'Acheter le reste' : 'Tout acheté'}</button>` : ''}`,
    onMount(el, close) {
      wirePartial(el);
      el.querySelector('[data-a=all]')?.addEventListener('click', () => { const u = buyAll(it); haptic(12); close(); undoToast(`${esc(it.name)} → dans le panier`, u); });
      el.querySelector('[data-a=part]')?.addEventListener('click', () => {
        const r = readPartial(el, it); if (!r) return;
        const u = r.full ? buyAll(it) : buyPart(it, r.v);
        haptic(12); close();
        undoToast(r.full ? `${esc(it.name)} → dans le panier` : `${fmtQty(r.v, it.unit)} de ${esc(it.name)} acheté · reste ${fmtQty(round3(it.remaining - r.v), it.unit)}`, u);
      });
      el.querySelector('[data-a=uncheck]')?.addEventListener('click', () => {
        const ids = purchases.map((p) => p.id);
        uncheckItem(it); close();
        undoToast(`${esc(it.name)} → remis à acheter`, () => store.batch(() => ids.forEach((id) => store.put('purchases', id, { deleted: false }))));
      });
      el.querySelector('#plist')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        const id = b.dataset.rm;
        store.del('purchases', id); haptic(8); close();
        undoToast('Achat retiré', () => store.put('purchases', id, { deleted: false }));
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
        { icon: 'undo', label: 'Remettre à acheter', run: () => { const prev = { checked: true, checkedBy: it.checkedBy, checkedAt: it.checkedAt }; uncheckItem(it); undoToast(`${esc(it.name)} → remis à acheter`, () => store.put('items', it.id, prev)); } },
        { icon: 'edit', label: 'Modifier l’article', run: () => openQuickAdd(it) },
        { sep: true },
        { icon: 'trash', label: 'Supprimer', danger: true, run: () => { store.del('items', it.id); undoToast('Article supprimé', () => store.put('items', it.id, { deleted: false })); } },
      ],
    });
  }
  sheet({
    title: it.name,
    subtitle: `Ajouté par ${esc(memberName(it.addedBy) || '—')} ${timeAgo(it.createdAt)}${it.bought ? ` · déjà ${fmtQty(it.bought, it.unit)} acheté` : ''}`,
    body: `${partialBlock(it)}
      <div class="action-list">
        <button class="action-row" data-a="edit"><span class="action-ic">${icon('edit', 20)}</span><span class="action-label">Modifier l’article</span></button>
        ${it.bought ? `<button class="action-row" data-a="resetbought"><span class="action-ic">${icon('undo', 20)}</span><span class="action-label">Annuler les achats partiels<small>Remet la quantité d’origine (${fmtQty(round3((it.qty || 0) + it.bought), it.unit)})</small></span></button>` : ''}
        <button class="action-row danger" data-a="del"><span class="action-ic">${icon('trash', 20)}</span><span class="action-label">Supprimer</span></button>
      </div>`,
    footer: `<button class="btn primary" data-a="all">${icon('check', 18)} Tout acheté</button>`,
    onMount(el, close) {
      wirePartial(el);
      el.querySelector('[data-a=all]').onclick = () => { const u = buyAll(it); haptic(12); close(); undoToast(`${esc(it.name)} → dans le panier`, u); };
      el.querySelector('[data-a=part]')?.addEventListener('click', () => {
        const r = readPartial(el, it); if (!r) return;
        const u = r.full ? buyAll(it) : buyPart(it, r.v);
        haptic(12); close();
        undoToast(r.full ? `${esc(it.name)} → dans le panier` : `${fmtQty(r.v, it.unit)} acheté · reste ${fmtQty(round3(it.qty - r.v), it.unit)}`, u);
      });
      el.querySelector('[data-a=edit]').onclick = () => { close(); setTimeout(() => openQuickAdd(it), 350); };
      el.querySelector('[data-a=resetbought]')?.addEventListener('click', () => {
        const prev = { qty: it.qty, bought: it.bought };
        store.put('items', it.id, { qty: round3((it.qty || 0) + it.bought), bought: 0 }); close();
        undoToast('Achats partiels annulés', () => store.put('items', it.id, prev));
      });
      el.querySelector('[data-a=del]').onclick = () => { store.del('items', it.id); close(); undoToast('Article supprimé', () => store.put('items', it.id, { deleted: false })); };
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
        const data = { name, qty: q === '' || isNaN(+q) ? null : +q, unit: el.querySelector('#u').value.trim() ? normalizeUnit(el.querySelector('#u').value.trim()) : null, category: el.querySelector('#c').value, note: el.querySelector('#no').value.trim() };
        if (editing) store.put('items', item.id, data); else addManualItem(data);
        haptic(10); close();
        toast(editing ? 'Article mis à jour' : `${esc(name)} ajouté aux courses`, { icon: 'cart' });
      };
      el.querySelector('[data-a=del]')?.addEventListener('click', () => {
        store.del('items', item.id); close();
        undoToast('Article supprimé', () => store.put('items', item.id, { deleted: false }));
      });
    },
  });
}
