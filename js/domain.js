// ─────────────────────────────────────────────────────────────
// RÈGLES MÉTIER (spec §5.5, §6, §12) — module pur, sans DOM.
// Testé par tests/domain.test.mjs. Toute la logique critique
// des courses vit ici, séparée de l'interface.
// ─────────────────────────────────────────────────────────────
import { INGREDIENTS, INGREDIENT, CATEGORY_HINTS } from './data/ingredients.js';
import { norm, addDays, startOfWeek } from './utils.js';

// ── Unités ───────────────────────────────────────────────────
// dim : dimension physique. Seules les unités d'une même dimension
// avec facteur connu sont converties (pas de conversion par densité).
export const UNITS = {
  g: { dim: 'mass', f: 1 },
  kg: { dim: 'mass', f: 1000 },
  ml: { dim: 'vol', f: 1 },
  cl: { dim: 'vol', f: 10 },
  dl: { dim: 'vol', f: 100 },
  l: { dim: 'vol', f: 1000 },
  'unité': { dim: 'count', plural: '' },
  'c. à café': { dim: 'cac' },
  'c. à soupe': { dim: 'cas' },
  'pincée': { dim: 'pincee', plural: 'pincées' },
  'tranche': { dim: 'tranche', plural: 'tranches' },
  'gousse': { dim: 'gousse', plural: 'gousses' },
  'bouquet': { dim: 'bouquet', plural: 'bouquets' },
  'boîte': { dim: 'boite', plural: 'boîtes' },
  'pot': { dim: 'pot', plural: 'pots' },
  'sachet': { dim: 'sachet', plural: 'sachets' },
};
export const UNIT_LIST = Object.keys(UNITS);
export const FRACTION_UNITS = new Set(['unité', 'c. à café', 'c. à soupe', 'pincée', 'tranche', 'gousse', 'bouquet', 'boîte', 'pot', 'sachet']);

const UNIT_ALIASES = {
  gr: 'g', gramme: 'g', grammes: 'g', kilo: 'kg', kilos: 'kg', kgs: 'kg',
  litre: 'l', litres: 'l', L: 'l', millilitre: 'ml', centilitre: 'cl',
  u: 'unité', unite: 'unité', unites: 'unité', piece: 'unité', pieces: 'unité', pc: 'unité', x: 'unité',
  cac: 'c. à café', 'c a cafe': 'c. à café', 'cuillere a cafe': 'c. à café', 'cuilleres a cafe': 'c. à café', cc: 'c. à café',
  cas: 'c. à soupe', 'c a soupe': 'c. à soupe', 'cuillere a soupe': 'c. à soupe', 'cuilleres a soupe': 'c. à soupe', cs: 'c. à soupe',
  pincee: 'pincée', pincees: 'pincée', tranches: 'tranche', gousses: 'gousse', bouquets: 'bouquet',
  boite: 'boîte', boites: 'boîte', pots: 'pot', sachets: 'sachet',
};
export function normalizeUnit(u) {
  if (!u) return 'unité';
  if (UNITS[u]) return u;
  const k = norm(u);
  if (UNITS[k]) return k;
  return UNIT_ALIASES[k] || UNIT_ALIASES[u] || u.trim(); // unité libre autorisée
}

/** Convertit une quantité vers l'unité de base de sa dimension. */
export function toBase(q, unit) {
  const u = normalizeUnit(unit);
  const def = UNITS[u];
  if (def && def.f) return { q: q * def.f, base: def.dim === 'mass' ? 'g' : 'ml', dim: def.dim };
  return { q, base: u, dim: def ? def.dim : 'free:' + u };
}

/** Arrondi décimal sûr (évite 0.1+0.2). Les quantités sont stockées à 1/1000. */
export const round3 = (n) => Math.round((+n + Number.EPSILON) * 1000) / 1000;

/** Spec §5.5 : Quantité finale = Quantité initiale × (personnes / portions initiales). */
export function scaleQty(q, baseServings, targetServings) {
  if (q == null || q === '' || isNaN(q)) return null;
  if (!baseServings || baseServings <= 0) return round3(q);
  return round3((+q * targetServings) / baseServings);
}

