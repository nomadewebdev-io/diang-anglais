import {
  CHILD_DEFAULT_PLAYBACK_RATE,
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_VOICE_ID,
  isValidPlaybackSpeed,
  migrateVoiceId,
  syncAudioPreferences,
} from './audio';
import { applyAutomaticCatchUp } from './planner';
import { formatDateISO } from './sm2';
import { isValidThemePreference } from './theme';
import {
  AppState,
  LocalProfileRecord,
  MultiProfileStore,
  OnboardingStep,
  PlacementSessionAnswer,
  PlacementSessionState,
  PlacementSessionStatus,
  ProfileMode,
  StudyPlan,
} from './types';

export const STORAGE_KEY = 'diang-anglais:v1';
export const MULTI_PROFILE_STORAGE_KEY = 'diang-anglais:v2';
export const MAX_LOCAL_PROFILES = 4;
export const LEGACY_STORAGE_KEYS = [
  'diang-anglais-state-v1',
  'diang-anglais:v0',
  'diang-anglais',
];
export const CURRENT_SCHEMA_VERSION = 1;
export const CURRENT_MULTI_PROFILE_VERSION = 2;

const VALID_ONBOARDING_STEPS: OnboardingStep[] = [
  'profile',
  'placement',
  'plan',
  'ready',
];

const VALID_SESSION_STATUSES: PlacementSessionStatus[] = [
  'in_progress',
  'abandoned',
  'completed',
];

