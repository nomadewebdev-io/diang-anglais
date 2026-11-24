# Vérification Diang-Anglais — Déploiement Appwrite Cloud (`appwrite.config.json`) & Cloudflare Pages

## Critères vérifiés
- [x] **Configuration Appwrite CLI (`appwrite.config.json`)** : renommage de `appwrite.json` en `appwrite.config.json`, `projectId = "6b041249002b54c1ab44"`, `endpoint = "https://fra.cloud.appwrite.io/v1"`, clé `tablesDB` compatible Appwrite CLI v28.14.0.
- [x] **Base de données & Table (`diang-anglais-db` / `learner_profiles`)** : déployées sur Appwrite Cloud (`fra.cloud.appwrite.io`), `rowSecurity: true`, permission table `create("users")` uniquement (aucun rôle `any`), colonne `data` en `mediumtext` (jusqu'à 16 Mo, couvrant ~500 Ko + compression gzip+base64 côté client au-delà de 16 Ko), index `idx_user_id` (`ASC` sur `user_id`).
- [x] **Fonctions Appwrite (`node-22` LTS)** :
  - `delete-my-account` : runtime `node-22`, execute `["users"]`, scopes minimaux `["users.read", "users.write", "rows.read", "rows.write"]`, déployée et active.
  - `enforce-profile-limit` : runtime `node-22`, événement `databases.diang-anglais-db.tables.learner_profiles.rows.*.create`, scopes minimaux `["rows.read", "rows.write"]`, déployée et active.
- [x] **Variables d'environnement (`.env` & `.env.example`)** : `VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`, `VITE_APPWRITE_DATABASE_ID`, `VITE_APPWRITE_TABLE_ID`, `VITE_ENABLE_GOOGLE_LOGIN=false` (`.env` ignoré par Git).
- [x] **Tests, Build & Budgets** :
  - `npm test` (`validate-data.js` + `vitest run`) : **10 fichiers de test, 64 tests passés**.
  - `npm run build` (`tsc -b && vite build && node scripts/check-budget.js`) : **0 erreur TypeScript, tous les budgets respectés**.
  - `npm run check:deploy` : **prêt pour Cloudflare Pages**.
