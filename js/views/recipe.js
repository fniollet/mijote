// ─────────────────────────────────────────────────────────────
// FICHE RECETTE (spec §5.3–5.8) — portions recalculées en direct
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { recipe, favoriteSet, toggleFavorite, memberName, membersMap, saveRecipe, recipeInUse, settings } from '../model.js';
import { scaleQty, fmtQty, ingredientName, totalTime, SLOT, DIETS } from '../domain.js';
import { esc, fmtDuration, haptic, norm, timeAgo } from '../utils.js';
import { icon } from '../icons.js';
import { cover, avatar, stepper, actionSheet, confirmDialog, toast } from '../ui.js';
import { openEditor } from './editor.js';
import { openAddMeal } from './planning.js';
import { backBtn, emptyState } from './shared.js';

export function mount(root, params) {
  let servings = null;
  const got = new Set();
  let first = true;

  const paint = () => {
    const r = recipe(params.id);
    if (!r) { root.innerHTML = emptyState('🫥', 'Recette introuvable', 'Elle a peut-être été supprimée.', `<a class="btn primary" href="#/recettes" style="margin-top:14px">Retour aux recettes</a>`); return; }
    servings ??= +params.s || r.servings;
    const fav = favoriteSet().has(r.id);
    const mm = membersMap();
    const warn = allergyWarning(r);
    const extra = [
      ['Cuisine', r.cuisine], ['Saison', r.season], ['Budget', r.budget], ['Régime', DIETS[r.diet]],
      ['Allergènes', (r.allergens || []).join(', ')], ['Moments', (r.slots || []).map((s) => SLOT[s]?.short).join(', ')],
    ].filter(([, v]) => v);
    const tips = [['Conseils de préparation', r.tips], ['Conservation', r.storage], ['Réchauffage', r.reheat], ['Notes personnelles', r.notes]].filter(([, v]) => v);

    root.innerHTML = `
      <div class="rd ${first ? 'view-in' : ''}">
        <div class="rd-hero">${cover(r, { eager: true })}
          <div class="rd-top">${backBtn()}
            <div class="grp"><button class="icon-btn glass ${fav ? 'on' : ''}" data-act="fav" aria-label="Favori">${icon('heart', 21)}</button>
            <button class="icon-btn glass" data-act="more" aria-label="Plus">${icon('more', 22)}</button></div></div>
        </div>
        <div class="rd-body">
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">${(r.categories || []).map((c) => `<span class="pill accent">${esc(c)}</span>`).join('')}${r.archived ? '<span class="pill">Archivée</span>' : ''}</div>
          <h1>${esc(r.title)}</h1>
          ${r.description ? `<p class="rd-desc">${esc(r.description)}</p>` : ''}
          <div class="rd-author">${r.builtin ? `<span class="avatar" style="--s:30px;--c:#ff5b2e">📚</span><span>Bibliothèque <b>Mijoté</b></span>`
            : `${avatar(mm[r.authorId], 30)}<span>Par <b>${esc(memberName(r.authorId) || 'un membre')}</b> · créée ${timeAgo(r.createdAt)}${r.updatedBy && r.updatedAt !== r.createdAt ? ` · modifiée par ${esc(memberName(r.updatedBy))} ${timeAgo(r.updatedAt)}` : ''}</span>`}</div>
          <div class="stats">
            <div class="stat">${icon('clock', 20)}<b>${fmtDuration(r.prep)}</b><small>Prépa</small></div>
            <div class="stat">${icon('flame', 20)}<b>${fmtDuration(r.cook)}</b><small>Cuisson</small></div>
            <div class="stat">${icon('timer', 20)}<b>${fmtDuration(totalTime(r))}</b><small>Total</small></div>
            <div class="stat">${icon('star', 20)}<b>${esc(r.difficulty || 'Facile')}</b><small>Niveau</small></div>
          </div>
          ${warn}
          <div class="rd-cols">
            <section>
              <div class="section-title" style="margin-top:8px"><h2>Ingrédients</h2><span class="faint" style="font-size:13px;font-weight:700">Touchez pour cocher</span></div>
              <div class="serv-bar"><span><b>Pour ${servings} personne${servings > 1 ? 's' : ''}</b><small>Recette de base : ${r.servings} pers.</small></span>${stepper('rs', servings, { min: 1, max: 40 })}</div>
              <div class="card pad" style="padding:6px 14px"><div class="ings">${(r.ingredients || []).map((i, k) => `
                <div class="ing ${got.has(k) ? 'got' : ''}" data-k="${k}"><span class="tick">${icon('check', 15)}</span>
                  <span class="q">${fmtQty(scaleQty(i.q, r.servings, servings), i.u) || '—'}</span>
                  <span class="n">${esc(ingredientName(i))}${i.opt ? '<span class="opt">facultatif</span>' : ''}${i.note ? `<small>${esc(i.note)}</small>` : ''}</span></div>`).join('') || '<p class="muted">Aucun ingrédient.</p>'}</div></div>
            </section>
            <section>
              <div class="section-title" style="margin-top:8px"><h2>Préparation</h2><span class="faint" style="font-size:13px;font-weight:700">${(r.steps || []).length} étapes</span></div>
              <div class="steps">${(r.steps || []).map((s, k) => `
                <div class="step"><span class="num">${k + 1}</span><div>${s.title ? `<h4>${esc(s.title)}</h4>` : ''}<p>${esc(s.text)}</p>
                  ${s.dur || s.temp ? `<div class="chips-row">${s.dur ? `<span class="pill accent">${icon('timer', 14)} ${fmtDuration(s.dur / 60)}</span>` : ''}${s.temp ? `<span class="pill">${icon('thermo', 14)} ${esc(s.temp)}</span>` : ''}</div>` : ''}
                </div></div>`).join('') || '<p class="muted">Aucune étape.</p>'}</div>
              ${extra.length ? `<div class="section-title"><h2>Infos</h2></div><div class="info-grid">${extra.map(([k, v]) => `<div class="info"><small>${k}</small>${esc(v)}</div>`).join('')}</div>` : ''}
              ${tips.length ? `<div class="info-grid" style="margin-top:10px">${tips.map(([k, v]) => `<div class="info wide"><small>${k}</small>${esc(v)}</div>`).join('')}</div>` : ''}
            </section>
          </div>
        </div>
        <div class="rd-cta">
          <button class="btn dark" data-act="plan">${icon('calendar', 20)} Planifier</button>
          <button class="btn primary" data-act="cook">${icon('chef', 20)} Cuisiner</button>
        </div>
      </div>`;
    first = false;
  };

  const allergyWarning = (r) => {
    const s = settings();
    const watch = [...(s.allergies || []), ...(s.intolerances || []), ...(s.avoid || [])];
    if (!watch.length) return '';
    const hay = norm([(r.allergens || []).join(' '), (r.ingredients || []).map(ingredientName).join(' ')].join(' '));
    const hits = watch.filter((w) => hay.includes(norm(w)));
    return hits.length ? `<div class="warn">⚠️ <span>Peut concerner vos préférences : <b>${hits.map(esc).join(', ')}</b>. Indication non garantie — vérifiez toujours les étiquettes.</span></div>` : '';
  };

  root.onclick = async (e) => {
    const ing = e.target.closest('.ing');
    if (ing) { const k = +ing.dataset.k; got.has(k) ? got.delete(k) : got.add(k); ing.classList.toggle('got'); haptic(4); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const r = recipe(params.id);
    switch (t.dataset.act) {
      case 'back': return history.length > 1 ? history.back() : (location.hash = '#/recettes');
      case 'fav': { const on = toggleFavorite(r.id); haptic(on ? 15 : 6); toast(on ? 'Ajoutée à vos favoris ♥' : 'Retirée des favoris', { icon: 'heart' }); return; }
      case 'plan': return openAddMeal({ recipeId: r.id, slot: (r.slots || ['dinner'])[0] });
      case 'cook': return (location.hash = `#/cuisine/${r.id}?s=${servings}`);
      case 'more': return moreMenu(r);
    }
  };
  root.addEventListener('change', (e) => {
    if (e.target.name === 'rs') { servings = +e.target.value; paint(); }
  });

  const moreMenu = (r) => actionSheet({
    title: r.title,
    actions: [
      !r.builtin && { icon: 'edit', label: 'Modifier la recette', run: () => openEditor(r) },
      { icon: 'copy', label: r.builtin ? 'Dupliquer pour la personnaliser' : 'Dupliquer', run: () => openEditor(r, { duplicate: true }) },
      { icon: 'download', label: 'Partager la recette', run: () => share(r) },
      !r.builtin && { sep: true },
      !r.builtin && (r.archived
        ? { icon: 'undo', label: 'Restaurer la recette', run: () => { saveRecipe({ archived: false }, r.id); toast('Recette restaurée'); } }
        : { icon: 'archive', label: 'Archiver', hint: 'Masquée de la bibliothèque, jamais supprimée', danger: true, run: async () => {
          const used = recipeInUse(r.id);
          if (await confirmDialog({ title: 'Archiver cette recette ?', text: used ? 'Elle est utilisée dans le planning : les repas existants restent intacts.' : 'Vous pourrez la restaurer depuis le filtre « Archivées ».', ok: 'Archiver', danger: true, icon: 'archive' })) {
            saveRecipe({ archived: true }, r.id); toast('Recette archivée', { icon: 'archive', action: 'Annuler', onAction: () => saveRecipe({ archived: false }, r.id) });
          }
        } }),
    ],
  });

  const share = async (r) => {
    const text = `${r.title} (${servings} pers.)\n\nIngrédients :\n${(r.ingredients || []).map((i) => `• ${fmtQty(scaleQty(i.q, r.servings, servings), i.u)} ${ingredientName(i)}${i.opt ? ' (facultatif)' : ''}`).join('\n')}\n\nPréparation :\n${(r.steps || []).map((s, k) => `${k + 1}. ${s.title ? s.title + ' — ' : ''}${s.text}`).join('\n')}\n\n— partagé depuis Mijoté`;
    try {
      if (navigator.share) await navigator.share({ title: r.title, text });
      else { await navigator.clipboard.writeText(text); toast('Recette copiée dans le presse-papiers'); }
    } catch {}
  };

  paint();
  document.getElementById('tabbar')?.classList.add('away');
  return { refresh: paint, destroy: () => document.getElementById('tabbar')?.classList.remove('away') };
}