export function createInitialAppState(mode: ProfileMode = 'adult'): AppState {
  const defaultRate =
    mode === 'child' ? CHILD_DEFAULT_PLAYBACK_RATE : DEFAULT_PLAYBACK_RATE;
  syncAudioPreferences(DEFAULT_VOICE_ID, defaultRate);
  return {
    version: CURRENT_SCHEMA_VERSION,
    mode,
    theme: 'system',
    voiceId: DEFAULT_VOICE_ID,
    playbackRate: defaultRate,
    dailyNewCardsLimit: mode === 'child' ? 10 : 20,
    xp: 0,
    dailyLogs: {},
    earnedBadges: [],
    onboardingStep: 'profile',
    profile: null,
    placementResult: null,
    seenQuestionIds: [],
    placementSession: null,
    studyPlan: null,
    sm2States: {},
    constructionProgress: {},
    studyDates: [],
    totalMinutesStudied: 0,
    dictationCompletedCount: 0,
    quizzesCompletedCount: 0,
  };
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function normalizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (typeof item === 'string' && item.trim().length > 0 && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

function normalizePlacementSession(raw: unknown): PlacementSessionState | null {
  if (!isPlainObject(raw) || typeof raw.id !== 'string' || raw.id.trim().length === 0) {
    return null;
  }
  const status: PlacementSessionStatus = VALID_SESSION_STATUSES.includes(
    raw.status as PlacementSessionStatus
  )
    ? (raw.status as PlacementSessionStatus)
    : 'abandoned';
  const questionIds = normalizeStringArray(raw.questionIds);
  const answers: PlacementSessionAnswer[] = Array.isArray(raw.answers)
    ? (raw.answers.filter(
        (a) => isPlainObject(a) && typeof a.questionId === 'string'
      ) as unknown as PlacementSessionAnswer[])
    : [];
  const startedAt =
    typeof raw.startedAt === 'string' && raw.startedAt.trim().length > 0
      ? raw.startedAt
      : new Date().toISOString();

  return {
    id: raw.id,
    questionIds,
    answers,
    startedAt,
    status,
  };
}

/**
 * Migre et normalise un objet brut (provenant d'une version antérieure ou actuelle)
 * vers le format AppState v1 sans écraser la progression existante.
 */
export function migrateAndValidateState(
  candidate: unknown,
  todayStr: string = formatDateISO(new Date())
): AppState | null {
  if (!isPlainObject(candidate)) {
    return null;
  }

  const hasKnownFields =
    'onboardingStep' in candidate ||
    'profile' in candidate ||
    'placementResult' in candidate ||
    'seenQuestionIds' in candidate ||
    'placementSession' in candidate ||
    'voiceId' in candidate ||
    'playbackRate' in candidate ||
    'studyPlan' in candidate ||
    'sm2States' in candidate ||
    'studyDates' in candidate;

  if (!hasKnownFields) {
    return null;
  }

  const profile =
    isPlainObject(candidate.profile) &&
    typeof candidate.profile.firstName === 'string' &&
    candidate.profile.firstName.trim().length > 0
      ? {
          firstName: candidate.profile.firstName.trim(),
          goal: (['voyage', 'travail', 'études', 'conversation'].includes(
            String(candidate.profile.goal)
          )
            ? candidate.profile.goal
            : 'travail') as AppState['profile'] extends null ? never : NonNullable<AppState['profile']>['goal'],
          createdAt:
            typeof candidate.profile.createdAt === 'string'
              ? candidate.profile.createdAt
              : new Date().toISOString(),
        }
      : null;

  const placementResult =
    isPlainObject(candidate.placementResult) &&
    typeof candidate.placementResult.determinedLevel === 'string' &&
    isPlainObject(candidate.placementResult.skillScores)
      ? (candidate.placementResult as unknown as AppState['placementResult'])
      : null;

  let studyPlan: StudyPlan | null =
    isPlainObject(candidate.studyPlan) &&
    isPlainObject(candidate.studyPlan.config) &&
    Array.isArray(candidate.studyPlan.sessions)
      ? ({
          ...candidate.studyPlan,
          milestoneTests: isPlainObject(candidate.studyPlan.milestoneTests)
            ? candidate.studyPlan.milestoneTests
            : {},
        } as unknown as StudyPlan)
      : null;

  if (studyPlan) {
    studyPlan = applyAutomaticCatchUp(studyPlan, todayStr).plan;
  }

  // Déterminer l'étape d'onboarding cohérente avec les données réellement présentes
  let onboardingStep: OnboardingStep = 'profile';
  if (
    typeof candidate.onboardingStep === 'string' &&
    VALID_ONBOARDING_STEPS.includes(candidate.onboardingStep as OnboardingStep)
  ) {
    onboardingStep = candidate.onboardingStep as OnboardingStep;
  } else if (studyPlan) {
    onboardingStep = 'ready';
  } else if (placementResult) {
    onboardingStep = 'plan';
  } else if (profile) {
    onboardingStep = 'placement';
  }

  // Si l'étape marquée est 'ready' mais qu'il n'y a pas de studyPlan, revenir à l'étape correspondante
  if (onboardingStep === 'ready' && !studyPlan) {
    onboardingStep = placementResult ? 'plan' : profile ? 'placement' : 'profile';
  }

  const sm2States = isPlainObject(candidate.sm2States)
    ? (candidate.sm2States as unknown as AppState['sm2States'])
    : {};

  const constructionProgress = isPlainObject(candidate.constructionProgress)
    ? (candidate.constructionProgress as unknown as AppState['constructionProgress'])
    : {};

  const studyDates = Array.isArray(candidate.studyDates)
    ? candidate.studyDates.filter((d): d is string => typeof d === 'string')
    : [];

  const theme = isValidThemePreference(candidate.theme) ? candidate.theme : 'system';
  const voiceId = migrateVoiceId(candidate.voiceId);
  const playbackRate = isValidPlaybackSpeed(candidate.playbackRate)
    ? candidate.playbackRate
    : DEFAULT_PLAYBACK_RATE;

  syncAudioPreferences(voiceId, playbackRate);

  const placementSession = normalizePlacementSession(candidate.placementSession);
  const rawSeenIds = normalizeStringArray(candidate.seenQuestionIds);
  const seenQuestionIds = placementSession
    ? normalizeStringArray([...rawSeenIds, ...placementSession.questionIds])
    : rawSeenIds;

  const dailyNewCardsLimit =
    typeof candidate.dailyNewCardsLimit === 'number' &&
    Number.isFinite(candidate.dailyNewCardsLimit) &&
    candidate.dailyNewCardsLimit >= 5 &&
    candidate.dailyNewCardsLimit <= 100
      ? Math.round(candidate.dailyNewCardsLimit)
      : 20;

  const xp =
    typeof candidate.xp === 'number' && Number.isFinite(candidate.xp)
      ? Math.max(0, Math.round(candidate.xp))
      : 0;

  const dailyLogs = isPlainObject(candidate.dailyLogs)
    ? (candidate.dailyLogs as unknown as AppState['dailyLogs'])
    : {};

  const earnedBadges = normalizeStringArray(candidate.earnedBadges);

  const mode: ProfileMode = candidate.mode === 'child' ? 'child' : 'adult';

  return {
    version: CURRENT_SCHEMA_VERSION,
    mode,
    theme,
    voiceId,
    playbackRate,
    dailyNewCardsLimit,
    xp,
    dailyLogs,
    earnedBadges,
    onboardingStep,
    profile,
    placementResult,
    seenQuestionIds,
    placementSession,
    studyPlan,
    sm2States,
    constructionProgress,
    studyDates,
    totalMinutesStudied:
      typeof candidate.totalMinutesStudied === 'number' &&
      Number.isFinite(candidate.totalMinutesStudied)
        ? Math.max(0, candidate.totalMinutesStudied)
        : 0,
    dictationCompletedCount:
      typeof candidate.dictationCompletedCount === 'number' &&
      Number.isFinite(candidate.dictationCompletedCount)
        ? Math.max(0, candidate.dictationCompletedCount)
        : 0,
    quizzesCompletedCount:
      typeof candidate.quizzesCompletedCount === 'number' &&
      Number.isFinite(candidate.quizzesCompletedCount)
        ? Math.max(0, candidate.quizzesCompletedCount)
        : 0,
  };
}

function markInProgressSessionAbandonedOnLoad(state: AppState): AppState {
  if (!state.placementSession || state.placementSession.status !== 'in_progress') {
    return state;
  }
  const mergedSeen = normalizeStringArray([
    ...state.seenQuestionIds,
    ...state.placementSession.questionIds,
  ]);
  return {
    ...state,
    seenQuestionIds: mergedSeen,
    placementSession: {
      ...state.placementSession,
      status: 'abandoned',
    },
  };
}

export function isValidAppState(candidate: unknown): candidate is AppState {
  return migrateAndValidateState(candidate) !== null;
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage removal errors
  }
}

export function saveAppState(state: AppState): boolean {
  syncAudioPreferences(state.voiceId, state.playbackRate);
  return safeSetItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAppState(): AppState {
  safeRemoveItem(STORAGE_KEY);
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    safeRemoveItem(legacyKey);
  }
  const fresh = createInitialAppState();
  saveAppState(fresh);
  return fresh;
}

export function loadAppState(todayStr: string = formatDateISO(new Date())): AppState {
  // 1. Lecture depuis la clé versionnée principale "diang-anglais:v1"
  const primaryRaw = safeGetItem(STORAGE_KEY);
  if (primaryRaw) {
    try {
      const parsed: unknown = JSON.parse(primaryRaw);
      const migrated = migrateAndValidateState(parsed, todayStr);
      if (migrated) {
        const finalized = markInProgressSessionAbandonedOnLoad(migrated);
        saveAppState(finalized);
        return finalized;
      }
    } catch {
      // JSON corrompu sur la clé principale : on tente les clés legacy avant fallback
    }
  }

  // 2. Migration automatique depuis une clé antérieure (ex: "diang-anglais-state-v1")
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    const legacyRaw = safeGetItem(legacyKey);
    if (!legacyRaw) continue;
    try {
      const parsed: unknown = JSON.parse(legacyRaw);
      const migrated = migrateAndValidateState(parsed, todayStr);
      if (migrated) {
        const finalized = markInProgressSessionAbandonedOnLoad(migrated);
        saveAppState(finalized);
        safeRemoveItem(legacyKey);
        return finalized;
      }
    } catch {
      // Ignorer la clé legacy corrompue
    }
  }

  return createInitialAppState();
}

