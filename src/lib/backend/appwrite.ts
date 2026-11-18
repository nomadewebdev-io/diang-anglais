import type {
  Account,
  Client,
  Functions,
  Models,
  TablesDB,
} from 'appwrite';
import { AppState, ProfileMode } from '../types';
import {
  AuthActionResult,
  BackendAdapter,
  BackendSession,
  BackendUser,
  MAX_REMOTE_PROFILES,
  RemoteLearnerProfileRow,
} from './types';
import { validateEmail, validatePassword } from './validation';

const GENERIC_LOGIN_ERROR =
  'Identifiants incorrects ou connexion impossible. Vérifie ton email et ton mot de passe.';
const GENERIC_SIGNUP_ERROR =
  "Impossible de créer le compte pour le moment. Vérifie l'adresse email saisie et réessaie.";
const GENERIC_RESET_MESSAGE =
  'Si un compte correspond à cet email, un lien de réinitialisation vient d’être envoyé.';
const GENERIC_CONFIG_ERROR =
  'La connexion cloud n’est pas encore configurée sur cet environnement.';

const COMPRESS_THRESHOLD_BYTES = 16384;
const GZIP_PREFIX = 'gz:';

interface AppwriteBundle {
  sdk: typeof import('appwrite');
  client: Client;
  account: Account;
  tablesDB: TablesDB;
  functions: Functions;
}

interface AppwriteLearnerRow extends Models.Row {
  user_id: string;
  name: string;
  kind: ProfileMode;
  data: string;
  version: number;
  client_updated_at: string;
}