// ── Formatage « humain » ─────────────────────────────────────
const FRACS = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
function fractionStr(q) {
  if (q >= 10) return String(Math.round(q));
  const whole = Math.floor(q);
  const rest = q - whole;
  let best = FRACS[0], bd = 9;
  for (const f of FRACS) { const d = Math.abs(rest - f[0]); if (d < bd) { bd = d; best = f; } }
  const w = best[0] === 1 ? whole + 1 : whole;
  if (!best[1]) return String(w || (q > 0 ? '¼' : '0'));
  return w ? `${w} ${best[1]}` : best[1];
}
function niceMetric(q) {
  if (q >= 500) return Math.round(q / 10) * 10;
  if (q >= 100) return Math.round(q / 5) * 5;
  if (q >= 10) return Math.round(q);
  return Math.round(q * 10) / 10;
}
const dec = (n) => String(n).replace('.', ',');

/** Formatte une quantité + unité de manière lisible (arrondi raisonnable, fractions). */
export function fmtQty(q, unit) {
  if (q == null || q === '' || isNaN(q)) return unit && unit !== 'unité' ? unit : '';
  const u = normalizeUnit(unit);
  const def = UNITS[u];
  if (def?.dim === 'mass') {
    const g = q * def.f;
    return g >= 1000 ? `${dec(Math.round(g / 10) / 100)} kg` : `${dec(niceMetric(g))} g`;
  }
  if (def?.dim === 'vol') {
    const ml = q * def.f;
    if (ml >= 1000) return `${dec(Math.round(ml / 10) / 100)} l`;
    if (u === 'cl' || u === 'dl') return `${dec(niceMetric(ml / 10))} cl`;
    return `${dec(niceMetric(ml))} ml`;
  }
  const n = FRACTION_UNITS.has(u) ? fractionStr(q) : dec(Math.round(q * 100) / 100);
  if (u === 'unité') return n;
  const plural = def?.plural && q > 1 ? def.plural : u;
  return `${n} ${plural}`;
}

// ── Référentiel d'ingrédients ────────────────────────────────
const singular = (s) => s.split(' ').map((w) => (w.length > 3 ? w.replace(/(s|x)$/, '') : w)).join(' ');
const ALIAS_INDEX = new Map();
for (const ing of INGREDIENTS) {
  for (const a of [ing.name, ...ing.aliases]) {
    const k = singular(norm(a));
    if (!ALIAS_INDEX.has(k)) ALIAS_INDEX.set(k, ing.id);
  }
}
/** Retrouve un ingrédient du référentiel par nom ou synonyme exact (après normalisation). */
export function matchIngredient(name) {
  if (!name) return null;
  let k = singular(norm(name).replace(/^(de |d |des |du |la |le |les )/, ''));
  return ALIAS_INDEX.get(k) || null;
}
export function guessCategory(name) {
  const id = matchIngredient(name);
  if (id) return INGREDIENT[id].category;
  const n = ' ' + norm(name) + ' ';
  for (const [cat, words] of CATEGORY_HINTS) if (words.some((w) => n.includes(' ' + w))) return cat;
  return 'autres';
}
export const ingredientName = (ri) => (ri.ing && INGREDIENT[ri.ing]?.name) || ri.name || 'Ingrédient';

