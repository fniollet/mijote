// ─────────────────────────────────────────────────────────────
// PLANNING (spec §4) — vue hebdomadaire, 3 créneaux, glisser-déposer   (v1.1)
// v1.1 : reprendre une semaine passée (spec §14.7)
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import {
  mealsOn, addMeal, updateMeal, deleteMeal, copyMeal, duplicateDay, copyWeek, pastWeeks, recipe, allRecipes, favoriteSet,
  settings, mealTitle, mealTime, memberName, usageCount,
} from '../model.js';
import { SLOTS, SLOT, totalTime, searchRecipes } from '../domain.js';
import { esc, todayISO, addDays, startOfWeek, fmtDate, dayName, fromISO, relDay, fmtDuration, haptic } from '../utils.js';
import { icon } from '../icons.js';
import { sheet, actionSheet, confirmDialog, toast, undoToast, cover, stepper } from '../ui.js';
import { mealThumb, FREE_PRESETS } from './shared.js';

let weekStart = startOfWeek(todayISO());
let focusDay = todayISO();

const undoMeals = (ids) => () => store.batch(() => ids.forEach((id) => store.del('meals', id)));

export function mount(root, params = {}) {
  if (params.date) { weekStart = startOfWeek(params.date); focusDay = params.date; }
  let first = true;

  const paint = () => {
    const today = todayISO();
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    const end = days[6];
    const count = days.reduce((n, d) => n + mealsOn(d).length, 0);
    const isThisWeek = weekStart === startOfWeek(today);
    root.innerHTML = `
      <div class="${first ? 'view-in' : ''}">
        <header class="page-head">
          <div><div class="eyebrow">Planning</div><h1>La semaine</h1>
          <p>${count ? `${count} repas prévus` : 'Aucun repas prévu'} · ${fmtDate(weekStart, { noDay: true })} – ${fmtDate(end, { noDay: true })}</p></div>
          <button class="icon-btn" data-act="week-menu" aria-label="Options">${icon('more', 22)}</button>
        </header>
        <div class="week-nav">
          <button class="icon-btn" data-act="prev" aria-label="Semaine précédente">${icon('left')}</button>
          <div class="wn-label">${isThisWeek ? 'Cette semaine' : weekStart === addDays(startOfWeek(today), 7) ? 'Semaine prochaine' : `Semaine du ${fmtDate(weekStart, { noDay: true })}`}
            <small>${isThisWeek ? 'Glissez un repas pour le déplacer' : `<button class="linkish" data-act="today">Revenir à aujourd'hui</button>`}</small></div>
          <button class="icon-btn" data-act="next" aria-label="Semaine suivante">${icon('right')}</button>
        </div>
        ${!count ? `<button class="card resume-week" data-act="past-weeks">${icon('repeat', 20)}<span><b>Semaine vide</b><small>Reprendre une semaine passée en un geste</small></span>${icon('right', 18)}</button>` : ''}
        <nav class="day-pills">${days.map((d) => `
          <button class="day-pill ${d === today ? 'today' : ''} ${d === focusDay ? 'on' : ''}" data-act="pill" data-d="${d}">
            <small>${dayName(d, true)}</small><b>${fromISO(d).getDate()}</b></button>`).join('')}</nav>
        <div class="days ${first ? 'stagger' : ''}">${days.map((d) => dayCard(d, today)).join('')}</div>
      </div>`;
    first = false;
  };

  const dayCard = (d, today) => `
    <section class="day-card ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}" id="day-${d}" data-day="${d}">
      <div class="day-head"><h3>${dayName(d)}<small>${fmtDate(d, { noDay: true, shortMonth: true })}${d === today ? " · aujourd'hui" : ''}</small></h3>
        <button class="icon-btn ghost sm" data-act="day-menu" data-d="${d}" aria-label="Options du jour">${icon('more', 20)}</button></div>
      <div class="slots">${SLOTS.map((s) => `
        <div class="slot" data-d="${d}" data-slot="${s.id}">
          <div class="slot-label"><span>${s.emoji}</span>${s.short}</div>
          <div class="slot-items">
            ${mealsOn(d, s.id).map((m) => mealRow(m)).join('')}
            <button class="add-slot" data-act="add" data-d="${d}" data-slot="${s.id}">${icon('plus', 18)}<span>Ajouter</span></button>
          </div>
        </div>`).join('')}</div>
    </section>`;

  const mealRow = (m) => {
    const r = m.recipeId ? recipe(m.recipeId) : null;
    return `<button class="meal" data-meal="${m.id}">
      ${mealThumb(m)}
      <span class="m-body"><span class="m-title">${esc(mealTitle(m))}</span>
      <span class="m-sub"><span class="m-serv">${icon('users', 13)} ${m.servings}</span>${r ? `<span>${icon('clock', 13)}</span>${fmtDuration(totalTime(r))}` : `<span>${m.kind === 'out' ? 'Extérieur' : 'Sans recette'}</span>`}${m.note ? ' · 📝' : ''}</span></span>
    </button>`;
  };

  root.onclick = async (e) => {
    if (dragState.justDropped) return;
    const t = e.target.closest('[data-act], [data-meal]');
    if (!t) return;
    const a = t.dataset.act;
    if (t.dataset.meal && !a) return openMealActions(store.get('meals', t.dataset.meal));
    if (a === 'prev' || a === 'next') { weekStart = addDays(weekStart, a === 'prev' ? -7 : 7); focusDay = weekStart; haptic(); paint(); }
    if (a === 'today') { weekStart = startOfWeek(todayISO()); focusDay = todayISO(); paint(); scrollToDay(focusDay); }
    if (a === 'pill') { focusDay = t.dataset.d; root.querySelectorAll('.day-pill').forEach((p) => p.classList.toggle('on', p.dataset.d === focusDay)); scrollToDay(focusDay); }
    if (a === 'add') openAddMeal({ date: t.dataset.d, slot: t.dataset.slot });
    if (a === 'day-menu') dayMenu(t.dataset.d);
    if (a === 'week-menu') weekMenu();
    if (a === 'past-weeks') openPastWeeks(weekStart, (s) => { weekStart = s; paint(); });
  };

  const scrollToDay = (d) => document.getElementById('day-' + d)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const weekMenu = () => actionSheet({
    title: 'Semaine',
    actions: [
      { icon: 'repeat', label: 'Reprendre une semaine passée…', hint: 'Copie ses repas sur cette semaine', run: () => openPastWeeks(weekStart, (s) => { weekStart = s; paint(); }) },
      { icon: 'copy', label: 'Copier cette semaine vers la suivante', run: () => {
        const ids = copyWeek(weekStart, addDays(weekStart, 7));
        undoToast(`${ids.length} repas copiés sur la semaine suivante`, undoMeals(ids), { icon: 'copy' });
      } },
      { icon: 'cart', label: 'Voir les courses de la semaine', run: () => (location.hash = '#/courses') },
      { sep: true },
      { icon: 'trash', label: 'Vider la semaine', danger: true, run: async () => {
        const list = Array.from({ length: 7 }, (_, i) => mealsOn(addDays(weekStart, i))).flat();
        if (!list.length) return;
        if (await confirmDialog({ title: 'Vider la semaine ?', text: `${list.length} repas seront retirés du planning. Les achats déjà effectués sont conservés.`, ok: 'Vider', danger: true, icon: 'trash' })) {
          store.batch(() => list.forEach((m) => deleteMeal(m.id)));
          undoToast('Semaine vidée', () => store.batch(() => list.forEach((m) => store.put('meals', m.id, { deleted: false }))), { icon: 'trash' });
        }
      } },
    ],
  });

  const dayMenu = (d) => actionSheet({
    title: `${dayName(d)} ${fmtDate(d, { noDay: true })}`,
    actions: [
      { icon: 'plus', label: 'Ajouter un repas', run: () => openAddMeal({ date: d, slot: 'dinner' }) },
      { icon: 'copy', label: 'Dupliquer la journée…', hint: 'Copier les repas vers un autre jour', run: async () => {
        const res = await pickDates({ title: 'Dupliquer vers…', date: addDays(d, 1), multi: true, withSlot: false });
        if (!res) return;
        const ids = [];
        store.batch(() => res.dates.forEach((x) => ids.push(...duplicateDay(d, x))));
        undoToast(`${ids.length} repas dupliqués`, undoMeals(ids), { icon: 'copy' });
      } },
      { sep: true },
      { icon: 'trash', label: 'Vider la journée', danger: true, run: () => {
        const list = mealsOn(d);
        store.batch(() => list.forEach((m) => deleteMeal(m.id)));
        list.length && undoToast('Journée vidée', () => store.batch(() => list.forEach((m) => store.put('meals', m.id, { deleted: false }))), { icon: 'trash' });
      } },
    ],
  });

  // ── Glisser-déposer (souris + appui long sur écran tactile) ──
  const dragState = { justDropped: false };
  const onDown = (e) => {
    const card = e.target.closest('.meal');
    if (!card || e.button > 0) return;
    const id = card.dataset.meal;
    const sx = e.clientX, sy = e.clientY;
    let ghost = null, over = null, timer = null, active = false, raf = 0, py = sy;
    const begin = () => {
      active = true;
      haptic(18);
      const r = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.classList.add('drag-ghost');
      ghost.style.width = Math.min(r.width, 280) + 'px';
      document.body.appendChild(ghost);
      card.classList.add('lifting');
      dragState.active = true;
      position(sx, sy);
      const scroll = () => {
        if (!active) return;
        if (py < 90) scrollBy(0, -12); else if (py > innerHeight - 140) scrollBy(0, 12);
        raf = requestAnimationFrame(scroll);
      };
      raf = requestAnimationFrame(scroll);
    };
    const position = (x, y) => {
      ghost.style.left = x - 40 + 'px'; ghost.style.top = y - 30 + 'px';
      const el = document.elementFromPoint(x, y)?.closest('.slot');
      if (el !== over) { over?.classList.remove('drop-ok'); over = el; over?.classList.add('drop-ok'); if (el) haptic(4); }
    };
    const move = (ev) => {
      py = ev.clientY;
      if (!active) {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy);
        if (e.pointerType === 'mouse' && dist > 6) begin();
        else if (e.pointerType !== 'mouse' && dist > 8) return cleanup();
        return;
      }
      position(ev.clientX, ev.clientY);
    };
    const up = () => {
      if (active && over) {
        const m = store.get('meals', id);
        const { d, slot } = over.dataset;
        if (m && (m.date !== d || m.slot !== slot)) {
          const prev = { date: m.date, slot: m.slot };
          updateMeal(id, { date: d, slot });
          haptic(14);
          undoToast(`Déplacé à ${relDay(d).toLowerCase()} · ${SLOT[slot].label.toLowerCase()}`, () => updateMeal(id, prev), { icon: 'move' });
        }
      }
      if (active) { dragState.justDropped = true; setTimeout(() => (dragState.justDropped = false), 50); }
      cleanup();
    };
    const cleanup = () => {
      clearTimeout(timer); cancelAnimationFrame(raf);
      active = false; dragState.active = false;
      ghost?.remove(); over?.classList.remove('drop-ok'); card.classList.remove('lifting');
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cleanup);
    };
    if (e.pointerType !== 'mouse') timer = setTimeout(begin, 380);
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cleanup);
  };
  const blockTouch = (ev) => { if (dragState.active) ev.preventDefault(); };
  const blockMenu = (ev) => { if (ev.target.closest('.meal')) ev.preventDefault(); };
  root.addEventListener('pointerdown', onDown);
  document.addEventListener('touchmove', blockTouch, { passive: false });
  root.addEventListener('contextmenu', blockMenu);

  paint();
  if (focusDay >= weekStart && focusDay <= addDays(weekStart, 6) && focusDay !== weekStart) setTimeout(() => scrollToDay(focusDay), 250);
  return {
    refresh: paint,
    destroy() { root.removeEventListener('pointerdown', onDown); document.removeEventListener('touchmove', blockTouch); root.removeEventListener('contextmenu', blockMenu); },
  };
}

// ── Reprendre une semaine passée (spec §14.7) ─────────────────
export function openPastWeeks(target, onDone) {
  const weeks = pastWeeks();
  sheet({
    title: 'Reprendre une semaine',
    subtitle: `Les repas seront copiés sur la semaine du ${fmtDate(target, { noDay: true })}.`,
    body: weeks.length ? `<div class="src-list">${weeks.map((w) => {
      const titles = [...new Set(w.meals.map(mealTitle))];
      const thumbs = w.meals.filter((m) => m.recipeId).slice(0, 4).map((m) => cover(recipe(m.recipeId))).join('');
      return `<button class="src week-pick" data-w="${w.start}"><span class="wp-thumbs">${thumbs || '<div class="m-free">🥢</div>'}</span>
        <span style="min-width:0;flex:1"><b>Semaine du ${fmtDate(w.start, { noDay: true })}</b><small>${w.meals.length} repas · ${titles.slice(0, 3).map(esc).join(', ')}${titles.length > 3 ? '…' : ''}</small></span>${icon('right', 18)}</button>`;
    }).join('')}</div>` : `<div class="empty-state" style="padding:30px 10px"><div class="big">🗓️</div><h3>Aucune semaine passée</h3><p>Dès que vous aurez planifié quelques semaines, vous pourrez les reprendre ici.</p></div>`,
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-w]'); if (!b) return;
        const existing = Array.from({ length: 7 }, (_, i) => mealsOn(addDays(target, i))).flat().length;
        if (existing && !(await confirmDialog({ title: 'Ajouter à la semaine ?', text: `Cette semaine contient déjà ${existing} repas. Les repas copiés s’ajouteront à côté.`, ok: 'Ajouter', icon: 'repeat' }))) return;
        const ids = copyWeek(b.dataset.w, target);
        haptic(14); close();
        onDone && onDone(target);
        undoToast(`${ids.length} repas repris 🎉 · les courses sont à jour`, undoMeals(ids), { icon: 'repeat' });
      });
    },
  });
}

// ── Ajout / modification d'un repas (spec §4.4) ──────────────
export function openAddMeal({ date = todayISO(), slot = 'dinner', recipeId = null, meal = null } = {}) {
  const editing = !!meal;
  const st = {
    kind: meal ? (meal.recipeId ? 'recipe' : meal.kind || 'free') : 'recipe',
    recipeId: meal?.recipeId || recipeId,
    title: meal?.title || '',
    date: meal?.date || date,
    slot: meal?.slot || slot,
    servings: meal?.servings || settings().defaultServings,
    q: '',
    gridStart: startOfWeek(meal?.date || date),
  };
  const favs = favoriteSet();
  const usage = usageCount();

  const recipeList = () => {
    let list = searchRecipes(allRecipes(), { q: st.q, favorites: favs, usage, sort: 'used' });
    if (!st.q) list = list.sort((a, b) => ((b.slots || []).includes(st.slot) - (a.slots || []).includes(st.slot)) || (favs.has(b.id) - favs.has(a.id)));
    if (st.recipeId) { const sel = recipe(st.recipeId); list = [sel, ...list.filter((r) => r.id !== st.recipeId)].filter(Boolean); }
    return list.slice(0, 60).map((r) => `
      <button type="button" class="pick ${r.id === st.recipeId ? 'on' : ''}" data-r="${r.id}">${cover(r)}
        <span style="min-width:0"><b>${esc(r.title)}</b><small>${fmtDuration(totalTime(r))} · ${r.servings} pers.${favs.has(r.id) ? ' · ♥' : ''}${r.builtin ? '' : ' · Famille'}</small></span>
        <span class="pk-check">${icon('check', 16)}</span></button>`).join('') || `<p class="note">Aucune recette trouvée. Essayez « Repas libre ».</p>`;
  };
  const dateGrid = () => Array.from({ length: 14 }, (_, i) => addDays(st.gridStart, i)).map((d) => `
    <button type="button" class="date-cell ${d === st.date ? 'on' : ''} ${d === todayISO() ? 'today' : ''}" data-date="${d}"><small>${dayName(d, true)}</small><b>${fromISO(d).getDate()}</b></button>`).join('');

  sheet({
    title: editing ? 'Modifier le repas' : 'Ajouter un repas',
    full: true,
    body: `
      <div class="seg" id="kind" style="margin-bottom:16px">
        <button type="button" data-k="recipe">${icon('book', 17)} Recette</button>
        <button type="button" data-k="free">🥡 Repas libre</button>
        <button type="button" data-k="out">📍 Extérieur</button>
      </div>
      <div id="k-recipe">
        <div class="searchbar" style="position:relative;top:0;margin-bottom:12px;box-shadow:none;background:var(--surface-2)">${icon('search', 20)}<input id="rq" placeholder="Chercher une recette, un ingrédient…" autocomplete="off"></div>
        <div class="pick-list" id="plist">${recipeList()}</div>
      </div>
      <div id="k-free">
        <div class="free-chips">${FREE_PRESETS.map(([n, e, k]) => `<button type="button" class="chip" data-preset="${esc(n)}" data-pk="${k}">${e} ${esc(n)}</button>`).join('')}</div>
        <label class="field"><span>Intitulé</span><input class="input" id="ftitle" placeholder="Ex. Chez Mamie, restes de lasagnes…" value="${esc(st.title)}"></label>
      </div>
      <div class="ed-section" style="margin-top:20px"><h3>Quand ?</h3>
        <div class="row" style="flex:none;gap:4px"><button type="button" class="icon-btn sm" data-gw="-7">${icon('left', 18)}</button><button type="button" class="icon-btn sm" data-gw="7">${icon('right', 18)}</button></div></div>
      <div class="date-grid" id="dgrid">${dateGrid()}</div>
      <div class="seg" id="slotseg" style="margin-top:10px">${SLOTS.map((s) => `<button type="button" data-s="${s.id}" class="${s.id === st.slot ? 'on' : ''}">${s.emoji} ${s.short}</button>`).join('')}</div>
      <div class="grid2" style="margin-top:18px;align-items:end">
        <div class="field" style="margin:0"><span>Personnes</span>${stepper('servings', st.servings, { min: 1, max: 30, label: 'pers.' })}</div>
        <label class="field" style="margin:0"><span>Heure (facultatif)</span><input class="input" type="time" id="mtime" value="${esc(meal?.time || '')}" placeholder="${settings().times[st.slot]}"></label>
      </div>
      <label class="field" style="margin-top:16px"><span>Note (facultatif)</span><input class="input" id="mnote" value="${esc(meal?.note || '')}" placeholder="Ex. doubler la sauce, sans oignon pour Léo…"></label>`,
    footer: `${editing ? `<button class="btn ghost" data-del style="flex:0 0 56px;padding:0">${icon('trash', 20)}</button>` : ''}<button class="btn primary" data-save>${editing ? 'Enregistrer' : 'Ajouter au planning'}</button>`,
    onMount(el, close) {
      const setKind = (k) => {
        st.kind = k;
        el.querySelectorAll('#kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
        el.querySelector('#k-recipe').hidden = k !== 'recipe';
        el.querySelector('#k-free').hidden = k === 'recipe';
      };
      setKind(st.kind);
      el.querySelector('#kind').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) setKind(b.dataset.k); };
      el.querySelector('#rq').oninput = (e) => { st.q = e.target.value; el.querySelector('#plist').innerHTML = recipeList(); };
      el.querySelector('#plist').onclick = (e) => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        st.recipeId = b.dataset.r; haptic();
        el.querySelectorAll('.pick').forEach((p) => p.classList.toggle('on', p.dataset.r === st.recipeId));
      };
      el.querySelector('.free-chips').onclick = (e) => {
        const b = e.target.closest('[data-preset]'); if (!b) return;
        el.querySelector('#ftitle').value = b.dataset.preset; setKind(b.dataset.pk);
      };
      el.querySelector('#dgrid').onclick = (e) => {
        const b = e.target.closest('[data-date]'); if (!b) return;
        st.date = b.dataset.date; el.querySelector('#dgrid').innerHTML = dateGrid(); haptic(4);
      };
      el.querySelectorAll('[data-gw]').forEach((b) => (b.onclick = () => { st.gridStart = addDays(st.gridStart, +b.dataset.gw); el.querySelector('#dgrid').innerHTML = dateGrid(); }));
      el.querySelector('#slotseg').onclick = (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        st.slot = b.dataset.s; el.querySelectorAll('#slotseg button').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#mtime').placeholder = settings().times[st.slot];
      };
      el.querySelector('[data-del]')?.addEventListener('click', () => { close(); removeMeal(meal); });
      el.querySelector('[data-save]').onclick = () => {
        const servings = +el.querySelector('input[name=servings]').value;
        const title = el.querySelector('#ftitle').value.trim();
        if (st.kind === 'recipe' && !st.recipeId) return toast('Choisissez une recette', { icon: 'info' });
        if (st.kind !== 'recipe' && !title) return toast('Donnez un intitulé au repas', { icon: 'info' });
        const data = {
          date: st.date, slot: st.slot, servings, kind: st.kind,
          recipeId: st.kind === 'recipe' ? st.recipeId : null, title: st.kind === 'recipe' ? '' : title,
          time: el.querySelector('#mtime').value || '', note: el.querySelector('#mnote').value.trim(),
        };
        let undo;
        if (editing) { const prev = Object.fromEntries(Object.keys(data).map((k) => [k, meal[k] ?? null])); updateMeal(meal.id, data); undo = () => updateMeal(meal.id, prev); }
        else { const m = addMeal(data); undo = () => store.del('meals', m.id); }
        haptic(14);
        close();
        undoToast(`${editing ? 'Repas mis à jour' : 'Ajouté'} · ${relDay(st.date)} ${SLOT[st.slot].short.toLowerCase()}`, undo, { icon: 'calendar' });
      };
    },
  });
}

async function removeMeal(m) {
  deleteMeal(m.id);
  undoToast('Repas retiré du planning', () => store.put('meals', m.id, { deleted: false }), { icon: 'trash' });
}

// ── Actions sur un repas (spec §4.5) ──────────────────────────
export function openMealActions(m) {
  if (!m) return;
  const r = m.recipeId ? recipe(m.recipeId) : null;
  const header = `
    <div class="src" style="margin-bottom:12px">${mealThumb(m)}
      <span style="min-width:0;flex:1"><b>${esc(mealTitle(m))}</b><small>${relDay(m.date)} · ${SLOT[m.slot].label} · ${mealTime(m)}${m.createdBy ? ` · par ${esc(memberName(m.createdBy))}` : ''}</small>
      ${m.note ? `<small style="display:block;color:var(--ink-2)">📝 ${esc(m.note)}</small>` : ''}</span></div>
    <div class="serv-bar"><span><b>Personnes</b><small>${r ? 'Les courses sont recalculées automatiquement' : 'Repas sans recette'}</small></span>${stepper('mserv', m.servings, { min: 1, max: 30 })}</div>`;
  actionSheet({
    header,
    actions: [
      r && { icon: 'chef', label: 'Commencer à cuisiner', run: () => (location.hash = `#/cuisine/${r.id}?s=${store.get('meals', m.id)?.servings || m.servings}`) },
      r && { icon: 'book', label: 'Voir la recette', run: () => (location.hash = `#/recette/${r.id}?s=${store.get('meals', m.id)?.servings || m.servings}`) },
      { icon: 'edit', label: r ? 'Modifier / changer de recette' : 'Modifier', run: () => openAddMeal({ meal: store.get('meals', m.id) }) },
      { icon: 'move', label: 'Déplacer…', run: async () => {
        const res = await pickDates({ title: 'Déplacer vers…', date: m.date, slot: m.slot });
        if (res) { updateMeal(m.id, { date: res.dates[0], slot: res.slot }); undoToast(`Déplacé · ${relDay(res.dates[0])}`, () => updateMeal(m.id, { date: m.date, slot: m.slot }), { icon: 'move' }); }
      } },
      { icon: 'copy', label: 'Copier vers…', run: async () => {
        const res = await pickDates({ title: 'Copier vers…', date: addDays(m.date, 1), slot: m.slot });
        if (res) { const c = copyMeal(m.id, res.dates[0], res.slot); undoToast(`Copié · ${relDay(res.dates[0])}`, undoMeals([c.id]), { icon: 'copy' }); }
      } },
      { icon: 'repeat', label: 'Répéter sur plusieurs jours…', run: async () => {
        const res = await pickDates({ title: 'Répéter ce repas', date: addDays(m.date, 1), slot: m.slot, multi: true });
        if (res) { const ids = []; store.batch(() => res.dates.forEach((d) => ids.push(copyMeal(m.id, d, res.slot).id))); undoToast(`Répété sur ${ids.length} jour${ids.length > 1 ? 's' : ''}`, undoMeals(ids), { icon: 'repeat' }); }
      } },
      { sep: true },
      { icon: 'trash', label: 'Retirer du planning', danger: true, run: () => removeMeal(m) },
    ],
  });
  setTimeout(() => {
    const inp = document.querySelector('.sheet-wrap:last-child input[name=mserv]');
    inp?.addEventListener('change', () => updateMeal(m.id, { servings: +inp.value }));
  }, 30);
}

