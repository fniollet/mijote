# 🍲 Mijoté — les repas de la famille, mijotés ensemble

**Planning des repas · Livre de recettes familial · Liste de courses partagée en temps réel · Mode cuisine**

Mijoté est une application web progressive (PWA) installable sur iPhone, Android, iPad et ordinateur.
Tout est relié : on planifie un plat → les ingrédients arrivent dans les courses, regroupés par rayon et
adaptés au nombre de personnes → on coche au supermarché → toute la famille le voit instantanément.

---

## ✨ Fonctionnalités

| Module | Ce que ça fait |
|---|---|
| **Accueil** | Salutation personnalisée, prochain repas mis en avant (compte à rebours, ingrédients, bouton « Cuisiner »), les 3 repas du jour, anneau de progression des courses, aperçu de la semaine, raccourcis |
| **Planning** | Semaine en grille (ordinateur) ou en cartes (téléphone), matin/midi/soir, **glisser-déposer** (souris ou appui long), déplacer, copier, répéter sur plusieurs jours, dupliquer une journée ou une semaine, repas libres (restes, restaurant, chez les grands-parents…), portions par repas, annulation |
| **Recettes** | 14 recettes intégrées, création avec photo ou illustration, ingrédients reliés à un référentiel (synonymes), étapes avec minuteur et température, auteur conservé, favoris personnels, recherche (nom, ingrédient, auteur, catégorie), 14 filtres, 5 tris, archivage (jamais de suppression), partage |
| **Courses** | Génération automatique depuis le planning, regroupement intelligent (20 cl + 200 ml = 400 ml), unités incompatibles jamais additionnées, rayons, « au placard » à part, saisie rapide (« 2 l lait »), **traçabilité** (« pourquoi cet article ? »), qui a acheté quoi, **achats jamais perdus** quand le planning change, mode magasin (écran allumé), partage par SMS/WhatsApp, confettis 🎉 |
| **Mode cuisine** | Plein écran sombre, une étape à la fois (glisser ou flèches), quantités recalculées, ingrédients de l'étape affichés, **minuteurs multiples** (pause, reprise, alarme sonore + vibration + notification), écran maintenu allumé |
| **Famille** | Espace familial partagé, profils avec avatar et couleur, choix du profil par appareil, préférences alimentaires (alertes non garanties), horaires des repas, thème clair/sombre/auto, sauvegarde/restauration JSON |
| **Expérience** | Écran d'ouverture animé, écran « À bientôt » à la fermeture, notifications quand un proche modifie quelque chose, fonctionne hors ligne, synchronisation automatique sans bouton |

---

## 🚀 Mise en ligne en 3 étapes (≈ 10 minutes, gratuit)

### Étape 1 — Mettre le code sur GitHub

**Option A : sans ligne de commande (le plus simple)**

