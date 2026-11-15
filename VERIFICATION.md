# Vérification Diang-Anglais — Choix de significations & classement SM-2 automatique

## Critères vérifiés
- [x] **Déroulé d'une carte (`FlashcardsPractice.tsx`)** : mot anglais seul au départ avec `"Écouter le mot"`, 3 choix mélangés (touches `1`, `2`, `3`) + bouton `"Je ne sais pas"`, aucun compte à rebours visible.
- [x] **Retour après réponse** : indication juste/faux par couleur + icône + texte, bonne réponse affichée, phrase d'exemple + traduction + audio, étiquette automatique (`"Classée : Facile · prochaine révision dans X jours"` ou `"Classée : À revoir · revient dans cette séance et demain"`), bouton `"Suivant"`.
- [x] **Classement automatique (`src/lib/srs.ts` + `src/lib/sm2.ts`)** :
  - `"Je ne sais pas"` → qualité `0`, mauvaise réponse → qualité `1` (reprise dans la séance et le lendemain).
  - Bonne réponse → `"Difficile"` (`3`), `"Bien"` (`4`), `"Facile"` (`5`) selon `SRS_TIMING_CONFIG` (seuils par niveau CECRL et longueur du mot).
  - Garde-fou sur les cartes jamais réussies (`repetitions === 0`) : qualité max `4` (`"Bien"`).
  - Chronomètre silencieux (`SilentResponseTimer`) mis en pause sur `visibilitychange` et plafonné à 20 s.
  - Alternance au sens inverse (`FR → EN`) après 2 réussites consécutives (`shouldUseReverseDirection`).
  - Suppression des boutons manuels et du libellé `(Planification SM-2)`, conservation discrète de `Répétitions` / `Facilité`.
- [x] **Faux choix sur 800 cartes (`src/data/cards.json` + `scripts/validate-data.js`)** : `distractors` (français) et `distractorsEn` (anglais) ajoutés sur les 800 cartes, validés sans doublon ni égalité avec la bonne réponse, avec repli thématique dans `buildCardChoices`.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **8 fichiers de test, 47 tests passés** (dont 6 tests dédiés dans `src/lib/__tests__/srs.test.ts`).
- `npm run build` (`tsc -b && vite build`) : **succès (0 erreur TypeScript, bundle PWA généré)**.
- Rendu navigateur headless Chrome CDP sur `http://localhost:4173/` : **0 erreur console**, **0 débordement horizontal** (`scrollWidth === clientWidth === 1425`), captures `verification/mobile-390px.png` et `verification/desktop-1440px.png` validées visuellement.
