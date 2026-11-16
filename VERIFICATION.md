# Vérification Diang-Anglais — Contenu complet Mode Enfant & Audio Piper TTS

## Critères vérifiés
- [x] **Cartes enfant (`src/data/kids/cards.json`)** : **320 cartes** (`A0: 120`, `A1: 120`, `A2: 80`), emoji sur chaque carte, phrase d'exemple ≤ 6 mots (max observé : 5 mots) avec traduction française, `distractors` (FR) et `distractorsEn` (EN) sans doublon.
- [x] **Mini-leçons (`src/data/kids/lessons.json`)** : **18 leçons** (`A0: 6`, `A1: 6`, `A2: 6`), explications en « tu », 2 exemples et 4 exercices QCM par leçon.
- [x] **Test de niveau enfant (`src/data/kids/placement.json`)** : **90 questions** (`A0: 30`, `A1: 30`, `A2: 30`) avec `emoji` ou `audioText`, une seule bonne réponse et sans doublon.
- [x] **Dictée & écoute (`src/data/kids/sentences.json`)** : **120 phrases courtes** (`A0: 40`, `A1: 40`, `A2: 40`), sans doublon.
- [x] **Constructions (`src/data/kids/constructions.json`)** : **64 phrases** réparties en **8 unités de 8** (`A0: 3`, `A1: 3`, `A2: 2`) avec tuiles de mots.
- [x] **Audio Piper TTS (`npm run audio:generate`)** : **3 287 textes uniques × 6 voix = 19 722 clips MP3** (24 kbps, `117,25 Mo`) couvrant les contenus adulte et enfant, indexés dans `public/audio/manifest.json`.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **9 fichiers de test, 53 tests passés**.
- `npm run build` (`tsc -b && vite build`) : **succès (0 erreur TypeScript, bundle PWA généré)**.
