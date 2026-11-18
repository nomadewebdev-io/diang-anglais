# Vérification Diang-Anglais — Migration vers Appwrite Cloud & Cloudflare Pages

## Critères vérifiés
- [x] **Isolation du backend (`src/lib/backend/`)** : interface `BackendAdapter`, `AppwriteAdapter` (`src/lib/backend/appwrite.ts`, seul fichier important `appwrite` v29.3.1 via `TablesDB`, `Account`, `Functions`, `Permission`, `Role`, `Query`, `OAuthProvider`), et `MemoryBackendAdapter` (`src/lib/backend/memory.ts`) pour les tests.
- [x] **Base de données & Fonctions (`appwrite.json`, `functions/`)** : base `diang-anglais-db`, table `learner_profiles` (`rowSecurity: true`, création `users`, permissions document `Role.user(userId)` uniquement, compression gzip+base64 au-delà de 16 Ko), fonction `delete-my-account` (identité via `x-appwrite-user-id`, clé dynamique), fonction `enforce-profile-limit` (4 profils max par compte + contrôle côté client).
- [x] **Synchronisation local-first (`src/lib/sync.ts`, `src/App.tsx`, `vite.config.ts`)** : debounce 5 s, flush `visibilitychange`/`online`, résolution de conflit par `client_updated_at` le plus récent avec sauvegarde locale, Workbox `NetworkOnly` sur Appwrite.
- [x] **Sécurité, CSP & Déploiement (`public/_headers`, `.env.example`, `PRIVACY.md`, `README.md`)** : `VITE_APPWRITE_*`, `connect-src` Appwrite (https/wss), aucune référence à l'ancien backend ni clé API serveur, documentation Appwrite CLI + console manuelle + note plan gratuit.
- [x] **Tests, Build & Rendu** :
  - `npm test` (`validate-data.js` + `vitest run`) : **10 fichiers de test, 64 tests passés**.
  - `npm run build` (`tsc -b && vite build && node scripts/check-budget.js`) : **JS initial `110,02 ko` / `120,00 ko`**, **CSS initial `7,30 ko` / `25,00 ko`**, **Max chunk différé `103,85 ko` / `150,00 ko`**, **Max paquet audio `2,48 Mo` / `5,00 Mo` (`69,24 Mo` total)**.
  - `npm run check:deploy` : **`dist/` = `121` fichiers (`71,24 Mo`)**, prêt pour Cloudflare Pages.
  - Rendu navigateur headless Chrome CDP sur `http://localhost:4173/` : **0 erreur console**, **0 débordement horizontal** à `390x844` (`verification/mobile-390px.png`) et `1440x900` (`verification/desktop-1440px.png`).
