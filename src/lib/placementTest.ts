import {
  CEFRLevel,
  PlacementQuestion,
  PlacementResult,
  PlacementSessionAnswer,
  PlacementSessionState,
  PlacementSessionStatus,
  ProfileMode,
  SkillPerformance,
  SkillType,
} from './types';

export const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
export const KIDS_CEFR_LEVELS: CEFRLevel[] = ['A0', 'A1', 'A2'];
export const KIDS_PLACEMENT_QUESTION_COUNT = 12;
export const ALL_SKILLS: SkillType[] = ['vocab', 'grammar', 'reading', 'listening'];

export function getLevelsForMode(mode: ProfileMode = 'adult'): CEFRLevel[] {
  return mode === 'child' ? KIDS_CEFR_LEVELS : CEFR_LEVELS;
}

export const SKILL_LABELS_FR: Record<SkillType, string> = {
  vocab: 'Vocabulaire',
  grammar: 'Grammaire',
  reading: 'Compréhension écrite',
  listening: 'Compréhension orale',
};

export const DONT_KNOW_OPTION_INDEX = -1;
export const DONT_KNOW_LABEL_FR = 'Je ne sais pas';
export const MAX_LISTENING_PLAYS = 2;
export const MIN_QUESTIONS_PER_TESTED_LEVEL = 3;
export const LEVEL_VALIDATION_THRESHOLD = 0.7;
export const PLACEMENT_LOCK_DURATION_DAYS = 7;
export const PLACEMENT_LOCK_DURATION_MS = PLACEMENT_LOCK_DURATION_DAYS * 24 * 60 * 60 * 1000;

export interface AnsweredPlacementItem {
  question: PlacementQuestion;
  selectedIndex: number | null;
  isCorrect: boolean;
  isDontKnow?: boolean;
}

export interface AdaptiveTestSession {
  id: string;
  startedAt: string;
  status: PlacementSessionStatus;
  currentLevel: CEFRLevel;
  allowedLevels?: CEFRLevel[];
  questionIds: string[];
  answered: AnsweredPlacementItem[];
  maxQuestions: number;
  baseMaxQuestions: number;
  confirmationQuestionsAdded: number;
  confirmationTargetLevels: CEFRLevel[];
}

export interface LevelInconsistencyReport {
  isInconsistent: boolean;
  reason?: string;
  confirmationTargetLevels: CEFRLevel[];
}

export interface PlacementLockStatus {
  isLocked: boolean;
  unlockAt: string | null;
  remainingMs: number;
  remainingDays: number;
  messageFr: string;
}

export function getQuestionTimeLimitSeconds(skill: SkillType): number {
  if (skill === 'reading' || skill === 'listening') {
    return 45;
  }
  return 30;
}

export function getNextHigherLevel(
  level: CEFRLevel,
  allowedLevels: CEFRLevel[] = CEFR_LEVELS
): CEFRLevel {
  const idx = allowedLevels.indexOf(level);
  if (idx < 0 || idx >= allowedLevels.length - 1) {
    return allowedLevels[allowedLevels.length - 1];
  }
  return allowedLevels[idx + 1];
}

export function getNextLowerLevel(
  level: CEFRLevel,
  allowedLevels: CEFRLevel[] = CEFR_LEVELS
): CEFRLevel {
  const idx = allowedLevels.indexOf(level);
  if (idx <= 0) {
    return allowedLevels[0];
  }
  return allowedLevels[idx - 1];
}

/**
 * Calcule le prochain niveau adaptatif.
 * - "Je ne sais pas" (isDontKnow = true) : neutre (ni point ni pénalité), ne fait pas monter le niveau.
 * - Bonne réponse : monte d'un niveau.
 * - Mauvaise réponse : descend d'un niveau.
 */
