import { calculateNextSM2State, formatDateISO } from './sm2';
import {
  CEFRLevel,
  FlashcardItem,
  SM2CardState,
  SM2Rating,
} from './types';

export type SM2Quality = 0 | 1 | 3 | 4 | 5;
export type CardDirection = 'en-to-fr' | 'fr-to-en';

export interface LevelTimingThreshold {
  fastMaxMs: number;
  normalMaxMs: number;
}

export interface SRSTimingConfig {
  maxResponseTimeMs: number;
  baseWordLength: number;
  fastPerExtraCharMs: number;
  normalPerExtraCharMs: number;
  maxExtraCharBonus: number;
  levels: Record<CEFRLevel, LevelTimingThreshold>;
}

/**
 * Configuration unique et modifiable des seuils de temps de réponse (en ms).
 * Les niveaux A1/A2 sont plus tolérants que B1/B2, avec un ajustement selon la longueur du mot.
 */
export const SRS_TIMING_CONFIG: SRSTimingConfig = {
  maxResponseTimeMs: 20_000,
  baseWordLength: 6,
  fastPerExtraCharMs: 160,
  normalPerExtraCharMs: 280,
  maxExtraCharBonus: 18,
  levels: {
    A1: { fastMaxMs: 4200, normalMaxMs: 9500 },
    A2: { fastMaxMs: 3800, normalMaxMs: 8500 },
    B1: { fastMaxMs: 3300, normalMaxMs: 7500 },
    B2: { fastMaxMs: 2900, normalMaxMs: 6500 },
  },
};

const RATING_LABELS_FR: Record<SM2Rating, string> = {
  again: 'À revoir',
  hard: 'Difficile',
  good: 'Bien',
  easy: 'Facile',
};

export function getResponseThresholds(
  level: CEFRLevel,
  wordLength: number,
  config: SRSTimingConfig = SRS_TIMING_CONFIG
): LevelTimingThreshold {
  const base = config.levels[level];
  const extraChars = Math.min(
    config.maxExtraCharBonus,
    Math.max(0, wordLength - config.baseWordLength)
  );
  return {
    fastMaxMs: base.fastMaxMs + extraChars * config.fastPerExtraCharMs,
    normalMaxMs: base.normalMaxMs + extraChars * config.normalPerExtraCharMs,
  };
}

export interface ClassifyResponseInput {
  isCorrect: boolean;
  isDontKnow: boolean;
  responseTimeMs: number;
  card: Pick<FlashcardItem, 'level' | 'en' | 'fr'>;
  direction?: CardDirection;
  previousState: SM2CardState;
  todayStr?: string;
  config?: SRSTimingConfig;
}

export interface ClassifyResponseResult {
  quality: SM2Quality;
  rating: SM2Rating;
  labelFr: string;
  nextState: SM2CardState;
  cappedByNewCardGuard: boolean;
  clampedResponseTimeMs: number;
}

/**
 * Classe automatiquement la réponse + temps silencieux vers une qualité SM-2 :
 * - "Je ne sais pas" -> 0 ('again')
 * - Mauvaise réponse -> 1 ('again')
 * - Bonne réponse lente -> 3 ('hard'), normale -> 4 ('good'), rapide -> 5 ('easy')
 * - Garde-fou : une carte jamais réussie (repetitions === 0) ne dépasse pas 'good' (4).
 */
export function classifyResponseToSM2({
  isCorrect,
  isDontKnow,
  responseTimeMs,
  card,
  direction = 'en-to-fr',
  previousState,
  todayStr = formatDateISO(new Date()),
  config = SRS_TIMING_CONFIG,
}: ClassifyResponseInput): ClassifyResponseResult {
  const clampedResponseTimeMs = Math.max(
    0,
    Math.min(config.maxResponseTimeMs, Math.round(responseTimeMs))
  );

  let quality: SM2Quality;
  let rating: SM2Rating;
  let cappedByNewCardGuard = false;

  if (isDontKnow) {
    quality = 0;
    rating = 'again';
  } else if (!isCorrect) {
    quality = 1;
    rating = 'again';
  } else {
    const promptLength =
      direction === 'fr-to-en' ? card.fr.trim().length : card.en.trim().length;
    const thresholds = getResponseThresholds(card.level, promptLength, config);

    if (clampedResponseTimeMs <= thresholds.fastMaxMs) {
      if (previousState.repetitions === 0) {
        quality = 4;
        rating = 'good';
        cappedByNewCardGuard = true;
      } else {
        quality = 5;
        rating = 'easy';
      }
    } else if (clampedResponseTimeMs <= thresholds.normalMaxMs) {
      quality = 4;
      rating = 'good';
    } else {
      quality = 3;
      rating = 'hard';
    }
  }

  const nextState = calculateNextSM2State(previousState, rating, todayStr);

  return {
    quality,
    rating,
    labelFr: RATING_LABELS_FR[rating],
    nextState,
    cappedByNewCardGuard,
    clampedResponseTimeMs,
  };
}

/**
 * Après 2 réussites consécutives (repetitions >= 2), la carte alterne les sens :
 * repetitions pairs (2, 4, 6...) -> FR -> EN ; impairs (3, 5, 7...) -> EN -> FR.
 */
