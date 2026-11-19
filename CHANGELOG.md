# Historique des versions

## 1.1.0 — Stock, « que cuisiner ? » et confort au quotidien
**Base de données : lancer `supabase/migration-v1.1.sql` une fois.**

### Nouveau
- **Chez moi** (onglet dans Courses) : stock frigo / congélateur / placard.
  - Alimenté automatiquement quand on coche un article (achat complet ou partiel).
  - Ajout manuel (« 6 œufs », « 1 kg riz »), rangement, date de péremption, « à consommer vite », « périmé ».
  - Utilisé · utilisé en partie · jeté · retirer les périmés — avec « Annuler ».
  - Sel, huile, épices… non suivis (restent « au placard / à vérifier »).
- **Courses moins le stock** : ce qui est déjà à la maison va dans « Déjà à la maison » ; si le stock couvre une partie, seul le reste est à acheter.
- **Mode cuisine** : à la fin, proposition de retirer du stock les ingrédients utilisés (cases à décocher).
- **Que cuisiner avec ce que j'ai ?** : filtre « Avec mon stock » dans Recettes (« ✓ Tout en stock », « Manque 2 »).
- **Articles fréquents** : pastilles sous la barre d'ajout (historique de la famille + classiques).
- **Ordre des rayons** personnalisable (Courses → ⋯, ou Réglages).
- **Reprendre une semaine passée** (Planning → ⋯, ou bouton sur une semaine vide).
- **Coller une recette en texte** : analyse du titre, des portions, des temps, des ingrédients (quantités, unités, notes) et des étapes (minuteurs, températures), puis vérification avant enregistrement.
- **Inviter** : message prêt à envoyer (membre de la famille / autre famille) + QR code.
- **État de la synchro** dans Réglages : dernière synchro, modifications en attente, dernière erreur.

### Améliorations
- « Annuler » sur la plupart des actions (planning, courses, stock, recettes).
- Message d'erreur explicite si la base n'accepte pas encore le stock.
- Service worker plus robuste (un fichier manquant ne bloque plus l'installation hors ligne).

## 1.0.3
- Achat partiel, bouton « Annuler » après avoir coché, correction des achats.
- `schema.sql` : droits `GRANT` pour le rôle `authenticated` (corrige « 42501 permission denied »).

## 1.0.2
- Diagnostic : la pastille de synchro affiche la cause exacte d'un échec.

## 1.0.1
- Synchro robuste sur iPhone : renouvellement du jeton, nouvelles tentatives, reconnexion temps réel, synchro forcée en touchant la pastille.

## 1.0.0
- Première version : planning, recettes, courses, mode cuisine, espace familial, PWA.
