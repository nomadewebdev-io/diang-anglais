import { addDaysISO, formatDateISO } from './sm2';
import {
  AppState,
  DailyActivityLog,
  FlashcardItem,
  SM2CardState,
  StudyPlan,
  StudySession,
} from './types';

export const MIN_ANSWERED_RATIO_FOR_XP = 0.6;
export const DEFAULT_DAILY_NEW_CARDS_LIMIT = 20;
export const BONUS_PAUSE_THRESHOLD = 4;

/**
 * Formate une date ISO (YYYY-MM-DD) en français naturel :
 * "Aujourd'hui", "Demain", "Hier" ou "lundi 16 novembre".
 */
export function formatFrenchDateNatural(
  dateStr: string,
  todayStr: string = formatDateISO(new Date())
): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  if (dateStr === todayStr) return "Aujourd'hui";
  if (dateStr === addDaysISO(todayStr, 1)) return 'Demain';
  if (dateStr === addDaysISO(todayStr, -1)) return 'Hier';

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, (m || 1) - 1, d || 1);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(dateObj);
}

/**
 * Retourne la prochaine séance non terminée dans l'ordre du programme
 * (aucune séance n'est verrouillée à une date).
 */
export function getNextUncompletedSession(plan: StudyPlan): StudySession | null {
  return plan.sessions.find((s) => !s.completed) ?? null;
}

export interface PlanScheduleStatus {
  completedCount: number;
  totalCount: number;
  expectedByTodayCount: number;
  deltaSessions: number; // > 0 = avance, < 0 = retard
  statusLabel: string;
  estimatedEndDate: string;
  initialEndDate: string;
}

export function getPlanScheduleStatus(
  plan: StudyPlan,
  todayStr: string = formatDateISO(new Date())
): PlanScheduleStatus {
  const totalCount = plan.sessions.length;
  const completedCount = plan.sessions.filter((s) => s.completed).length;

  // Séances initialement prévues jusqu'à aujourd'hui inclus
  const expectedByTodayCount = plan.sessions.filter(
    (s) => s.scheduledDate <= todayStr
  ).length;

  const deltaSessions = completedCount - expectedByTodayCount;
  let statusLabel = 'Dans les temps';
  if (deltaSessions > 0) {
    statusLabel = `Avance : +${deltaSessions} séance${deltaSessions > 1 ? 's' : ''}`;
  } else if (deltaSessions < 0) {
    const abs = Math.abs(deltaSessions);
    statusLabel = `Retard : ${abs} séance${abs > 1 ? 's' : ''}`;
  }

  const initialEndDate =
    plan.sessions[plan.sessions.length - 1]?.scheduledDate ??
    addDaysISO(plan.config.startDate, Math.max(0, plan.config.durationWeeks * 7 - 1));

  const remaining = Math.max(0, totalCount - completedCount);
  let estimatedEndDate = todayStr;
  if (remaining > 0) {
    const dayStep = Math.max(
      1,
      Math.floor(7 / Math.max(1, plan.config.sessionsPerWeek))
    );
    const weeksAhead = Math.floor((remaining - 1) / Math.max(1, plan.config.sessionsPerWeek));
    const slotInWeek = (remaining - 1) % Math.max(1, plan.config.sessionsPerWeek);
    const offsetDays = weeksAhead * 7 + Math.min(6, slotInWeek * dayStep);
    estimatedEndDate = addDaysISO(todayStr, offsetDays);
  }

  return {
    completedCount,
    totalCount,
    expectedByTodayCount,
    deltaSessions,
    statusLabel,
    estimatedEndDate,
    initialEndDate,
  };
}

/**
 * Bonus dégressif sur le +25 % d'XP des séances supplémentaires :
 * 1re séance bonus -> 100 % du bonus (+25 % XP)
 * 2e séance bonus -> 50 % du bonus (+12,5 % XP)
 * 3e séance bonus -> 25 % du bonus (+6,25 % XP)
 * 4e et suivantes -> 0 %
 */
