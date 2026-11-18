import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import viteConfigRaw from '../../../vite.config.ts?raw';
import {
  MemoryBackendAdapter,
  RemoteLearnerProfileRow,
  validateEmail,
  validatePassword,
} from '../backend';
import {
  clearAllLocalAccountData,
  createInitialAppState,
  createLocalProfile,
  MULTI_PROFILE_STORAGE_KEY,
  parseImportedProgressJSON,
  serializeProgressJSON,
} from '../storage';
import {
  CONFLICT_BACKUP_STORAGE_KEY,
  createSyncController,
  ensureUuidProfileIds,
  hasMeaningfulLocalData,
  isUuid,
  loadConflictBackups,
  mergeProfilesByUpdatedAt,
  SYNC_DEBOUNCE_MS,
  toRemoteRow,
} from '../sync';
import { MultiProfileStore, SyncStatus } from '../types';

const sourceFilesRaw = import.meta.glob('../../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('auth, synchronisation Appwrite, confidentialité & sécurité', () => {
  beforeEach(() => {
    const mem = createMemoryStorage();
    const target = new EventTarget();
    const mockWindow = Object.assign(target, {
      localStorage: mem,
    });
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('valide les mots de passe (8 caractères minimum) et les emails', () => {
    expect(validatePassword('1234567').valid).toBe(false);
    expect(validatePassword('').valid).toBe(false);
    expect(validatePassword('motdepasse8').valid).toBe(true);

    expect(validateEmail('invalide').valid).toBe(false);
    expect(validateEmail('aminata@example.com').valid).toBe(true);
  });

  it('déclenche un envoi différé après 5 s, gère le mode hors-ligne et reprend au retour online via MemoryBackendAdapter', async () => {
    let online = true;
    const userId = '00000000-0000-4000-8000-000000000001';
    const adapter = new MemoryBackendAdapter();
    adapter.seedSignedInUser({
      id: userId,
      email: 'awa@example.com',
      password: 'password123',
      emailVerification: true,
    });

    const profile = createLocalProfile('Awa', 'adult');
    profile.state.xp = 120;
    let currentStore: MultiProfileStore = {
      version: 2,
      activeProfileId: profile.id,
      profiles: [profile],
    };

    const statuses: SyncStatus[] = [];
    const controller = createSyncController({
      userId,
      adapter,
      getLocalStore: () => currentStore,
      onMergedStore: (next) => {
        currentStore = next;
      },
      onStatusChange: (s) => statuses.push(s),
      isOnline: () => online,
    });

    // 1. Envoi différé 5 s
    controller.scheduleSync();
    expect(await adapter.listProfiles(userId)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 100);
    expect(await adapter.listProfiles(userId)).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(150);
    const saved = await adapter.listProfiles(userId);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Awa');
    expect(statuses[statuses.length - 1]).toBe('synced');

    // 2. Passage hors-ligne puis reprise online
    online = false;
    window.dispatchEvent(new Event('offline'));
    expect(statuses[statuses.length - 1]).toBe('offline');

    currentStore.profiles[0].state.xp = 240;
    currentStore.profiles[0].updatedAt = new Date(Date.now() + 10000).toISOString();
    controller.scheduleSync();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);
    expect((await adapter.listProfiles(userId))[0].data.xp).toBe(120);

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect((await adapter.listProfiles(userId))[0].data.xp).toBe(240);
    expect(statuses[statuses.length - 1]).toBe('synced');

    controller.dispose();
  });

  it('résout les conflits par client_updated_at le plus récent et sauvegarde la version locale écrasée', () => {
    const profile = createLocalProfile('Moussa', 'child');
    profile.updatedAt = '2026-11-10T10:00:00.000Z';
    profile.state.xp = 45;

    const remoteState = createInitialAppState('child');
    remoteState.xp = 220;
    const remoteRow: RemoteLearnerProfileRow = {
      id: profile.id,
      user_id: '00000000-0000-4000-8000-000000000001',
      name: 'Moussa',
      kind: 'child',
      data: remoteState,
      version: 2,
      client_updated_at: '2026-11-12T15:30:00.000Z',
    };

    const { mergedStore, profilesToPush, conflictsResolved } = mergeProfilesByUpdatedAt(
      {
        version: 2,
        activeProfileId: profile.id,
        profiles: [profile],
      },
      [remoteRow]
    );

    expect(conflictsResolved).toBe(1);
    expect(profilesToPush).toHaveLength(0);
    expect(mergedStore.profiles[0].state.xp).toBe(220);

    const backups = loadConflictBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].profileId).toBe(profile.id);
    expect(backups[0].localProfile.state.xp).toBe(45);
  });

  it('applique la limite stricte de 4 profils maximum par compte dans MemoryBackendAdapter', async () => {
    const userId = '00000000-0000-4000-8000-000000000002';
    const adapter = new MemoryBackendAdapter();
    adapter.seedSignedInUser({
      id: userId,
      email: 'parent@example.com',
      password: 'password123',
      emailVerification: true,
    });

    const rows = [1, 2, 3, 4].map((n) =>
      toRemoteRow(userId, createLocalProfile(`Profil ${n}`, n === 1 ? 'adult' : 'child'))
    );
    await adapter.upsertProfiles(userId, rows);
    expect(await adapter.listProfiles(userId)).toHaveLength(4);

    const fifth = toRemoteRow(userId, createLocalProfile('Profil 5', 'child'));
    await expect(adapter.upsertProfiles(userId, [fifth])).rejects.toThrow(
      /4 profils maximum/i
    );
  });

  it('détecte et migre les données locales avec IDs legacy vers des UUID pour le compte', () => {
    const legacyState = createInitialAppState('adult');
    legacyState.xp = 80;
    const legacyStore: MultiProfileStore = {
      version: 2,
      activeProfileId: 'profile-adult-1',
      profiles: [
        {
          id: 'profile-adult-1',
          name: 'Khadija',
          mode: 'adult',
          createdAt: '2026-11-01T08:00:00.000Z',
          state: legacyState,
        },
      ],
    };

    expect(hasMeaningfulLocalData(legacyStore)).toBe(true);
    const migrated = ensureUuidProfileIds(legacyStore);
    expect(isUuid(migrated.profiles[0].id)).toBe(true);
    expect(migrated.activeProfileId).toBe(migrated.profiles[0].id);
  });

  it('exporte la progression et nettoie compte + données locales lors de deleteAccount', async () => {
    const userId = '00000000-0000-4000-8000-000000000003';
    const adapter = new MemoryBackendAdapter();
    adapter.seedSignedInUser({
      id: userId,
      email: 'fatou@example.com',
      password: 'password123',
      emailVerification: true,
    });

    const p = createLocalProfile('Fatou', 'adult');
    p.state.xp = 310;
    await adapter.upsertProfiles(userId, [toRemoteRow(userId, p)]);

    const exportedRemote = await adapter.exportAccountData(userId);
    expect(exportedRemote).toHaveLength(1);
    expect(exportedRemote[0].data.xp).toBe(310);

    const json = serializeProgressJSON(p.state);
    const parsed = parseImportedProgressJSON(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.xp).toBe(310);
    }

    window.localStorage.setItem(MULTI_PROFILE_STORAGE_KEY, '{"version":2}');
    window.localStorage.setItem('diang-anglais:v1', '{}');
    window.localStorage.setItem(CONFLICT_BACKUP_STORAGE_KEY, '[]');
    window.localStorage.setItem('diang-anglais:audio-settings:v1', '{}');

    const delRes = await adapter.deleteAccount();
    expect(delRes.ok).toBe(true);
    expect(await adapter.getSession()).toBeNull();
    expect(await adapter.listProfiles(userId)).toHaveLength(0);

    clearAllLocalAccountData();
    expect(window.localStorage.getItem(MULTI_PROFILE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('diang-anglais:v1')).toBeNull();
    expect(window.localStorage.getItem(CONFLICT_BACKUP_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('diang-anglais:audio-settings:v1')).toBeNull();
  });

  it('configure Workbox en NetworkOnly pour Appwrite, isole le SDK dans lib/backend/appwrite et n’expose aucune clé serveur ni ancien backend', () => {
    const legacyBackendRegex = new RegExp(`supa${'base'}`, 'i');
    expect(viteConfigRaw).toContain("handler: 'NetworkOnly'");
    expect(viteConfigRaw).toContain('appwrite');
    expect(viteConfigRaw).not.toMatch(legacyBackendRegex);

    for (const [filePath, content] of Object.entries(sourceFilesRaw)) {
      if (filePath.includes('authAndSync.test.ts')) continue;
      expect(content).not.toMatch(/service_role/i);
      expect(content).not.toMatch(/APPWRITE_API_KEY/i);
      expect(content).not.toMatch(legacyBackendRegex);
      if (!filePath.endsWith('/backend/appwrite.ts')) {
        expect(content).not.toMatch(/from\s+['"]appwrite['"]/);
        expect(content).not.toMatch(/import\(\s*['"]appwrite['"]\s*\)/);
      }
    }
  });
});
