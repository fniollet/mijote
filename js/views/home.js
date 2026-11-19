// ─────────────────────────────────────────────────────────────
// ACCUEIL (spec §3.2) — tableau de bord familial
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { settings, mealsOn, nextMeal, recipe, mealTitle, mealTime, shopping, mealsBetween } from '../model.js';
import { SLOTS, SLOT, totalTime, scaleQty, fmtQty, ingredientName } from '../domain.js';
import { esc, todayISO, addDays, startOfWeek, fmtDate, dayName, fromISO, relDay, fmtDuration, daysBetween } from '../utils.js';
import { icon } from '../icons.js';
import { cover, avatar } from '../ui.js';
import { openAddMeal, openMealActions } from './planning.js';
import { openQuickAdd } from './shopping.js';
import { openEditor } from './editor.js';
import { mealThumb, openMemberSwitch, syncBadge, freeEmoji } from './shared.js';

export function mount(root) {
  let first = true;
  const paint = () => {
    const today = todayISO();
    const s = settings();
    const me = store.member;
    const h = new Date().getHours();
    const hello = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
    const todays = mealsOn(today);
    const shop = shopping();
    const remaining = shop.toBuy.filter((i) => !i.pantry).length;
    const bought = shop.done.filter((i) => !i.noLongerNeeded).length;
    const pct = remaining + bought ? Math.round((bought / (remaining + bought)) * 100) : 0;
    const next = nextMeal();
    const ws = startOfWeek(today);

    root.innerHTML = `
      <div class="${first ? 'stagger' : ''}">
        <div class="topbar">
          <button class="whoami" data-act="who">${avatar(me, 34)}<span>${esc(me?.name || 'Choisir')}</span>${icon('down', 16)}</button>
          ${syncBadge()}
        </div>
        <div class="greet">
          <div class="eyebrow">${fmtDate(today)}</div>
          <h1>${hello},<br><em>${esc(me?.name || s.name)}</em></h1>
          <p>${todays.length ? `${todays.length} repas prévu${todays.length > 1 ? 's' : ''} aujourd'hui` : "Rien de prévu aujourd'hui"} · ${remaining ? `${remaining} article${remaining > 1 ? 's' : ''} à acheter` : 'courses à jour ✨'}</p>
        </div>

        ${next ? heroCard(next, today) : `
          <div class="hero hero-empty card"><div class="big">🍳</div><h2 style="color:var(--ink);font-size:28px">Que mange-t-on ?</h2>
          <p class="muted" style="margin:6px 0 18px">Aucun repas planifié pour les prochains jours.</p>
          <button class="btn primary" data-act="add-meal">${icon('plus', 20)} Planifier un repas</button></div>`}

        <div class="section-title"><h2>Aujourd'hui</h2><a href="#/planning?d=${today}">Planning ${icon('right', 14)}</a></div>
        <div class="today-row">${SLOTS.map((sl) => slotCard(sl, mealsOn(today, sl.id)[0], today)).join('')}</div>

        <div class="section-title"><h2>En un coup d'œil</h2></div>
        <div class="duo">
          <button class="card shop-widget" data-go="#/courses">
            <div class="ring" style="--p:${pct}"><div><b>${remaining}</b><small>RESTANTS</small></div></div>
            <div><h3>Courses</h3><p>${bought} acheté${bought > 1 ? 's' : ''} · ${remaining} à acheter</p>
            <span class="pill accent" style="margin-top:10px">${icon('cart', 15)} Ouvrir la liste</span></div>
          </button>
          <div class="card week-mini">
            <div class="row" style="justify-content:space-between"><b>Cette semaine</b><a class="linkish" href="#/planning">Tout voir</a></div>
            <div class="wm-days">${Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
              const has = SLOTS.map((x) => mealsOn(d, x.id).length > 0);
              return `<a class="wm-day ${d === today ? 'today' : ''}" href="#/planning?d=${d}"><small>${dayName(d, true).slice(0, 2)}</small><b>${fromISO(d).getDate()}</b>
                <span class="wm-dots">${has.map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</span></a>`;
            }).join('')}</div>
          </div>
        </div>

        <div class="section-title"><h2>Raccourcis</h2></div>
        <div class="quick">
          <button data-act="add-meal"><span class="qi" style="background:linear-gradient(135deg,#ff8a3d,#ff5b2e)">${icon('calendar')}</span>Ajouter un repas</button>
          <button data-act="add-recipe"><span class="qi" style="background:linear-gradient(135deg,#b49cff,#8c6cf0)">${icon('book')}</span>Nouvelle recette</button>
          <button data-act="add-item"><span class="qi" style="background:linear-gradient(135deg,#7fd49b,#4fa772)">${icon('cart')}</span>Ajouter aux courses</button>
          <button data-go="#/planning"><span class="qi" style="background:linear-gradient(135deg,#7fb0ff,#4f86f7)">${icon('list')}</span>Voir le planning</button>
        </div>
        <p class="foot-note">${esc(s.name)} · Mijoté</p>
      </div>`;
    first = false;
  };

  const heroCard = (m, today) => {
    const r = m.recipeId ? recipe(m.recipeId) : null;
    const when = m.date === today ? countdown(mealTime(m)) : `${relDay(m.date)} · ${mealTime(m)}`;
    const ings = r ? (r.ingredients || []).filter((i) => !i.opt).slice(0, 8)
      .map((i) => `<span class="pill glass">${fmtQty(scaleQty(i.q, r.servings, m.servings), i.u)} ${esc(ingredientName(i).toLowerCase())}</span>`).join('') : '';
    return `
      <article class="hero" data-meal="${m.id}">
        ${r ? cover(r, { eager: true }) : `<div class="cover cover-art" style="--c1:#c9b8a6;--c2:#7d6a58"><span class="cover-emoji">${freeEmoji(m)}</span></div>`}
        <div class="hero-body">
          <div class="hero-tag"><span class="live"></span>Prochain repas · ${SLOT[m.slot].label}</div>
          <h2>${esc(mealTitle(m))}</h2>
          <div class="hero-meta">
            <span class="pill glass">${icon('clock', 15)} ${when}</span>
            <span class="pill glass">${icon('users', 15)} ${m.servings} pers.</span>
            ${r ? `<span class="pill glass">${icon('flame', 15)} ${fmtDuration(totalTime(r))}</span>` : ''}
          </div>
          ${ings ? `<div class="hero-ings">${ings}</div>` : ''}
          <div class="hero-actions">
            ${r ? `<button class="btn primary" data-go="#/cuisine/${r.id}?s=${m.servings}">${icon('chef', 20)} Cuisiner</button>
            <button class="btn ghost" data-go="#/recette/${r.id}?s=${m.servings}">Recette</button>`
            : `<button class="btn ghost" data-act="meal" data-id="${m.id}">${icon('edit', 18)} Modifier</button>`}
          </div>
        </div>
      </article>`;
  };

  const countdown = (hhmm) => {
    const [hh, mm] = hhmm.split(':').map(Number);
    const t = new Date(); t.setHours(hh, mm, 0, 0);
    const diff = Math.round((t - Date.now()) / 60000);
    if (diff <= 0) return `Maintenant · ${hhmm}`;
    if (diff < 60) return `Dans ${diff} min`;
    return `Aujourd'hui · ${hhmm}`;
  };

  const slotCard = (sl, m, today) => {
    if (!m) return `<button class="slot-card empty" data-act="add-slot" data-slot="${sl.id}"><span style="font-size:26px">${sl.emoji}</span>${sl.label}<span class="linkish" style="font-size:12.5px">+ Ajouter</span></button>`;
    const r = m.recipeId ? recipe(m.recipeId) : null;
    return `<button class="slot-card" data-act="meal" data-id="${m.id}">
      ${r ? cover(r) : `<div class="free-art">${freeEmoji(m)}</div>`}
      <div class="sc-body"><div class="sc-slot">${sl.short} · ${mealTime(m)}</div><div class="sc-title">${esc(mealTitle(m))}</div>
      <div class="sc-meta">${m.servings} pers.${r ? ` · ${fmtDuration(totalTime(r))}` : ''}</div></div></button>`;
  };

  root.onclick = (e) => {
    const go = e.target.closest('[data-go]');
    if (go) { location.hash = go.dataset.go; return; }
    const t = e.target.closest('[data-act]');
    if (!t) { const h = e.target.closest('.hero[data-meal]'); if (h) openMealActions(store.get('meals', h.dataset.meal)); return; }
    switch (t.dataset.act) {
      case 'who': return openMemberSwitch();
      case 'add-meal': return openAddMeal({ date: todayISO(), slot: suggestSlot() });
      case 'add-slot': return openAddMeal({ date: todayISO(), slot: t.dataset.slot });
      case 'add-recipe': return openEditor();
      case 'add-item': return openQuickAdd();
      case 'meal': return openMealActions(store.get('meals', t.dataset.id));
    }
  };
  const suggestSlot = () => { const h = new Date().getHours(); return h < 10 ? 'breakfast' : h < 14 ? 'lunch' : 'dinner'; };

  paint();
  const tick = setInterval(paint, 60000);
  return { refresh: paint, destroy: () => clearInterval(tick) };
}