export function getDailyBonusMultiplier(bonusSessionIndex: number): number {
  if (bonusSessionIndex <= 0) return 0;
  if (bonusSessionIndex === 1) return 1;
  if (bonusSessionIndex === 2) return 0.5;
  if (bonusSessionIndex === 3) return 0.25;
  return 0;
}

export interface ActivityXPInput {
  durationMinutes: number;
  answeredRatio: number; // 0..1 (hors "Je ne sais pas" / passés)
  isRepeat: boolean;
  bonusSessionIndexToday: number; // 0 si séance normale du jour, 1 pour 1re bonus, etc.
}

export function calculateActivityXP({
  durationMinutes,
  answeredRatio,
  isRepeat,
  bonusSessionIndexToday,
}: ActivityXPInput): { xp: number; bonusXp: number; eligible: boolean } {
  if (isRepeat || answeredRatio < MIN_ANSWERED_RATIO_FOR_XP) {
    return { xp: 0, bonusXp: 0, eligible: false };
  }

  const baseXp = Math.max(10, Math.round(durationMinutes * 2));
  const multiplier = getDailyBonusMultiplier(bonusSessionIndexToday);
  const bonusXp = Math.round(baseXp * 0.25 * multiplier);

  return {
    xp: baseXp + bonusXp,
    bonusXp,
    eligible: true,
  };
}

/**
 * Un jour compte dans la série s'il a au moins 1 séance terminée
 * OU au moins 10 minutes d'activités validées.
 * Les séances bonus supplémentaires dans la même journée ne changent pas la série.
 */
export function isDayEligibleForStreak(log: DailyActivityLog | undefined): boolean {
  if (!log) return false;
  return log.sessionsCompleted >= 1 || log.validatedMinutes >= 10;
}

export function calculateStrictStreak(
  dailyLogs: Record<string, DailyActivityLog>,
  todayStr: string = formatDateISO(new Date()),
  legacyStudyDates: string[] = []
): number {
  const hasLogs = Object.keys(dailyLogs).length > 0;
  const eligibleDates = new Set<string>();

  if (hasLogs) {
    for (const [date, log] of Object.entries(dailyLogs)) {
      if (isDayEligibleForStreak(log)) {
        eligibleDates.add(date);
      }
    }
  } else {
    for (const d of legacyStudyDates) {
      eligibleDates.add(d);
    }
  }

  if (eligibleDates.size === 0) return 0;

  const yesterdayStr = addDaysISO(todayStr, -1);
  let cursor = eligibleDates.has(todayStr)
    ? todayStr
    : eligibleDates.has(yesterdayStr)
    ? yesterdayStr
    : null;

  if (!cursor) return 0;

  let streak = 0;
  while (eligibleDates.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function getWeeklyActiveDaysCount(
  dailyLogs: Record<string, DailyActivityLog>,
  todayStr: string = formatDateISO(new Date())
): number {
  let active = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysISO(todayStr, -i);
    if (isDayEligibleForStreak(dailyLogs[d])) {
      active += 1;
    }
  }
  return active;
}

export function getBonusSessionsStats(
  dailyLogs: Record<string, DailyActivityLog>,
  todayStr: string = formatDateISO(new Date())
): { today: number; week: number } {
  const today = dailyLogs[todayStr]?.bonusSessions ?? 0;
  let week = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysISO(todayStr, -i);
    week += dailyLogs[d]?.bonusSessions ?? 0;
  }
  return { today, week };
}

/**
 * Vocabulaire SM-2 : sépare strictement les cartes dues (déjà vues et dues aujourd'hui)
 * des nouvelles cartes (jamais vues, plafonnées par dailyNewCardsLimit).
 */
