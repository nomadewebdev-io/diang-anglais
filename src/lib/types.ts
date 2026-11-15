export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';

export type LearningGoal = 'voyage' | 'travail' | 'études' | 'conversation';

export type SkillType = 'vocab' | 'grammar' | 'reading' | 'listening';

export type SM2Rating = 'again' | 'hard' | 'good' | 'easy';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface FlashcardItem {
  id: string;
  en: string;
  fr: string;
  example: string;
  exampleFr: string;
  level: CEFRLevel;
  theme: string;
}

export interface LessonExample {
  en: string;
  fr: string;
}

export interface LessonExercise {
  prompt: string;
  options: string[];
  answerIndex: number;
}

export interface LessonItem {
  id: string;
  level: CEFRLevel;
  title: string;
  explanationFr: string;
  examples: LessonExample[];
  exercises: LessonExercise[];
}

export interface PlacementQuestion {
  id: string;
  level: CEFRLevel;
  skill: SkillType;
  prompt: string;
  options: string[];
  answerIndex: number;
  audioText?: string;
}

export interface SentenceItem {
  id: string;
  level: CEFRLevel;
  en: string;
  fr: string;
}

export interface SM2CardState {
  cardId: string;
  interval: number;
  repetitions: number;
  easeFactor: number;
  nextReviewDate: string; // YYYY-MM-DD
  lastRating?: SM2Rating;
  lastReviewedAt?: string;
}

export interface SkillPerformance {
  correct: number;
  total: number;
  percentage: number;
}

export interface PlacementResult {
  determinedLevel: CEFRLevel;
  overallScore: number;
  totalQuestions: number;
  skillScores: Record<SkillType, SkillPerformance>;
  strengths: SkillType[];
  weaknesses: SkillType[];
  completedAt: string;
}

export interface StudyPlanConfig {
  currentLevel: CEFRLevel;
  targetLevel: CEFRLevel;
  durationWeeks: number;
  sessionsPerWeek: number;
  minutesPerSession: number;
  startDate: string; // YYYY-MM-DD
}

export interface FeasibilityAnalysis {
  estimatedHoursNeeded: number;
  plannedHours: number;
  coverageRatio: number;
  isRealistic: boolean;
  status: 'optimal' | 'tight' | 'insufficient';
  message: string;
  suggestedWeeks: number;
  suggestedSessionsPerWeek: number;
  suggestedMinutesPerSession: number;
}

export type SessionActivityType = 'vocab' | 'grammar' | 'listening' | 'dictation' | 'quiz';

export interface SessionActivity {
  id: string;
  type: SessionActivityType;
  title: string;
  description: string;
  durationMinutes: number;
  isPriorityWeakness: boolean;
  itemIds: string[];
  completed: boolean;
  score?: number;
}

export interface StudySession {
  id: string;
  weekNumber: number;
  sessionNumberInWeek: number;
  globalSessionIndex: number;
  scheduledDate: string; // YYYY-MM-DD
  title: string;
  level: CEFRLevel;
  totalMinutes: number;
  focusSkills: SkillType[];
  activities: SessionActivity[];
  completed: boolean;
  completedAt?: string;
}

export interface MilestoneTestRecord {
  milestoneIndex: number;
  weekNumber: number;
  score: number;
  total: number;
  passed: boolean;
  completedAt: string;
}

export interface StudyPlan {
  config: StudyPlanConfig;
  sessions: StudySession[];
  lastCatchUpDate?: string;
  catchUpMessage?: string;
  milestoneTests: Record<number, MilestoneTestRecord>;
  finalTest?: {
    score: number;
    total: number;
    passed: boolean;
    completedAt: string;
  };
}

export interface UserProfile {
  firstName: string;
  goal: LearningGoal;
  createdAt: string;
}

export type OnboardingStep = 'profile' | 'placement' | 'plan' | 'ready';

export interface AppState {
  version: number;
  theme: ThemePreference;
  onboardingStep: OnboardingStep;
  profile: UserProfile | null;
  placementResult: PlacementResult | null;
  studyPlan: StudyPlan | null;
  sm2States: Record<string, SM2CardState>;
  studyDates: string[]; // Array of YYYY-MM-DD
  totalMinutesStudied: number;
  dictationCompletedCount: number;
  quizzesCompletedCount: number;
}
