// ─────────────────────────────────────────────────────────────
// Modèle applicatif : accès aux données + actions métier
// (fait le lien entre store et règles du domaine)
// ─────────────────────────────────────────────────────────────
import { store } from './store.js';
import { BUILTIN_RECIPES } from './data/recipes.js';
import { computeNeeds, buildShoppingList, shopRange, purchaseFor, SLOTS } from './domain.js';
import { todayISO, addDays, uid, startOfWeek } from './utils.js';

const BUILTIN = Object.fromEntries(BUILTIN_RECIPES.map((r) => [r.id, r]));

export const DEFAULT_SETTINGS = {
  name: 'Ma famille',
  defaultServings: 4,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  language: 'fr',
  units: 'metric',
  times: { breakfast: '08:00', lunch: '12:30', dinner: '19:30' },
  shopRange: 'next7',
  shopSession: 's1',
  allergies: [], intolerances: [], preferences: [], avoid: [],
};
export const settings = () => ({ ...DEFAULT_SETTINGS, ...store.settings, times: { ...DEFAULT_SETTINGS.times, ...(store.settings.times || {}) } });
export const saveSettings = (patch) => store.put('settings', 'family', patch);

// ── Membres ─────────────────────────────────────────────────
export const members = (all = false) => store.all('members').filter((m) => all || m.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
export const membersMap = () => Object.fromEntries(store.all('members').map((m) => [m.id, m]));
export const memberName = (id) => store.getAny('members', id)?.name || '';

// ── Recettes ────────────────────────────────────────────────
export function recipesMap() {
  const out = { ...BUILTIN };
  for (const r of Object.values(store.data.recipes)) if (!r.deleted) out[r.id] = r;
  return out;
}
export const recipe = (id) => (id ? store.get('recipes', id) || BUILTIN[id] || null : null);
export const allRecipes = () => Object.values(recipesMap());

export function favoriteSet(memberId = store.memberId) {
  return new Set(store.all('favorites').filter((f) => f.memberId === memberId).map((f) => f.recipeId));
}
export function toggleFavorite(recipeId) {
  const id = `${store.memberId}__${recipeId}`;
  if (store.get('favorites', id)) { store.del('favorites', id); return false; }
  store.put('favorites', id, { memberId: store.memberId, recipeId });
  return true;
}
export function usageCount() {
  const u = {};
  for (const m of store.all('meals')) if (m.recipeId) u[m.recipeId] = (u[m.recipeId] || 0) + 1;
  return u;
}
export function saveRecipe(data, existingId) {
  const now = new Date().toISOString();
  if (existingId && store.get('recipes', existingId)) {
    return store.put('recipes', existingId, { ...data, updatedAt: now, updatedBy: store.memberId });
  }
  return store.put('recipes', uid('r-'), { ...data, builtin: false, authorId: store.memberId, createdAt: now, updatedAt: now, updatedBy: store.memberId, archived: false });
}
export const recipeInUse = (id) => store.all('meals').some((m) => m.recipeId === id && m.date >= todayISO());

// ── Planning ────────────────────────────────────────────────
const slotOrder = Object.fromEntries(SLOTS.map((s, i) => [s.id, i]));
export const mealsBetween = (from, to) =>
  store.all('meals').filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || slotOrder[a.slot] - slotOrder[b.slot] || (a.order ?? 0) - (b.order ?? 0));
export const mealsOn = (date, slot) => mealsBetween(date, date).filter((m) => !slot || m.slot === slot);

export function addMeal({ date, slot, recipeId = null, title = '', kind = 'recipe', servings, note = '', time = '' }) {
  const now = new Date().toISOString();
  return store.put('meals', uid('m-'), {
    date, slot, recipeId: kind === 'recipe' ? recipeId : null, title: kind === 'recipe' ? '' : title, kind,
    servings: servings || settings().defaultServings, note, time, createdBy: store.memberId, createdAt: now, updatedAt: now, order: Date.now(),
  });
}
export const updateMeal = (id, patch) => store.put('meals', id, { ...patch, updatedAt: new Date().toISOString(), updatedBy: store.memberId });
export const deleteMeal = (id) => store.del('meals', id);
export function copyMeal(id, date, slot) {
  const m = store.get('meals', id);
  if (!m) return;
  const { id: _, _u, _by, _srv, deleted, ...rest } = m;
  return addMeal({ ...rest, date, slot: slot || m.slot });
}
export function duplicateDay(fromDate, toDate) {
  const list = mealsOn(fromDate);
  store.batch(() => list.forEach((m) => copyMeal(m.id, toDate, m.slot)));
  return list.length;
}
export const mealTitle = (m) => (m.recipeId ? recipe(m.recipeId)?.title || 'Recette supprimée' : m.title || 'Repas libre');
export const mealTime = (m) => m.time || settings().times[m.slot] || '12:00';