export function serializeProgressJSON(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseImportedProgressJSON(
  jsonText: string,
  todayStr: string = formatDateISO(new Date())
): { ok: true; state: AppState } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const migrated = migrateAndValidateState(parsed, todayStr);
    if (!migrated) {
      return {
        ok: false,
        error:
          'Le fichier JSON ne correspond pas au format de sauvegarde Diang-Anglais (champs requis manquants).',
      };
    }
    return { ok: true, state: migrated };
  } catch {
    return {
      ok: false,
      error: 'Impossible de lire ce fichier : le contenu JSON est invalide ou corrompu.',
    };
  }
}

// --- Multi-profils locaux (max 4 profils sur l'appareil, clé diang-anglais:v2) ---

export function getActiveProfile(
  store: MultiProfileStore
): LocalProfileRecord | null {
  if (store.profiles.length === 0) return null;
  return (
    store.profiles.find((p) => p.id === store.activeProfileId) ??
    store.profiles[0]
  );
}

export function saveMultiProfileStore(store: MultiProfileStore): boolean {
  const active = getActiveProfile(store);
  if (active) {
    syncAudioPreferences(active.state.voiceId, active.state.playbackRate);
  }
  return safeSetItem(MULTI_PROFILE_STORAGE_KEY, JSON.stringify(store));
}

