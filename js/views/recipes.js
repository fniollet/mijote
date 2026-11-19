// ─────────────────────────────────────────────────────────────
// BIBLIOTHÈQUE DE RECETTES (spec §5.9) — recherche, filtres, tri
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { allRecipes, favoriteSet, toggleFavorite, membersMap, usageCount } from '../model.js';
import { searchRecipes, totalTime } from '../domain.js';
import { esc, fmtDuration, haptic, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { cover, avatar } from '../ui.js';
import { openEditor } from './editor.js';
import { emptyState } from './shared.js';

const state = { q: '', filter: 'all', sort: 'alpha' };
const FILTERS = [
  ['all', 'Toutes'], ['fav', '♥ Favoris'], ['breakfast', '☀️ Matin'], ['lunch', '🌤️ Midi'], ['dinner', '🌙 Soir'],
  ['vege', '🥦 Végétarien'], ['viande', '🍗 Viande'], ['poisson', '🐟 Poisson'], ['quick', '⚡ ≤ 30 min'], ['easy', '👌 Facile'],
  ['dessert', '🍰 Desserts'], ['family', '👨‍👩‍👧 Famille'], ['builtin', '📚 Intégrées'], ['archived', '🗄️ Archivées'],
];
const SORTS = [['alpha', 'A → Z'], ['recent', 'Plus récentes'], ['time', 'Plus rapides'], ['fav', 'Favoris d’abord'], ['used', 'Plus utilisées']];

export function mount(root, params = {}) {
  if (params.f) state.filter = params.f;
  root.innerHTML = `
    <div class="view-in">
      <header class="page-head"><div><div class="eyebrow">Recettes</div><h1>Le livre<br>de la famille</h1></div>
        <select class="select" id="sort" style="width:auto;min-height:44px;border-radius:99px;font-weight:700;font-size:14px" aria-label="Trier">
          ${SORTS.map(([v, l]) => `<option value="${v}" ${v === state.sort ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </header>
      <label class="searchbar">${icon('search', 20)}<input id="q" type="search" placeholder="Nom, ingrédient, auteur, catégorie…" value="${esc(state.q)}" autocomplete="off" enterkeyhint="search"></label>
      <div class="filters" id="filters">${FILTERS.map(([v, l]) => `<button class="chip ${v === state.filter ? 'on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
      <div id="grid"></div>
    </div>
    <button class="fab" data-act="new">${icon('plus', 22)} Recette</button>`;

  const grid = root.querySelector('#grid');
  const paint = () => {
    const favs = favoriteSet();
    const mm = membersMap();
    const list = searchRecipes(allRecipes(), { ...state, favorites: favs, members: mm, usage: usageCount() });
    if (!list.length) {
      grid.innerHTML = state.filter === 'fav' && !state.q
        ? emptyState('💛', 'Pas encore de favoris', 'Touchez le cœur d’une recette pour la retrouver ici.')
        : emptyState('🔍', 'Aucune recette', state.q ? `Rien ne correspond à « ${esc(state.q)} ».` : 'Aucune recette dans cette catégorie.', `<button class="btn primary" data-act="new" style="margin-top:16px">${icon('plus', 20)} Créer une recette</button>`);
      return;
    }
    grid.innerHTML = `<div class="recipe-grid">${list.map((r) => card(r, favs.has(r.id), mm)).join('')}</div>
      <p class="foot-note">${list.length} recette${list.length > 1 ? 's' : ''}</p>`;
  };
  const card = (r, fav, mm) => `
    <a class="rcard" href="#/recette/${r.id}">
      ${cover(r)}
      ${r.archived ? '<span class="tag pill">Archivée</span>' : !r.builtin ? '<span class="tag pill glass" style="background:rgba(0,0,0,.28)">Famille</span>' : ''}
      <span class="fav"><button class="fav-btn ${fav ? 'on' : ''}" data-fav="${r.id}" aria-label="Favori">${icon('heart', 19)}</button></span>
      <div class="rc-body"><h3>${esc(r.title)}</h3>
        <div class="rc-meta">${icon('clock', 14)} ${fmtDuration(totalTime(r))} · ${esc(r.difficulty || 'Facile')}${r.authorId && mm[r.authorId] ? avatar(mm[r.authorId], 22) : ''}</div></div>
    </a>`;

  root.querySelector('#q').addEventListener('input', debounce((e) => { state.q = e.target.value; paint(); }, 90));
  root.querySelector('#sort').onchange = (e) => { state.sort = e.target.value; paint(); };
  root.querySelector('#filters').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    state.filter = b.dataset.f; haptic(4);
    root.querySelectorAll('#filters .chip').forEach((c) => c.classList.toggle('on', c === b));
    b.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    paint();
  };
  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-fav]');
    if (f) {
      e.preventDefault(); e.stopPropagation();
      const on = toggleFavorite(f.dataset.fav);
      f.classList.toggle('on', on); f.classList.remove('pop'); void f.offsetWidth; f.classList.add('pop'); haptic(on ? 15 : 6);
      return;
    }
    if (e.target.closest('[data-act=new]')) openEditor();
  });

  paint();
  return { refresh: paint };
}
