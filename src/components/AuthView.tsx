import React, { useEffect, useState } from 'react';
import {
  getBackendAdapter,
  parseAuthCallbackFromLocation,
  validatePassword,
} from '../lib/backend';
import { LegalDocumentKind } from '../lib/types';
import { IconCheck, IconMail, IconShield } from './Icons';

type AuthMode = 'login' | 'signup' | 'forgot' | 'check_email' | 'recovery';

interface AuthViewProps {
  initialMode?: 'login' | 'recovery';
  onOpenLegal: (kind: LegalDocumentKind) => void;
  onPasswordUpdated?: () => void;
}

export function AuthView({
  initialMode = 'login',
  onOpenLegal,
  onPasswordUpdated,
}: AuthViewProps): React.ReactElement {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryParams, setRecoveryParams] = useState<{
    userId: string;
    secret: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const backend = getBackendAdapter();
  const configured = backend.isConfigured();

  useEffect(() => {
    const callback = parseAuthCallbackFromLocation();
    if (callback.kind === 'none') return;

    if (callback.kind === 'oauth_error') {
      setErrorMessage('Connexion Google impossible pour le moment. Réessaie.');
    } else if (callback.kind === 'recovery' && callback.userId && callback.secret) {
      setRecoveryParams({ userId: callback.userId, secret: callback.secret });
      setMode('recovery');
    } else if (callback.kind === 'verification' && callback.userId && callback.secret) {
      void (async () => {
        const res = await backend.completeEmailVerification(
          callback.userId!,
          callback.secret!
        );
        if (res.ok) {
          setInfoMessage(
            res.message ?? 'Adresse email confirmée. Tu peux maintenant te connecter.'
          );
        } else {
          setErrorMessage(res.message ?? 'Lien de confirmation invalide ou expiré.');
        }
      })();
    }

    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [backend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        const res = await backend.signIn(email, password);
        if (!res.ok) {
          setErrorMessage(res.message ?? 'Connexion impossible.');
        }
        return;
      }

      if (mode === 'signup') {
        const pwdCheck = validatePassword(password);
        if (!pwdCheck.valid) {
          setErrorMessage(pwdCheck.error ?? 'Mot de passe invalide.');
          return;
        }
        const res = await backend.signUp(email, password);
        if (!res.ok) {
          setErrorMessage(res.message ?? 'Inscription impossible.');
          return;
        }
        if (res.needsEmailVerification) {
          setMode('check_email');
          setInfoMessage(
            "Un lien de confirmation vient d'être envoyé. Vérifie ta boîte mail puis clique sur le lien pour activer ton compte."
          );
        }
        return;
      }

      if (mode === 'forgot') {
        const res = await backend.sendPasswordRecovery(email);
        if (!res.ok) {
          setErrorMessage(res.message ?? 'Envoi impossible.');
          return;
        }
        setInfoMessage(
          res.message ??
            'Si un compte correspond à cet email, un lien de réinitialisation vient d’être envoyé.'
        );
        return;
      }

      if (mode === 'recovery') {
        const pwdCheck = validatePassword(password);
        if (!pwdCheck.valid) {
          setErrorMessage(pwdCheck.error ?? 'Mot de passe invalide.');
          return;
        }
        if (password !== confirmPassword) {
          setErrorMessage('Les deux mots de passe ne correspondent pas.');
          return;
        }
        if (!recoveryParams) {
          setErrorMessage('Lien de réinitialisation invalide ou expiré.');
          return;
        }
        const res = await backend.completePasswordRecovery(
          recoveryParams.userId,
          recoveryParams.secret,
          password
        );
        if (!res.ok) {
          setErrorMessage(res.message ?? 'Mise à jour impossible.');
          return;
        }
        setInfoMessage(res.message ?? 'Mot de passe mis à jour.');
        setMode('login');
        onPasswordUpdated?.();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    setSubmitting(true);
    try {
      const res = await backend.signInWithGoogle();
      if (!res.ok) {
        setErrorMessage(res.message ?? 'Connexion Google impossible.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#141817] flex flex-col justify-center px-4 py-8">
      <div className="w-full max-w-md mx-auto space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] text-xs font-semibold">
            <IconShield className="w-3.5 h-3.5" />
            <span>Compte personnel sécurisé</span>
          </div>
          <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F3F4F6] tracking-tight">
            Diang-Anglais
          </h1>
          <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
            {mode === 'signup'
              ? 'Crée ton compte adulte pour synchroniser ta progression et tes profils.'
              : mode === 'forgot'
                ? 'Reçois un lien pour choisir un nouveau mot de passe.'
                : mode === 'recovery'
                  ? 'Choisis ton nouveau mot de passe (8 caractères minimum).'
                  : mode === 'check_email'
                    ? 'Vérifie ta boîte mail'
                    : 'Connecte-toi pour retrouver ta progression sur tous tes appareils.'}
          </p>
        </div>

        <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 shadow-sm space-y-5">
          {!configured && (
            <div
              role="alert"
              className="rounded-xl border border-[#D97706]/30 bg-[#FEF3C7] dark:bg-[#78350F]/30 px-3.5 py-3 text-xs text-[#92400E] dark:text-[#FCD34D]"
            >
              Configuration Appwrite manquante (`VITE_APPWRITE_ENDPOINT`, `VITE_APPWRITE_PROJECT_ID`,
              `VITE_APPWRITE_DATABASE_ID`, `VITE_APPWRITE_TABLE_ID`). Ajoute ces variables dans
              `.env` ou sur Cloudflare Pages.
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-[#DC2626]/30 bg-[#FEE2E2] dark:bg-[#7F1D1D]/30 px-3.5 py-3 text-xs font-medium text-[#991B1B] dark:text-[#FCA5A5]"
            >
              {errorMessage}
            </div>
          )}

          {infoMessage && (
            <div
              role="status"
              className="rounded-xl border border-[#0F4C3A]/25 bg-[#E6F0EC] dark:bg-[#13362B] px-3.5 py-3 text-xs font-medium text-[#0F4C3A] dark:text-[#6EE7B7] flex items-start gap-2"
            >
              <IconCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {mode === 'check_email' ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center justify-center mx-auto">
                <IconMail className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]">
                  Vérifie ta boîte mail
                </h2>
                <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
                  Clique sur le lien reçu à <strong>{email}</strong> (pense aussi aux courriers
                  indésirables), puis reviens te connecter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold transition cursor-pointer"
              >
                Retour à la connexion
              </button>
            </div>
          ) : (
            <>
              {(mode === 'login' || mode === 'signup') && (
                <>
                  <button
                    type="button"
                    disabled={submitting || !configured}
                    onClick={handleGoogleSignIn}
                    className="w-full py-2.5 px-4 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:bg-[#F3EFE6] dark:hover:bg-[#2D3632] text-[#111827] dark:text-[#F3F4F6] text-sm font-semibold flex items-center justify-center gap-2.5 transition disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>Continuer avec Google</span>
                  </button>

                  <div className="relative flex items-center">
                    <div className="flex-1 border-t border-[#E4DFD3] dark:border-[#343F3B]" />
                    <span className="px-3 text-xs text-[#6B7280] dark:text-[#9CA3AF]">ou</span>
                    <div className="flex-1 border-t border-[#E4DFD3] dark:border-[#343F3B]" />
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode !== 'recovery' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]"
                    >
                      Adresse email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@exemple.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#141817] text-sm text-[#111827] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                    />
                  </div>
                )}

                {mode !== 'forgot' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]"
                      >
                        {mode === 'recovery' ? 'Nouveau mot de passe' : 'Mot de passe'}
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('forgot');
                            setErrorMessage(null);
                            setInfoMessage(null);
                          }}
                          className="text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] hover:underline cursor-pointer"
                        >
                          Mot de passe oublié ?
                        </button>
                      )}
                    </div>
                    <input
                      id="auth-password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#141817] text-sm text-[#111827] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                    />
                  </div>
                )}

                {mode === 'recovery' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-password-confirm"
                      className="block text-xs font-semibold text-[#374151] dark:text-[#D1D5DB]"
                    >
                      Confirmer le mot de passe
                    </label>
                    <input
                      id="auth-password-confirm"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#141817] text-sm text-[#111827] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting || !configured}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Patiente...'
                    : mode === 'login'
                      ? 'Se connecter'
                      : mode === 'signup'
                        ? 'Créer un compte'
                        : mode === 'forgot'
                          ? 'Envoyer le lien'
                          : 'Enregistrer le mot de passe'}
                </button>
              </form>

              <div className="pt-1 text-center text-xs text-[#4B5563] dark:text-[#D1D5DB]">
                {mode === 'login' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                    className="font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] hover:underline cursor-pointer"
                  >
                    Créer un compte
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setErrorMessage(null);
                      setInfoMessage(null);
                    }}
                    className="font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] hover:underline cursor-pointer"
                  >
                    Déjà un compte ? Se connecter
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-[#6B7280] dark:text-[#9CA3AF] leading-relaxed">
          Comptes réservés aux adultes. Les profils enfants sont gérés par le parent.{' '}
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="underline hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
          >
            Politique de confidentialité
          </button>{' '}
          ·{' '}
          <button
            type="button"
            onClick={() => onOpenLegal('terms')}
            className="underline hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
          >
            Conditions d&apos;utilisation
          </button>
        </p>
      </div>
    </div>
  );
}
