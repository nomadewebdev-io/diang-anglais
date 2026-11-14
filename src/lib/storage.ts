import { applyAutomaticCatchUp } from './planner';
import { formatDateISO } from './sm2';
import { AppState } from './types';

export const STORAGE_KEY = 'diang-anglais-state-v1';

export function createInitialAppState(): AppState {
  return {
    version: 1,
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

export function isValidAppState(candidate: unknown): candidate is AppState {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const obj = candidate as Record<string, unknown>;
  const validSteps = ['profile', 'placement', 'plan', 'ready'];
  if (typeof obj.onboardingStep !== 'string' || !validSteps.includes(obj.onboardingStep)) {
    return false;
  }
  if (!Array.isArray(obj.studyDates)) {
    return false;
  }
  if (typeof obj.sm2States !== 'object' || obj.sm2States === null) {
    return false;
  }
  return true;
}

export function loadAppState(todayStr: string = formatDateISO(new Date())): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialAppState();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isValidAppState(parsed)) {
      return createInitialAppState();
    }

    // Automatically apply non-guilt catch-up if studyPlan exists and has missed sessions
    if (parsed.studyPlan) {
      const { plan, adjustedCount } = applyAutomaticCatchUp(parsed.studyPlan, todayStr);
      if (adjustedCount > 0) {
        const updated: AppState = {
          ...parsed,
          studyPlan: plan,
        };
        saveAppState(updated);
        return updated;
      }
    }

    return parsed;
  } catch {
    return createInitialAppState();
  }
}

export function saveAppState(state: AppState): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
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
    if (!isValidAppState(parsed)) {
      return {
        ok: false,
        error:
          'Le fichier JSON ne correspond pas au format de sauvegarde Diang-Anglais (champs requis manquants).',
      };
    }

    let finalPlan = parsed.studyPlan;
    if (finalPlan) {
      finalPlan = applyAutomaticCatchUp(finalPlan, todayStr).plan;
    }

    const validState: AppState = {
      ...parsed,
      studyPlan: finalPlan,
    };

    return { ok: true, state: validState };
  } catch {
    return {
      ok: false,
      error: 'Impossible de lire ce fichier : le contenu JSON est invalide ou corrompu.',
    };
  }
}