// ── Saisie rapide : « 2 l lait », « lait x2 », « 6 œufs » ─────
export function parseQuickItem(text) {
  let t = String(text || '').trim();
  if (!t) return null;
  let qty = null, unit = null;
  const unitRe = '(kg|g|gr|ml|cl|dl|l|litres?|u|pcs?|x|boites?|boîtes?|pots?|sachets?|tranches?|bouquets?|gousses?)';
  let m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${unitRe}?\\s+(?:de |d')?(.+)$`, 'i'));
  if (m) { qty = parseFloat(m[1].replace(',', '.')); unit = m[2] ? normalizeUnit(m[2]) : 'unité'; t = m[3]; }
  else {
    m = t.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*${unitRe}?$`, 'i'));
    if (m) { t = m[1]; qty = parseFloat(m[2].replace(',', '.')); unit = m[3] ? normalizeUnit(m[3]) : 'unité'; }
  }
  const name = t.trim().replace(/^\w/, (c) => c.toUpperCase());
  return { name, qty, unit: qty != null ? unit : null, category: guessCategory(name), ing: matchIngredient(name) };
}

// ── Période des courses ──────────────────────────────────────
export const SHOP_RANGES = {
  next7: '7 prochains jours',
  week: 'Cette semaine',
  nextweek: 'Semaine prochaine',
  next14: '14 prochains jours',
};
export function shopRange(range, today) {
  switch (range) {
    case 'week': { const s = startOfWeek(today); return { from: today, to: addDays(s, 6) }; }
    case 'nextweek': { const s = addDays(startOfWeek(today), 7); return { from: s, to: addDays(s, 6) }; }
    case 'next14': return { from: today, to: addDays(today, 13) };
    default: return { from: today, to: addDays(today, 6) };
  }
}

// ── Besoins issus du planning (spec §6.2, §6.10, table shopping_item_sources) ──
/**
 * Calcule les besoins consolidés à partir des repas planifiés.
 * Clé d'un besoin = ingrédient référencé (ou nom libre normalisé) + unité de base.
 * Les unités incompatibles restent séparées (2 œufs ≠ 100 g d'œufs).
 * Chaque besoin conserve ses sources (repas, recette, quantité) → traçabilité.
 */
export function computeNeeds({ meals, recipes, from, to }) {
  const needs = new Map();
  for (const meal of meals) {
    if (meal.deleted || !meal.recipeId || meal.date < from || meal.date > to) continue;
    const r = recipes[meal.recipeId];
    if (!r) continue;
    const servings = meal.servings || r.servings;
    (r.ingredients || []).forEach((ri, idx) => {
      const ingId = ri.ing || matchIngredient(ri.name);
      const ingDef = ingId ? INGREDIENT[ingId] : null;
      if (ingDef?.skip) return;
      const q = scaleQty(ri.q, r.servings, servings);
      const unit = normalizeUnit(ri.u || ingDef?.unit || 'unité');
      const b = q == null ? { q: null, base: unit } : toBase(q, unit);
      const ingKey = ingId || 'x:' + singular(norm(ri.name));
      const key = `${ingKey}|${b.base}`;
      let n = needs.get(key);
      if (!n) {
        n = {
          key, ing: ingId || null, name: ingDef?.name || ri.name, unit: b.base,
          category: ingDef?.category || ri.cat || guessCategory(ri.name),
          pantry: !!ingDef?.pantry, qty: 0, hasQty: false, optional: true, sources: [],
        };
        needs.set(key, n);
      }
      if (b.q != null) { n.qty = round3(n.qty + b.q); n.hasQty = true; }
      if (!ri.opt) n.optional = false;
      n.sources.push({
        mealId: meal.id, date: meal.date, slot: meal.slot, recipeId: r.id, recipeTitle: r.title,
        ingredientIndex: idx, qty: b.q, servings, optional: !!ri.opt,
      });
    });
  }
  return needs;
}

/**
 * Fusionne besoins actuels, achats (historique) et articles manuels.
 * Règles (spec §6.10, §12.3) :
 *  - les achats ne sont JAMAIS supprimés par un recalcul ;
 *  - besoin ↓ sous la quantité achetée → l'article reste « acheté », signalé surplus ;
 *  - besoin disparu → l'article reste « acheté », signalé « plus nécessaire » ;
 *  - besoin ↑ au-delà de l'acheté → l'article revient « à acheter » pour le reste ;
 *  - articles manuels : jamais touchés par le recalcul.
 */
export function buildShoppingList({ needs, purchases, manualItems, session }) {
  const bought = new Map(); // key → { qty, list[] }
  for (const p of purchases) {
    if (p.deleted || p.session !== session) continue;
    let b = bought.get(p.key);
    if (!b) bought.set(p.key, (b = { qty: 0, hasQty: false, list: [], cleared: true }));
    if (p.qty != null) { b.qty = round3(b.qty + p.qty); b.hasQty = true; }
    if (!p.cleared) b.cleared = false;
    b.list.push(p);
  }
  const toBuy = [], done = [];
  const EPS = 0.0001;
  for (const n of needs.values()) {
    const b = bought.get(n.key);
    const item = { ...n, kind: 'planned', id: n.key, bought: b?.qty || 0, purchases: b?.list || [] };
    if (!b) { item.remaining = n.qty; toBuy.push(item); continue; }
    const remaining = n.hasQty ? round3(n.qty - b.qty) : 0;
    if (n.hasQty && b.hasQty && remaining > Math.max(EPS, n.qty * 0.02)) {
      item.remaining = remaining; item.partial = true; toBuy.push(item);
    } else {
      item.remaining = 0;
      if (n.hasQty && b.qty - n.qty > Math.max(EPS, n.qty * 0.02)) item.surplus = round3(b.qty - n.qty);
      item.cleared = b.cleared;
      item.checkedBy = b.list.at(-1)?.by; item.checkedAt = b.list.at(-1)?.at;
      done.push(item);
    }
  }
  // Achats dont le besoin a disparu : conservés, marqués « plus nécessaire »
  for (const [key, b] of bought) {
    if (needs.has(key)) continue;
    const p = b.list[0];
    done.push({
      key, id: key, kind: 'planned', name: p.name, unit: p.unit, category: p.category || 'autres',
      qty: 0, hasQty: b.hasQty, bought: b.qty, remaining: 0, noLongerNeeded: true, sources: [],
      purchases: b.list, cleared: b.cleared, checkedBy: b.list.at(-1)?.by, checkedAt: b.list.at(-1)?.at,
    });
  }
  for (const m of manualItems) {
    if (m.deleted) continue;
    const item = { ...m, kind: 'manual', unit: m.unit, remaining: m.qty };
    (m.checked ? done : toBuy).push(item);
  }
  const byName = (a, b) => a.name.localeCompare(b.name, 'fr');
  toBuy.sort(byName); done.sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));
  return { toBuy, done };
}

/** Crée l'enregistrement d'achat lorsqu'on coche un article planifié. */
export function purchaseFor(item, { session, memberId, now = new Date().toISOString() }) {
  return {
    session, key: item.key, name: item.name, unit: item.unit, category: item.category,
    qty: item.hasQty ? round3(item.remaining ?? item.qty) : null, by: memberId, at: now, cleared: false,
  };
}

// ── Recettes : recherche / filtres / tri ─────────────────────
export const SLOTS = [
  { id: 'breakfast', label: 'Petit-déjeuner', short: 'Matin', emoji: '☀️' },
  { id: 'lunch', label: 'Déjeuner', short: 'Midi', emoji: '🌤️' },
  { id: 'dinner', label: 'Dîner', short: 'Soir', emoji: '🌙' },
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const RECIPE_CATEGORIES = ['Petit-déjeuner', 'Entrée', 'Plat principal', 'Accompagnement', 'Dessert', 'Goûter', 'Sauce', 'Boisson', 'Soupe'];
export const DIETS = { vege: 'Végétarien', viande: 'Viande', poisson: 'Poisson' };
export const DIFFICULTIES = ['Facile', 'Moyen', 'Difficile'];
export const totalTime = (r) => (+r.prep || 0) + (+r.cook || 0);

export function searchRecipes(list, { q = '', filter = 'all', sort = 'alpha', favorites = new Set(), members = {}, usage = {} }) {
  const nq = norm(q);
  let out = list.filter((r) => {
    if (r.archived && filter !== 'archived') return false;
    if (filter === 'archived') return !!r.archived;
    if (nq) {
      const hay = norm([
        r.title, r.description, (r.categories || []).join(' '), r.cuisine,
        (r.ingredients || []).map(ingredientName).join(' '),
        r.authorId ? members[r.authorId]?.name : 'bibliotheque mijote',
        (r.slots || []).map((s) => SLOT[s]?.label).join(' '), DIETS[r.diet],
      ].join(' '));
      if (!nq.split(' ').every((w) => hay.includes(w))) return false;
    }
    switch (filter) {
      case 'fav': return favorites.has(r.id);
      case 'breakfast': case 'lunch': case 'dinner': return (r.slots || []).includes(filter);
      case 'vege': case 'viande': case 'poisson': return r.diet === filter;
      case 'quick': return totalTime(r) <= 30;
      case 'easy': return r.difficulty === 'Facile';
      case 'family': return !r.builtin;
      case 'builtin': return !!r.builtin;
      case 'dessert': return (r.categories || []).some((c) => c === 'Dessert' || c === 'Goûter');
      default: return true;
    }
  });
  const by = {
    alpha: (a, b) => a.title.localeCompare(b.title, 'fr'),
    recent: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    time: (a, b) => totalTime(a) - totalTime(b),
    fav: (a, b) => (favorites.has(b.id) - favorites.has(a.id)) || a.title.localeCompare(b.title, 'fr'),
    used: (a, b) => (usage[b.id] || 0) - (usage[a.id] || 0) || a.title.localeCompare(b.title, 'fr'),
  };
  return out.sort(by[sort] || by.alpha);
}
