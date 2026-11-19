// ─────────────────────────────────────────────────────────────
// Référentiel global des ingrédients (spec §6.3)
// id · nom canonique · synonymes · rayon · unité habituelle
// pantry = produit de placard (affiché à part « à vérifier »)
// skip   = jamais ajouté aux courses (ex. eau du robinet)
// Les produits non interchangeables (crème entière / légère)
// ont des identifiants distincts et ne sont jamais fusionnés.
// ─────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { id: 'fruits_legumes', label: 'Fruits et légumes', emoji: '🥬' },
  { id: 'viandes', label: 'Viandes et volailles', emoji: '🥩' },
  { id: 'poissons', label: 'Poissons et fruits de mer', emoji: '🐟' },
  { id: 'laitiers', label: 'Produits laitiers', emoji: '🥛' },
  { id: 'fromages', label: 'Fromages', emoji: '🧀' },
  { id: 'epicerie', label: 'Épicerie', emoji: '🫙' },
  { id: 'feculents', label: 'Pâtes, riz et céréales', emoji: '🍝' },
  { id: 'surgeles', label: 'Surgelés', emoji: '🧊' },
  { id: 'boulangerie', label: 'Boulangerie', emoji: '🥖' },
  { id: 'boissons', label: 'Boissons', emoji: '🧃' },
  { id: 'hygiene', label: 'Hygiène et entretien', emoji: '🧴' },
  { id: 'autres', label: 'Autres', emoji: '🛍️' },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// [id, nom canonique, rayon, unité habituelle, synonymes, options]
