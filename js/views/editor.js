// ─────────────────────────────────────────────────────────────
// ÉDITEUR DE RECETTE (spec §5.3–5.7)
// ─────────────────────────────────────────────────────────────
import { store } from '../store.js';
import { saveRecipe, settings, memberName } from '../model.js';
import { UNIT_LIST, matchIngredient, normalizeUnit, RECIPE_CATEGORIES, DIFFICULTIES, SLOTS, DIETS } from '../domain.js';
import { INGREDIENTS, INGREDIENT } from '../data/ingredients.js';
import { esc, compressImage, haptic } from '../utils.js';
import { icon } from '../icons.js';
import { sheet, toast, cover, chips, chipValues, stepper, confirmDialog, paletteFor } from '../ui.js';

const EMOJIS = ['🍝', '🍛', '🥘', '🍲', '🥗', '🍕', '🌮', '🍔', '🥞', '🍳', '🥐', '🍰', '🍫', '🍪', '🥧', '🍜', '🍣', '🐟', '🍗', '🥩', '🥔', '🍄', '🥦', '🎃', '🥕', '🍅', '🧀', '🥖', '🍎', '🫐', '🥤', '☕'];

export function openEditor(src = null, { duplicate = false } = {}) {
  const editing = src && !duplicate && !src.builtin;
  const base = src ? JSON.parse(JSON.stringify(src)) : {};
  const startVersion = editing ? store.get('recipes', src.id)?._u : null;
  const r = {
    title: duplicate ? `${base.title} (ma version)` : base.title || '',
    description: base.description || '', emoji: base.emoji || '🍲', photo: base.photo || '',
    palette: base.palette || null, categories: base.categories || ['Plat principal'], slots: base.slots || ['dinner'],
    diet: base.diet || 'viande', servings: base.servings || settings().defaultServings, prep: base.prep ?? 15, cook: base.cook ?? 20,
    difficulty: base.difficulty || 'Facile', cuisine: base.cuisine || '', season: base.season || '', budget: base.budget || '',
    allergens: base.allergens || [], storage: base.storage || '', reheat: base.reheat || '', tips: base.tips || '', notes: base.notes || '',
    ingredients: (base.ingredients || []).map((i) => ({ ...i, name: i.name || (i.ing ? INGREDIENT[i.ing]?.name : '') })),
    steps: (base.steps || []).map((s) => ({ ...s })),
  };
  if (!r.ingredients.length) r.ingredients.push({ q: '', u: 'g', name: '' });
  if (!r.steps.length) r.steps.push({ title: '', text: '', dur: null, temp: '' });

  const ingRow = (i, k) => {
    const matched = matchIngredient(i.name);
    return `<div class="ing-row" data-k="${k}">
      <input class="input" inputmode="decimal" data-f="q" placeholder="Qté" value="${i.q ?? ''}">
      <input class="input" data-f="u" list="units" placeholder="Unité" value="${esc(i.u || '')}">
      <input class="input" data-f="name" list="ingredients" placeholder="Ingrédient" value="${esc(i.name || '')}">
      <button type="button" class="icon-btn ghost sm" data-rm-ing="${k}" aria-label="Retirer">${icon('x', 18)}</button>
      <div class="ir-extra"><input class="input" data-f="note" placeholder="Indication (ex. émincé)" value="${esc(i.note || '')}">
        <label class="mini-toggle"><input type="checkbox" data-f="opt" ${i.opt ? 'checked' : ''}>Facultatif</label>
        <span class="match" data-match>${matched ? '✓ référencé' : ''}</span></div>
    </div>`;
  };
  const stepRow = (s, k) => `<div class="step-row" data-k="${k}">
    <div class="sr-head"><span class="num">${k + 1}</span><input class="input" data-f="title" placeholder="Titre de l'étape (facultatif)" value="${esc(s.title || '')}" style="margin:0;min-height:42px">
      <button type="button" class="icon-btn ghost sm" data-up="${k}" aria-label="Monter" style="transform:rotate(180deg)">${icon('down', 16)}</button>
      <button type="button" class="icon-btn ghost sm" data-rm-step="${k}" aria-label="Retirer">${icon('trash', 16)}</button></div>
    <textarea class="input" data-f="text" placeholder="Décrivez précisément l'étape…" rows="3">${esc(s.text || '')}</textarea>
    <div class="sr-foot"><input class="input" data-f="dur" inputmode="numeric" placeholder="⏱ Minuteur (min)" value="${s.dur ? Math.round(s.dur / 60) : ''}" style="margin:0">
      <input class="input" data-f="temp" placeholder="🌡 Température" value="${esc(s.temp || '')}" style="margin:0"></div>
  </div>`;

  sheet({
    title: editing ? 'Modifier la recette' : duplicate ? 'Personnaliser la recette' : 'Nouvelle recette',
    subtitle: editing ? `Créée par ${esc(memberName(src.authorId) || 'un membre')}` : `Auteur : ${esc(store.member?.name || '—')}`,
    full: true,
    body: `
      <datalist id="units">${UNIT_LIST.map((u) => `<option value="${u}">`).join('')}</datalist>
      <datalist id="ingredients">${INGREDIENTS.filter((i) => !i.skip).map((i) => `<option value="${esc(i.name)}">`).join('')}</datalist>
      <div class="photo-drop" id="photo">${cover({ ...r, palette: r.palette || paletteFor(r.title) }, { eager: true })}
        <div class="pd-actions">
          ${r.photo ? `<button type="button" class="btn sm" data-act="rm-photo" style="background:rgba(255,255,255,.85);color:#23190f">${icon('trash', 16)}</button>` : ''}
          <label class="btn sm" style="background:rgba(255,255,255,.9);color:#23190f">${icon('camera', 17)} ${r.photo ? 'Changer' : 'Ajouter une photo'}<input type="file" accept="image/*" hidden id="file"></label></div></div>
      ${r.photo ? '' : `<div class="label" style="margin-bottom:8px">…ou choisissez une illustration</div><div class="emoji-row" id="emojis">${EMOJIS.map((e) => `<button type="button" class="${e === r.emoji ? 'on' : ''}">${e}</button>`).join('')}</div>`}
      <label class="field"><span>Nom de la recette *</span><input class="input" id="title" value="${esc(r.title)}" placeholder="Ex. Lasagnes de Mamie"></label>
      <label class="field"><span>Description</span><textarea class="input" id="desc" rows="2" placeholder="Ce qui la rend spéciale…">${esc(r.description)}</textarea></label>
      <div class="field"><span>Catégories</span>${chips('cats', RECIPE_CATEGORIES.map((c) => [c, c]), r.categories)}</div>
      <div class="field"><span>Moments de la journée</span>${chips('slots', SLOTS.map((s) => [s.id, `${s.emoji} ${s.short}`]), r.slots)}</div>
      <div class="field"><span>Type</span>${chips('diet', Object.entries(DIETS), [r.diet], { multi: false })}</div>
      <div class="grid2">
        <div class="field"><span>Portions de référence</span>${stepper('servings', r.servings, { min: 1, max: 40, label: 'pers.' })}</div>
        <div class="field"><span>Difficulté</span>${chips('diff', DIFFICULTIES.map((d) => [d, d]), [r.difficulty], { multi: false })}</div>
      </div>
      <div class="grid2">
        <label class="field"><span>Préparation (min)</span><input class="input" id="prep" inputmode="numeric" value="${r.prep}"></label>
        <label class="field"><span>Cuisson (min)</span><input class="input" id="cook" inputmode="numeric" value="${r.cook}"></label>
      </div>

      <div class="ed-section"><h3>Ingrédients</h3><span class="faint" style="font-size:12.5px;font-weight:700">pour <b id="servlbl">${r.servings}</b> pers.</span></div>
      <div id="ings">${r.ingredients.map(ingRow).join('')}</div>
      <button type="button" class="btn ghost block" data-act="add-ing">${icon('plus', 18)} Ajouter un ingrédient</button>

      <div class="ed-section"><h3>Étapes</h3></div>
      <div id="steps">${r.steps.map(stepRow).join('')}</div>
      <button type="button" class="btn ghost block" data-act="add-step">${icon('plus', 18)} Ajouter une étape</button>

      <details style="margin-top:22px"><summary class="ed-section" style="cursor:pointer;margin:0 0 14px"><h3>Infos complémentaires</h3>${icon('down', 18)}</summary>
        <div class="grid2">
          <label class="field"><span>Cuisine du monde</span><input class="input" id="cuisine" value="${esc(r.cuisine)}" placeholder="Italienne…"></label>
          <label class="field"><span>Saison</span><input class="input" id="season" value="${esc(r.season)}" placeholder="Été…"></label>
          <label class="field"><span>Budget</span><input class="input" id="budget" value="${esc(r.budget)}" placeholder="€, €€, €€€"></label>
          <label class="field"><span>Allergènes</span><input class="input" id="allergens" value="${esc(r.allergens.join(', '))}" placeholder="Gluten, Lait…"></label>
        </div>
        <label class="field"><span>Conseils de préparation</span><textarea class="input" id="tips" rows="2">${esc(r.tips)}</textarea></label>
        <label class="field"><span>Conservation</span><input class="input" id="storage" value="${esc(r.storage)}"></label>
        <label class="field"><span>Réchauffage</span><input class="input" id="reheat" value="${esc(r.reheat)}"></label>
        <label class="field"><span>Notes personnelles</span><textarea class="input" id="notes" rows="2">${esc(r.notes)}</textarea></label>
      </details>`,
    footer: `<button class="btn primary" data-act="save">${icon('check', 20)} Enregistrer la recette</button>`,
    onMount(el, close) {
      const $ = (s) => el.querySelector(s);
      const readRows = () => {
        r.ingredients = [...el.querySelectorAll('.ing-row')].map((row) => ({
          q: row.querySelector('[data-f=q]').value.replace(',', '.'),
          u: row.querySelector('[data-f=u]').value.trim(),
          name: row.querySelector('[data-f=name]').value.trim(),
          note: row.querySelector('[data-f=note]').value.trim(),
          opt: row.querySelector('[data-f=opt]').checked,
        }));
        r.steps = [...el.querySelectorAll('.step-row')].map((row) => ({
          title: row.querySelector('[data-f=title]').value.trim(),
          text: row.querySelector('[data-f=text]').value.trim(),
          dur: +row.querySelector('[data-f=dur]').value ? +row.querySelector('[data-f=dur]').value * 60 : null,
          temp: row.querySelector('[data-f=temp]').value.trim(),
        }));
      };
      const redrawIngs = () => ($('#ings').innerHTML = r.ingredients.map(ingRow).join(''));
      const redrawSteps = () => ($('#steps').innerHTML = r.steps.map(stepRow).join(''));
      const redrawCover = () => { $('#photo').firstElementChild.outerHTML = cover({ ...r, palette: r.palette || paletteFor($('#title').value) }, { eager: true }); };

      el.addEventListener('input', (e) => {
        const row = e.target.closest('.ing-row');
        if (row && e.target.dataset.f === 'name') {
          const id = matchIngredient(e.target.value);
          row.querySelector('[data-match]').textContent = id ? '✓ référencé' : '';
          const u = row.querySelector('[data-f=u]');
          if (id && !u.value) u.value = INGREDIENT[id].unit;
        }
      });
      el.addEventListener('change', (e) => { if (e.target.name === 'servings') $('#servlbl').textContent = e.target.value; });
      $('#emojis')?.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        r.emoji = b.textContent; r.palette = null;
        el.querySelectorAll('#emojis button').forEach((x) => x.classList.toggle('on', x === b));
        redrawCover(); haptic(4);
      });
      $('#file').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { r.photo = await compressImage(f, 1000, 0.72); redrawCover(); toast('Photo ajoutée', { icon: 'camera' }); }
        catch { toast('Image illisible', { icon: 'info' }); }
      };
      el.addEventListener('click', async (e) => {
        const t = e.target.closest('[data-act],[data-rm-ing],[data-rm-step],[data-up]');
        if (!t) return;
        readRows();
        if (t.dataset.rmIng != null) { r.ingredients.splice(+t.dataset.rmIng, 1); redrawIngs(); return; }
        if (t.dataset.rmStep != null) { r.steps.splice(+t.dataset.rmStep, 1); redrawSteps(); return; }
        if (t.dataset.up != null) { const k = +t.dataset.up; if (k > 0) { [r.steps[k - 1], r.steps[k]] = [r.steps[k], r.steps[k - 1]]; redrawSteps(); } return; }
        switch (t.dataset.act) {
          case 'add-ing': r.ingredients.push({ q: '', u: '', name: '' }); redrawIngs(); el.querySelector('.ing-row:last-child [data-f=q]').focus(); break;
          case 'add-step': r.steps.push({ title: '', text: '' }); redrawSteps(); el.querySelector('.step-row:last-child textarea').focus(); break;
          case 'rm-photo': r.photo = ''; redrawCover(); break;
          case 'save': await save(close); break;
        }
      });

      const save = async (close) => {
        const title = $('#title').value.trim();
        if (!title) { $('#title').focus(); return toast('Donnez un nom à la recette', { icon: 'info' }); }
        const ingredients = r.ingredients.filter((i) => i.name).map((i) => {
          const ing = matchIngredient(i.name);
          const q = i.q === '' ? null : +i.q;
          return { ing, name: ing ? undefined : i.name, q: isNaN(q) ? null : q, u: normalizeUnit(i.u || (ing ? INGREDIENT[ing].unit : 'unité')), ...(i.opt ? { opt: true } : {}), ...(i.note ? { note: i.note } : {}) };
        }).map((i) => JSON.parse(JSON.stringify(i)));
        const steps = r.steps.filter((s) => s.text || s.title);
        const data = {
          title, description: $('#desc').value.trim(), emoji: r.emoji, photo: r.photo, palette: r.palette || paletteFor(title),
          categories: chipValues(el, 'cats'), slots: chipValues(el, 'slots'), diet: chipValues(el, 'diet')[0] || 'viande',
          servings: +el.querySelector('input[name=servings]').value, difficulty: chipValues(el, 'diff')[0] || 'Facile',
          prep: +$('#prep').value || 0, cook: +$('#cook').value || 0,
          cuisine: $('#cuisine').value.trim(), season: $('#season').value.trim(), budget: $('#budget').value.trim(),
          allergens: $('#allergens').value.split(',').map((s) => s.trim()).filter(Boolean),
          tips: $('#tips').value.trim(), storage: $('#storage').value.trim(), reheat: $('#reheat').value.trim(), notes: $('#notes').value.trim(),
          ingredients, steps,
        };
        // Contrôle de concurrence (spec §12.4) : la recette a-t-elle été modifiée ailleurs pendant l'édition ?
        if (editing) {
          const cur = store.get('recipes', src.id);
          if (cur && startVersion && cur._u !== startVersion && cur._by && cur._by !== store.memberId) {
            const ok = await confirmDialog({ title: 'Modifiée entre-temps', text: `${esc(memberName(cur._by) || 'Un autre membre')} a modifié cette recette pendant votre édition. Enregistrer quand même vos changements ?`, ok: 'Enregistrer', icon: 'info' });
            if (!ok) return;
          }
        }
        const saved = saveRecipe(data, editing ? src.id : null);
        haptic(16);
        close();
        toast(editing ? 'Recette mise à jour' : 'Recette ajoutée au livre de la famille 📖', { icon: 'book' });
        location.hash = `#/recette/${saved.id}`;
      };
    },
  });
}
