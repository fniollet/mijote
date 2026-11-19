# 🍲 Mijoté — les repas de la famille, mijotés ensemble

**Planning des repas · Livre de recettes familial · Courses partagées en temps réel · Stock du frigo · Mode cuisine**

Mijoté est une application web progressive (PWA) installable sur iPhone, Android, iPad et ordinateur.
Tout est relié : on planifie un plat → les ingrédients arrivent dans les courses, adaptés au nombre de personnes,
**moins ce qu'on a déjà à la maison** → on coche au supermarché → les produits entrent dans « Chez moi » →
on cuisine → le stock se met à jour. Toute la famille voit tout, instantanément.

Version actuelle : **1.1.0** — voir [CHANGELOG.md](CHANGELOG.md).

---

## ✨ Fonctionnalités

| Module | Ce que ça fait |
|---|---|
| **Accueil** | Prochain repas mis en avant (compte à rebours, ingrédients, bouton « Cuisiner »), repas du jour, progression des courses, aperçu de la semaine, widget « Chez moi » (produits à consommer vite), raccourcis |
| **Planning** | Semaine en grille (ordinateur) ou cartes (téléphone), matin/midi/soir, glisser-déposer, déplacer, copier, répéter, dupliquer un jour, copier la semaine, **reprendre une semaine passée**, repas libres, portions par repas, « Annuler » partout |
| **Recettes** | 14 recettes intégrées, création avec photo, **import d'une recette collée en texte**, ingrédients reliés au référentiel, étapes avec minuteur, auteur, favoris personnels, recherche, filtres, **« Avec mon stock » (que cuisiner avec ce que j'ai ?)**, archivage |
| **Courses** | Génération depuis le planning, **déduction du stock**, regroupement et conversion d'unités, **rayons dans l'ordre de votre magasin**, **articles fréquents en un geste**, saisie rapide, **achat partiel** (2 sur 3), traçabilité, qui a acheté quoi, achats jamais perdus, mode magasin, partage |
| **Chez moi** | Stock **frigo / congélateur / placard** alimenté automatiquement par les courses, ajout manuel, péremptions (« à consommer vite », « périmé »), utilisé / utilisé en partie / jeté, recherche |
| **Mode cuisine** | Plein écran, une étape à la fois, minuteurs multiples, écran allumé, **mise à jour du stock à la fin** |
| **Famille** | Espace partagé, profils, **inviter (message prêt + QR code)**, préférences alimentaires, thème, **état de la synchro**, sauvegarde / restauration |

---

## 🚀 Installation (≈ 15 minutes, gratuit)

### 1. Mettre le code sur GitHub
1. [github.com](https://github.com) → **+** → **New repository** → nom `mijote`, **Public** → **Create repository**.
2. **uploading an existing file** → glissez **tout le contenu** du dossier `mijote` → **Commit changes**.

### 2. Publier avec GitHub Pages
**Settings** → **Pages** → *Deploy from a branch* · `main` · `/ (root)` → **Save**.
L'adresse apparaît après 1–2 min : `https://VOTRE-PSEUDO.github.io/mijote/`

### 3. Synchroniser la famille (Supabase, gratuit)
1. [supabase.com](https://supabase.com) → **New project** (région proche de chez vous).
2. **SQL Editor** → **New query** → collez **tout** `supabase/schema.sql` → **Run** (« Success »).
3. **Authentication → URL Configuration** : *Site URL* et *Redirect URLs* = l'adresse GitHub Pages.
4. *(Recommandé)* **Authentication → Sign In / Providers → Email** → désactivez **Confirm email**.
5. **Project Settings → API Keys → Legacy API Keys** : copiez **Project URL** et la clé **anon public** (`eyJ…`).
6. Sur GitHub, éditez `config.js` :
   ```js
   window.MIJOTE_CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
   };
   ```
   ⚠️ Vérifiez les **guillemets fermants** et que la clé tient sur **une seule ligne**. Ne mettez **jamais** la clé `service_role`.

Premier appareil : **Créer notre espace familial**. Autres appareils : **Rejoindre ma famille** (mêmes identifiants).
Chaque autre famille crée son propre espace avec son propre e-mail : les familles ne se voient jamais entre elles.

---

## ⬆️ Mettre à jour une installation existante (v1.0.x → v1.1)

1. **Supabase → SQL Editor** : lancez `supabase/migration-v1.1.sql` (une fois, sans risque).
2. **GitHub → Add file → Upload files** : glissez le contenu du dossier de mise à jour (**sans** `config.js`) → **Commit changes**.
3. Attendez la coche verte dans **Actions**, puis fermez et rouvrez l'app (« Nouvelle version disponible → Recharger »).

---

## 📱 Installer sur iPhone
Safari → l'adresse de l'app → **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
Android : Chrome → ⋮ → *Installer l'application*. Ordinateur : icône d'installation dans la barre d'adresse.

---

## 🧑‍💻 Développement
Aucune compilation : modules JavaScript natifs, HTML et CSS.
```bash
npm start   # serveur local http://localhost:8080
npm test    # 18 tests des règles métier (Node 18+)
```
Après toute publication, augmentez `VERSION` dans `sw.js` (force la mise à jour des téléphones).

### Structure
```
index.html · styles.css · config.js · manifest.webmanifest · sw.js
icons/                    Icônes iOS / Android
supabase/schema.sql       Base complète (installation neuve)
supabase/migration-v1.1.sql  Mise à jour depuis v1.0.x
js/app.js                 Démarrage, routeur, navigation
js/store.js               Cache local, file hors ligne, synchro temps réel
js/domain.js              ⭐ Règles métier pures (portions, unités, courses, stock, import texte)
js/model.js               Actions métier (repas, recettes, courses, stock, famille)
js/data/                  Référentiel d'ingrédients · recettes intégrées
js/views/                 Accueil, Planning, Recettes, Fiche, Éditeur, Courses + Chez moi, Cuisine, Réglages
tests/domain.test.mjs     Tests automatisés
docs/ARCHITECTURE.md      Choix techniques
```

## 🔒 Sécurité
Authentification Supabase, HTTPS, isolation des familles par Row Level Security, aucune suppression physique depuis l'app,
sauvegarde JSON depuis **Réglages**. Les alertes d'allergènes sont indicatives et jamais garanties.

## 📄 Licence
MIT.
