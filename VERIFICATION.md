# Vérification Diang-Anglais — Correction des Flux Email Appwrite (`/verifier-email` & `/nouveau-mot-de-passe`)

## Diagnostic des causes racines
1. **Confusion entre lien de confirmation et réinitialisation de mot de passe** : Appwrite ajoute le paramètre `expire` aussi bien aux liens de confirmation d'email (`account.createVerification`) qu'aux liens de récupération (`account.createRecovery`). L'ancienne fonction `parseAuthCallbackFromLocation` testait `params.has('expire')` sur `/` et basculait donc à tort tous les liens de confirmation d'email vers l'écran `"Choisis ton nouveau mot de passe"`.
2. **Erreur `"Les deux mots de passe ne correspondent pas"` et gestion du formulaire** : l'ouverture involontaire du mode `recovery` conservait l'état du champ `#auth-password` (ou subissait l'auto-remplissage navigateur sur le premier champ uniquement) sans réinitialiser les deux champs, sans bouton afficher/masquer pour contrôler la saisie, et sans effacer `errorMessage` lors de la modification d'un champ.

## Corrections apportées
- [x] **Routes dédiées (`src/lib/backend/validation.ts`, `src/lib/backend/appwrite.ts`, `src/App.tsx`)** :
  - `/verifier-email` : cible unique de `account.createVerification`, appelle `completeEmailVerification(userId, secret)`, affiche `"Email confirmé"` ou un état d'erreur explicite avec bouton `"Renvoyer l'email de confirmation"` (`resendEmailVerification`).
  - `/nouveau-mot-de-passe` : cible unique de `account.createRecovery`, seul chemin permettant d'afficher le formulaire de nouveau mot de passe.
  - Servies par le serveur Vite (SPA) et `public/_redirects` (`/* /index.html 200`).
- [x] **Formulaire de nouveau mot de passe (`src/components/AuthView.tsx`)** :
  - Comparaison exacte (`password === confirmPassword`, sans `trim`) uniquement à la soumission (`validatePasswordMatch`).
  - Effacement immédiat du message d'erreur dès qu'un champ change (`onChange`) et réinitialisation des champs à chaque changement d'écran.
  - Bouton afficher/masquer (`IconEye` / `IconEyeOff`, `aria-label`, `aria-pressed`) sur chacun des deux champs.
  - `autoComplete="new-password"` sur les deux champs.
  - Messages français explicites pour les refus d'Appwrite (`formatPasswordRejectionError` : trop court, trop courant, données personnelles, lien expiré).

## Contrôles automatisés
- `npm test` (`validate-data.js` + `vitest run`) : **10 fichiers de test, 66 tests passés**.
- `npm run build` (`tsc -b && vite build && node scripts/check-budget.js`) : **0 erreur TypeScript, tous les budgets respectés**.
- `npm run check:deploy` : **prêt pour Cloudflare Pages**.