function getAppwriteConfig(): {
  endpoint: string;
  projectId: string;
  databaseId: string;
  tableId: string;
  deleteFunctionId: string;
} {
  return {
    endpoint: String(import.meta.env.VITE_APPWRITE_ENDPOINT ?? '').trim(),
    projectId: String(import.meta.env.VITE_APPWRITE_PROJECT_ID ?? '').trim(),
    databaseId: String(import.meta.env.VITE_APPWRITE_DATABASE_ID ?? '').trim(),
    tableId: String(import.meta.env.VITE_APPWRITE_TABLE_ID ?? '').trim(),
    deleteFunctionId:
      String(import.meta.env.VITE_APPWRITE_DELETE_FUNCTION_ID ?? '').trim() ||
      'delete-my-account',
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encodeProfileData(state: AppState): Promise<string> {
  const json = JSON.stringify(state);
  if (
    json.length <= COMPRESS_THRESHOLD_BYTES ||
    typeof CompressionStream === 'undefined'
  ) {
    return json;
  }
  try {
    const stream = new Blob([json])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const buf = await new Response(stream).arrayBuffer();
    return `${GZIP_PREFIX}${uint8ToBase64(new Uint8Array(buf))}`;
  } catch {
    return json;
  }
}

async function decodeProfileData(raw: string): Promise<AppState | null> {
  if (!raw) return null;
  try {
    if (raw.startsWith(GZIP_PREFIX) && typeof DecompressionStream !== 'undefined') {
      const bytes = base64ToUint8(raw.slice(GZIP_PREFIX.length));
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const stream = new Blob([copy])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      return JSON.parse(text) as AppState;
    }
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

function mapUser(u: Models.User<Models.Preferences>): BackendUser {
  return {
    id: u.$id,
    email: u.email || null,
    emailVerification: Boolean(u.emailVerification),
  };
}

export class AppwriteAdapter implements BackendAdapter {
  private bundle: AppwriteBundle | null = null;
  private pendingBundle: Promise<AppwriteBundle | null> | null = null;
  private authListeners = new Set<(session: BackendSession | null) => void>();

  isConfigured(): boolean {
    const cfg = getAppwriteConfig();
    return Boolean(
      cfg.endpoint &&
        cfg.projectId &&
        cfg.databaseId &&
        cfg.tableId &&
        /^https?:\/\//i.test(cfg.endpoint)
    );
  }

  private async getBundle(): Promise<AppwriteBundle | null> {
    if (this.bundle) return this.bundle;
    if (!this.isConfigured()) return null;
    if (this.pendingBundle) return this.pendingBundle;

    this.pendingBundle = import('appwrite')
      .then((sdk) => {
        const cfg = getAppwriteConfig();
        const client = new sdk.Client()
          .setEndpoint(cfg.endpoint)
          .setProject(cfg.projectId);
        const bundle: AppwriteBundle = {
          sdk,
          client,
          account: new sdk.Account(client),
          tablesDB: new sdk.TablesDB(client),
          functions: new sdk.Functions(client),
        };
        this.bundle = bundle;
        return bundle;
      })
      .catch(() => null)
      .finally(() => {
        this.pendingBundle = null;
      });

    return this.pendingBundle;
  }

  private notifyListeners(session: BackendSession | null): void {
    for (const cb of this.authListeners) {
      cb(session);
    }
  }

  async getSession(): Promise<BackendSession | null> {
    const b = await this.getBundle();
    if (!b) return null;
    try {
      const user = await b.account.get();
      return { user: mapUser(user) };
    } catch {
      return null;
    }
  }

  subscribeAuth(callback: (session: BackendSession | null) => void): () => void {
    this.authListeners.add(callback);
    return () => {
      this.authListeners.delete(callback);
    };
  }

  async signUp(email: string, password: string): Promise<AuthActionResult> {
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) return { ok: false, message: emailCheck.error };
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      const created = await b.account.create({
        userId: b.sdk.ID.unique(),
        email: email.trim(),
        password,
      });

      // Crée une session temporaire pour pouvoir envoyer l'email de vérification via Appwrite
      await b.account.createEmailPasswordSession({
        email: email.trim(),
        password,
      });

      const redirectUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/';
      try {
        await b.account.createVerification({ url: redirectUrl });
      } catch {
        // Ne pas bloquer l'écran "Vérifie ta boîte mail" si le SMTP n'est pas encore configuré
      }

      // Déconnexion jusqu'à vérification de l'email
      await b.account.deleteSession({ sessionId: 'current' }).catch(() => {});

      return {
        ok: true,
        needsEmailVerification: true,
        user: mapUser(created),
      };
    } catch {
      return { ok: false, message: GENERIC_SIGNUP_ERROR };
    }
  }

  async signIn(email: string, password: string): Promise<AuthActionResult> {
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) return { ok: false, message: emailCheck.error };
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      await b.account.createEmailPasswordSession({
        email: email.trim(),
        password,
      });
      const user = await b.account.get();
      const mapped = mapUser(user);
      this.notifyListeners({ user: mapped });
      return { ok: true, user: mapped };
    } catch {
      return { ok: false, message: GENERIC_LOGIN_ERROR };
    }
  }

  async signInWithGoogle(): Promise<AuthActionResult> {
    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      const origin =
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      b.account.createOAuth2Session({
        provider: b.sdk.OAuthProvider.Google,
        success: `${origin}/`,
        failure: `${origin}/?auth_error=google`,
      });
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'Connexion Google impossible pour le moment. Réessaie.',
      };
    }
  }

  async signOut(): Promise<void> {
    const b = await this.getBundle();
    if (!b) return;
    try {
      await b.account.deleteSession({ sessionId: 'current' });
    } catch {
      // Ignore network errors during signOut
    }
    this.notifyListeners(null);
  }

  async sendPasswordRecovery(email: string): Promise<AuthActionResult> {
    const emailCheck = validateEmail(email);
    if (!emailCheck.valid) return { ok: false, message: emailCheck.error };

    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/?mode=recovery`
          : 'http://localhost:5173/?mode=recovery';
      await b.account.createRecovery({
        email: email.trim(),
        url: redirectUrl,
      });
      return { ok: true, message: GENERIC_RESET_MESSAGE };
    } catch {
      return { ok: true, message: GENERIC_RESET_MESSAGE };
    }
  }

  async completePasswordRecovery(
    userId: string,
    secret: string,
    newPassword: string
  ): Promise<AuthActionResult> {
    const pwdCheck = validatePassword(newPassword);
    if (!pwdCheck.valid) return { ok: false, message: pwdCheck.error };

    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      await b.account.updateRecovery({
        userId,
        secret,
        password: newPassword,
      });
      return { ok: true, message: 'Mot de passe mis à jour. Tu peux maintenant te connecter.' };
    } catch {
      return {
        ok: false,
        message: 'Impossible de mettre à jour le mot de passe. Redemande un lien.',
      };
    }
  }

  async completeEmailVerification(
    userId: string,
    secret: string
  ): Promise<AuthActionResult> {
    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };

    try {
      await b.account.updateVerification({ userId, secret });
      return {
        ok: true,
        message: 'Adresse email confirmée. Tu peux maintenant te connecter.',
      };
    } catch {
      return {
        ok: false,
        message: 'Lien de confirmation invalide ou expiré.',
      };
    }
  }

  async listProfiles(userId: string): Promise<RemoteLearnerProfileRow[]> {
    const b = await this.getBundle();
    if (!b) throw new Error('Appwrite non configuré');
    const cfg = getAppwriteConfig();

    const res = await b.tablesDB.listRows<AppwriteLearnerRow>({
      databaseId: cfg.databaseId,
      tableId: cfg.tableId,
      queries: [
        b.sdk.Query.equal('user_id', userId),
        b.sdk.Query.orderDesc('client_updated_at'),
        b.sdk.Query.limit(MAX_REMOTE_PROFILES),
      ],
    });

    const decoded: RemoteLearnerProfileRow[] = [];
    for (const row of res.rows) {
      const state = await decodeProfileData(row.data);
      if (!state) continue;
      decoded.push({
        id: row.$id,
        user_id: row.user_id,
        name: row.name,
        kind: row.kind === 'child' ? 'child' : 'adult',
        data: state,
        version: Number(row.version) || 2,
        client_updated_at: row.client_updated_at,
      });
    }
    return decoded;
  }

  async upsertProfiles(
    userId: string,
    rows: RemoteLearnerProfileRow[]
  ): Promise<void> {
    if (!rows.length) return;
    const b = await this.getBundle();
    if (!b) throw new Error('Appwrite non configuré');
    const cfg = getAppwriteConfig();

    // Contrôle côté client de la limite de 4 profils avant création
    const existing = await this.listProfiles(userId);
    const existingIds = new Set(existing.map((r) => r.id));
    let totalCount = existing.length;
    for (const r of rows) {
      if (!existingIds.has(r.id)) {
        totalCount += 1;
        if (totalCount > MAX_REMOTE_PROFILES) {
          throw new Error('Limite de 4 profils maximum par compte atteinte.');
        }
        existingIds.add(r.id);
      }
    }

    const { Permission, Role } = b.sdk;
    const docPermissions = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ];

    for (const row of rows) {
      const encodedData = await encodeProfileData(row.data);
      await b.tablesDB.upsertRow({
        databaseId: cfg.databaseId,
        tableId: cfg.tableId,
        rowId: row.id,
        data: {
          user_id: userId,
          name: row.name,
          kind: row.kind,
          data: encodedData,
          version: row.version,
          client_updated_at: row.client_updated_at,
        },
        permissions: docPermissions,
      });
    }
  }

  async deleteProfile(_userId: string, profileId: string): Promise<void> {
    const b = await this.getBundle();
    if (!b) throw new Error('Appwrite non configuré');
    const cfg = getAppwriteConfig();

    await b.tablesDB.deleteRow({
      databaseId: cfg.databaseId,
      tableId: cfg.tableId,
      rowId: profileId,
    });
  }

  async exportAccountData(userId: string): Promise<RemoteLearnerProfileRow[]> {
    return this.listProfiles(userId);
  }

  async deleteAccount(): Promise<AuthActionResult> {
    const b = await this.getBundle();
    if (!b) return { ok: false, message: GENERIC_CONFIG_ERROR };
    const cfg = getAppwriteConfig();

    try {
      const execution = await b.functions.createExecution({
        functionId: cfg.deleteFunctionId,
        body: '',
        async: false,
        method: b.sdk.ExecutionMethod.POST,
      });
      if (
        execution.status === 'failed' ||
        (execution.responseStatusCode && execution.responseStatusCode >= 400)
      ) {
        return {
          ok: false,
          message: 'La suppression du compte a échoué. Reconnecte-toi puis réessaie.',
        };
      }
      await this.signOut();
      return { ok: true };
    } catch {
      return {
        ok: false,
        message: 'La suppression du compte a échoué. Vérifie ta connexion.',
      };
    }
  }
}
