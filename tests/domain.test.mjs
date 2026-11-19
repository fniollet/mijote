// Tests des règles métier critiques — exécuter avec : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleQty, fmtQty, toBase, computeNeeds, buildShoppingList, purchaseFor, matchIngredient, parseQuickItem, normalizeUnit,
  stockKeyFor, stockAvailability, planConsumption, recipeStockMatch, parseRecipeText, parseIngredientLine,
} from '../js/domain.js';

const R = {
  pates: { id: 'pates', title: 'Pâtes au poulet', servings: 2, ingredients: [
    { ing: 'pates', q: 200, u: 'g' }, { ing: 'poulet_filet', q: 200, u: 'g' }, { ing: 'creme_entiere', q: 20, u: 'cl' }] },
  gratin: { id: 'gratin', title: 'Gratin', servings: 2, ingredients: [
    { ing: 'pomme_de_terre', q: 500, u: 'g' }, { ing: 'creme_entiere', q: 200, u: 'ml' }] },
  curry: { id: 'curry', title: 'Curry', servings: 2, ingredients: [
    { ing: 'poulet_filet', q: 300, u: 'g' }, { ing: 'creme_entiere', q: 200, u: 'ml' }, { ing: 'oeuf', q: 2, u: 'unité' }, { name: 'Œufs', q: 100, u: 'g' }] },
  legere: { id: 'legere', title: 'Sauce légère', servings: 2, ingredients: [{ ing: 'creme_legere', q: 10, u: 'cl' }] },
};
const meal = (id, date, recipeId, servings = 2) => ({ id, date, slot: 'dinner', recipeId, servings });
const range = { from: '2025-01-01', to: '2025-12-31' };
const list = (meals, purchases = [], manual = [], stock = null) =>
  buildShoppingList({ needs: computeNeeds({ meals, recipes: R, ...range }), purchases, manualItems: manual, session: 's1', stock });
const find = (l, key) => [...l.toBuy, ...l.done, ...l.home].find((i) => i.key === key);
const lot = (id, name, qty, unit, extra = {}) => ({ id, ...stockKeyFor(name, null, qty, unit), ...extra });

test('§5.5 mise à l’échelle des portions', () => {
  assert.equal(scaleQty(200, 2, 4), 400);
  assert.equal(scaleQty(1, 4, 3), 0.75);
  assert.equal(fmtQty(0.75, 'c. à soupe'), '¾ c. à soupe');
  assert.equal(fmtQty(1500, 'g'), '1,5 kg');
  assert.equal(fmtQty(40, 'cl'), '40 cl');
  assert.equal(fmtQty(2, 'gousse'), '2 gousses');
});

test('§6.4 conversion d’unités compatibles uniquement', () => {
  assert.deepEqual(toBase(20, 'cl'), { q: 200, base: 'ml', dim: 'vol' });
  assert.equal(toBase(2, 'unité').base, 'unité');
});

test('§6.2 génération + regroupement (exemple de la spec)', () => {
  const l = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-04', 'gratin'), meal('m3', '2025-03-04', 'curry')]);
  assert.equal(find(l, 'poulet_filet|g').qty, 500);
  assert.equal(find(l, 'creme_entiere|ml').qty, 600);
  assert.equal(find(l, 'creme_entiere|ml').sources.length, 3);
});

test('§6.4 unités incompatibles jamais additionnées', () => {
  const l = list([meal('m1', '2025-03-03', 'curry')]);
  assert.equal(find(l, 'oeuf|unité').qty, 2);
  assert.equal(find(l, 'oeuf|g').qty, 100);
});

test('§6.3 crème entière / légère non fusionnées', () => {
  const l = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-03', 'legere')]);
  assert.ok(find(l, 'creme_entiere|ml')); assert.ok(find(l, 'creme_legere|ml'));
});

test('§12.3 achat conservé quand le repas est supprimé', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates')]);
  const p = { id: 'p1', ...purchaseFor(find(l1, 'pates|g'), { session: 's1', memberId: 'flo' }) };
  const it = find(list([], [p]), 'pates|g');
  assert.equal(it.noLongerNeeded, true); assert.equal(it.bought, 200);
});

test('§6.10 besoin 500 g → acheté 500 g → besoin 300 g : surplus signalé', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-04', 'curry')]);
  const p = { id: 'p1', ...purchaseFor(find(l1, 'poulet_filet|g'), { session: 's1', memberId: 'flo' }) };
  const it = find(list([meal('m2', '2025-03-04', 'curry')], [p]), 'poulet_filet|g');
  assert.equal(it.qty, 300); assert.equal(it.bought, 500); assert.equal(it.surplus, 200);
});

test('§6.10 achat partiel → reste à acheter', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates')]);
  const p = { id: 'p1', ...purchaseFor(find(l1, 'poulet_filet|g'), { session: 's1', memberId: 'flo' }), qty: 50 };
  const it = find(list([meal('m1', '2025-03-03', 'pates')], [p]), 'poulet_filet|g');
  assert.equal(it.partial, true); assert.equal(it.remaining, 150);
});

