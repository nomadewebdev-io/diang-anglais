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

export interface AuthCallbackParams {
  kind: 'none' | 'verification' | 'recovery' | 'oauth_error';
  userId?: string;
  secret?: string;
}

export function parseAuthCallbackFromLocation(
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): AuthCallbackParams {
  if (!search) return { kind: 'none' };
  const params = new URLSearchParams(search);
  if (params.get('auth_error')) {
    return { kind: 'oauth_error' };
  }
  const userId = params.get('userId') ?? undefined;
  const secret = params.get('secret') ?? undefined;
  if (!userId || !secret) {
    return { kind: 'none' };
  }
  const mode = params.get('mode');
  if (mode === 'recovery' || params.has('expire')) {
    return { kind: 'recovery', userId, secret };
  }
  return { kind: 'verification', userId, secret };
}
