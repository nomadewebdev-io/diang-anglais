# Vérification Diang-Anglais — Mode Enfant (8-12 ans) & Profils Locaux

## Critères vérifiés
- [x] **Profils locaux (`src/lib/storage.ts`, `src/components/ProfileGateView.tsx`)** : jusqu'à 4 profils séparés sous `diang-anglais:v2` (progression, plan, XP, série, voix, thème, cartes vues), écran `"Qui apprend ?"` au premier lancement (`Enfant (8-12 ans)` / `Ado / Adulte`, prénom/pseudo uniquement), sélecteur à initiales dans l'en-tête, migration automatique sans perte depuis `diang-anglais:v1` vers un premier profil `"Adulte"`.
- [x] **Espace parent (`src/lib/parentGate.ts`, `src/components/ParentGateModal.tsx`)** : calcul de contrôle aléatoire (ex. `7 × 8`) sur les profils enfant pour accéder aux Paramètres, au changement de profil, à l'export/import JSON et à la réinitialisation.
- [x] **Interface & rythme enfant** : classe `.child-mode` (police >= 18 px, cibles tactiles >= 56 px), tutoiement, phrases courtes et bienveillantes, vitesse vocale par défaut `0,85x`, seuils de classement SM-2 ×2 (`src/lib/srs.ts`), séances courtes (5 à 8 min), pause conseillée après 2 séances bonus, emoji visible avant réponse sur les cartes enfant.
- [x] **Contenu enfant séparé (`src/data/kids/*`, `src/lib/catalog.ts`)** : 40 cartes, 4 leçons, 24 questions de test (adaptatif sur `A0/A1/A2`, 12 questions, sans minuteur visible), 30 phrases et 20 constructions validées par `scripts/validate-data.js`, sans jamais mélanger les contenus adulte et enfant.
- [x] **Vie privée (`PRIVACY.md`)** : stockage 100 % local, aucun compte, aucune requête réseau externe, aucune publicité ni outil d'analyse.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **9 fichiers de test, 53 tests passés** (dont 6 tests dédiés dans `src/lib/__tests__/kidsAndProfiles.test.ts`).
- `npm run build` (`tsc -b && vite build`) : **succès (0 erreur TypeScript, bundle PWA généré)**.
- Rendu navigateur headless Chrome CDP sur `http://localhost:4173/` : **0 erreur console**, **0 débordement horizontal** (`scrollWidth === clientWidth === 1425`), captures `verification/mobile-390px.png` et `verification/desktop-1440px.png` validées visuellement.