test('§6.10 articles manuels jamais supprimés · repas libre sans ingrédient', () => {
  assert.equal(list([], [], [{ id: 'i1', name: 'Lessive', category: 'hygiene', checked: false }]).toBuy[0].kind, 'manual');
  assert.equal(list([{ id: 'x', date: '2025-03-03', slot: 'lunch', recipeId: null, title: 'Resto', servings: 4 }]).toBuy.length, 0);
});

test('§6.3 référentiel et saisie rapide', () => {
  assert.equal(matchIngredient('Crème liquide entière'), 'creme_entiere');
  assert.equal(matchIngredient('filets de poulet'), 'poulet_filet');
  const a = parseQuickItem('2 l lait');
  assert.equal(a.qty, 2); assert.equal(a.unit, 'l'); assert.equal(a.category, 'laitiers');
  assert.equal(parseQuickItem('lessive').category, 'hygiene');
  assert.equal(normalizeUnit('cuillère à soupe'), 'c. à soupe');
});

// ── v1.1 : stock ─────────────────────────────────────────────
test('stock : clé identique besoin / stock (1 kg = 1000 g)', () => {
  assert.equal(stockKeyFor('Pâtes', null, 1, 'kg').key, 'pates|g');
  assert.equal(stockKeyFor('Pâtes', null, 1, 'kg').qty, 1000);
  assert.equal(stockKeyFor('6 œufs'.slice(2), null, 6, null).key, 'oeuf|unité');
});

test('stock couvre tout le besoin → « Déjà à la maison »', () => {
  const stock = stockAvailability([lot('s1', 'Pâtes', 500, 'g')]);
  const l = list([meal('m1', '2025-03-03', 'pates')], [], [], stock);
  assert.ok(l.home.find((i) => i.key === 'pates|g'));
  assert.ok(!l.toBuy.find((i) => i.key === 'pates|g'));
});

test('stock couvre une partie → seul le reste est à acheter', () => {
  const stock = stockAvailability([lot('s1', 'Blanc de poulet', 150, 'g')]);
  const it = list([meal('m1', '2025-03-03', 'pates')], [], [], stock).toBuy.find((i) => i.key === 'poulet_filet|g');
  assert.equal(it.inStock, 150); assert.equal(it.remaining, 50);
  assert.equal(purchaseFor(it, { session: 's1', memberId: 'x' }).qty, 50);
});

test('stock : les achats de la session en cours ne sont pas comptés deux fois', () => {
  const stock = stockAvailability([lot('s1', 'Pâtes', 200, 'g', { session: 's1' })], { excludeSession: 's1' });
  const it = list([meal('m1', '2025-03-03', 'pates')], [], [], stock).toBuy.find((i) => i.key === 'pates|g');
  assert.equal(it.remaining, 200);
});

test('stock : consommation au plus proche de la péremption', () => {
  const ch = planConsumption([
    { id: 'a', qty: 500, expires: '2025-05-10' }, { id: 'b', qty: 300, expires: '2025-05-01' },
  ], 400);
  assert.deepEqual(ch[0], { id: 'b', remove: true, prevQty: 300 });
  assert.deepEqual(ch[1], { id: 'a', remove: false, qty: 400, prevQty: 500 });
});

test('« Que cuisiner ? » : ce qui manque', () => {
  const stock = stockAvailability([lot('a', 'Pâtes', 1, 'kg'), lot('b', 'Blanc de poulet', 400, 'g')]);
  const m = recipeStockMatch(R.pates, stock, 2);
  assert.equal(m.total, 3); assert.equal(m.have, 2); assert.deepEqual(m.missing, ['Crème entière']);
});

test('import texte : ingrédients, étapes, portions, durées', () => {
  const r = parseRecipeText(`Lasagnes de Mamie
Pour 6 personnes
Préparation : 30 min
Cuisson : 1 h

Ingrédients
- 500 g de bœuf haché
- 2 cuillères à soupe d'huile d'olive
- 1/2 l de lait
- 3 gousses d'ail (hachées)
- Sel, poivre

Préparation
1. Faire revenir la viande 10 minutes.
2. Enfourner à 180°C pendant 45 min.`);
  assert.equal(r.title, 'Lasagnes de Mamie');
  assert.equal(r.servings, 6); assert.equal(r.prep, 30); assert.equal(r.cook, 60);
  assert.equal(r.ingredients.length, 5);
  assert.deepEqual([r.ingredients[0].q, r.ingredients[0].u, r.ingredients[0].name], [500, 'g', 'Bœuf haché']);
  assert.deepEqual([r.ingredients[1].q, r.ingredients[1].u], [2, 'c. à soupe']);
  assert.deepEqual([r.ingredients[2].q, r.ingredients[2].u, r.ingredients[2].name], [0.5, 'l', 'Lait']);
  assert.equal(r.ingredients[3].note, 'hachées');
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[0].dur, 600);
  assert.equal(r.steps[1].temp, '180 °C');
});

test('import texte : ligne sans quantité et « 1 lime » non confondu avec « l »', () => {
  assert.equal(parseIngredientLine('1 lime').u, '');
  assert.equal(parseIngredientLine('1 lime').name, 'Lime');
  assert.equal(parseIngredientLine('Sel').q, null);
});