let pendingStoreToSave: MultiProfileStore | null = null;
let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let saveIdleHandle: number | null = null;
let unloadListenersRegistered = false;

export function flushPendingStorageWrites(): void {
  if (saveDebounceTimer !== null) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  if (
    saveIdleHandle !== null &&
    typeof window !== 'undefined' &&
    typeof (window as Window & { cancelIdleCallback?: (id: number) => void })
      .cancelIdleCallback === 'function'
  ) {
    (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
      saveIdleHandle
    );
    saveIdleHandle = null;
  }
  if (pendingStoreToSave) {
    const toWrite = pendingStoreToSave;
    pendingStoreToSave = null;
    saveMultiProfileStore(toWrite);
  }
}

export function scheduleSaveMultiProfileStore(
  store: MultiProfileStore,
  delayMs = 600
): void {
  pendingStoreToSave = store;
  const active = getActiveProfile(store);
  if (active) {
    syncAudioPreferences(active.state.voiceId, active.state.playbackRate);
  }

  if (typeof window !== 'undefined' && !unloadListenersRegistered) {
    unloadListenersRegistered = true;
    window.addEventListener('pagehide', flushPendingStorageWrites);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) flushPendingStorageWrites();
      });
    }
  }

  if (saveDebounceTimer !== null) {
    clearTimeout(saveDebounceTimer);
  }
  saveDebounceTimer = setTimeout(() => {
    saveDebounceTimer = null;
    const ric =
      typeof window !== 'undefined'
        ? (
            window as Window & {
              requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback
        : undefined;
    if (typeof ric === 'function') {
      saveIdleHandle = ric(
        () => {
          saveIdleHandle = null;
          flushPendingStorageWrites();
        },
        { timeout: 1500 }
      );
    } else {
      flushPendingStorageWrites();
    }
  }, Math.max(500, delayMs));
}

export function createLocalProfile(
  name: string,
  mode: ProfileMode,
  goal?: NonNullable<AppState['profile']>['goal']
): LocalProfileRecord {
  const cleanName = name.trim().slice(0, 32) || (mode === 'child' ? 'Enfant' : 'Adulte');
  const nowIso = new Date().toISOString();
  const state = createInitialAppState(mode);
  const resolvedGoal = goal ?? (mode === 'child' ? 'études' : 'conversation');
  state.profile = {
    firstName: cleanName,
    goal: resolvedGoal,
    mode,
    createdAt: nowIso,
  };
  state.onboardingStep = 'placement';

  return {
    id: `prof-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    mode,
    createdAt: nowIso,
    state,
  };
}

export function addProfileToStore(
  store: MultiProfileStore,
  profile: LocalProfileRecord
): MultiProfileStore {
  if (store.profiles.length >= MAX_LOCAL_PROFILES) {
    return store;
  }
  const next: MultiProfileStore = {
    version: CURRENT_MULTI_PROFILE_VERSION,
    activeProfileId: profile.id,
    profiles: [...store.profiles, profile],
  };
  saveMultiProfileStore(next);
  return next;
}

export function switchActiveProfile(
  store: MultiProfileStore,
  profileId: string
): MultiProfileStore {
  const found = store.profiles.find((p) => p.id === profileId);
  if (!found) return store;
  const next: MultiProfileStore = {
    ...store,
    activeProfileId: found.id,
  };
  saveMultiProfileStore(next);
  return next;
}

export function updateActiveProfileState(
  store: MultiProfileStore,
  updater: (prev: AppState) => AppState,
  deferWrite = false
): MultiProfileStore {
  const active = getActiveProfile(store);
  if (!active) return store;
  const updatedState = updater(active.state);
  const nextProfiles = store.profiles.map((p) =>
    p.id === active.id
      ? {
          ...p,
          name: updatedState.profile?.firstName || p.name,
          state: updatedState,
        }
      : p
  );
  const next: MultiProfileStore = {
    ...store,
    profiles: nextProfiles,
  };
  if (deferWrite) {
    scheduleSaveMultiProfileStore(next);
  } else {
    saveMultiProfileStore(next);
  }
  return next;
}

export function resetActiveProfileInStore(
  store: MultiProfileStore
): MultiProfileStore {
  const active = getActiveProfile(store);
  if (!active) return store;
  const freshState = createInitialAppState(active.mode);
  freshState.profile = {
    firstName: active.name,
    goal: active.mode === 'child' ? 'études' : 'conversation',
    mode: active.mode,
    createdAt: active.createdAt,
  };
  freshState.onboardingStep = 'placement';

  const next: MultiProfileStore = {
    ...store,
    profiles: store.profiles.map((p) =>
      p.id === active.id ? { ...p, state: freshState } : p
    ),
  };
  saveMultiProfileStore(next);
  return next;
}

export function deleteProfileFromStore(
  store: MultiProfileStore,
  profileId: string
): MultiProfileStore {
  const remaining = store.profiles.filter((p) => p.id !== profileId);
  const nextActiveId =
    store.activeProfileId === profileId
      ? remaining[0]?.id ?? ''
      : store.activeProfileId;
  const next: MultiProfileStore = {
    version: CURRENT_MULTI_PROFILE_VERSION,
    activeProfileId: nextActiveId,
    profiles: remaining,
  };
  saveMultiProfileStore(next);
  return next;
}

export function loadMultiProfileStore(
  todayStr: string = formatDateISO(new Date())
): MultiProfileStore {
  const rawV2 = safeGetItem(MULTI_PROFILE_STORAGE_KEY);
  if (rawV2) {
    try {
      const parsed: unknown = JSON.parse(rawV2);
      if (isPlainObject(parsed) && Array.isArray(parsed.profiles)) {
        const validProfiles: LocalProfileRecord[] = [];
        for (const item of parsed.profiles) {
          if (!isPlainObject(item) || typeof item.id !== 'string') continue;
          const migrated = migrateAndValidateState(item.state, todayStr);
          if (!migrated) continue;
          const finalized = markInProgressSessionAbandonedOnLoad(migrated);
          const mode: ProfileMode = item.mode === 'child' ? 'child' : finalized.mode;
          finalized.mode = mode;
          validProfiles.push({
            id: item.id,
            name:
              typeof item.name === 'string' && item.name.trim()
                ? item.name.trim()
                : finalized.profile?.firstName || (mode === 'child' ? 'Enfant' : 'Adulte'),
            mode,
            createdAt:
              typeof item.createdAt === 'string'
                ? item.createdAt
                : finalized.profile?.createdAt || new Date().toISOString(),
            state: finalized,
          });
        }
        if (validProfiles.length > 0) {
          const activeId = validProfiles.some((p) => p.id === parsed.activeProfileId)
            ? String(parsed.activeProfileId)
            : validProfiles[0].id;
          const store: MultiProfileStore = {
            version: CURRENT_MULTI_PROFILE_VERSION,
            activeProfileId: activeId,
            profiles: validProfiles.slice(0, MAX_LOCAL_PROFILES),
          };
          saveMultiProfileStore(store);
          return store;
        }
      }
    } catch {
      // Fallback to v1 migration
    }
  }

  // Migration automatique depuis v1 ou clés legacy vers un premier profil "Adulte"
  const keysToCheck = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS];
  for (const key of keysToCheck) {
    const raw = safeGetItem(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateAndValidateState(parsed, todayStr);
      if (migrated) {
        const finalized = markInProgressSessionAbandonedOnLoad(migrated);
        finalized.mode = 'adult';
        const profileName = finalized.profile?.firstName || 'Adulte';
        const store: MultiProfileStore = {
          version: CURRENT_MULTI_PROFILE_VERSION,
          activeProfileId: 'profile-adult-1',
          profiles: [
            {
              id: 'profile-adult-1',
              name: profileName,
              mode: 'adult',
              createdAt: finalized.profile?.createdAt || new Date().toISOString(),
              state: finalized,
            },
          ],
        };
        saveMultiProfileStore(store);
        return store;
      }
    } catch {
      // Ignore corrupted key
    }
  }

  return {
    version: CURRENT_MULTI_PROFILE_VERSION,
    activeProfileId: '',
    profiles: [],
  };
}
