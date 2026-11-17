import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCatalogForProfile,
  loadFullCatalogForMode,
  loadPlacementBank,
} from '../catalog';
import { generateParentChallenge, verifyParentChallenge } from '../parentGate';
import { getDefaultPlanPreferences } from '../planner';
import { getBonusPauseThreshold } from '../progression';
import { createInitialSM2State } from '../sm2';
import { classifyResponseToSM2, getResponseThresholds } from '../srs';
import {
  addProfileToStore,
  createInitialAppState,
  createLocalProfile,
  getActiveProfile,
  loadMultiProfileStore,
  MAX_LOCAL_PROFILES,
  saveAppState,
  switchActiveProfile,
  updateActiveProfileState,
} from '../storage';

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

describe('Mode enfant & profils locaux', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: { localStorage: createMemoryStorage() },
      writable: true,
      configurable: true,
    });
  });

  it('migre les données v1 existantes vers un premier profil Adulte sans perte', () => {
    const legacyState = createInitialAppState('adult');
    legacyState.profile = {
      firstName: 'Moussa',
      goal: 'travail',
      createdAt: '2026-11-10T10:00:00Z',
    };
    legacyState.xp = 240;
    legacyState.onboardingStep = 'ready';
    saveAppState(legacyState);

    const store = loadMultiProfileStore('2026-11-16');
    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0].mode).toBe('adult');
    expect(store.profiles[0].name).toBe('Moussa');
    expect(store.profiles[0].state.xp).toBe(240);
  });

  it('isole complètement la progression entre jusqu’à 4 profils locaux', () => {
    let store = loadMultiProfileStore('2026-11-16');
    expect(store.profiles).toHaveLength(0);

    const p1 = createLocalProfile('Awa', 'child');
    const p2 = createLocalProfile('Aminata', 'adult');
    const p3 = createLocalProfile('Omar', 'child');
    const p4 = createLocalProfile('Cheikh', 'adult');
    const p5 = createLocalProfile('Fatou', 'adult');

    store = addProfileToStore(store, p1);
    store = addProfileToStore(store, p2);
    store = addProfileToStore(store, p3);
    store = addProfileToStore(store, p4);
    store = addProfileToStore(store, p5); // ignoré car max 4
    expect(store.profiles).toHaveLength(MAX_LOCAL_PROFILES);

    // Modifier Awa (active = p4 actuellement, basculons sur p1)
    store = switchActiveProfile(store, p1.id);
    store = updateActiveProfileState(store, (s) => ({
      ...s,
      xp: 95,
      theme: 'dark',
    }));

    const reloaded = loadMultiProfileStore('2026-11-16');
    const awa = getActiveProfile(reloaded);
    const aminata = reloaded.profiles.find((p) => p.id === p2.id);

    expect(awa?.name).toBe('Awa');
    expect(awa?.state.xp).toBe(95);
    expect(awa?.state.theme).toBe('dark');
    expect(aminata?.state.xp).toBe(0);
    expect(aminata?.state.theme).toBe('system');
  });

  it('charge le bon catalogue dynamiquement selon le mode et le niveau sans jamais mélanger adulte et enfant', async () => {
    const kids = await loadFullCatalogForMode('child');
    const adult = await loadFullCatalogForMode('adult');

    expect(kids.cards).toHaveLength(320);
    expect(kids.lessons).toHaveLength(18);
    expect(kids.placement).toHaveLength(90);
    expect(kids.sentences).toHaveLength(120);
    expect(kids.constructions).toHaveLength(64);
    expect(kids.cards.every((c) => Boolean(c.emoji))).toBe(true);
    expect(kids.cards.every((c) => ['A0', 'A1', 'A2'].includes(c.level))).toBe(true);

    expect(adult.cards).toHaveLength(800);
    const kidsIds = new Set(kids.cards.map((c) => c.id));
    expect(adult.cards.some((c) => kidsIds.has(c.id))).toBe(false);

    // Chargement ciblé par niveau (ex. A1 + A2 uniquement, sans B1/B2 ni banque de placement)
    const targeted = await loadCatalogForProfile('adult', 'A1', 'A2', false);
    expect(targeted.cards.every((c) => c.level === 'A1' || c.level === 'A2')).toBe(true);
    expect(targeted.placement).toHaveLength(0);

    // Banque de test chargée à la demande
    const kidsPlacement = await loadPlacementBank('child');
    expect(kidsPlacement).toHaveLength(90);
  });

  it('génère et vérifie le calcul de contrôle de l’espace parent', () => {
    const challenge = generateParentChallenge(() => 0.5); // 7 × 7 = 49
    expect(challenge.a).toBe(7);
    expect(challenge.b).toBe(7);
    expect(challenge.questionFr).toContain('7 × 7');
    expect(verifyParentChallenge(challenge, '49')).toBe(true);
    expect(verifyParentChallenge(challenge, ' 49 ')).toBe(true);
    expect(verifyParentChallenge(challenge, '48')).toBe(false);
    expect(verifyParentChallenge(challenge, 'abc')).toBe(false);
  });

  it('multiplie par 2 les seuils de temps du classement automatique en mode enfant', () => {
    const adultThresh = getResponseThresholds('A1', 6, undefined, 'adult');
    const childThresh = getResponseThresholds('A1', 6, undefined, 'child');

    expect(childThresh.fastMaxMs).toBe(adultThresh.fastMaxMs * 2);
    expect(childThresh.normalMaxMs).toBe(adultThresh.normalMaxMs * 2);

    const learned = {
      ...createInitialSM2State('kcard-a1-01', '2026-11-16'),
      repetitions: 1,
      interval: 1,
    };

    // 7000 ms : normal ('good') pour un adulte, mais rapide ('easy') pour un enfant (<= 8400 ms)
    const childFast = classifyResponseToSM2({
      isCorrect: true,
      isDontKnow: false,
      responseTimeMs: 7000,
      card: { level: 'A1', en: 'apple', fr: 'pomme' },
      mode: 'child',
      previousState: learned,
      todayStr: '2026-11-16',
    });
    expect(childFast.rating).toBe('easy');
    expect(childFast.quality).toBe(5);
  });

  it('applique les réglages par défaut du profil enfant (voix 0,85x, séances 5-8 min, pause après 2 bonus)', () => {
    const childState = createInitialAppState('child');
    expect(childState.mode).toBe('child');
    expect(childState.playbackRate).toBe(0.85);

    const planPrefs = getDefaultPlanPreferences('child');
    expect(planPrefs.minutesPerSession).toBeGreaterThanOrEqual(5);
    expect(planPrefs.minutesPerSession).toBeLessThanOrEqual(8);
    expect(getBonusPauseThreshold('child')).toBe(2);
    expect(getBonusPauseThreshold('adult')).toBe(4);
  });
});