export function nextMeal() {
  const now = new Date();
  const today = todayISO();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const list = mealsBetween(today, addDays(today, 14));
  return list.find((m) => m.date > today || mealTime(m) >= subtractMinutes(hhmm, 45)) || null;
}
function subtractMinutes(hhmm, n) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.max(0, h * 60 + m - n);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// ── Courses ─────────────────────────────────────────────────
export function shopping() {
  const s = settings();
  const { from, to } = shopRange(s.shopRange, todayISO());
  const needs = computeNeeds({ meals: store.all('meals'), recipes: recipesMap(), from, to });
  const list = buildShoppingList({
    needs, purchases: store.all('purchases'), manualItems: store.all('items'), session: s.shopSession,
  });
  return { ...list, from, to, session: s.shopSession, range: s.shopRange };
}
export function checkItem(item) {
  const s = settings();
  if (item.kind === 'manual') {
    store.put('items', item.id, { checked: true, checkedBy: store.memberId, checkedAt: new Date().toISOString() });
  } else {
    store.put('purchases', uid('p-'), purchaseFor(item, { session: s.shopSession, memberId: store.memberId }));
  }
}
export function uncheckItem(item) {
  if (item.kind === 'manual') store.put('items', item.id, { checked: false, checkedBy: null, checkedAt: null });
  else store.batch(() => (item.purchases || []).forEach((p) => store.del('purchases', p.id)));
}
export function addManualItem({ name, qty = null, unit = null, category = 'autres', note = '', ing = null }) {
  return store.put('items', uid('i-'), { name, qty, unit, category, note, ing, checked: false, addedBy: store.memberId, createdAt: new Date().toISOString() });
}
/** « Vider les achetés » : masque les achats (conservés dans l'historique) et retire les articles manuels cochés. */
export function clearBought() {
  const { done } = shopping();
  store.batch(() => {
    for (const it of done) {
      if (it.kind === 'manual') store.del('items', it.id);
      else (it.purchases || []).forEach((p) => !p.cleared && store.put('purchases', p.id, { cleared: true }));
    }
  });
}
/** Nouvelle session de courses : l'historique des achats est conservé, la liste repart de zéro. */
export function newShoppingSession() {
  const n = 's' + Date.now().toString(36);
  store.batch(() => {
    store.all('items').filter((i) => i.checked).forEach((i) => store.del('items', i.id));
    saveSettings({ shopSession: n, lastSessionAt: new Date().toISOString() });
  });
}

// ── Création d'un espace + semaine de démonstration ──────────
export function createFamily({ name, people, servings, demo }) {
  store.batch(() => {
    saveSettings({ ...DEFAULT_SETTINGS, name, defaultServings: servings, createdAt: new Date().toISOString() });
    people.forEach((p, i) => store.put('members', p.id || uid('u-'), { name: p.name, color: p.color, emoji: p.emoji, active: true, order: i, createdAt: new Date().toISOString() }));
  });
  const first = members()[0];
  if (first) store.memberId = first.id;
  if (demo) seedDemoWeek(servings);
}
export function seedDemoWeek(servings = 4) {
  const start = todayISO();
  const plan = [
    ['b-oeufs', 'b-quiche', 'b-pates-poulet'],
    ['b-overnight', { t: 'Restes de la veille', k: 'free' }, 'b-curry'],
    [null, 'b-saumon', 'b-veloute'],
    ['b-overnight', { t: 'Cantine / bureau', k: 'out' }, 'b-dahl'],
    ['b-oeufs', 'b-chili', 'b-risotto'],
    ['b-pancakes', { t: 'Chez les grands-parents', k: 'out' }, { t: 'Pizza maison improvisée', k: 'free' }],
    ['b-pancakes', 'b-gratin', 'b-veloute'],
  ];
  store.batch(() => {
    plan.forEach((day, i) => day.forEach((x, j) => {
      if (!x) return;
      const slot = SLOTS[j].id;
      const date = addDays(start, i);
      if (typeof x === 'string') addMeal({ date, slot, recipeId: x, servings: x === 'b-overnight' ? 2 : servings });
      else addMeal({ date, slot, kind: x.k, title: x.t, servings });
    }));
    addManualItem({ name: 'Papier toilette', category: 'hygiene' });
    addManualItem({ name: 'Café', qty: 1, unit: 'unité', category: 'boissons', ing: 'cafe' });
    addManualItem({ name: 'Baguette', qty: 2, unit: 'unité', category: 'boulangerie' });
  });
}
export const weekStart = (iso) => startOfWeek(iso);