/** Sélecteur de date(s) + créneau. */
export function pickDates({ title, date = todayISO(), slot = 'dinner', multi = false, withSlot = true }) {
  return new Promise((resolve) => {
    let start = startOfWeek(date), sel = new Set(multi ? [] : [date]), s = slot, ok = false;
    const grid = () => Array.from({ length: 14 }, (_, i) => addDays(start, i)).map((d) => `
      <button type="button" class="date-cell ${sel.has(d) ? 'on' : ''} ${d === todayISO() ? 'today' : ''}" data-date="${d}"><small>${dayName(d, true)}</small><b>${fromISO(d).getDate()}</b></button>`).join('');
    sheet({
      title, subtitle: multi ? 'Touchez un ou plusieurs jours' : '',
      body: `<div class="row" style="justify-content:space-between;margin-bottom:10px"><b id="mlabel" style="flex:1"></b>
          <span class="row" style="flex:none;gap:4px"><button type="button" class="icon-btn sm" data-gw="-7">${icon('left', 18)}</button><button type="button" class="icon-btn sm" data-gw="7">${icon('right', 18)}</button></span></div>
        <div class="date-grid" id="pg">${grid()}</div>
        ${withSlot ? `<div class="seg" id="ps" style="margin-top:12px">${SLOTS.map((x) => `<button type="button" data-s="${x.id}" class="${x.id === s ? 'on' : ''}">${x.emoji} ${x.short}</button>`).join('')}</div>` : ''}`,
      footer: `<button class="btn primary" data-ok>Valider</button>`,
      onMount(el, close) {
        const label = () => (el.querySelector('#mlabel').textContent = `${fmtDate(start, { noDay: true })} – ${fmtDate(addDays(start, 13), { noDay: true })}`);
        label();
        el.querySelector('#pg').onclick = (e) => {
          const b = e.target.closest('[data-date]'); if (!b) return;
          const d = b.dataset.date;
          if (multi) sel.has(d) ? sel.delete(d) : sel.add(d); else sel = new Set([d]);
          haptic(4); el.querySelector('#pg').innerHTML = grid();
        };
        el.querySelectorAll('[data-gw]').forEach((b) => (b.onclick = () => { start = addDays(start, +b.dataset.gw); label(); el.querySelector('#pg').innerHTML = grid(); }));
        el.querySelector('#ps')?.addEventListener('click', (e) => {
          const b = e.target.closest('[data-s]'); if (!b) return;
          s = b.dataset.s; el.querySelectorAll('#ps button').forEach((x) => x.classList.toggle('on', x === b));
        });
        el.querySelector('[data-ok]').onclick = () => { if (!sel.size) return toast('Choisissez au moins un jour', { icon: 'info' }); ok = true; close(); };
      },
      onClose: () => resolve(ok ? { dates: [...sel].sort(), slot: s } : null),
    });
  });
}
