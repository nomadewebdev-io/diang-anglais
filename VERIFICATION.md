# Vérification Diang-Anglais — Plan par séances, récompenses & anti-abus

## Critères vérifiés
- [x] **Plan par séances (sans verrouillage par date)** : `getNextUncompletedSession` sélectionne la prochaine séance non terminée ; l'écran `Aujourd'hui` affiche `"Objectif du jour atteint"`, `"Disponible maintenant"`, la date secondaire en français naturel (`"prévue Demain"`) et le bouton `"Continuer"`.
- [x] **Dates en français naturel & prévision de fin** : `formatFrenchDateNatural` remplace tout affichage ISO (`YYYY-MM-DD`) dans `TodayView` et `ProgramView` ; `getPlanScheduleStatus` calcule l'avance/retard (`"Avance : +N séances"` / `"Retard : N séances"`) et la date de fin estimée.
- [x] **Récompenses XP & bonus dégressif** : `calculateActivityXP` et `getDailyBonusMultiplier` appliquent +25 % dégressif sur les séances bonus (100 % / 50 % / 25 % / 0 %), compteurs `"Séances bonus"` (jour/semaine), `"Jours actifs cette semaine (x/7)"` et badges sobres sans classement ni confettis (`prefers-reduced-motion` respecté).
- [x] **Anti-abus & qualité d'apprentissage** :
  - Seuil >= 60 % de réponses réelles (hors `"Je ne sais pas"` / passés) pour gagner des XP.
  - 0 XP sur répétition d'une activité déjà terminée.
  - Série stricte (`calculateStrictStreak`) : >= 1 séance terminée ou >= 10 min d'activités validées ; les séances bonus n'augmentent pas la série.
  - SM-2 (`getDueAndNewCardsForToday`) : cartes dues uniquement par défaut, message `"Révisions à jour, reviens demain pour consolider"` et plafond quotidien de nouvelles cartes réglable dans `Paramètres` (10 / 20 / 30 / 50).
  - Pause bienveillante après 4 séances bonus/jour et recommandation de consolidation 48 h si le plan est terminé en < 50 % de la durée prévue (sans blocage).
- [x] **En-tête et barre de navigation opaques** : fond 100 % opaque en modes clair (`rgb(250, 248, 245)` / `rgb(255, 255, 255)`) et sombre, avec bordure fine et `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)`.

## Contrôles automatisés
- `npm test` (`node scripts/validate-data.js && vitest run`) : **7 fichiers de test, 41 tests passés** (dont 7 tests unitaires dans `src/lib/__tests__/progression.test.ts`).
- `npm run build` (`tsc -b && vite build`) : **succès (0 erreur TypeScript, bundle PWA généré)**.
- Rendu navigateur headless Chrome CDP sur `http://localhost:4173/` : **0 erreur console**, **0 débordement horizontal** (`scrollWidth === clientWidth === 1425`), captures `verification/mobile-390px.png` (390x844) et `verification/desktop-1440px.png` (1440x900) validées visuellement.
