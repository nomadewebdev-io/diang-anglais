import { describe, expect, it } from 'vitest';
import {
  calculateActivityXP,
  calculateStrictStreak,
  formatFrenchDateNatural,
  getDailyBonusMultiplier,
  getDueAndNewCardsForToday,
  getNextUncompletedSession,
  getPlanScheduleStatus,
  shouldRecommendConsolidation,
} from '../progression';
import {
  DailyActivityLog,
  FlashcardItem,
  SM2CardState,
  StudyPlan,
  StudySession,
} from '../types';

function makeSession(
  index: number,
  scheduledDate: string,
  completed: boolean = false
): StudySession {
  return {
    id: `sess-${index}`,
    weekNumber: Math.floor((index - 1) / 3) + 1,
    sessionNumberInWeek: ((index - 1) % 3) + 1,
    globalSessionIndex: index,
    scheduledDate,
    title: `Séance ${index}`,
    level: 'A2',
    totalMinutes: 15,
    focusSkills: ['vocab'],
    completed,
    activities: [
      {
        id: `act-${index}-1`,
        type: 'vocab',
        title: 'Vocabulaire',
        description: 'Cartes',
        durationMinutes: 15,
        itemIds: [],
        completed,
        isPriorityWeakness: false,
      },
    ],
  };
}

function makePlan(sessions: StudySession[], startDate = '2026-11-10'): StudyPlan {
  return {
    config: {
      currentLevel: 'A1',
      targetLevel: 'A2',
      durationWeeks: 4,
      sessionsPerWeek: 3,
      minutesPerSession: 30,
      startDate,
    },
    sessions,
    milestoneTests: [],
  };
}

