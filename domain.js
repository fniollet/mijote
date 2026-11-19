// ─────────────────────────────────────────────────────────────
// RÈGLES MÉTIER (spec §5.5, §6, §12, §14) — module pur, sans DOM.   (v1.1)
// Testé par tests/domain.test.mjs. Toute la logique critique
// des courses et du stock vit ici, séparée de l'interface.
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

// ── Clé commune besoin / stock ───────────────────────────────
/**
 * Calcule la clé de regroupement d'un produit (ingrédient + unité de base),
 * identique pour les besoins du planning et pour le stock.
 */
export function stockKeyFor(name, ing, qty, unit) {
  const ingId = ing || matchIngredient(name);
  const def = ingId ? INGREDIENT[ingId] : null;
  const u = normalizeUnit(unit || def?.unit || 'unité');
  const b = qty == null || qty === '' || isNaN(qty) ? { q: null, base: toBase(1, u).base } : toBase(+qty, u);
  return {
    key: `${ingId || 'x:' + singular(norm(name))}|${b.base}`,
    ing: ingId || null,
    name: def?.name || name,
    qty: b.q == null ? null : round3(b.q),
    unit: b.base,
    category: def?.category || guessCategory(name),
    pantry: !!def?.pantry,
    skip: !!def?.skip,
  };
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
      const b = q == null ? { q: null, base: toBase(1, unit).base } : toBase(q, unit);
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

// ── Stock (frigo / congélateur / placard) — spec §14.4 ─────────
export const STOCK_LOCATIONS = [
  { id: 'frigo', label: 'Frigo', emoji: '🧊' },
  { id: 'congel', label: 'Congélateur', emoji: '❄️' },
  { id: 'placard', label: 'Placard', emoji: '🫙' },
];
export const STOCK_LOCATION = Object.fromEntries(STOCK_LOCATIONS.map((l) => [l.id, l]));
/** Rayons dont les achats ne sont pas suivis en stock (papier toilette, lessive…). */
export const NON_STOCK_CATEGORIES = new Set(['hygiene', 'autres']);
export function guessLocation(category) {
  if (category === 'surgeles') return 'congel';
  if (['viandes', 'poissons', 'laitiers', 'fromages', 'fruits_legumes'].includes(category)) return 'frigo';
  return 'placard';
}

/**
 * Disponibilités du stock par clé.
 * excludeSession : les lots achetés pendant la session de courses en cours
 * sont exclus (ils sont déjà comptés comme « achetés » → pas de double comptage).
 */
export function stockAvailability(entries, { excludeSession = null } = {}) {
  const m = new Map();
  for (const s of entries) {
    if (s.deleted || !s.key) continue;
    if (excludeSession && s.session === excludeSession) continue;
    let a = m.get(s.key);
    if (!a) m.set(s.key, (a = { qty: 0, hasQty: false, unknown: false, entries: [] }));
    if (s.qty != null) { a.qty = round3(a.qty + s.qty); a.hasQty = true; } else a.unknown = true;
    a.entries.push(s);
  }
  return m;
}

/**
 * Consomme une quantité dans des lots (plus proche péremption d'abord).
 * Retourne la liste des changements { id, qty (nouvelle), remove, prevQty }.
 * qty = null → tout consommer.
 */
export function planConsumption(lots, qty) {
  const sorted = [...lots].sort((a, b) =>
    (a.expires || '9999').localeCompare(b.expires || '9999') || String(a.addedAt || '').localeCompare(String(b.addedAt || '')));
  const changes = [];
  let left = qty == null ? Infinity : qty;
  for (const l of sorted) {
    if (left <= 0.0001) break;
    if (l.qty == null || qty == null || l.qty <= left + 0.0001) {
      changes.push({ id: l.id, remove: true, prevQty: l.qty });
      left = l.qty == null ? (qty == null ? left : 0) : round3(left - l.qty);
    } else {
      changes.push({ id: l.id, remove: false, qty: round3(l.qty - left), prevQty: l.qty });
      left = 0;
    }
  }
  return changes;
}

/** Ce qu'une recette demande vs ce qui est en stock (pour « Que cuisiner ? »). */
export function recipeStockMatch(recipe, avail, servings) {
  let total = 0, have = 0;
  const missing = [], partial = [];
  for (const ri of recipe.ingredients || []) {
    if (ri.opt) continue;
    const name = ingredientName(ri);
    const k = stockKeyFor(name, ri.ing, scaleQty(ri.q, recipe.servings, servings || recipe.servings), ri.u);
    if (k.pantry || k.skip) continue;
    total++;
    const a = avail.get(k.key);
    if (!a) { missing.push(name); continue; }
    if (k.qty == null || (a.hasQty && a.qty >= k.qty * 0.95) || (!a.hasQty && a.unknown)) have++;
    else { partial.push(name); missing.push(name); }
  }
  return { total, have, missing, partial };
}

/**
 * Fusionne besoins actuels, stock, achats (historique) et articles manuels.
 * Règles (spec §6.10, §12.3, §14.4) :
 *  - le stock disponible (hors achats de la session en cours) couvre d'abord les besoins ;
 *    un besoin entièrement couvert va dans « Déjà à la maison » ;
 *  - les achats ne sont JAMAIS supprimés par un recalcul ;
 *  - besoin ↓ sous la quantité achetée → l'article reste « acheté », signalé surplus ;
 *  - besoin disparu → l'article reste « acheté », signalé « plus nécessaire » ;
 *  - besoin ↑ au-delà de l'acheté → l'article revient « à acheter » pour le reste ;
 *  - articles manuels : jamais touchés par le recalcul.
 */
export function buildShoppingList({ needs, purchases, manualItems, session, stock = null }) {
  const bought = new Map();
  for (const p of purchases) {
    if (p.deleted || p.session !== session) continue;
    let b = bought.get(p.key);
    if (!b) bought.set(p.key, (b = { qty: 0, hasQty: false, list: [], cleared: true }));
    if (p.qty != null) { b.qty = round3(b.qty + p.qty); b.hasQty = true; }
    if (!p.cleared) b.cleared = false;
    b.list.push(p);
  }
  const toBuy = [], done = [], home = [];
  const EPS = 0.0001;
  for (const n of needs.values()) {
    const b = bought.get(n.key);
    const st = stock?.get(n.key);
    let covered = 0, coveredAll = false;
    if (st) {
      if (n.hasQty && st.hasQty) covered = round3(Math.min(st.qty, n.qty));
      if (!n.hasQty) coveredAll = true;
    }
    const need = n.hasQty ? round3(n.qty - covered) : n.qty;
    if (n.hasQty && covered > 0 && need <= Math.max(EPS, n.qty * 0.02)) coveredAll = true;
    const item = {
      ...n, kind: 'planned', id: n.key, bought: b?.qty || 0, purchases: b?.list || [],
      inStock: covered, need, stockUnknown: !!(st && !st.hasQty && n.hasQty),
    };
    if (!b) {
      if (coveredAll) { item.remaining = 0; home.push(item); continue; }
      item.remaining = need; toBuy.push(item); continue;
    }
    const remaining = n.hasQty ? round3(need - b.qty) : 0;
    if (n.hasQty && b.hasQty && remaining > Math.max(EPS, need * 0.02)) {
      item.remaining = remaining; item.partial = true; toBuy.push(item);
    } else {
      item.remaining = 0;
      if (n.hasQty && b.qty - need > Math.max(EPS, need * 0.02)) item.surplus = round3(b.qty - need);
      item.cleared = b.cleared;
      item.checkedBy = b.list.at(-1)?.by; item.checkedAt = b.list.at(-1)?.at;
      done.push(item);
    }
  }
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
  toBuy.sort(byName); home.sort(byName);
  done.sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')));
  return { toBuy, done, home };
}

/** Crée l'enregistrement d'achat lorsqu'on coche un article planifié. */
export function purchaseFor(item, { session, memberId, now = new Date().toISOString() }) {
  return {
    session, key: item.key, name: item.name, unit: item.unit, category: item.category,
    qty: item.hasQty ? round3(item.remaining ?? item.qty) : null, by: memberId, at: now, cleared: false,
  };
}

// ── Import d'une recette collée en texte (spec §14.3, sans IA) ──
const QFRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
function parseNum(s) {
  s = s.trim();
  if (QFRAC[s] != null) return QFRAC[s];
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (m) return +m[1] + QFRAC[m[2]];
  m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] / +m[2];
  return parseFloat(s.replace(',', '.'));
}
const deacc = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const UNIT_WORDS = [
  ['cuilleres a soupe', 'c. à soupe'], ['cuillere a soupe', 'c. à soupe'], ['cuilleres a cafe', 'c. à café'], ['cuillere a cafe', 'c. à café'],
  ['c. a soupe', 'c. à soupe'], ['c. a cafe', 'c. à café'], ['c.a.s.', 'c. à soupe'], ['c.a.c.', 'c. à café'], ['c.a.s', 'c. à soupe'], ['c.a.c', 'c. à café'],
  ['cas', 'c. à soupe'], ['cac', 'c. à café'], ['cs', 'c. à soupe'], ['cc', 'c. à café'],
  ['grammes', 'g'], ['gramme', 'g'], ['kilos', 'kg'], ['kilo', 'kg'], ['kg', 'kg'], ['gr', 'g'], ['g', 'g'],
  ['litres', 'l'], ['litre', 'l'], ['ml', 'ml'], ['cl', 'cl'], ['dl', 'dl'], ['l', 'l'],
  ['pincees', 'pincée'], ['pincee', 'pincée'], ['gousses', 'gousse'], ['gousse', 'gousse'], ['tranches', 'tranche'], ['tranche', 'tranche'],
  ['bouquets', 'bouquet'], ['bouquet', 'bouquet'], ['boites', 'boîte'], ['boite', 'boîte'], ['pots', 'pot'], ['pot', 'pot'],
  ['sachets', 'sachet'], ['sachet', 'sachet'],
];
/** Analyse une ligne d'ingrédient : « 200 g de farine (tamisée) ». */
export function parseIngredientLine(line) {
  let t = line.replace(/^\s*[-•*·–—▪︎✓]+\s*/, '').trim();
  if (!t) return null;
  let q = null, u = '', note = '';
  const m = t.match(/^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔]?|[½¼¾⅓⅔])\s*(.*)$/);
  if (m) {
    q = parseNum(m[1]);
    t = m[2];
    const low = deacc(t);
    for (const [w, unit] of UNIT_WORDS) {
      if (low.startsWith(w) && (low.length === w.length || /[\s.,)]/.test(low[w.length]))) {
        u = unit; t = t.slice(w.length).replace(/^\.\s*/, '').trim(); break;
      }
    }
    t = t.replace(/^(de |d'|d’|du |des )/i, '').trim();
  }
  const opt = /\(?\s*(facultatif|optionnel)\s*\)?/i.test(t);
  t = t.replace(/\(?\s*(facultatif|optionnel)\s*\)?/ig, '').trim();
  const pm = t.match(/^(.*?)\s*\((.+)\)\s*$/);
  if (pm) { t = pm[1]; note = pm[2]; }
  else {
    const cm = q != null && t.match(/^([^,]{2,}?),\s*(.+)$/);
    if (cm && cm[2].length < 40) { t = cm[1]; note = cm[2]; }
  }
  t = t.replace(/[.;:]+$/, '').trim();
  if (!t) return null;
  return { q: q != null && !isNaN(q) ? q : null, u: u || (q != null ? '' : ''), name: t.charAt(0).toUpperCase() + t.slice(1), note, opt };
}
function minutesIn(s) {
  let total = 0, found = false;
  const h = s.match(/(\d+)\s*h(?:eures?)?(?:\s*(\d+))?/i);
  if (h) { total += +h[1] * 60 + (+h[2] || 0); found = true; }
  const mm = s.match(/(\d+)\s*(?:min|minutes?|mn)\b/i);
  if (mm && !h?.[2]) { total += +mm[1]; found = true; }
  return found ? total : null;
}
/** Transforme un texte libre en brouillon de recette structurée (à vérifier par l'utilisateur). */
export function parseRecipeText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const out = { title: '', servings: null, prep: null, cook: null, ingredients: [], steps: [], description: '' };
  let section = null;
  const isIngHeader = (l) => /^(les\s+)?ingr[ée]dients?\b/i.test(l) && l.length < 60;
  const isStepHeader = (l) => /^(la\s+)?(pr[ée]paration|[ée]tapes?|instructions?|m[ée]thode|d[ée]roulement|recette)\s*:?\s*$/i.test(l);
  const looksIng = (l) => /^[-•*·–]/.test(l) || /^(\d+([.,/]\d+)?|[½¼¾⅓⅔])\s*\S/.test(l);
  const numbered = (l) => /^(\d+\s*[.)\-:]|[ée]tape\s*\d+\s*[.:)-]?)\s*/i.test(l);
  for (const raw of lines) {
    if (!raw) continue;
    const l = raw.replace(/\s+/g, ' ');
    const sv = l.match(/(?:pour\s+)?(\d+)\s*(?:personnes?|pers\.?|portions?|parts?)\b/i);
    const metaOnly = l.length < 70 && /^(pour|portions?|nombre|temps|pr[ée]paration\s*:|cuisson\s*:|repos|total|difficult)/i.test(l);
    if (sv && !out.servings && (metaOnly || isIngHeader(l))) out.servings = +sv[1];
    if (/pr[ée]paration\s*:/i.test(l)) out.prep = minutesIn(l.split(/pr[ée]paration\s*:/i)[1]) ?? out.prep;
    if (/cuisson\s*:/i.test(l)) out.cook = minutesIn(l.split(/cuisson\s*:/i)[1]) ?? out.cook;
    if (isIngHeader(l)) { section = 'ing'; continue; }
    if (isStepHeader(l)) { section = 'step'; continue; }
    if (metaOnly) continue;
    if (!out.title && !looksIng(l) && !numbered(l) && l.length < 90) { out.title = l.replace(/[:.]$/, ''); continue; }
    let kind = section;
    if (!kind) kind = numbered(l) ? 'step' : looksIng(l) && l.length < 90 ? 'ing' : out.ingredients.length && l.length > 50 ? 'step' : out.steps.length ? 'step' : l.length > 70 ? 'step' : 'ing';
    if (section === 'ing' && numbered(l) && l.length > 60) kind = 'step';
    if (kind === 'ing') {
      const ing = parseIngredientLine(l);
      if (ing) out.ingredients.push(ing);
    } else {
      const textStep = l.replace(/^(\d+\s*[.)\-:]|[ée]tape\s*\d+\s*[.:)-]?)\s*/i, '').replace(/^[-•*·–]\s*/, '').trim();
      if (!textStep) continue;
      const dur = minutesIn(textStep);
      const temp = textStep.match(/(\d{2,3})\s*°\s*C?/i);
      out.steps.push({ title: '', text: textStep, dur: dur ? dur * 60 : null, temp: temp ? `${temp[1]} °C` : '' });
    }
  }
  return out;
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
