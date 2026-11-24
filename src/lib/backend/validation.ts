export const VERIFY_EMAIL_PATH = '/verifier-email';
export const RESET_PASSWORD_PATH = '/nouveau-mot-de-passe';

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: 'Saisis une adresse email valide.' };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || password.length < 8) {
    return {
      valid: false,
      error: 'Le mot de passe doit contenir au moins 8 caractères.',
    };
  }
  return { valid: true };
}

/**
 * Compare exactement les deux champs de mot de passe, sans aucune transformation (pas de trim).
 */
export function validatePasswordMatch(
  password: string,
  confirmPassword: string
): { valid: boolean; error?: string } {
  const lengthCheck = validatePassword(password);
  if (!lengthCheck.valid) {
    return lengthCheck;
  }
  if (password !== confirmPassword) {
    return {
      valid: false,
      error: 'Les deux mots de passe ne correspondent pas.',
    };
  }
  return { valid: true };
}

/**
 * Traduit les motifs de refus de mot de passe d'Appwrite en messages français explicites.
 */
export function formatPasswordRejectionError(err: unknown): string {
  const rawMessage =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message?: unknown }).message ?? '')
      : String(err ?? '');
  const rawType =
    typeof err === 'object' && err !== null && 'type' in err
      ? String((err as { type?: unknown }).type ?? '')
      : '';
  const combined = `${rawType} ${rawMessage}`.toLowerCase();

  if (
    combined.includes('personal_data') ||
    combined.includes('personal data') ||
    combined.includes('données personnelles')
  ) {
    return 'Ce mot de passe contient des données personnelles (email ou nom). Choisis-en un autre.';
  }

  if (
    combined.includes('commonly used') ||
    combined.includes('common') ||
    combined.includes('pwned') ||
    combined.includes('dictionary') ||
    combined.includes('weak') ||
    combined.includes('frequently') ||
    combined.includes('trop courant')
  ) {
    return 'Ce mot de passe est trop courant ou facile à deviner. Choisis un mot de passe plus robuste.';
  }

  if (
    combined.includes('at least 8') ||
    combined.includes('8 characters') ||
    combined.includes('short') ||
    combined.includes('length') ||
    combined.includes('8 caractères')
  ) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }

  if (
    combined.includes('expired') ||
    combined.includes('invalid_token') ||
    combined.includes('invalid token') ||
    combined.includes('user_invalid_token') ||
    combined.includes('secret')
  ) {
    return 'Ce lien de réinitialisation est expiré ou a déjà été utilisé. Demande un nouveau lien.';
  }

  return 'Impossible de mettre à jour le mot de passe. Vérifie ta saisie ou demande un nouveau lien.';
}

export interface AuthCallbackParams {
  kind: 'none' | 'verification' | 'recovery' | 'oauth_error';
  userId?: string;
  secret?: string;
  invalidLink?: boolean;
}

/**
 * Détermine l'action d'authentification UNIQUEMENT à partir de la route dédiée
 * (/verifier-email ou /nouveau-mot-de-passe), jamais sur la seule présence de userId/secret/expire.
 */
export function parseAuthCallbackFromLocation(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  pathname: string = typeof window !== 'undefined' ? window.location.pathname : '/'
): AuthCallbackParams {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search || '');

  if (params.get('auth_error')) {
    return { kind: 'oauth_error' };
  }

  const userId = params.get('userId')?.trim() || undefined;
  const secret = params.get('secret')?.trim() || undefined;

  if (cleanPath === VERIFY_EMAIL_PATH) {
    if (!userId || !secret) {
      return { kind: 'verification', invalidLink: true };
    }
    return { kind: 'verification', userId, secret };
  }

  if (cleanPath === RESET_PASSWORD_PATH) {
    if (!userId || !secret) {
      return { kind: 'recovery', invalidLink: true };
    }
    return { kind: 'recovery', userId, secret };
  }

  return { kind: 'none' };
}
