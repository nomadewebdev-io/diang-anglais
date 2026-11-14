import { addDaysISO, formatDateISO } from './sm2';
import { CEFR_LEVELS, getNextHigherLevel } from './placementTest';
import {
  CEFRLevel,
  FeasibilityAnalysis,
  FlashcardItem,
  LearningGoal,
  LessonItem,
  PlacementQuestion,
  PlacementResult,
  SentenceItem,
  SessionActivity,
  SessionActivityType,
  SkillType,
  StudyPlan,
  StudyPlanConfig,
  StudySession,
} from './types';

export function getDefaultTargetLevel(currentLevel: CEFRLevel): CEFRLevel {
  return getNextHigherLevel(currentLevel);
}

export function estimateHoursForTarget(
  currentLevel: CEFRLevel,
  targetLevel: CEFRLevel
): number {
  const startIdx = CEFR_LEVELS.indexOf(currentLevel);
  const endIdx = CEFR_LEVELS.indexOf(targetLevel);
  const diff = Math.max(0, endIdx - startIdx);

  if (diff === 0) {
    // Consolidation at the same level (e.g. B2 mastery)
    return 100;
  }
  if (diff === 1) {
    if (currentLevel === 'A1') return 100;
    if (currentLevel === 'A2') return 130;
    return 160; // B1 -> B2
  }
  if (diff === 2) {
    return 180;
  }
  return 200; // A1 -> B2
}

export function analyzeFeasibility(config: StudyPlanConfig): FeasibilityAnalysis {
  const estimatedHoursNeeded = estimateHoursForTarget(
    config.currentLevel,
    config.targetLevel
  );
  const weeklyMinutes = config.sessionsPerWeek * config.minutesPerSession;
  const plannedHours = Number(((config.durationWeeks * weeklyMinutes) / 60).toFixed(1));
  const coverageRatio =
    estimatedHoursNeeded > 0
      ? Number((plannedHours / estimatedHoursNeeded).toFixed(2))
      : 1;

  // Option A: Keep weekly pace, extend duration in weeks
  const weeklyHours = weeklyMinutes / 60;
  const suggestedWeeks =
    weeklyHours > 0
      ? Math.max(config.durationWeeks, Math.ceil(estimatedHoursNeeded / weeklyHours))
      : 24;

  // Option B: Increase weekly pace within reasonable bounds
  const neededMinutesPerWeek = Math.ceil((estimatedHoursNeeded * 60) / Math.max(1, config.durationWeeks));
  let suggestedSessionsPerWeek = Math.min(7, Math.max(config.sessionsPerWeek + 1, 5));
  let suggestedMinutesPerSession = Math.ceil(neededMinutesPerWeek / suggestedSessionsPerWeek / 5) * 5;
  suggestedMinutesPerSession = Math.min(90, Math.max(30, suggestedMinutesPerSession));
  if (suggestedSessionsPerWeek * suggestedMinutesPerSession < neededMinutesPerWeek && suggestedSessionsPerWeek < 6) {
    suggestedSessionsPerWeek = 6;
  }

  if (coverageRatio >= 0.85) {
    return {
      estimatedHoursNeeded,
      plannedHours,
      coverageRatio,
      isRealistic: true,
      status: 'optimal',
      message: `Ce volume de ${plannedHours} h est cohérent avec les ${estimatedHoursNeeded} h recommandées pour valider le niveau ${config.targetLevel}.`,
      suggestedWeeks: config.durationWeeks,
      suggestedSessionsPerWeek: config.sessionsPerWeek,
      suggestedMinutesPerSession: config.minutesPerSession,
    };
  }

  const status = coverageRatio >= 0.6 ? 'tight' : 'insufficient';
  const message =
    status === 'tight'
      ? `Votre plan prévoit ${plannedHours} h contre environ ${estimatedHoursNeeded} h recommandées pour le niveau ${config.targetLevel}. C'est ambitieux : vous pouvez allonger la durée à ${suggestedWeeks} semaines ou augmenter le rythme hebdomadaire.`
      : `Attention : ${plannedHours} h prévues pour environ ${estimatedHoursNeeded} h nécessaires vers le niveau ${config.targetLevel}. Pour consolider durablement vos acquis, nous vous conseillons d'étendre le programme à ${suggestedWeeks} semaines ou de passer à ${suggestedSessionsPerWeek} séances de ${suggestedMinutesPerSession} min par semaine.`;

  return {
    estimatedHoursNeeded,
    plannedHours,
    coverageRatio,
    isRealistic: false,
    status,
    message,
    suggestedWeeks,
    suggestedSessionsPerWeek,
    suggestedMinutesPerSession,
  };
}

