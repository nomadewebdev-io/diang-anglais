# Rapport de Vérification — `/nomadego`

**Demande :** Ajouter l'exercice progressif « Construis la phrase » (`src/data/constructions.json`, tuiles A1-A2, saisie libre B1-B2, correction tolérante, ré-injection + SM-2, audio, intégration Réviser/Programme, validation et tests).
**Date :** 2026-11-15
**Statut Global :** ✅ VALIDÉ (Boucles de correction utilisées : 0/3)

## 1. Critères Fonctionnels (Checklist)

| ID | Critère vérifiable | Statut | Preuve concrète |
| :--- | :--- | :---: | :--- |
| C1 | Catalogue `src/data/constructions.json` 100 % original (A1: 12 unités, A2: 12, B1: 10, B2: 8 ; 10-14 phrases/unité) | ✅ | `src/data/constructions.json` : 462 phrases (42 unités × 11 phrases), validées par `scripts/validate-data.js` |
| C2 | Correcteur tolérant (casse, ponctuation, espaces, contractions `I'm`/`I am`, variantes `answers`, surlignage d'écart) | ✅ | `src/lib/construction.ts` (`evaluateConstruction`, `computeExpectedWordDiff`) + tests dans `src/lib/__tests__/construction.test.ts` |
| C3 | Exercice « Construis la phrase » : tuiles mélangées + distracteurs en A1-A2, saisie libre en B1-B2, bouton « Je ne sais pas » | ✅ | `src/components/ConstructionPractice.tsx` + vérification visuelle mobile/desktop |
| C4 | Ré-injection 2 fois en séance après erreur/« Je ne sais pas » puis entrée en SM-2 (espacement accru si 1er coup) | ✅ | `advanceConstructionQueue` et `updateConstructionSM2` dans `src/lib/construction.ts` + tests unitaires |
| C5 | Lecture audio de `answers[0]` après chaque réponse via `lib/audio` (voix choisie, repli Web Speech) | ✅ | `speakEnglish(currentItem.answers[0])` et `preloadAudioClip` dans `src/components/ConstructionPractice.tsx` |
| C6 | Onglet/entrée « Construire » dans `Réviser`, progression par unité, déblocage à 80 % et bouton « Passer à la suite » | ✅ | `src/components/ReviewView.tsx` + `src/App.tsx` + `src/lib/storage.ts` |
| C7 | Intégration dans `lib/planner.ts` (~30 % des séances dans l'ordre des unités du niveau) et `TodayView.tsx` | ✅ | `src/lib/planner.ts` (`globalIdx % 3 === 1`) + `src/components/TodayView.tsx` + test dans `construction.test.ts` |
| C8 | Audio incrémental pour `answers[0]` via `npm run audio:generate` | ✅ | `scripts/generate-audio.py` exécuté : 15 450 clips MP3 (2 575 textes × 6 voix), 131,75 Mo |
| C9 | `scripts/validate-data.js` étendu (format, ids uniques, `answers`, volumes, doublons, clips audio) | ✅ | `[validate-data] OK — ... constructions: 462, audioTexts: 2575, audioClips: 15450` |
| C10 | Tests unitaires du correcteur et de la planification/progression | ✅ | `src/lib/__tests__/construction.test.ts` (7/7 tests passés) |
| C11 | Thèmes clair/sombre, clavier, ergonomie une main 390px/1440px, 100 % français | ✅ | Captures `verification/mobile-390px.png` et `verification/desktop-1440px.png`, 0 débordement |

## 2. Vérifications Techniques & Visuelles

| Contrôle | Statut | Preuve / Résultat |
| :--- | :---: | :--- |
| **Build** | ✅ | `npm run build` (`tsc -b && vite build`) — code retour 0 |
| **Lint & Types** | ✅ | `tsc -b` sans erreur TypeScript |
| **Tests** | ✅ | `npm test` (`validate-data.js && vitest run`) — 6 fichiers, 34/34 tests passés |
| **Lancement App & Parcours critiques** | ✅ | Parcours `Réviser > Construire > A1 Unité 1` exécuté sur `http://localhost:4173/` via Chrome CDP |
| **Console sans erreur** | ✅ | `CONSOLE_ERRORS: []` (0 erreur console/runtime) |
| **Capture Mobile (390px)** | ✅ | `verification/mobile-390px.png` (`scrollWidth` sans débordement horizontal) |
| **Capture Desktop (1440px)** | ✅ | `verification/desktop-1440px.png` (`scrollWidth === 1440`) |
| **Contrôles additionnels (`nomadego-learnings.md`)** | ✅ | Aucun contrôle additionnel préalable dans `nomadego-learnings.md` |

## 3. Choix Techniques Effectués en Autonomie

- **Réutilisation de `sm2States` pour les constructions** : Stockage des phrases construites dans `AppState.sm2States` via leurs identifiants disjoints (`con-...`) plutôt qu'une table séparée, afin de réutiliser directement la logique SM-2, l'export/import JSON et le suivi quotidien existants.
- **Substitution dans le créneau grammaire (~33 % des séances)** : Remplacement de l'activité `grammar` par `construction` lorsque `globalIdx % 3 === 1` dans `lib/planner.ts`, afin de respecter exactement le budget total de minutes de chaque séance tout en suivant l'ordre des unités du niveau de l'utilisateur.
- **Expansion bidirectionnelle des contractions** : Normalisation des contractions anglaises courantes (`I'm` ↔ `I am`, `don't` ↔ `do not`, etc.) dans `normalizeConstructionText` plutôt que de dupliquer chaque variante dans `constructions.json`.
- **Capture et inspection CDP directe** : Utilisation de Chrome Headless via Chrome DevTools Protocol (`scratch/capture_screenshots.mjs`) sur `vite preview` pour valider la console et capturer `390px` et `1440px` en l'absence du serveur MCP `chrome_devtools`.