const RAW = [
  // Fruits & légumes
  ['pomme_de_terre', 'Pommes de terre', 'fruits_legumes', 'g', ['pomme de terre', 'patate', 'patates', 'pommes de terre a chair ferme']],
  ['oignon', 'Oignon', 'fruits_legumes', 'unité', ['oignons', 'oignon jaune']],
  ['oignon_rouge', 'Oignon rouge', 'fruits_legumes', 'unité', ['oignons rouges']],
  ['echalote', 'Échalote', 'fruits_legumes', 'unité', ['echalotes']],
  ['ail', 'Ail', 'fruits_legumes', 'gousse', ["gousse d'ail", "gousses d'ail", 'ail frais']],
  ['carotte', 'Carottes', 'fruits_legumes', 'unité', ['carotte']],
  ['tomate', 'Tomates', 'fruits_legumes', 'unité', ['tomate', 'tomates grappe']],
  ['tomate_cerise', 'Tomates cerises', 'fruits_legumes', 'g', ['tomate cerise']],
  ['courgette', 'Courgettes', 'fruits_legumes', 'unité', ['courgette']],
  ['poivron', 'Poivron', 'fruits_legumes', 'unité', ['poivrons', 'poivron rouge']],
  ['champignon', 'Champignons de Paris', 'fruits_legumes', 'g', ['champignons', 'champignon de paris', 'champignons de paris']],
  ['haricot_vert', 'Haricots verts', 'fruits_legumes', 'g', ['haricot vert']],
  ['potimarron', 'Potimarron', 'fruits_legumes', 'unité', ['courge potimarron']],
  ['poireau', 'Poireaux', 'fruits_legumes', 'unité', ['poireau']],
  ['salade', 'Salade verte', 'fruits_legumes', 'unité', ['laitue', 'salade', 'batavia']],
  ['concombre', 'Concombre', 'fruits_legumes', 'unité', ['concombres']],
  ['citron', 'Citron', 'fruits_legumes', 'unité', ['citrons', 'citron jaune']],
  ['citron_vert', 'Citron vert', 'fruits_legumes', 'unité', ['citrons verts']],
  ['banane', 'Bananes', 'fruits_legumes', 'unité', ['banane']],
  ['pomme', 'Pommes', 'fruits_legumes', 'unité', ['pomme']],
  ['fruits_rouges', 'Fruits rouges', 'fruits_legumes', 'g', ['framboises', 'myrtilles', 'fruits rouges frais']],
  ['gingembre', 'Gingembre frais', 'fruits_legumes', 'g', ['gingembre']],
  ['persil', 'Persil', 'fruits_legumes', 'bouquet', ['persil plat']],
  ['coriandre', 'Coriandre', 'fruits_legumes', 'bouquet', ['coriandre fraiche']],
  ['basilic', 'Basilic', 'fruits_legumes', 'bouquet', ['basilic frais']],
  ['ciboulette', 'Ciboulette', 'fruits_legumes', 'bouquet', []],
  ['epinard', 'Épinards frais', 'fruits_legumes', 'g', ['epinards', 'pousses d epinard']],
  ['avocat', 'Avocat', 'fruits_legumes', 'unité', ['avocats']],
  // Viandes
  ['poulet_filet', 'Blanc de poulet', 'viandes', 'g', ['blancs de poulet', 'filet de poulet', 'filets de poulet', 'escalope de poulet']],
  ['poulet_entier', 'Poulet entier', 'viandes', 'unité', ['poulet fermier', 'poulet a rotir']],
  ['boeuf_hache', 'Bœuf haché', 'viandes', 'g', ['viande hachee', 'boeuf hache', 'steak hache']],
  ['lardons', 'Lardons', 'viandes', 'g', ['lardons fumes', 'allumettes de lardons']],
  ['jambon', 'Jambon blanc', 'viandes', 'tranche', ['jambon', 'jambon cuit']],
  // Poissons
  ['saumon', 'Pavé de saumon', 'poissons', 'unité', ['saumon', 'paves de saumon', 'filet de saumon']],
  ['cabillaud', 'Dos de cabillaud', 'poissons', 'unité', ['cabillaud']],
  ['crevette', 'Crevettes', 'poissons', 'g', ['crevettes decortiquees']],
  // Laitiers
  ['lait', 'Lait demi-écrémé', 'laitiers', 'ml', ['lait', 'lait demi ecreme']],
  ['lait_entier', 'Lait entier', 'laitiers', 'ml', []],
  ['beurre', 'Beurre', 'laitiers', 'g', ['beurre doux']],
  ['creme_entiere', 'Crème entière', 'laitiers', 'ml', ['creme liquide entiere', 'creme fraiche entiere liquide', 'creme liquide', 'creme entiere liquide']],
  ['creme_legere', 'Crème légère', 'laitiers', 'ml', ['creme liquide legere', 'creme allegee']],
  ['creme_epaisse', 'Crème fraîche épaisse', 'laitiers', 'g', ['creme fraiche', 'creme epaisse']],
  ['oeuf', 'Œufs', 'laitiers', 'unité', ['oeuf', 'oeufs', 'œuf', 'œufs', 'oeufs frais']],
  ['yaourt', 'Yaourt nature', 'laitiers', 'pot', ['yaourt', 'yaourts', 'yaourt grec']],
  ['lait_coco', 'Lait de coco', 'epicerie', 'ml', ['lait de coco']],
  // Fromages
  ['parmesan', 'Parmesan', 'fromages', 'g', ['parmigiano', 'parmesan rape']],
  ['gruyere', 'Gruyère râpé', 'fromages', 'g', ['gruyere', 'emmental rape', 'fromage rape']],
  ['mozzarella', 'Mozzarella', 'fromages', 'g', ['mozza']],
  ['feta', 'Feta', 'fromages', 'g', []],
  // Épicerie
  ['farine', 'Farine de blé', 'epicerie', 'g', ['farine', 'farine t45', 'farine t55'], { pantry: true }],
  ['sucre', 'Sucre', 'epicerie', 'g', ['sucre en poudre', 'sucre blanc'], { pantry: true }],
  ['sucre_vanille', 'Sucre vanillé', 'epicerie', 'sachet', ['sachet de sucre vanille']],
  ['levure', 'Levure chimique', 'epicerie', 'sachet', ['levure', 'poudre a lever']],
  ['chocolat_noir', 'Chocolat noir pâtissier', 'epicerie', 'g', ['chocolat noir', 'chocolat patissier']],
  ['huile_olive', "Huile d'olive", 'epicerie', 'c. à soupe', ['huile d olive', 'huile'], { pantry: true }],
  ['huile_neutre', 'Huile neutre', 'epicerie', 'c. à soupe', ['huile de tournesol', 'huile vegetale'], { pantry: true }],
  ['sel', 'Sel', 'epicerie', 'pincée', ['sel fin', 'gros sel', 'fleur de sel'], { pantry: true }],
  ['poivre', 'Poivre', 'epicerie', 'pincée', ['poivre noir', 'poivre du moulin'], { pantry: true }],
  ['muscade', 'Noix de muscade', 'epicerie', 'pincée', ['muscade'], { pantry: true }],
  ['curry', 'Curry en poudre', 'epicerie', 'c. à café', ['curry', 'pate de curry'], { pantry: true }],
  ['cumin', 'Cumin', 'epicerie', 'c. à café', ['cumin moulu'], { pantry: true }],
  ['paprika', 'Paprika', 'epicerie', 'c. à café', ['paprika doux', 'piment doux'], { pantry: true }],
  ['herbes_provence', 'Herbes de Provence', 'epicerie', 'c. à café', ['thym', 'herbes'], { pantry: true }],
  ['bouillon', 'Bouillon cube', 'epicerie', 'unité', ['cube de bouillon', 'bouillon de volaille', 'bouillon de legumes'], { pantry: true }],
  ['tomate_concassee', 'Tomates concassées', 'epicerie', 'boîte', ['tomates pelees', 'pulpe de tomate', 'coulis de tomate']],
  ['concentre_tomate', 'Concentré de tomate', 'epicerie', 'c. à soupe', ['double concentre de tomate'], { pantry: true }],
  ['haricot_rouge', 'Haricots rouges', 'epicerie', 'boîte', ['haricots rouges en boite']],
  ['miel', 'Miel', 'epicerie', 'c. à soupe', [], { pantry: true }],
  ['sirop_erable', "Sirop d'érable", 'epicerie', 'c. à soupe', ['sirop d erable']],
  ['moutarde', 'Moutarde', 'epicerie', 'c. à café', ['moutarde de dijon'], { pantry: true }],
  ['vinaigre', 'Vinaigre', 'epicerie', 'c. à soupe', ['vinaigre balsamique', 'vinaigre de vin'], { pantry: true }],
  ['sauce_soja', 'Sauce soja', 'epicerie', 'c. à soupe', ['soja'], { pantry: true }],
  ['vin_blanc', 'Vin blanc sec', 'boissons', 'ml', ['vin blanc']],
  ['eau', 'Eau', 'boissons', 'ml', ['eau froide', 'eau chaude', 'eau tiede'], { skip: true }],
  // Féculents
  ['pates', 'Pâtes', 'feculents', 'g', ['pates', 'penne', 'spaghetti', 'tagliatelles', 'fusilli', 'rigatoni']],
  ['riz', 'Riz basmati', 'feculents', 'g', ['riz', 'riz blanc']],
  ['riz_risotto', 'Riz arborio', 'feculents', 'g', ['riz a risotto', 'riz carnaroli']],
  ['lentille_corail', 'Lentilles corail', 'feculents', 'g', ['lentilles corail']],
  ['flocons_avoine', "Flocons d'avoine", 'feculents', 'g', ['flocons d avoine', 'avoine']],
  ['semoule', 'Semoule', 'feculents', 'g', ['couscous', 'boulgour']],
  ['pate_brisee', 'Pâte brisée', 'laitiers', 'unité', ['pate brisee', 'rouleau de pate brisee']],
  // Boulangerie
  ['pain', 'Pain de campagne', 'boulangerie', 'tranche', ['pain', 'tartines', 'baguette']],
  ['pain_mie', 'Pain de mie', 'boulangerie', 'tranche', []],
  ['tortilla', 'Tortillas', 'boulangerie', 'unité', ['wraps']],
  // Surgelés
  ['petits_pois', 'Petits pois surgelés', 'surgeles', 'g', ['petits pois']],
  // Boissons
  ['jus_orange', "Jus d'orange", 'boissons', 'ml', ['jus d orange']],
  ['cafe', 'Café', 'boissons', 'unité', ['cafe moulu', 'capsules de cafe']],
];

