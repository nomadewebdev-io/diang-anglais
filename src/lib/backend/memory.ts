import {
  AuthActionResult,
  BackendAdapter,
  BackendSession,
  BackendUser,
  MAX_REMOTE_PROFILES,
  RemoteLearnerProfileRow,
} from './types';
import {
  formatPasswordRejectionError,
   validateEmail,
  validatePassword,
} from './validation';

interface MemoryUserRecord extends BackendUser {
  password: string;
}

export class MemoryBackendAdapter implements BackendAdapter {
  private configured = true;
  private users = new Map<string, MemoryUserRecord>();
  private currentUserId: string | null = null;
  private profiles = new Map<string, RemoteLearnerProfileRow>();
  private listeners = new Set<(session: BackendSession | null) => void>();
  private nextUserSeq = 1;

  constructor(options?: { configured?: boolean }) {
    if (options?.configured === false) {
      this.configured = false;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  private notify(): void {
    const session = this.getSessionSync();
    for (const listener of this.listeners) {
      listener(session);
    }
  }

  private getSessionSync(): BackendSession | null {
    if (!this.currentUserId) return null;
    const u = this.users.get(this.currentUserId);
    if (!u) return null;
    return {
      user: {
        id: u.id,
        email: u.email,
        emailVerification: u.emailVerification,
      },
    };
  }

  async getSession(): Promise<BackendSession | null> {
    return this.getSessionSync();
  }

  subscribeAuth(callback: (session: BackendSession | null) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async signUp(email: string, password: string): Promise<AuthActionResult> {
    const eCheck = validateEmail(email);
    if (!eCheck.valid) return { ok: false, message: eCheck.error };
    const pCheck = validatePassword(password);
    if (!pCheck.valid) return { ok: false, message: pCheck.error };

    const normalized = email.trim().toLowerCase();
    for (const existing of this.users.values()) {
      if (existing.email?.toLowerCase() === normalized) {
        return {
          ok: false,
          message:
            "Impossible de créer le compte pour le moment. Vérifie l'adresse email saisie et réessaie.",
        };
      }
    }

    const id = `00000000-0000-4000-8000-${String(this.nextUserSeq++).padStart(12, '0')}`;
    const user: MemoryUserRecord = {
      id,
      email: normalized,
      password,
      emailVerification: false,
    };
    this.users.set(id, user);
    return {
      ok: true,
      needsEmailVerification: true,
      user: { id: user.id, email: user.email, emailVerification: false },
    };
  }

  async signIn(email: string, password: string): Promise<AuthActionResult> {
    const eCheck = validateEmail(email);
    if (!eCheck.valid) return { ok: false, message: eCheck.error };
    const pCheck = validatePassword(password);
    if (!pCheck.valid) return { ok: false, message: pCheck.error };

    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email?.toLowerCase() === normalized && user.password === password) {
        this.currentUserId = user.id;
        this.notify();
        return {
          ok: true,
          user: {
            id: user.id,
            email: user.email,
            emailVerification: user.emailVerification,
          },
        };
      }
    }
    return {
      ok: false,
      message: 'Identifiants incorrects ou connexion impossible. Vérifie ton email et ton mot de passe.',
    };
  }

  async signInWithGoogle(): Promise<AuthActionResult> {
    return { ok: true };
  }

  async signOut(): Promise<void> {
    this.currentUserId = null;
    this.notify();
  }

  async sendPasswordRecovery(email: string): Promise<AuthActionResult> {
    const eCheck = validateEmail(email);
    if (!eCheck.valid) return { ok: false, message: eCheck.error };
    return {
      ok: true,
      message: 'Si un compte correspond à cet email, un lien de réinitialisation vient d’être envoyé.',
    };
  }

  async completePasswordRecovery(
    userId: string,
    secret: string,
    newPassword: string
  ): Promise<AuthActionResult> {
    const pCheck = validatePassword(newPassword);
    if (!pCheck.valid) return { ok: false, message: pCheck.error };
    if (!secret || secret === 'expired-secret') {
      return {
        ok: false,
        message: formatPasswordRejectionError(new Error('Invalid token or expired secret')),
      };
    }
    if (newPassword.toLowerCase() === 'password123') {
      return {
        ok: false,
        message: formatPasswordRejectionError(new Error('Password is too commonly used')),
      };
    }
    const user = this.users.get(userId);
    if (!user) {
      return {
        ok: false,
        message: 'Ce lien de réinitialisation est expiré ou a déjà été utilisé. Demande un nouveau lien.',
      };
    }
    if (user.email && newPassword.toLowerCase().includes(user.email.split('@')[0].toLowerCase())) {
      return {
        ok: false,
        message: formatPasswordRejectionError(new Error('Password contains personal data')),
      };
    }
    user.password = newPassword;
    return {
      ok: true,
      message: 'Mot de passe mis à jour avec succès. Tu peux maintenant te connecter.',
    };
  }

  async completeEmailVerification(userId: string, secret: string): Promise<AuthActionResult> {
    const user = this.users.get(userId);
    if (!user || !secret || secret === 'expired-secret') {
      return {
        ok: false,
        message: 'Ce lien de confirmation est expiré, invalide ou a déjà été utilisé.',
      };
    }
    user.emailVerification = true;
    return { ok: true, message: 'Email confirmé. Tu peux maintenant te connecter.' };
  }

  async resendEmailVerification(
    email?: string,
    password?: string
  ): Promise<AuthActionResult> {
    if (this.currentUserId) {
      return {
        ok: true,
        message: "Un nouvel email de confirmation vient d'être envoyé. Vérifie ta boîte mail.",
      };
    }
    if (!email || !password) {
      return {
        ok: false,
        message: "Saisis ton email et ton mot de passe pour renvoyer l'email de confirmation.",
      };
    }
    const normalized = email.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.email?.toLowerCase() === normalized && user.password === password) {
        return {
          ok: true,
          message: "Un nouvel email de confirmation vient d'être envoyé. Vérifie ta boîte mail.",
        };
      }
    }
    return {
      ok: false,
      message: 'Identifiants incorrects ou envoi impossible.',
    };
  }

  async listProfiles(userId: string): Promise<RemoteLearnerProfileRow[]> {
    const rows: RemoteLearnerProfileRow[] = [];
    for (const row of this.profiles.values()) {
      if (row.user_id === userId) {
        rows.push(structuredClone(row));
      }
    }
    return rows.sort((a, b) => b.client_updated_at.localeCompare(a.client_updated_at));
  }

  async upsertProfiles(userId: string, rows: RemoteLearnerProfileRow[]): Promise<void> {
    const existingForUser = await this.listProfiles(userId);
    const existingIds = new Set(existingForUser.map((r) => r.id));

    let projectedCount = existingForUser.length;
    for (const row of rows) {
      if (!existingIds.has(row.id)) {
        projectedCount += 1;
        if (projectedCount > MAX_REMOTE_PROFILES) {
          throw new Error('Limite de 4 profils maximum par compte atteinte.');
        }
        existingIds.add(row.id);
      }
      this.profiles.set(row.id, structuredClone({ ...row, user_id: userId }));
    }
  }

  async deleteProfile(userId: string, profileId: string): Promise<void> {
    const existing = this.profiles.get(profileId);
    if (existing && existing.user_id === userId) {
      this.profiles.delete(profileId);
    }
  }

  async exportAccountData(userId: string): Promise<RemoteLearnerProfileRow[]> {
    return this.listProfiles(userId);
  }

  async deleteAccount(): Promise<AuthActionResult> {
    if (!this.currentUserId) {
      return { ok: false, message: 'Authentification requise.' };
    }
    const uid = this.currentUserId;
    for (const [rowId, row] of this.profiles.entries()) {
      if (row.user_id === uid) {
        this.profiles.delete(rowId);
      }
    }
    this.users.delete(uid);
    this.currentUserId = null;
    this.notify();
    return { ok: true };
  }

  seedSignedInUser(user: MemoryUserRecord): void {
    this.users.set(user.id, user);
    this.currentUserId = user.id;
    this.notify();
  }
}