export interface ContentCatalog {
  cards: FlashcardItem[];
  lessons: LessonItem[];
  placement: PlacementQuestion[];
  sentences: SentenceItem[];
}

function getRelevantLevels(current: CEFRLevel, target: CEFRLevel): CEFRLevel[] {
  const startIdx = CEFR_LEVELS.indexOf(current);
  const endIdx = Math.max(startIdx, CEFR_LEVELS.indexOf(target));
  return CEFR_LEVELS.slice(startIdx, endIdx + 1);
}

function pickCyclingIds<T extends { id: string }>(
  items: T[],
  startIndex: number,
  count: number
): string[] {
  if (items.length === 0 || count <= 0) {
    return [];
  }
  const picked: string[] = [];
  const actualCount = Math.min(count, items.length);
  for (let i = 0; i < actualCount; i++) {
    const item = items[(startIndex + i) % items.length];
    picked.push(item.id);
  }
  return picked;
}

export function allocateSessionMinutes(
  totalMinutes: number,
  weaknesses: SkillType[]
): Record<SessionActivityType, { minutes: number; isPriority: boolean }> {
  const weaknessSet = new Set(weaknesses);

  const isVocabWeak = weaknessSet.has('vocab');
  const isGrammarWeak = weaknessSet.has('grammar');
  const isListeningWeak = weaknessSet.has('listening');
  const isReadingWeak = weaknessSet.has('reading');

  const rawWeights: Record<SessionActivityType, { weight: number; isPriority: boolean }> = {
    vocab: { weight: isVocabWeak ? 1.5 : 1.0, isPriority: isVocabWeak },
    grammar: { weight: isGrammarWeak ? 1.5 : 1.0, isPriority: isGrammarWeak },
    listening: { weight: isListeningWeak ? 1.5 : 1.0, isPriority: isListeningWeak },
    dictation: {
      weight: isListeningWeak || isVocabWeak ? 1.35 : 0.9,
      isPriority: isListeningWeak,
    },
    quiz: {
      weight: isReadingWeak || isGrammarWeak ? 1.35 : 0.9,
      isPriority: isReadingWeak,
    },
  };

  const types: SessionActivityType[] = ['vocab', 'grammar', 'listening', 'dictation', 'quiz'];
  const totalWeight = types.reduce((acc, t) => acc + rawWeights[t].weight, 0);

  const result: Record<SessionActivityType, { minutes: number; isPriority: boolean }> = {
    vocab: { minutes: 0, isPriority: rawWeights.vocab.isPriority },
    grammar: { minutes: 0, isPriority: rawWeights.grammar.isPriority },
    listening: { minutes: 0, isPriority: rawWeights.listening.isPriority },
    dictation: { minutes: 0, isPriority: rawWeights.dictation.isPriority },
    quiz: { minutes: 0, isPriority: rawWeights.quiz.isPriority },
  };

  let allocated = 0;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (i === types.length - 1) {
      result[t].minutes = Math.max(2, totalMinutes - allocated);
    } else {
      const m = Math.max(2, Math.round((totalMinutes * rawWeights[t].weight) / totalWeight));
      result[t].minutes = m;
      allocated += m;
    }
  }

  // Adjust if rounding exceeded totalMinutes
  const sum = types.reduce((acc, t) => acc + result[t].minutes, 0);
  if (sum !== totalMinutes) {
    const diff = totalMinutes - sum;
    // Apply difference to the largest bucket
    const largest = [...types].sort((a, b) => result[b].minutes - result[a].minutes)[0];
    result[largest].minutes = Math.max(1, result[largest].minutes + diff);
  }

  return result;
}

