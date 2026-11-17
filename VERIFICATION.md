# Vérification Diang-Anglais — Passage de 6 à 4 Voix Synthétiques

## Mesures Avant / Après (Audio)
| Métrique | Avant (6 voix) | Après (4 voix) |
| --- | --- | --- |
| Voix actives | `6` (`aminata`, `fatou`, `khady`, `moussa`, `cheikh`, `ibrahima`) | `4` (`ragui`, `fatou-sarre`, `omare`, `boubacar`) |
| `public/audio` (fichiers) | `79` fichiers (`72` paquets `.bin` + `7` manifests) | `53` fichiers (`48` paquets `.bin` + `5` manifests) |
| `public/audio` (poids) | `107,61 Mo` | `69,12 Mo` (max paquet : `2,48 Mo` < `5 Mo`) |
| Clips audio totaux | `19 722` (`3 287 × 6`) | `13 148` (`3 287 × 4`) |
| JS initial (gzip) | `103,33 ko` | `103,38 ko` (budget `120,00 ko`) |
| CSS initial (gzip) | `7,03 ko` | `7,03 ko` (budget `25,00 ko`) |

## Critères vérifiés
- [x] **Parité et accents des 4 voix (`src/lib/audio.ts`, `scripts/generate-audio.py`)** : `ragui` (femme, US, par défaut), `fatou-sarre` (femme, GB), `omare` (homme, US), `boubacar` (homme, GB), identifiants explicitement synthétiques (`isSynthetic: true`).
- [x] **Nettoyage & régénération (`public/audio/`, `CREDITS.md`, `vite.config.ts`)** : anciens dossiers/paquets/manifests supprimés, 48 paquets `.bin` et 5 manifests régénérés via `npm run audio:generate`, licences commerciales documentées dans `CREDITS.md`, `runtimeCaching` PWA mis à jour.
- [x] **Migration silencieuse (`src/lib/audio.ts`, `src/lib/storage.ts`)** : `migrateVoiceId` convertit les anciens IDs sur profils adulte et enfant (`aminata -> ragui`, `fatou/khady -> fatou-sarre`, `moussa/ibrahima -> omare`, `cheikh -> boubacar`, inconnue -> `ragui`).
- [x] **Validation & budgets (`scripts/validate-data.js`, `scripts/check-budget.js`)** : vérification stricte des 4 voix, absence des anciens IDs, `defaultVoiceId === "ragui"`, budgets JS/CSS/chunks/paquets audio respectés.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **9 fichiers de test, 57 tests passés** (`audioTexts: 3287`, `audioClips: 13148`).
- `npm run build` (`tsc -b && vite build && node scripts/check-budget.js`) : **succès (0 erreur TypeScript, tous les budgets respectés, `total audio: 69.12 Mo`)**.