export function adjustAdaptiveLevel(
  currentLevel: CEFRLevel,
  isCorrect: boolean,
  isDontKnow = false,
  allowedLevels: CEFRLevel[] = CEFR_LEVELS
): CEFRLevel {
  if (isDontKnow) {
    return currentLevel;
  }
  return isCorrect
    ? getNextHigherLevel(currentLevel, allowedLevels)
    : getNextLowerLevel(currentLevel, allowedLevels);
}

/**
 * Mélange l'ordre des options d'une question et recalcule answerIndex.
 * Garantit un ordre différent de l'ordre d'origine dès qu'il y a au moins 2 options.
 */
export function shuffleQuestionOptions(
  question: PlacementQuestion,
  rng: () => number = Math.random
): PlacementQuestion {
  if (!Array.isArray(question.options) || question.options.length <= 1) {
    return { ...question };
  }

  const indexed = question.options.map((text, idx) => ({
    text,
    isAnswer: idx === question.answerIndex,
    originalIndex: idx,
  }));

  // Mélange de Fisher-Yates
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = indexed[i];
    indexed[i] = indexed[j];
    indexed[j] = temp;
  }

  // Garantir que l'ordre affiché change effectivement par rapport à l'ordre initial
  const isUnchanged = indexed.every((item, idx) => item.originalIndex === idx);
  if (isUnchanged && indexed.length >= 2) {
    const swapIdx = 1 + Math.floor(rng() * (indexed.length - 1));
    const first = indexed[0];
    indexed[0] = indexed[swapIdx];
    indexed[swapIdx] = first;
  }

  const newOptions = indexed.map((item) => item.text);
  const newAnswerIndex = indexed.findIndex((item) => item.isAnswer);

  return {
    ...question,
    options: newOptions,
    answerIndex: newAnswerIndex >= 0 ? newAnswerIndex : 0,
  };
}

/**
 * Ajoute ou déplace un identifiant de question en fin de liste `seenQuestionIds`
 * afin que l'index 0 corresponde toujours à la question vue le plus anciennement.
 */
export function recordSeenQuestion(
  seenQuestionIds: string[],
  questionId: string
): string[] {
  if (!questionId) return seenQuestionIds;
  const filtered = seenQuestionIds.filter((id) => id !== questionId);
  return [...filtered, questionId];
}

export function recordSeenQuestions(
  seenQuestionIds: string[],
  questionIds: string[]
): string[] {
  let updated = [...seenQuestionIds];
  for (const id of questionIds) {
    updated = recordSeenQuestion(updated, id);
  }
  return updated;
}

