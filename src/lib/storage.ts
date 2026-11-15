import { applyAutomaticCatchUp } from './planner';
import { formatDateISO } from './sm2';
import { isValidThemePreference } from './theme';
import { AppState, OnboardingStep, StudyPlan } from './types';

export const STORAGE_KEY = 'diang-anglais:v1';
export const LEGACY_STORAGE_KEYS = [
  'diang-anglais-state-v1',
  'diang-anglais:v0',
  'diang-anglais',
];
export const CURRENT_SCHEMA_VERSION = 1;

const VALID_ONBOARDING_STEPS: OnboardingStep[] = [
  'profile',
  'placement',
  'plan',
  'ready',
];

export function createInitialAppState(): AppState {
  return {
    version: CURRENT_SCHEMA_VERSION,
    theme: 'system',
    onboardingStep: 'profile',
    profile: null,
    placementResult: null,
    studyPlan: null,
    sm2States: {},
    studyDates: [],
    totalMinutesStudied: 0,
    dictationCompletedCount: 0,
    quizzesCompletedCount: 0,
  };
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
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

  const studyDates = Array.isArray(candidate.studyDates)
    ? candidate.studyDates.filter((d): d is string => typeof d === 'string')
    : [];

  const theme = isValidThemePreference(candidate.theme) ? candidate.theme : 'system';

  return {
    version: CURRENT_SCHEMA_VERSION,
    theme,
    onboardingStep,
    profile,
    placementResult,
    studyPlan,
    sm2States,
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
        saveAppState(migrated);
        return migrated;
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
        saveAppState(migrated);
        safeRemoveItem(legacyKey);
        return migrated;
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
