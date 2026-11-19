// Tests des règles métier critiques — exécuter avec : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleQty, fmtQty, toBase, computeNeeds, buildShoppingList, purchaseFor, matchIngredient, parseQuickItem, normalizeUnit,
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
const list = (meals, purchases = [], manual = []) =>
  buildShoppingList({ needs: computeNeeds({ meals, recipes: R, ...range }), purchases, manualItems: manual, session: 's1' });
const find = (l, key) => [...l.toBuy, ...l.done].find((i) => i.key === key);

test('§5.5 mise à l’échelle des portions', () => {
  assert.equal(scaleQty(200, 2, 4), 400);
  assert.equal(scaleQty(20, 2, 4), 40);
  assert.equal(scaleQty(1, 4, 3), 0.75);
  assert.equal(fmtQty(0.75, 'c. à soupe'), '¾ c. à soupe');
  assert.equal(fmtQty(1500, 'g'), '1,5 kg');
  assert.equal(fmtQty(40, 'cl'), '40 cl');
  assert.equal(fmtQty(3, 'unité'), '3');
  assert.equal(fmtQty(2, 'gousse'), '2 gousses');
});

test('§6.4 conversion d’unités compatibles uniquement', () => {
  assert.deepEqual(toBase(20, 'cl'), { q: 200, base: 'ml', dim: 'vol' });
  assert.deepEqual(toBase(1, 'kg'), { q: 1000, base: 'g', dim: 'mass' });
  assert.equal(toBase(2, 'unité').base, 'unité');
});

test('§6.2 génération + regroupement (exemple de la spec)', () => {
  const l = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-04', 'gratin'), meal('m3', '2025-03-04', 'curry')]);
  assert.equal(find(l, 'poulet_filet|g').qty, 500);
  assert.equal(find(l, 'creme_entiere|ml').qty, 600); // 20 cl + 200 ml + 200 ml
  assert.equal(find(l, 'pomme_de_terre|g').qty, 500);
  assert.equal(find(l, 'creme_entiere|ml').sources.length, 3); // traçabilité
});

test('§6.4 unités incompatibles jamais additionnées (2 œufs ≠ 100 g d’œufs)', () => {
  const l = list([meal('m1', '2025-03-03', 'curry')]);
  assert.equal(find(l, 'oeuf|unité').qty, 2);
  assert.equal(find(l, 'oeuf|g').qty, 100);
});

test('§6.3 produits non interchangeables non fusionnés (crème entière / légère)', () => {
  const l = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-03', 'legere')]);
  assert.ok(find(l, 'creme_entiere|ml'));
  assert.ok(find(l, 'creme_legere|ml'));
});

test('§4.7/§6.10 recalcul quand les portions changent', () => {
  const l = list([meal('m1', '2025-03-03', 'pates', 4)]);
  assert.equal(find(l, 'pates|g').qty, 400);
});

test('§12.3 achat conservé quand le repas est supprimé', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates')]);
  const p = { id: 'p1', ...purchaseFor(find(l1, 'pates|g'), { session: 's1', memberId: 'flo' }) };
  const l2 = list([], [p]);
  const it = find(l2, 'pates|g');
  assert.ok(it, 'l’achat doit rester visible');
  assert.equal(it.noLongerNeeded, true);
  assert.equal(it.bought, 200);
  assert.ok(l2.done.includes(it));
});

test('§6.10 besoin 500 g → acheté 500 g → besoin 300 g : achat préservé, surplus signalé', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates'), meal('m2', '2025-03-04', 'curry')]);
  const chicken = find(l1, 'poulet_filet|g');
  assert.equal(chicken.qty, 500);
  const p = { id: 'p1', ...purchaseFor(chicken, { session: 's1', memberId: 'flo' }) };
  const l2 = list([meal('m2', '2025-03-04', 'curry')], [p]);
  const it = find(l2, 'poulet_filet|g');
  assert.equal(it.qty, 300);
  assert.equal(it.bought, 500);
  assert.equal(it.surplus, 200);
  assert.ok(l2.done.includes(it));
});

test('§6.10 besoin qui augmente après achat → reste à acheter', () => {
  const l1 = list([meal('m1', '2025-03-03', 'pates')]);
  const p = { id: 'p1', ...purchaseFor(find(l1, 'poulet_filet|g'), { session: 's1', memberId: 'flo' }) };
  const l2 = list([meal('m1', '2025-03-03', 'pates', 6)], [p]);
  const it = find(l2, 'poulet_filet|g');
  assert.equal(it.partial, true);
  assert.equal(it.remaining, 400);
  assert.ok(l2.toBuy.includes(it));
});

test('§6.10 articles manuels jamais supprimés par le recalcul', () => {
  const manual = [{ id: 'i1', name: 'Lessive', category: 'hygiene', checked: false }];
  const l = list([], [], manual);
  assert.equal(l.toBuy.length, 1);
  assert.equal(l.toBuy[0].kind, 'manual');
});

test('§4.6 repas libre sans recette → aucun ingrédient', () => {
  const l = list([{ id: 'x', date: '2025-03-03', slot: 'lunch', recipeId: null, title: 'Restaurant', servings: 4 }]);
  assert.equal(l.toBuy.length, 0);
});

test('§6.3 référentiel : synonymes reconnus', () => {
  assert.equal(matchIngredient('Crème liquide entière'), 'creme_entiere');
  assert.equal(matchIngredient('filets de poulet'), 'poulet_filet');
  assert.equal(matchIngredient('Crème légère'), 'creme_legere');
  assert.equal(matchIngredient('oeufs'), 'oeuf');
});

test('saisie rapide des courses', () => {
  const a = parseQuickItem('2 l lait');
  assert.equal(a.qty, 2); assert.equal(a.unit, 'l'); assert.equal(a.category, 'laitiers');
  const b = parseQuickItem('lessive');
  assert.equal(b.qty, null); assert.equal(b.category, 'hygiene');
  const c = parseQuickItem('6 œufs');
  assert.equal(c.qty, 6); assert.equal(c.ing, 'oeuf');
  assert.equal(normalizeUnit('cuillère à soupe'), 'c. à soupe');
});
