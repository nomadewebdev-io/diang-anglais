import {
  BackendAdapter,
  MAX_REMOTE_PROFILES,
  RemoteLearnerProfileRow,
} from './backend';
import { formatDateISO } from './sm2';
import {
  MAX_LOCAL_PROFILES,
  migrateAndValidateState,
  saveMultiProfileStore,
} from './storage';
import {
  LocalProfileRecord,
  MultiProfileStore,
  ProfileMode,
  SyncStatus,
} from './types';

export const SYNC_DEBOUNCE_MS = 5000;
export const CONFLICT_BACKUP_STORAGE_KEY = 'diang-anglais:conflict-backups:v1';
const MAX_CONFLICT_BACKUPS = 10;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ConflictBackupEntry {
  profileId: string;
  profileName: string;
  overwrittenAt: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localProfile: LocalProfileRecord;
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function ensureUuidProfileIds(store: MultiProfileStore): MultiProfileStore {
  let changed = false;
  let nextActiveId = store.activeProfileId;

  const nextProfiles = store.profiles.map((profile) => {
    if (isUuid(profile.id)) return profile;
    changed = true;
    const newId = generateUuid();
    if (store.activeProfileId === profile.id) {
      nextActiveId = newId;
    }
    return {
      ...profile,
      id: newId,
      updatedAt: profile.updatedAt ?? profile.createdAt,
    };
  });

  if (!changed) return store;
  const updated: MultiProfileStore = {
    ...store,
    activeProfileId: nextActiveId,
    profiles: nextProfiles,
  };
  saveMultiProfileStore(updated);
  return updated;
}

export function hasMeaningfulLocalData(store: MultiProfileStore): boolean {
  if (!store.profiles.length) return false;
  return store.profiles.some((profile) => {
    const s = profile.state;
    return (
      s.xp > 0 ||
      s.totalMinutesStudied > 0 ||
      s.onboardingStep !== 'profile' ||
      Object.keys(s.sm2States).length > 0 ||
      Object.keys(s.constructionProgress).length > 0 ||
      Boolean(s.studyPlan) ||
      Boolean(s.placementResult)
    );
  });
}

export function loadConflictBackups(): ConflictBackupEntry[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(CONFLICT_BACKUP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConflictBackup(entry: ConflictBackupEntry): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const existing = loadConflictBackups();
    const updated = [entry, ...existing].slice(0, MAX_CONFLICT_BACKUPS);
    window.localStorage.setItem(CONFLICT_BACKUP_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors for backups
  }
}

function getTimestampMs(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toRemoteRow(
  userId: string,
  profile: LocalProfileRecord
): RemoteLearnerProfileRow {
  return {
    id: profile.id,
    user_id: userId,
    name:
      profile.name.trim().slice(0, 40) ||
      (profile.mode === 'child' ? 'Enfant' : 'Adulte'),
    kind: profile.mode,
    data: profile.state,
    version: profile.state.version,
    client_updated_at:
      profile.updatedAt ?? profile.createdAt ?? new Date().toISOString(),
  };
}

export function mergeProfilesByUpdatedAt(
  localStore: MultiProfileStore,
  remoteRows: RemoteLearnerProfileRow[],
  todayStr: string = formatDateISO(new Date())
): {
  mergedStore: MultiProfileStore;
  profilesToPush: LocalProfileRecord[];
  conflictsResolved: number;
} {
  const normalizedLocal = ensureUuidProfileIds(localStore);
  const localById = new Map(normalizedLocal.profiles.map((p) => [p.id, p]));
  const remoteById = new Map(remoteRows.map((r) => [r.id, r]));

  const mergedProfiles: LocalProfileRecord[] = [];
  const profilesToPush: LocalProfileRecord[] = [];
  let conflictsResolved = 0;

  for (const local of normalizedLocal.profiles) {
    const remote = remoteById.get(local.id);
    if (!remote) {
      mergedProfiles.push(local);
      profilesToPush.push(local);
      continue;
    }

    const localMs = getTimestampMs(local.updatedAt ?? local.createdAt);
    const remoteMs = getTimestampMs(remote.client_updated_at);

    if (remoteMs > localMs) {
      const migratedRemoteState = migrateAndValidateState(remote.data, todayStr);
      if (migratedRemoteState) {
        saveConflictBackup({
          profileId: local.id,
          profileName: local.name,
          overwrittenAt: new Date().toISOString(),
          localUpdatedAt: local.updatedAt ?? local.createdAt,
          remoteUpdatedAt: remote.client_updated_at,
          localProfile: local,
        });
        conflictsResolved += 1;
        mergedProfiles.push({
          id: remote.id,
          name: remote.name,
          mode: remote.kind === 'child' ? 'child' : 'adult',
          createdAt: local.createdAt,
          updatedAt: remote.client_updated_at,
          state: {
            ...migratedRemoteState,
            mode: remote.kind === 'child' ? 'child' : 'adult',
          },
        });
      } else {
        mergedProfiles.push(local);
        profilesToPush.push(local);
      }
    } else {
      mergedProfiles.push(local);
      if (localMs > remoteMs) {
        profilesToPush.push(local);
      }
    }
  }

  const maxProfiles = Math.min(MAX_LOCAL_PROFILES, MAX_REMOTE_PROFILES);
  for (const remote of remoteRows) {
    if (localById.has(remote.id)) continue;
    if (mergedProfiles.length >= maxProfiles) break;
    const migratedRemoteState = migrateAndValidateState(remote.data, todayStr);
    if (!migratedRemoteState) continue;
    const kind: ProfileMode = remote.kind === 'child' ? 'child' : 'adult';
    mergedProfiles.push({
      id: remote.id,
      name: remote.name,
      mode: kind,
      createdAt: remote.client_updated_at,
      updatedAt: remote.client_updated_at,
      state: {
        ...migratedRemoteState,
        mode: kind,
      },
    });
  }

  const bounded = mergedProfiles.slice(0, maxProfiles);
  const activeId = bounded.some((p) => p.id === normalizedLocal.activeProfileId)
    ? normalizedLocal.activeProfileId
    : bounded[0]?.id ?? '';

  return {
    mergedStore: {
      version: normalizedLocal.version,
      activeProfileId: activeId,
      profiles: bounded,
    },
    profilesToPush: profilesToPush.filter((p) =>
      bounded.some((b) => b.id === p.id)
    ),
    conflictsResolved,
  };
}

export interface SyncControllerOptions {
  userId: string;
  adapter: BackendAdapter;
  getLocalStore: () => MultiProfileStore;
  onMergedStore: (store: MultiProfileStore) => void;
  onStatusChange: (status: SyncStatus) => void;
  debounceMs?: number;
  isOnline?: () => boolean;
}

export interface SyncController {
  scheduleSync: () => void;
  syncNow: () => Promise<SyncStatus>;
  deleteRemoteProfile: (profileId: string) => Promise<void>;
  dispose: () => void;
}

export function createSyncController(options: SyncControllerOptions): SyncController {
  const {
    userId,
    adapter,
    getLocalStore,
    onMergedStore,
    onStatusChange,
    debounceMs = SYNC_DEBOUNCE_MS,
    isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine),
  } = options;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<SyncStatus> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const syncNow = async (): Promise<SyncStatus> => {
    if (disposed) return 'synced';
    clearTimer();

    if (!isOnline()) {
      onStatusChange('offline');
      return 'offline';
    }

    if (inFlight) return inFlight;

    inFlight = (async () => {
      onStatusChange('syncing');
      try {
        const localStore = ensureUuidProfileIds(getLocalStore());
        const remoteRows = await adapter.listProfiles(userId);
        const { mergedStore, profilesToPush } = mergeProfilesByUpdatedAt(
          localStore,
          remoteRows
        );

        if (profilesToPush.length > 0) {
          await adapter.upsertProfiles(
            userId,
            profilesToPush.map((p) => toRemoteRow(userId, p))
          );
        }

        saveMultiProfileStore(mergedStore);
        onMergedStore(mergedStore);
        onStatusChange('synced');
        return 'synced' as SyncStatus;
      } catch {
        const nextStatus: SyncStatus = isOnline() ? 'error' : 'offline';
        onStatusChange(nextStatus);
        return nextStatus;
      } finally {
        inFlight = null;
      }
    })();

    return inFlight;
  };

  const scheduleSync = () => {
    if (disposed) return;
    if (!isOnline()) {
      onStatusChange('offline');
      return;
    }
    clearTimer();
    timer = setTimeout(() => {
      void syncNow();
    }, debounceMs);
  };

  const deleteRemoteProfile = async (profileId: string) => {
    if (!isOnline() || !isUuid(profileId)) return;
    try {
      await adapter.deleteProfile(userId, profileId);
    } catch {
      onStatusChange('error');
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void syncNow();
    }
  };

  const handleOnline = () => {
    void syncNow();
  };

  const handleOffline = () => {
    clearTimer();
    onStatusChange('offline');
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  return {
    scheduleSync,
    syncNow,
    deleteRemoteProfile,
    dispose: () => {
      disposed = true;
      clearTimer();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    },
  };
}