export const INGREDIENTS = RAW.map(([id, name, category, unit, aliases, opts = {}]) => ({
  id, name, category, unit, aliases, ...opts,
}));
export const INGREDIENT = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

// Mots-clés pour deviner le rayon d'un article manuel non référencé
export const CATEGORY_HINTS = [
  ['hygiene', ['papier toilette', 'lessive', 'savon', 'shampo', 'dentifrice', 'eponge', 'liquide vaisselle', 'essuie tout', 'sopalin', 'couches', 'gel douche', 'deodorant', 'sac poubelle', 'nettoyant', 'javel', 'mouchoir', 'coton']],
  ['boissons', ['eau', 'jus', 'soda', 'vin', 'biere', 'sirop', 'the ', 'tisane', 'coca', 'limonade']],
  ['boulangerie', ['pain', 'baguette', 'croissant', 'brioche', 'viennoiserie']],
  ['surgeles', ['surgele', 'glace', 'frites', 'congel']],
  ['fromages', ['fromage', 'comte', 'camembert', 'chevre', 'brie', 'raclette', 'roquefort']],
  ['laitiers', ['lait', 'yaourt', 'creme', 'beurre', 'oeuf', 'skyr', 'fromage blanc', 'compote']],
  ['viandes', ['poulet', 'boeuf', 'porc', 'jambon', 'saucisse', 'dinde', 'veau', 'agneau', 'steak', 'lardon']],
  ['poissons', ['poisson', 'saumon', 'thon', 'cabillaud', 'crevette', 'moule', 'sardine']],
  ['feculents', ['pates', 'riz', 'cereales', 'quinoa', 'lentille', 'semoule', 'muesli', 'granola']],
  ['fruits_legumes', ['pomme', 'banane', 'orange', 'salade', 'tomate', 'carotte', 'fraise', 'legume', 'fruit', 'citron', 'avocat', 'kiwi', 'poire', 'raisin', 'courgette', 'concombre', 'oignon']],
  ['epicerie', ['huile', 'sucre', 'farine', 'sel', 'poivre', 'epice', 'confiture', 'chocolat', 'cafe', 'biscuit', 'conserve', 'sauce', 'ketchup', 'mayonnaise', 'moutarde', 'nutella', 'gateau']],
];
