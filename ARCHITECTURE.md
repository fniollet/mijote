# Architecture de Mijoté (v1.1)

## 1. Vue d'ensemble

```
 Téléphones / PC ── PWA (HTML + CSS + modules JS natifs, service worker) ── GitHub Pages
        │
   store.js : cache IndexedDB + file d'attente hors ligne + écriture optimiste
        │  HTTPS : rpc patch_record()   ·   WebSocket : Realtime
   Supabase : Auth (1 compte = 1 famille) · Postgres public.records · RLS · Realtime
```

- `domain.js` : **toutes** les règles métier, sans DOM ni réseau → testées (`npm test`).
- `model.js` : relie le store aux règles ; les actions de courses/stock retournent une fonction d'annulation.
- `views/` : affichage uniquement.

## 2. Écarts assumés avec la spécification

| Spécification | Choix | Pourquoi |
|---|---|---|
| React + TS + Vite + Tailwind | JS natif, CSS maison, aucun build | Publication directe sur GitHub Pages, rien à maintenir |
| 13 tables | 1 table `records` (collection, id, data jsonb) | Une seule règle RLS, synchro générique, fusion par champ |
| `shopping_item_sources` stockée | Sources recalculées (`computeNeeds`) | Le besoin ne peut pas diverger du planning |
| Photos dans Storage | Photo compressée dans la recette | Zéro configuration |
| DECIMAL | Nombres arrondis au 1/1000 (`round3`) | JSON n'a pas de DECIMAL |

## 3. Collections

| Collection | Contenu |
|---|---|
| `settings/family` | nom, portions, horaires, période et session de courses, **ordre des rayons**, préférences |
| `members` | prénom, couleur, avatar, actif |
| `recipes` | recettes familiales (ingrédients et étapes imbriqués) |
| `meals` | repas planifiés |
| `items` | articles de courses manuels (`qty` restante, `bought` déjà acheté) |
| `purchases` | historique des achats d'articles issus du planning |
| `favorites` | favoris personnels |
| **`stock`** (v1.1) | lots : `key`, `name`, `qty` (unité de base), `unit`, `category`, `location` (frigo/congel/placard), `expires`, `source` (courses/manuel), `session`, `fromPurchase`, `fromItem`, `addedBy`, `addedAt` |

## 4. Règles des courses et du stock

1. **Clé commune** : ingrédient référencé (ou nom normalisé) + unité de base (`g`, `ml`, `unité`…). 1 kg de pâtes en stock couvre 400 g de besoin.
2. **Besoins** = repas planifiés de la période × portions (`computeNeeds`).
3. **Couverture par le stock** (`buildShoppingList`) : les lots achetés pendant la **session de courses en cours** sont exclus (déjà comptés comme achetés). Besoin couvert → « Déjà à la maison » ; partiellement → seul le reste est à acheter.
4. **Achats** jamais supprimés par un recalcul (surplus, « plus nécessaire », reste à acheter).
5. **Cocher** = achat + lot de stock lié (`fromPurchase` / `fromItem`). **Décocher / retirer un achat** = suppression des lots liés.
6. **Consommation** (`planConsumption`) : lots dont la péremption est la plus proche d'abord.
7. Produits de placard (`pantry` : sel, huile, épices…) et rayons hygiène / autres : non suivis en stock.

## 5. Import texte (`parseRecipeText`)
Repère : titre (première ligne courte), portions (« pour 6 personnes »), « Préparation : 30 min », « Cuisson : 1 h », sections « Ingrédients » / « Préparation » (ou heuristiques sans sections), quantités (`250`, `1/2`, `½`, `1,5`), unités (g, kg, ml, cl, l, c. à soupe, cs, cas, pincée, gousse…), notes entre parenthèses, « facultatif », étapes numérotées, durées et températures. Le résultat s'ouvre **toujours** dans l'éditeur pour vérification.

## 6. Synchronisation
Écriture locale immédiate → outbox persistante → `patch_record` (fusion jsonb champ par champ) → diffusion Realtime.
Jeton rafraîchi avant chaque synchro, nouvelles tentatives (2 s → 60 s), reconnexion au retour au premier plan, relecture différentielle toutes les 60 s, synchro forcée en touchant la pastille.