export function generateStudyPlan(
  config: StudyPlanConfig,
  placementResult: PlacementResult | null,
  catalog: ContentCatalog,
  goal?: LearningGoal
): StudyPlan {
  const weaknesses: SkillType[] =
    placementResult && placementResult.weaknesses.length > 0
      ? placementResult.weaknesses
      : ['listening', 'grammar'];

  const relevantLevels = getRelevantLevels(config.currentLevel, config.targetLevel);
  const sessions: StudySession[] = [];

  // Filter catalog items by relevant levels, with fallback to full catalog so any dataset size works
  const levelCards = catalog.cards.filter((c) => relevantLevels.includes(c.level));
  const activeCards = levelCards.length > 0 ? levelCards : catalog.cards;

  // Prioritize goal theme cards first
  const sortedCards = goal
    ? [...activeCards].sort((a, b) => (a.theme === goal ? -1 : b.theme === goal ? 1 : 0))
    : activeCards;

  const levelLessons = catalog.lessons.filter((l) => relevantLevels.includes(l.level));
  const activeLessons = levelLessons.length > 0 ? levelLessons : catalog.lessons;

  const listeningQuestions = catalog.placement.filter(
    (q) => q.skill === 'listening' && relevantLevels.includes(q.level)
  );
  const activeListening =
    listeningQuestions.length > 0
      ? listeningQuestions
      : catalog.placement.filter((q) => q.skill === 'listening');

  const quizQuestions = catalog.placement.filter(
    (q) => q.skill !== 'listening' && relevantLevels.includes(q.level)
  );
  const activeQuiz =
    quizQuestions.length > 0 ? quizQuestions : catalog.placement;

  const levelSentences = catalog.sentences.filter((s) => relevantLevels.includes(s.level));
  const activeSentences = levelSentences.length > 0 ? levelSentences : catalog.sentences;

  const totalSessions = config.durationWeeks * config.sessionsPerWeek;
  const dayStep = Math.max(1, Math.floor(7 / Math.max(1, config.sessionsPerWeek)));

  const allocation = allocateSessionMinutes(config.minutesPerSession, weaknesses);

  const sessionThemes = [
    'Consolidation lexicale et structures clés',
    'Fluidité orale et compréhension active',
    'Précision grammaticale et mise en situation',
    'Synthèse pratique et réflexes de communication',
    'Approfondissement thématique et écoute rapide',
    'Entraînement intensif et automatismes',
    'Révision croisée des acquis de la semaine',
  ];

  for (let week = 1; week <= config.durationWeeks; week++) {
    const progressFraction = (week - 1) / Math.max(1, config.durationWeeks);
    const levelIndex = Math.min(
      relevantLevels.length - 1,
      Math.floor(progressFraction * relevantLevels.length)
    );
    const sessionLevel = relevantLevels[levelIndex] ?? config.currentLevel;

    for (let s = 1; s <= config.sessionsPerWeek; s++) {
      const globalIdx = (week - 1) * config.sessionsPerWeek + (s - 1);
      const dayOffset = (week - 1) * 7 + Math.min(6, (s - 1) * dayStep);
      const scheduledDate = addDaysISO(config.startDate, dayOffset);

      const cardCount = allocation.vocab.isPriority ? 6 : 4;
      const dictationCount = allocation.dictation.isPriority ? 4 : 3;
      const listeningCount = allocation.listening.isPriority ? 3 : 2;
      const quizCount = allocation.quiz.isPriority ? 5 : 4;

      const activities: SessionActivity[] = [
        {
          id: `act-w${week}-s${s}-vocab`,
          type: 'vocab',
          title: 'Vocabulaire SM-2',
          description: allocation.vocab.isPriority
            ? 'Session renforcée sur vos cartes prioritaires avec prononciation audio'
            : 'Révision espacée des mots et expressions clés du palier',
          durationMinutes: allocation.vocab.minutes,
          isPriorityWeakness: allocation.vocab.isPriority,
          itemIds: pickCyclingIds(sortedCards, globalIdx * cardCount, cardCount),
          completed: false,
        },
        {
          id: `act-w${week}-s${s}-grammar`,
          type: 'grammar',
          title: 'Grammaire appliquée',
          description: allocation.grammar.isPriority
            ? 'Règle structurante, exemples commentés et exercices de renforcement'
            : 'Point grammatical ciblé et mise en pratique immédiate',
          durationMinutes: allocation.grammar.minutes,
          isPriorityWeakness: allocation.grammar.isPriority,
          itemIds: pickCyclingIds(activeLessons, globalIdx, 1),
          completed: false,
        },
        {
          id: `act-w${week}-s${s}-listening`,
          type: 'listening',
          title: 'Compréhension orale',
          description: allocation.listening.isPriority
            ? 'Écoute active renforcée (annonces, messages et dialogues professionnels)'
            : 'Exercices d’écoute en anglais américain (en-US)',
          durationMinutes: allocation.listening.minutes,
          isPriorityWeakness: allocation.listening.isPriority,
          itemIds: pickCyclingIds(activeListening, globalIdx * listeningCount, listeningCount),
          completed: false,
        },
        {
          id: `act-w${week}-s${s}-dictation`,
          type: 'dictation',
          title: 'Dictée guidée',
          description: 'Écoute de phrases complètes et saisie avec correction mot par mot',
          durationMinutes: allocation.dictation.minutes,
          isPriorityWeakness: allocation.dictation.isPriority,
          itemIds: pickCyclingIds(activeSentences, globalIdx * dictationCount, dictationCount),
          completed: false,
        },
        {
          id: `act-w${week}-s${s}-quiz`,
          type: 'quiz',
          title: 'Quiz de validation',
          description: allocation.quiz.isPriority
            ? 'Série QCM approfondie sur la compréhension écrite et la précision'
            : 'Contrôle rapide des acquis de la séance',
          durationMinutes: allocation.quiz.minutes,
          isPriorityWeakness: allocation.quiz.isPriority,
          itemIds: pickCyclingIds(activeQuiz, globalIdx * quizCount, quizCount),
          completed: false,
        },
      ];

      const themeTitle = sessionThemes[(s - 1) % sessionThemes.length];

      sessions.push({
        id: `session-w${week}-s${s}`,
        weekNumber: week,
        sessionNumberInWeek: s,
        globalSessionIndex: globalIdx + 1,
        scheduledDate,
        title: `Semaine ${week} · Séance ${s} — ${themeTitle}`,
        level: sessionLevel,
        totalMinutes: config.minutesPerSession,
        focusSkills: weaknesses,
        activities,
        completed: false,
      });
    }
  }

  void totalSessions;

  return {
    config,
    sessions,
    milestoneTests: {},
  };
}