export function getDueAndNewCardsForToday(
  cards: FlashcardItem[],
  sm2States: Record<string, SM2CardState>,
  newCardsUsedToday: number = 0,
  dailyNewCardsLimit: number = DEFAULT_DAILY_NEW_CARDS_LIMIT,
  todayStr: string = formatDateISO(new Date())
): {
  dueCards: FlashcardItem[];
  newCards: FlashcardItem[];
  remainingNewQuota: number;
} {
  const dueCards: FlashcardItem[] = [];
  const unseenCards: FlashcardItem[] = [];

  for (const card of cards) {
    const st = sm2States[card.id];
    if (!st) {
      unseenCards.push(card);
    } else if (st.nextReviewDate <= todayStr) {
      dueCards.push(card);
    }
  }

  dueCards.sort((a, b) => {
    const da = sm2States[a.id]?.nextReviewDate ?? todayStr;
    const db = sm2States[b.id]?.nextReviewDate ?? todayStr;
    return da.localeCompare(db);
  });

  const remainingNewQuota = Math.max(0, dailyNewCardsLimit - newCardsUsedToday);
  const newCards = unseenCards.slice(0, remainingNewQuota);

  return {
    dueCards,
    newCards,
    remainingNewQuota,
  };
}

/**
 * Si l'utilisateur termine toutes les séances en moins de 50 % de la durée prévue,
 * recommande 48 h de consolidation (révision uniquement) avant le test final.
 */
export function shouldRecommendConsolidation(
  plan: StudyPlan,
  todayStr: string = formatDateISO(new Date())
): { recommend: boolean; elapsedDays: number; plannedDays: number } {
  const totalSessions = plan.sessions.length;
  const completedSessions = plan.sessions.filter((s) => s.completed).length;
  const plannedDays = Math.max(1, plan.config.durationWeeks * 7);

  const [sy, sm, sd] = plan.config.startDate.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const startMs = new Date(sy, (sm || 1) - 1, sd || 1).getTime();
  const todayMs = new Date(ty, (tm || 1) - 1, td || 1).getTime();
  const elapsedDays = Math.max(0, Math.round((todayMs - startMs) / 86400000));

  const recommend =
    totalSessions > 0 &&
    completedSessions === totalSessions &&
    elapsedDays < plannedDays * 0.5;

  return { recommend, elapsedDays, plannedDays };
}

export interface SoberBadge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

export function computeBadges(
  state: AppState,
  todayStr: string = formatDateISO(new Date())
): SoberBadge[] {
  const streak = calculateStrictStreak(
    state.dailyLogs,
    todayStr,
    state.studyDates
  );
  const weeklyActive = getWeeklyActiveDaysCount(state.dailyLogs, todayStr);
  const schedule = state.studyPlan
    ? getPlanScheduleStatus(state.studyPlan, todayStr)
    : null;
  const bonusStats = getBonusSessionsStats(state.dailyLogs, todayStr);

  return [
    {
      id: 'streak-5',
      label: "5 jours d'affilée",
      description: '5 jours consécutifs avec une séance ou 10 min validées',
      earned: streak >= 5 || state.earnedBadges.includes('streak-5'),
    },
    {
      id: 'full-week',
      label: 'Semaine complète',
      description: '7 jours actifs sur les 7 derniers jours',
      earned: weeklyActive >= 7 || state.earnedBadges.includes('full-week'),
    },
    {
      id: 'ahead-of-plan',
      label: 'En avance sur le plan',
      description: 'Au moins 2 séances d’avance sur le calendrier initial',
      earned:
        (schedule !== null && schedule.deltaSessions >= 2) ||
        state.earnedBadges.includes('ahead-of-plan'),
    },
    {
      id: 'bonus-explorer',
      label: 'Élan supplémentaire',
      description: 'Au moins une séance bonus réalisée cette semaine',
      earned:
        bonusStats.week >= 1 || state.earnedBadges.includes('bonus-explorer'),
    },
  ];
}
