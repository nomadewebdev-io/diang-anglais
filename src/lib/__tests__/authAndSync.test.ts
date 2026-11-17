import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import viteConfigRaw from '../../../vite.config.ts?raw';
import {
  clearAllLocalAccountData,
  createInitialAppState,
  createLocalProfile,
  MULTI_PROFILE_STORAGE_KEY,
  parseImportedProgressJSON,
  serializeProgressJSON,
} from '../storage';
import { validateEmail, validatePassword } from '../supabase';
import {
  CONFLICT_BACKUP_STORAGE_KEY,
  createSyncController,
  ensureUuidProfileIds,
  hasMeaningfulLocalData,
  isUuid,
  loadConflictBackups,
  mergeProfilesByUpdatedAt,
  RemoteLearnerProfileRow,
  SYNC_DEBOUNCE_MS,
  SyncRemoteAdapter,
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

describe('auth, synchronisation cloud, confidentialité & sécurité', () => {
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

  it('déclenche un envoi différé après 5 s, gère le mode hors-ligne et reprend au retour online', async () => {
    let online = true;
    const profile = createLocalProfile('Awa', 'adult');
    profile.state.xp = 120;
    let currentStore: MultiProfileStore = {
      version: 2,
      activeProfileId: profile.id,
      profiles: [profile],
    };

    const upsertedBatches: RemoteLearnerProfileRow[][] = [];
    const adapter: SyncRemoteAdapter = {
      fetchProfiles: vi.fn(async () => []),
      upsertProfiles: vi.fn(async (rows) => {
        upsertedBatches.push(rows);
      }),
    };

    const statuses: SyncStatus[] = [];
    const controller = createSyncController({
      userId: '00000000-0000-4000-8000-000000000001',
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
    expect(upsertedBatches).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS - 100);
    expect(upsertedBatches).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(150);
    expect(upsertedBatches).toHaveLength(1);
    expect(upsertedBatches[0][0].name).toBe('Awa');
    expect(statuses[statuses.length - 1]).toBe('synced');

    // 2. Passage hors-ligne puis reprise online
    online = false;
    window.dispatchEvent(new Event('offline'));
    expect(statuses[statuses.length - 1]).toBe('offline');

    controller.scheduleSync();
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS + 100);
    expect(upsertedBatches).toHaveLength(1); // Pas d'appel réseau hors-ligne

    online = true;
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect(upsertedBatches).toHaveLength(2);
    expect(statuses[statuses.length - 1]).toBe('synced');

    controller.dispose();
  });

  it('résout les conflits par updated_at le plus récent et sauvegarde la version locale écrasée', () => {
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
      updated_at: '2026-11-12T15:30:00.000Z',
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

  it('exporte la progression en JSON et nettoie toutes les données locales après suppression du compte', () => {
    const state = createInitialAppState('adult');
    state.xp = 310;
    const json = serializeProgressJSON(state);
    const parsed = parseImportedProgressJSON(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.state.xp).toBe(310);
    }

    window.localStorage.setItem(MULTI_PROFILE_STORAGE_KEY, '{"version":2}');
    window.localStorage.setItem('diang-anglais:v1', '{}');
    window.localStorage.setItem(CONFLICT_BACKUP_STORAGE_KEY, '[]');
    window.localStorage.setItem('diang-anglais:audio-settings:v1', '{}');

    clearAllLocalAccountData();

    expect(window.localStorage.getItem(MULTI_PROFILE_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('diang-anglais:v1')).toBeNull();
    expect(window.localStorage.getItem(CONFLICT_BACKUP_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem('diang-anglais:audio-settings:v1')).toBeNull();
  });

  it('configure Workbox en NetworkOnly pour Supabase et n’expose jamais service_role dans le code', () => {
    expect(viteConfigRaw).toContain("handler: 'NetworkOnly'");
    expect(viteConfigRaw).toContain('supabase');

    for (const [filePath, content] of Object.entries(sourceFilesRaw)) {
      if (filePath.includes('authAndSync.test.ts')) continue;
      expect(content).not.toMatch(/service_role/i);
    }
  });
});