/**
 * Rattrapage automatique et sans culpabilisation :
 * Si une ou plusieurs séances planifiées avant `todayStr` n'ont pas été complétées,
 * toutes les séances non terminées sont replanifiées proprement à partir d'aujourd'hui
 * en respectant le rythme hebdomadaire choisi par l'utilisateur.
 */
export function applyAutomaticCatchUp(
  plan: StudyPlan,
  todayStr: string = formatDateISO(new Date())
): { plan: StudyPlan; adjustedCount: number } {
  const missedSessions = plan.sessions.filter(
    (s) => !s.completed && s.scheduledDate < todayStr
  );

  if (missedSessions.length === 0) {
    return { plan, adjustedCount: 0 };
  }

  const dayStep = Math.max(
    1,
    Math.floor(7 / Math.max(1, plan.config.sessionsPerWeek))
  );

  let uncompletedCursor = 0;
  const updatedSessions = plan.sessions.map((session) => {
    if (session.completed) {
      return session;
    }
    const weeksAhead = Math.floor(uncompletedCursor / plan.config.sessionsPerWeek);
    const slotInWeek = uncompletedCursor % plan.config.sessionsPerWeek;
    const offsetDays = weeksAhead * 7 + Math.min(6, slotInWeek * dayStep);
    const newDate = addDaysISO(todayStr, offsetDays);
    uncompletedCursor += 1;

    return {
      ...session,
      scheduledDate: newDate,
    };
  });

  const count = missedSessions.length;
  const catchUpMessage =
    count === 1
      ? "Une séance précédente a été décalée : votre calendrier s'est ajusté automatiquement à partir d'aujourd'hui pour respecter votre rythme."
      : `${count} séances ont été reprogrammées en douceur à partir d'aujourd'hui. Vous reprenez exactement là où vous vous étiez arrêté, sans surcharge.`;

  return {
    plan: {
      ...plan,
      sessions: updatedSessions,
      lastCatchUpDate: todayStr,
      catchUpMessage,
    },
    adjustedCount: count,
  };
}

export function getTodayOrNextSession(
  plan: StudyPlan,
  todayStr: string = formatDateISO(new Date())
): StudySession | null {
  const exactToday = plan.sessions.find(
    (s) => !s.completed && s.scheduledDate === todayStr
  );
  if (exactToday) {
    return exactToday;
  }
  const firstUncompleted = plan.sessions.find((s) => !s.completed);
  if (firstUncompleted) {
    return firstUncompleted;
  }
  return plan.sessions[plan.sessions.length - 1] ?? null;
}

export function calculateStreak(
  studyDates: string[],
  todayStr: string = formatDateISO(new Date())
): number {
  if (studyDates.length === 0) {
    return 0;
  }
  const uniqueDates = new Set(studyDates);
  const yesterdayStr = addDaysISO(todayStr, -1);

  // Streak is active if user studied today or yesterday
  let cursor = uniqueDates.has(todayStr)
    ? todayStr
    : uniqueDates.has(yesterdayStr)
    ? yesterdayStr
    : null;

  if (!cursor) {
    return 0;
  }

  let streak = 0;
  while (uniqueDates.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function getMilestoneWeeks(durationWeeks: number): number[] {
  const weeks: number[] = [];
  const step = durationWeeks <= 4 ? 1 : 2;
  for (let w = step; w <= durationWeeks; w += step) {
    weeks.push(w);
  }
  if (!weeks.includes(durationWeeks) && durationWeeks > 0) {
    weeks.push(durationWeeks);
  }
  return weeks;
}
