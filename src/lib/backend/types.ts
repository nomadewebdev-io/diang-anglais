import { AppState, ProfileMode } from '../types';

export const MAX_REMOTE_PROFILES = 4;

export interface BackendUser {
  id: string;
  email: string | null;
  emailVerification: boolean;
}

export interface BackendSession {
  user: BackendUser;
}

export interface AuthActionResult {
  ok: boolean;
  needsEmailVerification?: boolean;
  message?: string;
  user?: BackendUser | null;
}

export interface RemoteLearnerProfileRow {
  id: string;
  user_id: string;
  name: string;
  kind: ProfileMode;
  data: AppState;
  version: number;
  client_updated_at: string;
}

export interface BackendAdapter {
  isConfigured(): boolean;
  getSession(): Promise<BackendSession | null>;
  subscribeAuth(callback: (session: BackendSession | null) => void): () => void;
  signUp(email: string, password: string): Promise<AuthActionResult>;
  signIn(email: string, password: string): Promise<AuthActionResult>;
  signInWithGoogle(): Promise<AuthActionResult>;
  signOut(): Promise<void>;
  sendPasswordRecovery(email: string): Promise<AuthActionResult>;
  completePasswordRecovery(
    userId: string,
    secret: string,
    newPassword: string
  ): Promise<AuthActionResult>;
  completeEmailVerification(
    userId: string,
    secret: string
  ): Promise<AuthActionResult>;
  listProfiles(userId: string): Promise<RemoteLearnerProfileRow[]>;
  upsertProfiles(userId: string, rows: RemoteLearnerProfileRow[]): Promise<void>;
  deleteProfile(userId: string, profileId: string): Promise<void>;
  exportAccountData(userId: string): Promise<RemoteLearnerProfileRow[]>;
  deleteAccount(): Promise<AuthActionResult>;
}
