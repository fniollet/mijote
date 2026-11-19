// ─────────────────────────────────────────────────────────────
// Modèle applicatif : accès aux données + actions métier   (v1.1)
// (fait le lien entre store et règles du domaine)
// Les actions qui modifient les courses / le stock retournent une
// fonction d'annulation (utilisée par les boutons « Annuler »).
// ─────────────────────────────────────────────────────────────
import { store } from './store.js';
import { BUILTIN_RECIPES } from './data/recipes.js';
import { CATEGORIES } from './data/ingredients.js';
import {
  computeNeeds, buildShoppingList, shopRange, purchaseFor, SLOTS, stockKeyFor, stockAvailability, planConsumption,
  guessLocation, NON_STOCK_CATEGORIES, round3, scaleQty, ingredientName, recipeStockMatch, parseQuickItem,
} from './domain.js';
import { todayISO, addDays, uid, startOfWeek, norm } from './utils.js';

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
  aisleOrder: null,
  allergies: [], intolerances: [], preferences: [], avoid: [],
};
export const settings = () => ({ ...DEFAULT_SETTINGS, ...store.settings, times: { ...DEFAULT_SETTINGS.times, ...(store.settings.times || {}) } });
export const saveSettings = (patch) => store.put('settings', 'family', patch);

/** Ordre des rayons (personnalisable dans Réglages). */
export function aisleOrder() {
  const saved = settings().aisleOrder;
  const ids = CATEGORIES.map((c) => c.id);
  if (!Array.isArray(saved)) return ids;
  return [...saved.filter((id) => ids.includes(id)), ...ids.filter((id) => !saved.includes(id))];
}

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
  const ids = [];
  store.batch(() => list.forEach((m) => { const c = copyMeal(m.id, toDate, m.slot); if (c) ids.push(c.id); }));
  return ids;
}
/** Copie une semaine entière (lundi → dimanche). Retourne les ids créés. */
export function copyWeek(fromStart, toStart) {
  const ids = [];
  store.batch(() => { for (let i = 0; i < 7; i++) ids.push(...duplicateDay(addDays(fromStart, i), addDays(toStart, i))); });
  return ids;
}
/** Semaines passées contenant des repas (plus récentes d'abord). */
export function pastWeeks(before = startOfWeek(todayISO()), max = 12) {
  const out = [];
  for (let i = 1; i <= 26 && out.length < max; i++) {
    const s = addDays(before, -7 * i);
    const meals = mealsBetween(s, addDays(s, 6));
    if (meals.length) out.push({ start: s, meals });
  }
  return out;
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

// ── Stock (frigo / congélateur / placard) ───────────────────
export const stockLots = () => store.all('stock');
export const stockAvail = (opts) => stockAvailability(stockLots(), opts);

/**
 * Ajoute un lot au stock. Retourne { id, undo } ou null si non suivi
 * (produits de placard comme sel/huile, hygiène… sauf si force).
 */
export function addToStock({ name, ing = null, qty = null, unit = null, category = null, location = null, expires = null, source = 'manuel', session = null, fromPurchase = null, fromItem = null, force = false }) {
  const k = stockKeyFor(name, ing, qty, unit);
  const cat = category || k.category;
  if (!force && (k.pantry || k.skip || (NON_STOCK_CATEGORIES.has(cat) && !k.ing))) return null;
  const id = uid('k-');
  store.put('stock', id, {
    key: k.key, ing: k.ing, name: k.name, qty: k.qty, unit: k.unit, category: cat,
    location: location || guessLocation(cat), expires: expires || null,
    source, session, fromPurchase, fromItem, addedBy: store.memberId, addedAt: new Date().toISOString(),
  });
  return { id, undo: () => store.del('stock', id) };
}
/** Applique un plan de consommation ; retourne l'annulation. */
function applyChanges(changes) {
  const prev = changes.map((c) => ({ id: c.id, qty: c.prevQty }));
  store.batch(() => changes.forEach((c) => (c.remove ? store.del('stock', c.id) : store.put('stock', c.id, { qty: c.qty }))));
  return () => store.batch(() => prev.forEach((p) => store.put('stock', p.id, { qty: p.qty })));
}
/** Consomme une quantité (unité de base) d'une clé, péremption la plus proche d'abord. */
export function consumeStock(key, qty = null, lots = null) {
  lots ||= stockLots().filter((l) => l.key === key);
  return applyChanges(planConsumption(lots, qty));
}
/** Retire les lots créés par des achats (quand on décoche / annule). */
export function removeLinkedStock({ purchaseIds = [], itemId = null }) {
  const ids = new Set(purchaseIds);
  const lots = stockLots().filter((l) => (l.fromPurchase && ids.has(l.fromPurchase)) || (itemId && l.fromItem === itemId));
  return applyChanges(lots.map((l) => ({ id: l.id, remove: true, prevQty: l.qty })));
}
export function updateLots(lots, patch) {
  const prev = lots.map((l) => ({ id: l.id, data: Object.fromEntries(Object.keys(patch).map((k) => [k, l[k] ?? null])) }));
  store.batch(() => lots.forEach((l) => store.put('stock', l.id, patch)));
  return () => store.batch(() => prev.forEach((p) => store.put('stock', p.id, p.data)));
}
/** Lots regroupés par produit + rangement (pour l'affichage « Chez moi »). */
export function stockGroups() {
  const by = new Map();
  for (const l of stockLots()) {
    const g0 = `${l.key}@${l.location || 'placard'}`;
    let g = by.get(g0);
    if (!g) by.set(g0, (g = { id: g0, key: l.key, name: l.name, unit: l.unit, category: l.category, location: l.location || 'placard', qty: 0, hasQty: false, unknown: false, lots: [], expires: null, addedAt: l.addedAt, addedBy: l.addedBy }));
    if (l.qty != null) { g.qty = round3(g.qty + l.qty); g.hasQty = true; } else g.unknown = true;
    if (l.expires && (!g.expires || l.expires < g.expires)) g.expires = l.expires;
    if (String(l.addedAt || '') > String(g.addedAt || '')) { g.addedAt = l.addedAt; g.addedBy = l.addedBy; }
    g.lots.push(l);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
/** Ingrédients d'une recette présents dans le stock (pour la fin du mode cuisine). */
export function stockUsedBy(r, servings) {
  const avail = stockAvail();
  const out = [];
  for (const ri of r.ingredients || []) {
    const name = ingredientName(ri);
    const k = stockKeyFor(name, ri.ing, scaleQty(ri.q, r.servings, servings), ri.u);
    if (k.pantry || k.skip) continue;
    const a = avail.get(k.key);
    if (!a) continue;
    const take = k.qty == null || !a.hasQty ? null : round3(Math.min(k.qty, a.qty));
    out.push({ key: k.key, name: k.name, unit: k.unit, qty: take, lots: a.entries });
  }
  return out;
}
export function stockMatches(servings = settings().defaultServings) {
  const avail = stockAvail();
  const m = {};
  for (const r of allRecipes()) if (!r.archived) m[r.id] = recipeStockMatch(r, avail, servings);
  return m;
}

// ── Courses ─────────────────────────────────────────────────
export function shopping() {
  const s = settings();
  const { from, to } = shopRange(s.shopRange, todayISO());
  const needs = computeNeeds({ meals: store.all('meals'), recipes: recipesMap(), from, to });
  const list = buildShoppingList({
    needs, purchases: store.all('purchases'), manualItems: store.all('items'), session: s.shopSession,
    stock: stockAvail({ excludeSession: s.shopSession }),
  });
  return { ...list, from, to, session: s.shopSession, range: s.shopRange };
}

/**
 * Achète un article (tout le reste, ou qty dans l'unité de l'article).
 * Crée l'achat + le lot de stock correspondant. Retourne l'annulation.
 */
export function buyItem(it, qty = null) {
  const s = settings();
  const now = new Date().toISOString();
  const undos = [];
  store.batch(() => {
    if (it.kind === 'manual') {
      const partial = qty != null && it.qty != null && qty < it.qty - 1e-9;
      const prev = { qty: it.qty ?? null, bought: it.bought || 0, checked: !!it.checked, checkedBy: it.checkedBy || null, checkedAt: it.checkedAt || null };
      const got = qty != null ? qty : it.qty;
      if (partial) store.put('items', it.id, { qty: round3(it.qty - qty), bought: round3((it.bought || 0) + qty), lastBoughtBy: store.memberId, lastBoughtAt: now });
      else store.put('items', it.id, { checked: true, checkedBy: store.memberId, checkedAt: now });
      undos.push(() => store.put('items', it.id, prev));
      const st = addToStock({ name: it.name, ing: it.ing, qty: got ?? null, unit: it.unit, category: it.category, source: 'courses', session: s.shopSession, fromItem: it.id });
      if (st) undos.push(st.undo);
    } else {
      const id = uid('p-');
      const p = purchaseFor(it, { session: s.shopSession, memberId: store.memberId, now });
      if (qty != null) p.qty = round3(qty);
      store.put('purchases', id, p);
      undos.push(() => store.del('purchases', id));
      const st = addToStock({ name: it.name, ing: it.ing, qty: p.qty, unit: it.unit, category: it.category, source: 'courses', session: s.shopSession, fromPurchase: id });
      if (st) undos.push(st.undo);
    }
  });
  return () => store.batch(() => undos.reverse().forEach((u) => u()));
}
/** Remet un article « à acheter » (et retire le stock créé par ces achats). */
export function unbuyItem(it) {
  const undos = [];
  store.batch(() => {
    if (it.kind === 'manual') {
      const prev = { checked: !!it.checked, checkedBy: it.checkedBy || null, checkedAt: it.checkedAt || null };
      store.put('items', it.id, { checked: false, checkedBy: null, checkedAt: null });
      undos.push(() => store.put('items', it.id, prev));
      undos.push(removeLinkedStock({ itemId: it.id }));
    } else {
      const ids = (it.purchases || []).map((p) => p.id);
      ids.forEach((id) => store.del('purchases', id));
      undos.push(() => ids.forEach((id) => store.put('purchases', id, { deleted: false })));
      undos.push(removeLinkedStock({ purchaseIds: ids }));
    }
  });
  return () => store.batch(() => undos.reverse().forEach((u) => u()));
}
/** Retire un achat précis (erreur de saisie). */
export function removePurchase(id) {
  let u2;
  store.batch(() => { store.del('purchases', id); u2 = removeLinkedStock({ purchaseIds: [id] }); });
  return () => store.batch(() => { store.put('purchases', id, { deleted: false }); u2(); });
}
// Compatibilité v1.0
export const checkItem = (it) => buyItem(it);
export const uncheckItem = (it) => unbuyItem(it);

export function addManualItem({ name, qty = null, unit = null, category = 'autres', note = '', ing = null }) {
  return store.put('items', uid('i-'), { name, qty, unit, category, note, ing, checked: false, addedBy: store.memberId, createdAt: new Date().toISOString() });
}

const DEFAULT_FREQUENT = ['Lait', 'Pain', 'Œufs', 'Café', 'Bananes', 'Beurre', 'Papier toilette', 'Eau'];
/** Articles fréquents (historique de la famille, complété par des classiques). */
export function frequentItems(limit = 8) {
  const counts = new Map();
  for (const it of Object.values(store.data.items || {})) {
    const k = norm(it.name);
    if (!k) continue;
    const c = counts.get(k) || { n: 0, last: it };
    c.n++;
    if (String(it.createdAt || '') >= String(c.last.createdAt || '')) c.last = it;
    counts.set(k, c);
  }
  const active = new Set(store.all('items').filter((i) => !i.checked).map((i) => norm(i.name)));
  const list = [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n)
    .map((c) => ({ name: c.last.name, qty: c.last.qty ?? null, unit: c.last.unit ?? null, category: c.last.category, ing: c.last.ing ?? null }));
  for (const d of DEFAULT_FREQUENT) {
    if (list.length >= limit + 4) break;
    if (!list.some((x) => norm(x.name) === norm(d))) { const p = parseQuickItem(d); list.push({ name: p.name, qty: null, unit: null, category: p.category, ing: p.ing }); }
  }
  return list.filter((x) => !active.has(norm(x.name))).slice(0, limit);
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
    addToStock({ name: 'Pâtes', qty: 500, unit: 'g' });
    addToStock({ name: 'Œufs', qty: 6, unit: 'unité', expires: addDays(start, 10) });
    addToStock({ name: 'Lait demi-écrémé', qty: 1, unit: 'l', expires: addDays(start, 2) });
  });
}
export const weekStart = (iso) => startOfWeek(iso);
