import {
  CEFRLevel,
  PlacementQuestion,
  PlacementResult,
  SkillPerformance,
  SkillType,
} from './types';

export const CEFR_LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2'];
export const ALL_SKILLS: SkillType[] = ['vocab', 'grammar', 'reading', 'listening'];

export const SKILL_LABELS_FR: Record<SkillType, string> = {
  vocab: 'Vocabulaire',
  grammar: 'Grammaire',
  reading: 'Compréhension écrite',
  listening: 'Compréhension orale',
};

export interface AnsweredPlacementItem {
  question: PlacementQuestion;
  selectedIndex: number;
  isCorrect: boolean;
}

export interface AdaptiveTestSession {
  currentLevel: CEFRLevel;
  answered: AnsweredPlacementItem[];
  maxQuestions: number;
}

export function getNextHigherLevel(level: CEFRLevel): CEFRLevel {
  const idx = CEFR_LEVELS.indexOf(level);
  if (idx < 0 || idx >= CEFR_LEVELS.length - 1) {
    return 'B2';
  }
  return CEFR_LEVELS[idx + 1];
}

export function getNextLowerLevel(level: CEFRLevel): CEFRLevel {
  const idx = CEFR_LEVELS.indexOf(level);
  if (idx <= 0) {
    return 'A1';
  }
  return CEFR_LEVELS[idx - 1];
}

export function adjustAdaptiveLevel(currentLevel: CEFRLevel, isCorrect: boolean): CEFRLevel {
  return isCorrect ? getNextHigherLevel(currentLevel) : getNextLowerLevel(currentLevel);
}

export function createAdaptiveSession(
  questionBankSize: number,
  targetQuestionCount = 20,
  initialLevel: CEFRLevel = 'A1'
): AdaptiveTestSession {
  const maxQuestions = Math.min(Math.max(1, targetQuestionCount), Math.max(1, questionBankSize));
  return {
    currentLevel: initialLevel,
    answered: [],
    maxQuestions,
  };
}

export function selectNextAdaptiveQuestion(
  bank: PlacementQuestion[],
  session: AdaptiveTestSession
): PlacementQuestion | null {
  if (session.answered.length >= session.maxQuestions || bank.length === 0) {
    return null;
  }

  const usedIds = new Set(session.answered.map((item) => item.question.id));
  const remaining = bank.filter((q) => !usedIds.has(q.id));

  if (remaining.length === 0) {
    return null;
  }

  // Determine the least tested skill so far to keep the 4 skills balanced
  const skillCounts: Record<SkillType, number> = {
    vocab: 0,
    grammar: 0,
    reading: 0,
    listening: 0,
  };
  for (const item of session.answered) {
    skillCounts[item.question.skill] = (skillCounts[item.question.skill] ?? 0) + 1;
  }

  const sortedSkills = [...ALL_SKILLS].sort((a, b) => skillCounts[a] - skillCounts[b]);
  const targetLevel = session.currentLevel;

  // 1. Try exact level + least tested skill
  for (const preferredSkill of sortedSkills) {
    const exactMatch = remaining.find(
      (q) => q.level === targetLevel && q.skill === preferredSkill
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  // 2. Any unused question at exact targetLevel
  const sameLevelMatch = remaining.find((q) => q.level === targetLevel);
  if (sameLevelMatch) {
    return sameLevelMatch;
  }

  // 3. Closest level available, prioritizing least tested skill
  const targetIdx = CEFR_LEVELS.indexOf(targetLevel);
  const sortedByLevelDistance = [...remaining].sort((a, b) => {
    const distA = Math.abs(CEFR_LEVELS.indexOf(a.level) - targetIdx);
    const distB = Math.abs(CEFR_LEVELS.indexOf(b.level) - targetIdx);
    if (distA !== distB) {
      return distA - distB;
    }
    return skillCounts[a.skill] - skillCounts[b.skill];
  });

  return sortedByLevelDistance[0] ?? null;
}

export function recordAdaptiveAnswer(
  session: AdaptiveTestSession,
  question: PlacementQuestion,
  selectedIndex: number
): AdaptiveTestSession {
  const isCorrect = selectedIndex === question.answerIndex;
  const nextLevel = adjustAdaptiveLevel(session.currentLevel, isCorrect);

  return {
    ...session,
    currentLevel: nextLevel,
    answered: [
      ...session.answered,
      {
        question,
        selectedIndex,
        isCorrect,
      },
    ],
  };
}

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

  const levelWeights: Record<CEFRLevel, number> = {
    A1: 1,
    A2: 2,
    B1: 3,
    B2: 4,
  };

  let weightedEarned = 0;
  let weightedPossible = 0;
  let totalCorrect = 0;

  for (const item of answered) {
    const skill = item.question.skill;
    const weight = levelWeights[item.question.level] ?? 1;
    skillScores[skill].total += 1;
    weightedPossible += weight;

    if (item.isCorrect) {
      skillScores[skill].correct += 1;
      totalCorrect += 1;
      weightedEarned += weight;
    }
  }

  for (const skill of ALL_SKILLS) {
    const perf = skillScores[skill];
    perf.percentage = perf.total > 0 ? Math.round((perf.correct / perf.total) * 100) : 0;
  }

  // Compute level based on highest level mastered + weighted performance
  const levelStats: Record<CEFRLevel, { correct: number; total: number }> = {
    A1: { correct: 0, total: 0 },
    A2: { correct: 0, total: 0 },
    B1: { correct: 0, total: 0 },
    B2: { correct: 0, total: 0 },
  };

  for (const item of answered) {
    levelStats[item.question.level].total += 1;
    if (item.isCorrect) {
      levelStats[item.question.level].correct += 1;
    }
  }

  let determinedLevel: CEFRLevel = 'A1';
  const overallRatio = weightedPossible > 0 ? weightedEarned / weightedPossible : 0;

  if (
    levelStats.B2.correct >= 3 &&
    levelStats.B2.total > 0 &&
    levelStats.B2.correct / levelStats.B2.total >= 0.6 &&
    overallRatio >= 0.72
  ) {
    determinedLevel = 'B2';
  } else if (
    (levelStats.B1.correct >= 2 && overallRatio >= 0.52) ||
    (levelStats.B2.correct >= 2 && overallRatio >= 0.55)
  ) {
    determinedLevel = 'B1';
  } else if (
    (levelStats.A2.correct >= 2 && overallRatio >= 0.32) ||
    totalCorrect >= Math.ceil(answered.length * 0.4)
  ) {
    determinedLevel = 'A2';
  } else {
    determinedLevel = 'A1';
  }

  // Sort skills by percentage descending to identify strengths and weaknesses
  const rankedSkills = [...ALL_SKILLS].sort(
    (a, b) => skillScores[b].percentage - skillScores[a].percentage
  );

  const strengths = rankedSkills.filter((skill) => skillScores[skill].percentage >= 65);
  const weaknesses = rankedSkills
    .filter((skill) => skillScores[skill].percentage < 65)
    .reverse();

  // Always guarantee at least one strength (if any correct answers) and at least one priority skill to reinforce
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