describe('progression', () => {
  it('chains sessions in order without date lock', () => {
    const s1 = makeSession(1, '2026-11-10', true);
    const s2 = makeSession(2, '2026-11-25', false); // future scheduledDate, still immediately available
    const s3 = makeSession(3, '2026-11-27', false);
    const plan = makePlan([s1, s2, s3]);

    const next = getNextUncompletedSession(plan);
    expect(next?.id).toBe('sess-2');
    expect(formatFrenchDateNatural('2026-11-16', '2026-11-15')).toBe('Demain');
    expect(formatFrenchDateNatural('2026-11-15', '2026-11-15')).toBe("Aujourd'hui");
  });

  it('computes lead/lag and recalculates estimated end date', () => {
    const s1 = makeSession(1, '2026-11-10', true);
    const s2 = makeSession(2, '2026-11-12', true);
    const s3 = makeSession(3, '2026-11-20', false);
    const s4 = makeSession(4, '2026-11-22', false);
    const plan = makePlan([s1, s2, s3, s4]);

    // On 2026-11-11, only 1 session was expected by today, user completed 2 -> +1 ahead
    const ahead = getPlanScheduleStatus(plan, '2026-11-11');
    expect(ahead.deltaSessions).toBe(1);
    expect(ahead.statusLabel).toBe('Avance : +1 séance');
    expect(ahead.estimatedEndDate).toBe('2026-11-13');

    // On 2026-11-22, 4 sessions were expected, 2 completed -> 2 behind
    const behind = getPlanScheduleStatus(plan, '2026-11-22');
    expect(behind.deltaSessions).toBe(-2);
    expect(behind.statusLabel).toBe('Retard : 2 séances');
  });

  it('applies degressive +25% bonus for extra sessions (100%, 50%, 25%, 0%)', () => {
    expect(getDailyBonusMultiplier(0)).toBe(0);
    expect(getDailyBonusMultiplier(1)).toBe(1);
    expect(getDailyBonusMultiplier(2)).toBe(0.5);
    expect(getDailyBonusMultiplier(3)).toBe(0.25);
    expect(getDailyBonusMultiplier(4)).toBe(0);

    // duration 20 min -> baseXp = 40 -> 25% = 10
    const normal = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: false,
      bonusSessionIndexToday: 0,
    });
    expect(normal).toEqual({ xp: 40, bonusXp: 0, eligible: true });

    const bonus1 = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: false,
      bonusSessionIndexToday: 1,
    });
    expect(bonus1).toEqual({ xp: 50, bonusXp: 10, eligible: true });

    const bonus2 = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: false,
      bonusSessionIndexToday: 2,
    });
    expect(bonus2).toEqual({ xp: 45, bonusXp: 5, eligible: true });

    const bonus3 = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: false,
      bonusSessionIndexToday: 3,
    });
    expect(bonus3).toEqual({ xp: 43, bonusXp: 3, eligible: true });

    const bonus4 = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: false,
      bonusSessionIndexToday: 4,
    });
    expect(bonus4).toEqual({ xp: 40, bonusXp: 0, eligible: true });
  });

  it('requires >= 60% genuine answers and awards 0 XP on repeats', () => {
    const belowThreshold = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 0.59,
      isRepeat: false,
      bonusSessionIndexToday: 1,
    });
    expect(belowThreshold).toEqual({ xp: 0, bonusXp: 0, eligible: false });

    const atThreshold = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 0.6,
      isRepeat: false,
      bonusSessionIndexToday: 0,
    });
    expect(atThreshold.eligible).toBe(true);
    expect(atThreshold.xp).toBe(40);

    const repeat = calculateActivityXP({
      durationMinutes: 20,
      answeredRatio: 1,
      isRepeat: true,
      bonusSessionIndexToday: 0,
    });
    expect(repeat).toEqual({ xp: 0, bonusXp: 0, eligible: false });
  });

  it('computes strict streak (>= 1 session or >= 10 min) and bonus sessions do not inflate streak', () => {
    const logs: Record<string, DailyActivityLog> = {
      '2026-11-13': {
        sessionsCompleted: 1,
        bonusSessions: 3, // extra bonus sessions on same day still count as 1 day
        validatedMinutes: 15,
        newCardsCount: 5,
        xpEarned: 30,
      },
      '2026-11-14': {
        sessionsCompleted: 0,
        bonusSessions: 0,
        validatedMinutes: 10, // >= 10 min validated counts
        newCardsCount: 0,
        xpEarned: 20,
      },
      '2026-11-15': {
        sessionsCompleted: 0,
        bonusSessions: 0,
        validatedMinutes: 5, // < 10 min does not count for today, streak stays at yesterday (2)
        newCardsCount: 0,
        xpEarned: 0,
      },
    };

    expect(calculateStrictStreak(logs, '2026-11-15')).toBe(2);

    // If today reaches 10 min or 1 session, streak becomes 3
    logs['2026-11-15'].validatedMinutes = 10;
    expect(calculateStrictStreak(logs, '2026-11-15')).toBe(3);
  });

  it('filters due SM-2 cards only and enforces daily soft cap on new cards', () => {
    const cards: FlashcardItem[] = [
      { id: 'c1', level: 'A1', theme: 'base', en: 'a', fr: 'a', example: 'a', exampleFr: 'a' },
      { id: 'c2', level: 'A1', theme: 'base', en: 'b', fr: 'b', example: 'b', exampleFr: 'b' },
      { id: 'c3', level: 'A1', theme: 'base', en: 'c', fr: 'c', example: 'c', exampleFr: 'c' },
      { id: 'c4', level: 'A1', theme: 'base', en: 'd', fr: 'd', example: 'd', exampleFr: 'd' },
    ];
    const sm2States: Record<string, SM2CardState> = {
      c1: {
        cardId: 'c1',
        repetitions: 1,
        interval: 1,
        easeFactor: 2.5,
        nextReviewDate: '2026-11-14', // due
      },
      c2: {
        cardId: 'c2',
        repetitions: 2,
        interval: 6,
        easeFactor: 2.5,
        nextReviewDate: '2026-11-20', // not due yet
      },
    };

    const res = getDueAndNewCardsForToday(cards, sm2States, 19, 20, '2026-11-15');
    expect(res.dueCards.map((c) => c.id)).toEqual(['c1']);
    expect(res.remainingNewQuota).toBe(1);
    expect(res.newCards.map((c) => c.id)).toEqual(['c3']);
  });

  it('recommends 48h consolidation if all sessions finish in under 50% of planned duration', () => {
    const s1 = makeSession(1, '2026-11-10', true);
    const s2 = makeSession(2, '2026-11-12', true);
    const plan = makePlan([s1, s2], '2026-11-10'); // 4 weeks = 28 planned days

    // Finished all sessions in 5 days (< 14 days)
    const fast = shouldRecommendConsolidation(plan, '2026-11-15');
    expect(fast.recommend).toBe(true);
    expect(fast.elapsedDays).toBe(5);
    expect(fast.plannedDays).toBe(28);

    // Finished in 20 days (>= 14 days)
    const normal = shouldRecommendConsolidation(plan, '2026-11-30');
    expect(normal.recommend).toBe(false);
  });
});