1. Créez un compte sur [github.com](https://github.com) si besoin.
2. En haut à droite : **+** → **New repository**.
3. Nom : `mijote` · Visibilité : **Public** · ne cochez rien d'autre → **Create repository**.
4. Sur la page du dépôt vide, cliquez sur **uploading an existing file**.
5. Décompressez le zip, ouvrez le dossier `mijote`, **sélectionnez tout son contenu** (pas le dossier lui-même) et glissez-le dans la page.
   > ⚠️ Le fichier `.nojekyll` est caché sur Mac (`Cmd + Maj + .` pour l'afficher). Il est recommandé, mais l'application fonctionne sans.
6. **Commit changes**.

**Option B : avec Git**

```bash
cd mijote
git init
git add .
git commit -m "Mijoté 1.0"
git branch -M main
git remote add origin https://github.com/VOTRE-PSEUDO/mijote.git
git push -u origin main
```

### Étape 2 — Publier avec GitHub Pages

1. Dans le dépôt : **Settings** → **Pages** (menu de gauche).
2. **Source** : *Deploy from a branch* · **Branch** : `main` · dossier `/ (root)` → **Save**.
3. Patientez 1 à 2 minutes puis rafraîchissez : l'adresse s'affiche, du type
   **`https://VOTRE-PSEUDO.github.io/mijote/`**

🎉 L'application est en ligne. Sans l'étape 3, chaque appareil garde ses propres données (mode « cet appareil »).

### Étape 3 — Synchroniser toute la famille (Supabase, gratuit)

1. Créez un compte sur [supabase.com](https://supabase.com) → **New project** (choisissez une région proche, ex. *West EU (Paris)*, et notez le mot de passe de la base).
2. Menu **SQL Editor** → **New query** → collez **tout** le contenu de `supabase/schema.sql` → **Run**. (« Success. No rows returned » = parfait.)
3. Menu **Authentication** → **URL Configuration** :
   - **Site URL** : `https://VOTRE-PSEUDO.github.io/mijote/`
   - **Redirect URLs** : ajoutez la même adresse (nécessaire pour « mot de passe oublié »).
4. *(Recommandé pour simplifier)* **Authentication** → **Sign In / Providers** → **Email** → désactivez **Confirm email**. Sinon, il faudra cliquer sur le lien reçu par e-mail avant la première connexion (géré par l'app).
5. **Project Settings** → **API** (ou **Data API / API Keys**) : copiez **Project URL** et la clé **anon public**.
6. Sur GitHub, ouvrez `config.js` → icône ✏️ → collez les deux valeurs :
   ```js
   window.MIJOTE_CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   };
   ```
   → **Commit changes**. Une minute plus tard, c'est en ligne.

> 🔐 La clé *anon* est publique par conception : la sécurité repose sur les politiques RLS installées par `schema.sql` (chaque famille ne voit que ses données). **Ne mettez jamais la clé `service_role`** dans ce fichier.
> Les offres gratuites ont des limites (taille, mise en pause des projets inactifs…) : vérifiez-les sur la page *Pricing* de Supabase.

**Ensuite :**
- Sur le premier appareil : **Créer notre espace familial** → nom, membres, portions, puis l'e-mail et le mot de passe de la famille.
- Sur chaque autre appareil : **Rejoindre ma famille** → mêmes identifiants → « Qui êtes-vous ? ».

---

## 📱 Installer sur iPhone (comme une vraie app)

1. Ouvrez **Safari** (pas un autre navigateur, pour l'installation) à l'adresse `https://VOTRE-PSEUDO.github.io/mijote/`.
2. Touchez le bouton **Partager** (carré avec une flèche vers le haut, en bas de l'écran — ou dans le menu **•••** sur les versions récentes d'iOS).
3. Faites défiler et choisissez **« Sur l'écran d'accueil »**.
4. Vérifiez le nom **Mijoté** → **Ajouter**.
5. Lancez Mijoté depuis sa nouvelle icône : plein écran, sans barre Safari, avec l'écran d'ouverture animé.

Répétez sur l'iPhone de chaque membre de la famille. Pour **Android** : Chrome → menu ⋮ → *Installer l'application*. Pour **ordinateur** (Chrome/Edge) : icône d'installation dans la barre d'adresse.

> 💡 Notifications de fin de minuteur : sur iPhone, elles ne fonctionnent que dans l'app **installée** (iOS 16.4 ou plus) et après avoir accepté l'autorisation. Une alarme sonore et une vibration sont toujours jouées quand l'app est ouverte ; les minuteurs restent exacts même si l'écran se verrouille.

---

## 🧑‍💻 Développement

Aucune installation ni compilation : modules JavaScript natifs, HTML et CSS.

```bash
npm start     # serveur local sur http://localhost:8080 (via npx http-server)
npm test      # 13 tests des règles métier (Node 18+)
```

Après une modification publiée, augmentez `VERSION` dans `sw.js` pour forcer le rafraîchissement du cache hors ligne (l'app affiche alors « Nouvelle version disponible »).

### Structure

```
index.html              Coquille de l'application
styles.css              Design system complet (clair + sombre)
config.js               Connexion Supabase (optionnelle)
manifest.webmanifest    Installation PWA
sw.js                   Service worker (hors ligne, mises à jour)
icons/                  Icônes iOS / Android / favicon
supabase/schema.sql     Base de données + sécurité RLS + temps réel
js/
  app.js                Démarrage, routeur, navigation
  store.js              Données : cache local, file hors ligne, synchro temps réel
  domain.js             ⭐ Règles métier pures (portions, unités, courses)
  model.js              Actions métier (repas, recettes, courses, famille)
  data/ingredients.js   Référentiel d'ingrédients (synonymes, rayons)
  data/recipes.js       Bibliothèque de recettes intégrée
  intro.js              Écrans d'ouverture et de fermeture
  onboarding.js         Création / connexion de l'espace familial
  ui.js, icons.js       Composants d'interface
  views/                Accueil, Planning, Recettes, Fiche, Éditeur, Courses, Cuisine, Réglages
tests/domain.test.mjs   Tests automatisés (scénario §17.4 de la spécification)
docs/ARCHITECTURE.md    Choix techniques et correspondance avec la spécification
```

---

## 🔒 Sécurité & confidentialité

- Authentification Supabase (mots de passe hachés, jamais stockés en clair), HTTPS obligatoire.
- Isolation stricte des familles par **Row Level Security** côté serveur (`family_id = auth.uid()`), jamais par un simple filtre d'interface.
- Aucune suppression physique depuis l'app : suppressions = archivage ou drapeau.
- Sauvegarde : **Réglages → Exporter une sauvegarde** (fichier JSON), plus les sauvegardes de Supabase selon votre offre.
- Le compte familial partagé est un compromis volontaire (spécification §13) : quiconque connaît les identifiants accède à l'espace.
- Les alertes d'allergènes sont indicatives et **jamais garanties**.

## 📄 Licence

MIT — libre d'utilisation, de modification et de partage.
