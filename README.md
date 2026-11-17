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
Configurer les variables suivantes (sans jamais exposer `service_role` côté client) :
- `VITE_SUPABASE_URL` : URL du projet Supabase (`https://<project-ref>.supabase.co`).
- `VITE_SUPABASE_ANON_KEY` : clé publique `anon` du projet Supabase.
- `VITE_AUDIO_BASE_URL` *(optionnel)* : URL de base des paquets audio si hébergés sur un domaine/CDN externe. Si défini sur un autre domaine, ajouter ce domaine dans `connect-src` et `media-src` de `public/_headers`.

### 2. Réglages Supabase
1. Créer un projet Supabase et ouvrir **SQL Editor**.
2. Coller et exécuter `supabase/migrations/001_init.sql` (table `learner_profiles`, RLS, limite de 4 profils par utilisateur, `delete_my_account()`, `ping()`).
3. Dans **Authentication > URL Configuration** :
   - **Site URL** : URL de production Cloudflare Pages (ex. `https://diang-anglais.pages.dev`).
   - **Redirect URLs** : ajouter `https://diang-anglais.pages.dev/**` et `http://localhost:5173/**`.
4. Dans **Authentication > Providers** : activer **Email** (avec confirmation par e-mail) et **Google**.

### 3. Réglages Google Cloud (OAuth)
1. Dans Google Cloud Console, configurer l'écran de consentement OAuth et créer des identifiants **Client OAuth Web**.
2. Ajouter l'URI de redirection autorisée fournie par Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`).
3. Renseigner le Client ID et le Client Secret dans **Supabase > Authentication > Providers > Google**.

### 4. Réglages Cloudflare Pages
- **Build command** : `npm run build`
- **Build output directory** : `dist`
- **Variables d'environnement** (Production & Preview) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (et optionnellement `VITE_AUDIO_BASE_URL`).
- Les fichiers `public/_headers` (CSP stricte, HSTS, règles de cache) et `public/_redirects` (SPA fallback) sont automatiquement copiés dans `dist/`.
- Exécuter `npm run check:deploy` après `npm run build` pour vérifier que `dist/` respecte les limites Cloudflare Pages (< 20 000 fichiers, aucun fichier > 25 Mo).

### 5. Keep-alive GitHub Actions (plan gratuit Supabase)
Pour éviter la mise en pause automatique d'un projet Supabase gratuit, ajouter dans **GitHub > Settings > Secrets and variables > Actions** :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Le workflow `.github/workflows/keepalive.yml` appelle automatiquement `ping()` tous les 3 jours.