export function shouldUseReverseDirection(state: SM2CardState): boolean {
  return state.repetitions >= 2 && state.repetitions % 2 === 0;
}

export function getCardDirection(state: SM2CardState): CardDirection {
  return shouldUseReverseDirection(state) ? 'fr-to-en' : 'en-to-fr';
}

function normalizeChoiceText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface CardChoicesResult {
  direction: CardDirection;
  prompt: string;
  correctAnswer: string;
  options: [string, string, string];
  answerIndex: number;
}

/**
 * Construit 3 choix mélangés (1 bonne réponse + 2 distracteurs) pour une carte.
 * Utilise distractors / distractorsEn, avec repli sur les cartes du même thème et niveau.
 */
export function buildCardChoices(
  card: FlashcardItem,
  direction: CardDirection,
  fallbackPool: FlashcardItem[] = [],
  rng: () => number = Math.random
): CardChoicesResult {
  const prompt = direction === 'fr-to-en' ? card.fr : card.en;
  const correctAnswer = direction === 'fr-to-en' ? card.en : card.fr;
  const primaryDistractors =
    direction === 'fr-to-en' ? card.distractorsEn : card.distractors;

  const seen = new Set<string>([normalizeChoiceText(correctAnswer)]);
  const chosenDistractors: string[] = [];

  const tryPush = (candidate: string | undefined) => {
    if (!candidate) return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const norm = normalizeChoiceText(trimmed);
    if (seen.has(norm)) return;
    seen.add(norm);
    chosenDistractors.push(trimmed);
  };

  if (Array.isArray(primaryDistractors)) {
    for (const d of primaryDistractors) {
      if (chosenDistractors.length >= 2) break;
      tryPush(d);
    }
  }

  // Repli déterministe/thématique si des distracteurs manquent
  if (chosenDistractors.length < 2 && fallbackPool.length > 0) {
    const getField = (item: FlashcardItem) =>
      direction === 'fr-to-en' ? item.en : item.fr;

    const sameThemeAndLevel = fallbackPool.filter(
      (c) => c.id !== card.id && c.theme === card.theme && c.level === card.level
    );
    const sameLevel = fallbackPool.filter(
      (c) => c.id !== card.id && c.theme !== card.theme && c.level === card.level
    );
    const others = fallbackPool.filter(
      (c) => c.id !== card.id && c.level !== card.level
    );

    const orderedPools = [sameThemeAndLevel, sameLevel, others];
    for (const pool of orderedPools) {
      if (chosenDistractors.length >= 2) break;
      // Mélange léger dans le pool de repli pour varier les faux choix
      const copy = [...pool];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      for (const candidate of copy) {
        if (chosenDistractors.length >= 2) break;
        tryPush(getField(candidate));
      }
    }
  }

  // Ultime filet de sécurité si le pool est minuscule dans un test isolé
  while (chosenDistractors.length < 2) {
    const idx = chosenDistractors.length + 1;
    tryPush(
      direction === 'fr-to-en' ? `other word ${idx}` : `autre sens ${idx}`
    );
  }

  const options = [
    correctAnswer,
    chosenDistractors[0],
    chosenDistractors[1],
  ] as [string, string, string];

  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const answerIndex = options.findIndex(
    (opt) => normalizeChoiceText(opt) === normalizeChoiceText(correctAnswer)
  );

  return {
    direction,
    prompt,
    correctAnswer,
    options,
    answerIndex: answerIndex >= 0 ? answerIndex : 0,
  };
}

/**
 * Chronomètre silencieux avec pause lors de visibilitychange et plafond à 20 s.
 */
export class SilentResponseTimer {
  private accumulatedMs = 0;
  private activeStartMs: number | null = null;
  private readonly maxMs: number;

  constructor(
    initialNowMs: number = Date.now(),
    maxMs: number = SRS_TIMING_CONFIG.maxResponseTimeMs
  ) {
    this.maxMs = maxMs;
    this.activeStartMs = initialNowMs;
  }

  reset(nowMs: number = Date.now()): void {
    this.accumulatedMs = 0;
    this.activeStartMs = nowMs;
  }

  pause(nowMs: number = Date.now()): void {
    if (this.activeStartMs === null) return;
    this.accumulatedMs += Math.max(0, nowMs - this.activeStartMs);
    this.activeStartMs = null;
  }

  resume(nowMs: number = Date.now()): void {
    if (this.activeStartMs !== null) return;
    this.activeStartMs = nowMs;
  }

  getElapsedMs(nowMs: number = Date.now()): number {
    const running =
      this.activeStartMs !== null ? Math.max(0, nowMs - this.activeStartMs) : 0;
    return Math.min(this.maxMs, this.accumulatedMs + running);
  }
}

export function formatReviewClassificationLabel(
  rating: SM2Rating,
  nextState: SM2CardState
): string {
  const label = RATING_LABELS_FR[rating];
  if (rating === 'again') {
    return `Classée : ${label} · revient dans cette séance et demain`;
  }
  const days = nextState.interval;
  if (days <= 1) {
    return `Classée : ${label} · prochaine révision demain`;
  }
  return `Classée : ${label} · prochaine révision dans ${days} jours`;
}
