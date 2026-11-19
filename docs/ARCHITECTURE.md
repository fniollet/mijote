# Architecture de Mijoté

Ce document explique les choix techniques, en particulier les **écarts assumés** avec la stack proposée
dans la spécification (§10.2), et montre où chaque règle métier critique (§12) est implémentée.

## 1. Vue d'ensemble

```
 iPhone / Android / PC  ──  PWA (HTML + CSS + modules JS natifs, service worker)
                               │
                 ┌─────────────┴──────────────┐
                 │  store.js                  │  cache IndexedDB + file d'attente hors ligne
                 │  (écriture optimiste)      │
                 └─────────────┬──────────────┘
                               │ HTTPS : rpc patch_record()  ·  WebSocket : Realtime
                 ┌─────────────┴──────────────┐
                 │  Supabase                  │  Auth (compte famille) · Postgres · RLS
                 │  table public.records      │  fusion par champ (jsonb ||)
                 └────────────────────────────┘
```

- `domain.js` contient **toutes** les règles métier, sans DOM ni réseau → testable (`npm test`) et réutilisable
  côté serveur (Edge Function) si l'on veut un jour centraliser le calcul.
- `model.js` relie le store aux règles. Les vues (`views/`) ne font que de l'affichage et des appels au modèle.

## 2. Écarts avec la spécification, et pourquoi

| Spécification | Choix retenu | Justification |
|---|---|---|
| React + TypeScript + Vite + Tailwind | Modules ES natifs, CSS maison, pas de build | Publication directe sur GitHub Pages sans Node, sans pipeline CI ni dépendances à maintenir ; démarrage instantané. Le code est découpé (domaine / modèle / vues) pour une migration progressive vers React/TS si besoin. |
| 13 tables relationnelles | 1 table `records` (collection, id, data jsonb, deleted, version) | Une seule politique RLS à auditer, temps réel trivial, **fusion par champ** côté serveur (§12.4) et file hors ligne générique (§8.5). Des vues SQL (`v_recipes`, `v_meal_plans`) exposent une lecture relationnelle. |
| `shopping_item_sources` stockée | Sources **calculées** à chaque affichage (`computeNeeds`) | Le besoin courant ne peut jamais dériver du planning : il est recalculé de façon déterministe. Chaque besoin porte ses sources (repas, recette, quantité) → traçabilité totale (§12.2). |
| `shopping_item_purchases` | Collection `purchases` | Identique dans l'esprit : historique des achats indépendant du besoin (§6.10, §12.3). |
| Photos dans Supabase Storage | Photo compressée (≤ 1000 px, JPEG) dans l'enregistrement | Zéro configuration supplémentaire. Évolution possible vers Storage sans changer l'interface. |
| DECIMAL pour les quantités | Nombres arrondis au millième (`round3`) | JSON n'a pas de DECIMAL ; l'arrondi systématique au 1/1000 évite les erreurs flottantes visibles (§12.6). |

## 3. Correspondance des données

| Table de la spec | Collection Mijoté | Notes |
|---|---|---|
| families | `settings/family` + compte Auth | `family_id = auth.uid()` |
| family_members | `members` | `active` pour désactiver sans perdre l'historique |
| recipes, recipe_ingredients, recipe_steps | `recipes` (ingrédients et étapes imbriqués) | bibliothèque intégrée dans `data/recipes.js` (family_id nul) |
| ingredients, ingredient_aliases | `data/ingredients.js` | référentiel global, synonymes, rayon, placard |
| recipe_favorites | `favorites` (`membre__recette`) | favoris personnels |
| meal_plans | `meals` | `kind` : recipe / free / out |
| shopping_lists | `settings.shopSession` + `shopRange` | nouvelle session = nouvelle liste, historique conservé |
| shopping_items (manuels) | `items` | jamais touchés par le recalcul |
| shopping_item_purchases | `purchases` | qui, quand, quelle quantité |

## 4. Règles critiques (§12) — où les trouver

| Règle | Implémentation | Test |
|---|---|---|
| 12.1 Isolation familiale | `supabase/schema.sql` (RLS, aucune policy DELETE, anon révoqué) | — |
| 12.2 Traçabilité des courses | `computeNeeds()` → `sources[]` ; écran « Pourquoi cet article ? » | ✔ |
| 12.3 Préservation des achats | `buildShoppingList()` : `noLongerNeeded`, `surplus`, `partial` | ✔ ✔ ✔ |
| 12.4 Modifications simultanées | `patch_record()` fusion jsonb par champ ; alerte de conflit dans l'éditeur de recette | testé à 2 appareils |
| 12.5 Suppression des recettes | archivage uniquement ; repas existants intacts | — |
| 12.6 Précision | `round3`, arrondis d'affichage séparés (`fmtQty`) | ✔ |
| 12.7 Traçabilité auteur | `createdBy/updatedBy/authorId`, `_by/_u` sur chaque écriture | — |

## 5. Synchronisation et hors ligne

1. Toute écriture (`store.put`) est appliquée localement, persistée en IndexedDB et ajoutée à l'*outbox*.
2. L'outbox est envoyée dans l'ordre via `patch_record` ; en cas d'erreur réseau elle est conservée et rejouée
   (retour du réseau, retour au premier plan, toutes les 15 s).
3. Les changements des autres appareils arrivent par Realtime ; une modification locale encore en attente reste
   prioritaire sur l'enregistrement reçu (pas de « clignotement »).
4. À la reconnexion, un `pull` différentiel (`updated_at > dernière synchro`) rattrape ce qui a été manqué.

## 6. Pistes d'évolution (§14)

L'architecture accueille sans refonte : suggestions et menus IA (proposition → validation), import de recettes
(texte/URL → formulaire d'édition pré-rempli), placards (nouvelle collection + soustraction dans `buildShoppingList`),
budget (prix sur le référentiel), historique des semaines (les repas passés sont déjà conservés).
