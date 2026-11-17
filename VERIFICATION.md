# Vérification Diang-Anglais — Allègement, Paquets Audio & Budgets Performance

## Mesures Avant / Après
| Métrique | Avant | Après |
| --- | --- | --- |
| `public/audio` (fichiers) | `20 777` fichiers | `79` fichiers (`72` paquets `.bin` + `7` manifests) |
| `public/audio` (poids) | `117,43 Mo` | `107,61 Mo` (max paquet : `2,48 Mo` < `5 Mo`) |
| JS initial (gzip) | `326,61 ko` | `103,33 ko` (`-68,4 %`, budget `120 ko`) |
| CSS initial (gzip) | `6,91 ko` | `7,03 ko` (avec polices auto-hébergées, budget `25 ko`) |
| `dist/` total | `20 788` fichiers (`118,64 Mo`) | `139` fichiers (`108,93 Mo`) |

## Critères vérifiés
- [x] **Paquets audio (`scripts/generate-audio.py`, `src/lib/audio.ts`)** : clips MP3 mono 24 kbps 22,05 kHz stockés dans `audio-cache/` (gitignored), concaténés en paquets `.bin` (1–3 Mo, max `2,48 Mo`), extraits via `Blob.slice` et joués via `URL.createObjectURL` révoqué après lecture, avec repli Web Speech API et préchauffage.
- [x] **Service Worker & espace audio (`vite.config.ts`, `SettingsView.tsx`)** : aucun précache audio, cache runtime `CacheFirst` (plafonné à 50 paquets), affichage de l'espace audio utilisé et bouton `"Libérer l'espace audio"`.
- [x] **JSON découpés & chargement dynamique (`src/data/`, `src/lib/catalog.ts`)** : contenus adulte et enfant découpés par niveau, chargés à la demande par `import()` dynamique selon le profil/niveau et seulement au lancement du test pour le placement.
- [x] **Polices auto-hébergées & code splitting (`src/main.tsx`, `src/App.tsx`)** : `@fontsource/plus-jakarta-sans` (woff2 latin, 400/500/600/700, `font-display: swap`), `React.lazy` + `Suspense`, chunk `vendor` séparé, écritures `localStorage` regroupées (`scheduleSaveMultiProfileStore`, debounce 600 ms + `requestIdleCallback`).
- [x] **Budgets & contrôle (`budget.config.json`, `scripts/check-budget.js`)** : `npm run analyze` et `npm run check:budget` intégrés au build.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **9 fichiers de test, 55 tests passés** (`audioTexts: 3287`, `audioClips: 19722`).
- `npm run build` (`tsc -b && vite build && node scripts/check-budget.js`) : **succès (0 erreur TypeScript, tous les budgets respectés)**.
- Rendu navigateur headless Chrome CDP sur `http://localhost:4173/` : **0 erreur console**, **0 débordement horizontal**.
