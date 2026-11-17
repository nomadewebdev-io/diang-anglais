import type { AuthChangeEvent, Session, SupabaseClient, User } from '@supabase/supabase-js';

export interface AuthActionResult {
  ok: boolean;
  needsEmailVerification?: boolean;
  message?: string;
  user?: User | null;
}

const GENERIC_LOGIN_ERROR =
  'Identifiants incorrects ou connexion impossible. Vérifie ton email et ton mot de passe.';
const GENERIC_SIGNUP_ERROR =
  "Impossible de créer le compte pour le moment. Vérifie l'adresse email saisie et réessaie.";
const GENERIC_RESET_MESSAGE =
  'Si un compte correspond à cet email, un lien de réinitialisation vient d’être envoyé.';
const GENERIC_CONFIG_ERROR =
  'La connexion cloud n’est pas encore configurée sur cet environnement.';

let cachedClient: SupabaseClient | null = null;
let pendingClientPromise: Promise<SupabaseClient | null> | null = null;

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url && anonKey && /^https?:\/\//i.test(url));
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;
  if (!isSupabaseConfigured()) return null;
  if (pendingClientPromise) return pendingClientPromise;

  pendingClientPromise = import('@supabase/supabase-js')
    .then(({ createClient }) => {
      const { url, anonKey } = getSupabaseConfig();
      cachedClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      return cachedClient;
    })
    .catch(() => null)
    .finally(() => {
      pendingClientPromise = null;
    });

  return pendingClientPromise;
}

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

export function isAuthCallbackInUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  return (
    search.includes('code=') ||
    search.includes('type=recovery') ||
    search.includes('type=signup') ||
    hash.includes('access_token=') ||
    hash.includes('type=recovery') ||
    hash.includes('type=signup')
  );
}

export async function getSupabaseSession(): Promise<Session | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function subscribeToAuthChanges(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): Promise<() => void> {
  const client = await getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error };
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error || !data.user) {
      return { ok: false, message: GENERIC_LOGIN_ERROR };
    }
    return { ok: true, user: data.user };
  } catch {
    return { ok: false, message: GENERIC_LOGIN_ERROR };
  }
}

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error };
  const pwdCheck = validatePassword(password);
  if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (error) {
      return { ok: false, message: GENERIC_SIGNUP_ERROR };
    }
    const needsVerification = !data.session;
    return {
      ok: true,
      needsEmailVerification: needsVerification,
      user: data.user ?? null,
    };
  } catch {
    return { ok: false, message: GENERIC_SIGNUP_ERROR };
  }
}

export async function signInWithGoogle(): Promise<AuthActionResult> {
  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) {
      return {
        ok: false,
        message: 'Connexion Google impossible pour le moment. Réessaie.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'Connexion Google impossible pour le moment. Réessaie.',
    };
  }
}

export async function sendPasswordResetEmail(email: string): Promise<AuthActionResult> {
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) return { ok: false, message: emailCheck.error };

  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
    await client.auth.resetPasswordForEmail(
      email.trim(),
      redirectTo ? { redirectTo } : undefined
    );
    return { ok: true, message: GENERIC_RESET_MESSAGE };
  } catch {
    return { ok: true, message: GENERIC_RESET_MESSAGE };
  }
}

export async function updateUserPassword(newPassword: string): Promise<AuthActionResult> {
  const pwdCheck = validatePassword(newPassword);
  if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
      return {
        ok: false,
        message: 'Impossible de mettre à jour le mot de passe. Redemande un lien.',
      };
    }
    return { ok: true, message: 'Mot de passe mis à jour.' };
  } catch {
    return {
      ok: false,
      message: 'Impossible de mettre à jour le mot de passe. Redemande un lien.',
    };
  }
}

export async function signOutAccount(): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // Ignore network errors during signOut
  }
}

export async function deleteMyAccount(): Promise<AuthActionResult> {
  const client = await getSupabaseClient();
  if (!client) return { ok: false, message: GENERIC_CONFIG_ERROR };

  try {
    const { error } = await client.rpc('delete_my_account');
    if (error) {
      return {
        ok: false,
        message: 'La suppression du compte a échoué. Reconnecte-toi puis réessaie.',
      };
    }
    await signOutAccount();
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: 'La suppression du compte a échoué. Vérifie ta connexion.',
    };
  }
}
