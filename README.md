# Diang-Anglais

Application PWA mobile-first d'apprentissage structuré de l'anglais pour francophones (niveaux CECRL A0 à B2), avec parcours adulte, mode enfant (8-12 ans), voix neuronales pré-générées et synchronisation cloud local-first.

## Développement local

```bash
npm install
cp .env.example .env
npm run dev
```

## Scripts principaux
- `npm run dev` : serveur de développement Vite (`http://localhost:5173`).
- `npm test` : validation des données (`validate-data.js`) + suite de tests Vitest.
- `npm run build` : vérification TypeScript (`tsc -b`), build Vite et contrôle des budgets (`check-budget.js`).
- `npm run check:deploy` : vérification des limites Cloudflare Pages sur `dist/` (nombre de fichiers et taille max 25 Mo).
- `npm run audio:generate` : génération/empaquetage des clips audio neuronaux avec hash de contenu.

## Déploiement

### 1. Variables d'environnement
Configurer les variables suivantes (aucune clé API serveur côté client) :
- `VITE_APPWRITE_ENDPOINT` : URL de l'API Appwrite (ex. `https://cloud.appwrite.io/v1` ou endpoint régional).
- `VITE_APPWRITE_PROJECT_ID` : identifiant du projet Appwrite.
- `VITE_APPWRITE_DATABASE_ID` : `diang-anglais-db`
- `VITE_APPWRITE_TABLE_ID` : `learner_profiles`
- `VITE_AUDIO_BASE_URL` *(optionnel)* : URL de base des paquets audio si hébergés sur un autre domaine/CDN. Si défini sur un autre domaine, ajouter ce domaine dans `connect-src` et `media-src` de `public/_headers`.

### 2. Réglages Appwrite Cloud (CLI ou Console)

> [!NOTE]
> Les projets sur le plan gratuit d'Appwrite Cloud sont mis en pause après une semaine d'inactivité. Le **plan Pro** est recommandé pour la mise en ligne publique.

#### Méthode rapide via Appwrite CLI (`appwrite.json`)
```bash
npm install -g appwrite-cli
appwrite login
# Renseigner votre projectId dans appwrite.json puis pousser les tables et fonctions :
appwrite push tables
appwrite push functions
```

#### Méthode manuelle dans la console Appwrite (secours)
1. **Plateformes Web** (**Overview > Integrations > Platforms > Add Platform > Web**) :
   - Ajouter `localhost` (développement).
   - Ajouter votre domaine Cloudflare Pages (ex. `diang-anglais.pages.dev` et votre domaine personnalisé).
2. **Base de données & Table** :
   - Créer la base `diang-anglais-db` et la table `learner_profiles`.
   - Activer **Row / Document Security** (`rowSecurity: true`) et ajouter uniquement la permission `create` pour le rôle `Users` (jamais `Any`).
   - Colonnes requises :
     - `user_id` (string, taille 64, requis, indexé `idx_user_id`)
     - `name` (string, taille 40, requis)
     - `kind` (string, taille 10, requis)
     - `data` (string, taille 524288, requis)
     - `version` (integer, min 1, requis)
     - `client_updated_at` (string, taille 40, requis)
3. **Fonctions Appwrite** (2 fonctions, compatibles plan gratuit) :
   - `delete-my-account` (dossier `functions/delete-my-account`, runtime Node 20, execute `users`, clé dynamique avec scopes `users.write`, `tables.read`, `tables.write`).
   - `enforce-profile-limit` (dossier `functions/enforce-profile-limit`, runtime Node 20, événement `databases.diang-anglais-db.tables.learner_profiles.rows.*.create`, clé dynamique avec scopes `tables.read`, `tables.write`).

### 3. Réglages Google Cloud (OAuth2)
1. Dans **Appwrite Console > Auth > Settings > OAuth2 Providers > Google**, activer Google et copier l'URI de redirection fournie par Appwrite (`https://cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/<projectId>`).
2. Dans **Google Cloud Console**, créer des identifiants **Client OAuth Web** et ajouter cette URI de redirection autorisée.
3. Renseigner le Client ID et le Client Secret dans Appwrite.

### 4. Réglages Cloudflare Pages
- **Build command** : `npm run build`
- **Build output directory** : `dist`
- **Variables d'environnement** (Production & Preview) : `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_DATABASE_ID`, `VITE_APPWRITE_TABLE_ID` (et optionnellement `VITE_AUDIO_BASE_URL`).
- Les fichiers `public/_headers` (CSP stricte, HSTS, règles de cache) et `public/_redirects` (SPA fallback) sont automatiquement copiés dans `dist/`.
- Si vous utilisez un endpoint Appwrite régional ou auto-hébergé autre que `*.appwrite.io`, adaptez `connect-src` dans `public/_headers`.
- Exécuter `npm run check:deploy` après `npm run build` pour vérifier que `dist/` respecte les limites Cloudflare Pages (< 20 000 fichiers, aucun fichier > 25 Mo).
