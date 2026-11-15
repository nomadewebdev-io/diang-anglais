import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAppState,
  createInitialAppState,
  loadAppState,
  migrateAndValidateState,
  parseImportedProgressJSON,
  saveAppState,
  STORAGE_KEY,
} from '../storage';
import {
  applyThemeToDocument,
  isValidThemePreference,
  resolveEffectiveTheme,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from '../theme';

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

describe('storage — persistance versionnée (diang-anglais:v1), migration et résilience', () => {
  beforeEach(() => {
    const mockStorage = createMemoryStorage();
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: mockStorage,
      },
      writable: true,
      configurable: true,
    });
  });

  it('utilise la clé versionnée diang-anglais:v1 et conserve la progression au rechargement', () => {
    expect(STORAGE_KEY).toBe('diang-anglais:v1');

    const state = createInitialAppState();
    state.profile = {
      firstName: 'Aminata',
      goal: 'travail',
      createdAt: '2026-11-15T00:00:00Z',
    };
    state.onboardingStep = 'placement';
    state.theme = 'dark';
    state.totalMinutesStudied = 45;

    expect(saveAppState(state)).toBe(true);
    expect(window.localStorage.getItem('diang-anglais:v1')).not.toBeNull();

    const reloaded = loadAppState('2026-11-15');
    expect(reloaded.profile?.firstName).toBe('Aminata');
    expect(reloaded.onboardingStep).toBe('placement');
    expect(reloaded.theme).toBe('dark');
    expect(reloaded.totalMinutesStudied).toBe(45);
  });

  it('migre automatiquement les données depuis l’ancienne clé diang-anglais-state-v1 sans perte', () => {
    const legacyPayload = {
      version: 1,
      onboardingStep: 'plan',
      profile: {
        firstName: 'Moussa',
        goal: 'voyage',
        createdAt: '2026-11-14T10:00:00Z',
      },
      placementResult: {
        determinedLevel: 'B1',
        overallScore: 70,
        totalQuestions: 20,
        skillScores: {
          vocab: { correct: 4, total: 5, percentage: 80 },
          grammar: { correct: 3, total: 5, percentage: 60 },
          reading: { correct: 4, total: 5, percentage: 80 },
          listening: { correct: 3, total: 5, percentage: 60 },
        },
        strengths: ['vocab', 'reading'],
        weaknesses: ['grammar', 'listening'],
        completedAt: '2026-11-14T10:15:00Z',
      },
      studyPlan: null,
      sm2States: {},
      studyDates: ['2026-11-14'],
      totalMinutesStudied: 30,
      dictationCompletedCount: 2,
      quizzesCompletedCount: 1,
    };

    window.localStorage.setItem('diang-anglais-state-v1', JSON.stringify(legacyPayload));

    const migrated = loadAppState('2026-11-15');
    expect(migrated.profile?.firstName).toBe('Moussa');
    expect(migrated.placementResult?.determinedLevel).toBe('B1');
    expect(migrated.theme).toBe('system');
    expect(migrated.totalMinutesStudied).toBe(30);
    // Vérifie que la nouvelle clé a bien été écrite et l'ancienne nettoyée
    expect(window.localStorage.getItem('diang-anglais:v1')).not.toBeNull();
    expect(window.localStorage.getItem('diang-anglais-state-v1')).toBeNull();
  });

  it('gère les données corrompues dans localStorage ou à l’import JSON sans planter', () => {
    window.localStorage.setItem('diang-anglais:v1', '{invalid-json:::');
    const fallback = loadAppState('2026-11-15');
    expect(fallback.onboardingStep).toBe('profile');
    expect(fallback.theme).toBe('system');

    expect(migrateAndValidateState(null)).toBeNull();
    expect(migrateAndValidateState({ randomKey: 123 })).toBeNull();

    const badImport = parseImportedProgressJSON('not json');
    expect(badImport.ok).toBe(false);
  });

  it('réinitialise proprement les données via clearAppState', () => {
    const s = createInitialAppState();
    s.totalMinutesStudied = 120;
    saveAppState(s);

    const cleared = clearAppState();
    expect(cleared.totalMinutesStudied).toBe(0);
    expect(loadAppState().totalMinutesStudied).toBe(0);
  });
});

describe('theme — résolution Clair / Sombre / Système et mise à jour DOM', () => {
  it('valide les 3 options de thème et résout correctement le mode Système', () => {
    expect(isValidThemePreference('light')).toBe(true);
    expect(isValidThemePreference('dark')).toBe(true);
    expect(isValidThemePreference('system')).toBe(true);
    expect(isValidThemePreference('purple')).toBe(false);

    expect(resolveEffectiveTheme('light', true)).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
  });

  it('applique la classe .dark et met à jour la balise meta theme-color', () => {
    const classSet = new Set<string>();
    let metaContent = THEME_COLOR_LIGHT;

    const fakeDoc = {
      documentElement: {
        classList: {
          add: (cls: string) => classSet.add(cls),
          remove: (cls: string) => classSet.delete(cls),
        },
        style: { colorScheme: '' },
      },
      querySelector: (selector: string) => {
        if (selector === 'meta[name="theme-color"]') {
          return {
            setAttribute: (_name: string, val: string) => {
              metaContent = val;
            },
          };
        }
        return null;
      },
    } as unknown as Document;

    applyThemeToDocument('dark', fakeDoc, false);
    expect(classSet.has('dark')).toBe(true);
    expect(metaContent).toBe(THEME_COLOR_DARK);

    applyThemeToDocument('light', fakeDoc, true);
    expect(classSet.has('dark')).toBe(false);
    expect(metaContent).toBe(THEME_COLOR_LIGHT);

    applyThemeToDocument('system', fakeDoc, true);
    expect(classSet.has('dark')).toBe(true);
    expect(metaContent).toBe(THEME_COLOR_DARK);
  });
});