function generateSessionId(): string {
  return `pl-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAdaptiveSession(
  questionBankSize: number,
  targetQuestionCount = 20,
  initialLevel: CEFRLevel = 'A1',
  startedAt: string = new Date().toISOString(),
  allowedLevels: CEFRLevel[] = CEFR_LEVELS
): AdaptiveTestSession {
  const maxQuestions = Math.min(Math.max(1, targetQuestionCount), Math.max(1, questionBankSize));
  return {
    id: generateSessionId(),
    startedAt,
    status: 'in_progress',
    currentLevel: initialLevel,
    allowedLevels,
    questionIds: [],
    answered: [],
    maxQuestions,
    baseMaxQuestions: maxQuestions,
    confirmationQuestionsAdded: 0,
    confirmationTargetLevels: [],
  };
}

export function toPlacementSessionState(
  session: AdaptiveTestSession
): PlacementSessionState {
  const answers: PlacementSessionAnswer[] = session.answered.map((item) => ({
    questionId: item.question.id,
    level: item.question.level,
    skill: item.question.skill,
    selectedIndex: item.isDontKnow ? null : item.selectedIndex,
    isCorrect: item.isCorrect,
    isDontKnow: Boolean(item.isDontKnow),
  }));

  const allQuestionIds = recordSeenQuestions(
    session.questionIds,
    session.answered.map((a) => a.question.id)
  );

  return {
    id: session.id,
    questionIds: allQuestionIds,
    answers,
    startedAt: session.startedAt,
    status: session.status,
  };
}

export function abandonPlacementSession(
  session: AdaptiveTestSession,
  seenQuestionIds: string[]
): { session: AdaptiveTestSession; seenQuestionIds: string[] } {
  const updatedSeen = recordSeenQuestions(seenQuestionIds, session.questionIds);
  return {
    session: {
      ...session,
      status: 'abandoned',
    },
    seenQuestionIds: updatedSeen,
  };
}

/**
 * Tire la prochaine question, mélange ses options et marque immédiatement son id
 * comme vu dans `session.questionIds` et `seenQuestionIds`.
 */
export function drawNextPlacementQuestion(
  bank: PlacementQuestion[],
  session: AdaptiveTestSession,
  seenQuestionIds: string[] = [],
  rng: () => number = Math.random
): {
  question: PlacementQuestion | null;
  session: AdaptiveTestSession;
  seenQuestionIds: string[];
} {
  const rawQuestion = selectNextAdaptiveQuestion(bank, session, seenQuestionIds, rng);
  if (!rawQuestion) {
    return {
      question: null,
      session,
      seenQuestionIds,
    };
  }

  const shuffledQuestion = shuffleQuestionOptions(rawQuestion, rng);
  const updatedQuestionIds = recordSeenQuestion(session.questionIds, rawQuestion.id);
  const updatedSeenIds = recordSeenQuestion(seenQuestionIds, rawQuestion.id);

  return {
    question: shuffledQuestion,
    session: {
      ...session,
      questionIds: updatedQuestionIds,
    },
    seenQuestionIds: updatedSeenIds,
  };
}

/**
 * Sélectionne la prochaine question du test adaptatif :
 * - Priorise les questions non vues (`!seenQuestionIds.includes(id)`), tirées au hasard (`rng`)
 *   et réparties sur les 4 compétences.
 * - Si toutes les questions du niveau cible ont déjà été vues, réutilise d'abord
 *   les plus anciennement vues (selon l'ordre dans `seenQuestionIds`).
 * - Veille à ce que chaque niveau testé atteigne au moins 3 questions lorsque le stock le permet.
 */
export function selectNextAdaptiveQuestion(
  bank: PlacementQuestion[],
  session: AdaptiveTestSession,
  seenQuestionIds: string[] = [],
  rng: () => number = Math.random
): PlacementQuestion | null {
  if (
    session.status === 'abandoned' ||
    session.status === 'completed' ||
    session.answered.length >= session.maxQuestions ||
    bank.length === 0
  ) {
    return null;
  }

  const usedInSessionIds = new Set<string>([
    ...session.answered.map((item) => item.question.id),
    ...(session.questionIds ?? []),
  ]);

  // Si la dernière question de `questionIds` n'a pas encore été répondue, ne pas l'exclure
  // uniquement si on cherche à la réafficher ; mais selectNextAdaptiveQuestion tire une nouvelle question non répondue :
  const answeredIds = new Set(session.answered.map((item) => item.question.id));
  const remaining = bank.filter((q) => !answeredIds.has(q.id) && !usedInSessionIds.has(q.id));
  const fallbackRemaining =
    remaining.length > 0 ? remaining : bank.filter((q) => !answeredIds.has(q.id));

  if (fallbackRemaining.length === 0) {
    return null;
  }

  // Compter les compétences déjà posées pour équilibrer vocab/grammar/reading/listening
  const skillCounts: Record<SkillType, number> = {
    vocab: 0,
    grammar: 0,
    reading: 0,
    listening: 0,
  };
  const activeLevels = session.allowedLevels ?? CEFR_LEVELS;
  const levelCounts: Record<CEFRLevel, number> = {
    A0: 0,
    A1: 0,
    A2: 0,
    B1: 0,
    B2: 0,
  };

  for (const item of session.answered) {
    skillCounts[item.question.skill] = (skillCounts[item.question.skill] ?? 0) + 1;
    levelCounts[item.question.level] = (levelCounts[item.question.level] ?? 0) + 1;
  }

  const sortedSkills = [...ALL_SKILLS].sort((a, b) => skillCounts[a] - skillCounts[b]);

  // Déterminer le niveau cible pour cette question
  let targetLevel: CEFRLevel = session.currentLevel;
  const baseMax = session.baseMaxQuestions ?? session.maxQuestions;

  if (
    session.confirmationTargetLevels &&
    session.confirmationTargetLevels.length > 0 &&
    session.answered.length >= baseMax
  ) {
    const confIdx = session.answered.length - baseMax;
    targetLevel =
      session.confirmationTargetLevels[confIdx] ??
      session.confirmationTargetLevels[session.confirmationTargetLevels.length - 1];
  } else if (session.answered.length >= Math.max(4, baseMax - 9)) {
    // S'assurer que tout niveau déjà entamé atteint le minimum de 3 questions
    const underSampledLevel = activeLevels.find(
      (lvl) =>
        levelCounts[lvl] > 0 &&
        levelCounts[lvl] < MIN_QUESTIONS_PER_TESTED_LEVEL &&
        fallbackRemaining.some((q) => q.level === lvl)
    );
    if (underSampledLevel) {
      targetLevel = underSampledLevel;
    }
  }

  const seenSet = new Set(seenQuestionIds);
  const seenOrderMap = new Map<string, number>();
  seenQuestionIds.forEach((id, idx) => {
    if (!seenOrderMap.has(id)) {
      seenOrderMap.set(id, idx);
    }
  });

  const pickFromPool = (pool: PlacementQuestion[]): PlacementQuestion | null => {
    if (pool.length === 0) return null;

    const unseenPool = pool.filter((q) => !seenSet.has(q.id));
    if (unseenPool.length > 0) {
      // Parmi les questions non vues, privilégier la compétence la moins représentée et tirer au hasard
      for (const skill of sortedSkills) {
        const unseenBySkill = unseenPool.filter((q) => q.skill === skill);
        if (unseenBySkill.length > 0) {
          const randomIndex = Math.floor(rng() * unseenBySkill.length);
          return unseenBySkill[randomIndex];
        }
      }
      const randomIndex = Math.floor(rng() * unseenPool.length);
      return unseenPool[randomIndex];
    }

    // Toutes les questions de ce niveau ont été vues : réutiliser d'abord la plus anciennement vue
    const sortedByOldestSeen = [...pool].sort((a, b) => {
      const idxA = seenOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const idxB = seenOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return skillCounts[a.skill] - skillCounts[b.skill];
    });

    return sortedByOldestSeen[0] ?? null;
  };

  // 1. Chercher au niveau cible exact
  const exactLevelPool = fallbackRemaining.filter((q) => q.level === targetLevel);
  const chosenExact = pickFromPool(exactLevelPool);
  if (chosenExact) {
    return chosenExact;
  }

  // 2. Niveau le plus proche disponible
  const targetIdx = activeLevels.indexOf(targetLevel);
  const levelsByDistance = [...activeLevels].sort(
    (a, b) =>
      Math.abs(activeLevels.indexOf(a) - targetIdx) -
      Math.abs(activeLevels.indexOf(b) - targetIdx)
  );

  for (const nearLevel of levelsByDistance) {
    const nearPool = fallbackRemaining.filter((q) => q.level === nearLevel);
    const chosenNear = pickFromPool(nearPool);
    if (chosenNear) {
      return chosenNear;
    }
  }

  return null;
}

/**
 * Détecte les incohérences dans les réponses (ex. échec < 70% sur A2 mais réussite >= 70% sur B1,
 * ou série chanceuse sur un niveau supérieur avec moins de 3 questions) afin de poser
 * 2 à 4 questions de confirmation supplémentaires avant de conclure.
 */
export function detectLevelInconsistency(
  answered: AnsweredPlacementItem[],
  allowedLevels: CEFRLevel[] = CEFR_LEVELS
): LevelInconsistencyReport {
  const stats: Record<CEFRLevel, { correct: number; total: number; ratio: number }> = {
    A0: { correct: 0, total: 0, ratio: 0 },
    A1: { correct: 0, total: 0, ratio: 0 },
    A2: { correct: 0, total: 0, ratio: 0 },
    B1: { correct: 0, total: 0, ratio: 0 },
    B2: { correct: 0, total: 0, ratio: 0 },
  };

  for (const item of answered) {
    const lvl = item.question.level;
    stats[lvl].total += 1;
    if (item.isCorrect && !item.isDontKnow) {
      stats[lvl].correct += 1;
    }
  }

  for (const lvl of allowedLevels) {
    stats[lvl].ratio = stats[lvl].total > 0 ? stats[lvl].correct / stats[lvl].total : 0;
  }

  const confirmationTargets: CEFRLevel[] = [];

  // Cas 1 : Inversion de réussite (échec < 70% sur un niveau inférieur L mais réussite >= 70% sur un niveau supérieur H)
  for (let i = 0; i < CEFR_LEVELS.length; i++) {
    const lower = CEFR_LEVELS[i];
    const lowerTestedAndFailed =
      stats[lower].total > 0 && stats[lower].ratio < LEVEL_VALIDATION_THRESHOLD;

    if (!lowerTestedAndFailed) continue;

    for (let j = i + 1; j < CEFR_LEVELS.length; j++) {
      const higher = CEFR_LEVELS[j];
      const higherSucceeded =
        stats[higher].total > 0 && stats[higher].ratio >= LEVEL_VALIDATION_THRESHOLD;
      if (higherSucceeded) {
        confirmationTargets.push(lower, higher);
      }
    }
  }

  // Cas 2 : Série de bonnes réponses chanceuses sur un niveau supérieur (ratio >= 70% mais < 3 questions posées)
  for (const lvl of ['A2', 'B1', 'B2'] as CEFRLevel[]) {
    if (
      stats[lvl].total > 0 &&
      stats[lvl].total < MIN_QUESTIONS_PER_TESTED_LEVEL &&
      stats[lvl].ratio >= 0.5
    ) {
      const needed = MIN_QUESTIONS_PER_TESTED_LEVEL - stats[lvl].total;
      for (let k = 0; k < Math.max(2, needed); k++) {
        confirmationTargets.push(lvl);
      }
    }
  }

  if (confirmationTargets.length === 0) {
    return {
      isInconsistent: false,
      confirmationTargetLevels: [],
    };
  }

  // Borner entre 2 et 4 questions de confirmation supplémentaires
  const boundedTargets = confirmationTargets.slice(0, 4);
  while (boundedTargets.length < 2) {
    boundedTargets.push(boundedTargets[0]);
  }

  return {
    isInconsistent: true,
    reason:
      'Résultats irréguliers entre deux paliers CECRL : questions de confirmation ajoutées.',
    confirmationTargetLevels: boundedTargets,
  };
}

export function recordAdaptiveAnswer(
  session: AdaptiveTestSession,
  question: PlacementQuestion,
  selectedIndex: number | null,
  options?: { isDontKnow?: boolean }
): AdaptiveTestSession {
  const isDontKnow =
    Boolean(options?.isDontKnow) ||
    selectedIndex === null ||
    selectedIndex === DONT_KNOW_OPTION_INDEX;

  const isCorrect = !isDontKnow && selectedIndex === question.answerIndex;
  const nextLevel = adjustAdaptiveLevel(session.currentLevel, isCorrect, isDontKnow);

  const newAnswered: AnsweredPlacementItem[] = [
    ...session.answered,
    {
      question,
      selectedIndex: isDontKnow ? null : selectedIndex,
      isCorrect,
      isDontKnow,
    },
  ];

  const updatedQuestionIds = recordSeenQuestion(
    session.questionIds ?? [],
    question.id
  );

  let maxQuestions = session.maxQuestions;
  let confirmationQuestionsAdded = session.confirmationQuestionsAdded ?? 0;
  let confirmationTargetLevels = session.confirmationTargetLevels ?? [];
  const baseMax = session.baseMaxQuestions ?? session.maxQuestions;

  // À la fin de la série initiale, vérifier la cohérence des résultats avant de conclure
  if (
    newAnswered.length === baseMax &&
    confirmationQuestionsAdded === 0
  ) {
    const inconsistency = detectLevelInconsistency(newAnswered);
    if (inconsistency.isInconsistent) {
      confirmationQuestionsAdded = inconsistency.confirmationTargetLevels.length;
      confirmationTargetLevels = inconsistency.confirmationTargetLevels;
      maxQuestions = baseMax + confirmationQuestionsAdded;
    }
  }

  const isCompleted = newAnswered.length >= maxQuestions;
  const nextTargetFromConfirmation =
    !isCompleted &&
    confirmationTargetLevels.length > 0 &&
    newAnswered.length >= baseMax
      ? confirmationTargetLevels[newAnswered.length - baseMax] ?? nextLevel
      : nextLevel;

  return {
    ...session,
    status: isCompleted ? 'completed' : 'in_progress',
    currentLevel: nextTargetFromConfirmation,
    questionIds: updatedQuestionIds,
    answered: newAnswered,
    maxQuestions,
    baseMaxQuestions: baseMax,
    confirmationQuestionsAdded,
    confirmationTargetLevels,
  };
}

/**
 * Calcule le niveau final sur la régularité :
 * - Un niveau est validé uniquement si l'utilisateur réussit au moins 70 % des questions
 *   posées à ce niveau (minimum 3 questions par niveau testé).
 * - Les réponses "Je ne sais pas" comptent dans le total du niveau sans donner de point.
 * - Une réussite isolée sur un niveau supérieur ne valide pas ce niveau si un niveau inférieur testé a échoué (< 70%).
 */
export function evaluatePlacementTest(
  answered: AnsweredPlacementItem[],
  completedAt: string = new Date().toISOString()
): PlacementResult {
  const skillScores: Record<SkillType, SkillPerformance> = {
    vocab: { correct: 0, total: 0, percentage: 0 },
    grammar: { correct: 0, total: 0, percentage: 0 },
    reading: { correct: 0, total: 0, percentage: 0 },
    listening: { correct: 0, total: 0, percentage: 0 },
  };

  let totalCorrect = 0;

  for (const item of answered) {
    const skill = item.question.skill;
    skillScores[skill].total += 1;

    if (item.isCorrect && !item.isDontKnow) {
      skillScores[skill].correct += 1;
      totalCorrect += 1;
    }
  }

  for (const skill of ALL_SKILLS) {
    const perf = skillScores[skill];
    perf.percentage = perf.total > 0 ? Math.round((perf.correct / perf.total) * 100) : 0;
  }

  const levelStats: Record<CEFRLevel, { correct: number; total: number; ratio: number }> = {
    A0: { correct: 0, total: 0, ratio: 0 },
    A1: { correct: 0, total: 0, ratio: 0 },
    A2: { correct: 0, total: 0, ratio: 0 },
    B1: { correct: 0, total: 0, ratio: 0 },
    B2: { correct: 0, total: 0, ratio: 0 },
  };

  const hasA0 = answered.some((a) => a.question.level === 'A0');
  const activeLevels = hasA0 ? KIDS_CEFR_LEVELS : CEFR_LEVELS;
  const baseLevel = activeLevels[0];

  for (const item of answered) {
    const lvl = item.question.level;
    levelStats[lvl].total += 1;
    if (item.isCorrect && !item.isDontKnow) {
      levelStats[lvl].correct += 1;
    }
  }

  for (const lvl of activeLevels) {
    levelStats[lvl].ratio =
      levelStats[lvl].total > 0 ? levelStats[lvl].correct / levelStats[lvl].total : 0;
  }

  const isLevelValidated = (lvl: CEFRLevel): boolean => {
    return (
      levelStats[lvl].total >= MIN_QUESTIONS_PER_TESTED_LEVEL &&
      levelStats[lvl].ratio >= LEVEL_VALIDATION_THRESHOLD
    );
  };

  let determinedLevel: CEFRLevel = baseLevel;

  // Pour valider un niveau L au-dessus du niveau de base :
  // 1. L doit être validé (>= 3 questions et >= 70% de bonnes réponses).
  // 2. Aucun niveau inférieur M < L ayant été testé ne doit être en échec.
  for (const lvl of activeLevels.slice(1)) {
    const lvlIdx = activeLevels.indexOf(lvl);
    const lowerLevels = activeLevels.slice(0, lvlIdx);

    const anyLowerLevelFailed = lowerLevels.some((lower) => {
      if (levelStats[lower].total === 0) {
        return false;
      }
      if (lower === baseLevel) {
        return levelStats[baseLevel].ratio < LEVEL_VALIDATION_THRESHOLD;
      }
      return !isLevelValidated(lower);
    });

    if (anyLowerLevelFailed) {
      break;
    }

    if (isLevelValidated(lvl)) {
      determinedLevel = lvl;
    } else if (levelStats[lvl].total > 0) {
      break;
    }
  }

  // Trier les compétences par pourcentage décroissant pour identifier points forts et priorités
  const rankedSkills = [...ALL_SKILLS].sort(
    (a, b) => skillScores[b].percentage - skillScores[a].percentage
  );

  const strengths = rankedSkills.filter((skill) => skillScores[skill].percentage >= 65);
  const weaknesses = rankedSkills
    .filter((skill) => skillScores[skill].percentage < 65)
    .reverse();

  const finalStrengths =
    strengths.length > 0
      ? strengths
      : totalCorrect > 0
      ? [rankedSkills[0]]
      : [];

  const finalWeaknesses =
    weaknesses.length > 0
      ? weaknesses
      : [rankedSkills[rankedSkills.length - 1]];

  const overallScore =
    answered.length > 0 ? Math.round((totalCorrect / answered.length) * 100) : 0;

  return {
    determinedLevel,
    overallScore,
    totalQuestions: answered.length,
    skillScores,
    strengths: finalStrengths,
    weaknesses: finalWeaknesses,
    completedAt,
  };
}

/**
 * Vérifie si le résultat du test de niveau est verrouillé (7 jours après un test terminé).
 */
export function getPlacementLockStatus(
  placementResult: PlacementResult | null | undefined,
  now: Date | number = new Date()
): PlacementLockStatus {
  if (!placementResult || !placementResult.completedAt) {
    return {
      isLocked: false,
      unlockAt: null,
      remainingMs: 0,
      remainingDays: 0,
      messageFr: '',
    };
  }

  const completedMs = Date.parse(placementResult.completedAt);
  if (Number.isNaN(completedMs)) {
    return {
      isLocked: false,
      unlockAt: null,
      remainingMs: 0,
      remainingDays: 0,
      messageFr: '',
    };
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();
  const unlockMs = completedMs + PLACEMENT_LOCK_DURATION_MS;
  const remainingMs = Math.max(0, unlockMs - nowMs);
  const isLocked = remainingMs > 0;
  const remainingDays = isLocked
    ? Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
    : 0;
  const unlockAt = new Date(unlockMs).toISOString();

  const messageFr = isLocked
    ? `Votre résultat de niveau (${placementResult.determinedLevel}) est verrouillé pendant 7 jours (${remainingDays} ${
        remainingDays > 1 ? 'jours restants' : 'jour restant'
      }). Si vous souhaitez recommencer dès maintenant, utilisez Paramètres > Réinitialiser mes données.`
    : '';

  return {
    isLocked,
    unlockAt,
    remainingMs,
    remainingDays,
    messageFr,
  };
}
