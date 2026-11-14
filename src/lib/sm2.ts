import { FlashcardItem, SM2CardState, SM2Rating } from './types';

export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_EASE_FACTOR = 2.5;

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return formatDateISO(date);
}

export function createInitialSM2State(
  cardId: string,
  todayStr: string = formatDateISO(new Date())
): SM2CardState {
  return {
    cardId,
    interval: 0,
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    nextReviewDate: todayStr,
  };
}

export function calculateNextSM2State(
  previous: SM2CardState,
  rating: SM2Rating,
  todayStr: string = formatDateISO(new Date())
): SM2CardState {
  let interval = previous.interval;
  let repetitions = previous.repetitions;
  let easeFactor = previous.easeFactor;

  if (rating === 'again') {
    repetitions = 0;
    interval = 1;
    easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.2).toFixed(2)));
  } else if (rating === 'hard') {
    repetitions += 1;
    interval = repetitions === 1 ? 1 : Math.max(2, Math.round(previous.interval * 1.2));
    easeFactor = Math.max(MIN_EASE_FACTOR, Number((easeFactor - 0.14).toFixed(2)));
  } else if (rating === 'good') {
    repetitions += 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 4;
    } else {
      interval = Math.max(5, Math.round(previous.interval * easeFactor));
    }
  } else if (rating === 'easy') {
    repetitions += 1;
    easeFactor = Number((easeFactor + 0.1).toFixed(2));
    if (repetitions === 1) {
      interval = 3;
    } else if (repetitions === 2) {
      interval = 7;
    } else {
      interval = Math.max(8, Math.round(previous.interval * easeFactor * 1.3));
    }
  }

  // If rated 'again', keep it due today/tomorrow; for others, schedule after `interval` days
  const nextReviewDate =
    rating === 'again' ? todayStr : addDaysISO(todayStr, interval);

  return {
    cardId: previous.cardId,
    interval,
    repetitions,
    easeFactor,
    nextReviewDate,
    lastRating: rating,
    lastReviewedAt: todayStr,
  };
}

export function getDueCards(
  cards: FlashcardItem[],
  sm2States: Record<string, SM2CardState>,
  todayStr: string = formatDateISO(new Date())
): FlashcardItem[] {
  return [...cards].sort((a, b) => {
    const stateA = sm2States[a.id];
    const stateB = sm2States[b.id];
    const dueA = !stateA || stateA.nextReviewDate <= todayStr ? 0 : 1;
    const dueB = !stateB || stateB.nextReviewDate <= todayStr ? 0 : 1;

    if (dueA !== dueB) {
      return dueA - dueB;
    }
    const dateA = stateA?.nextReviewDate ?? todayStr;
    const dateB = stateB?.nextReviewDate ?? todayStr;
    return dateA.localeCompare(dateB);
  });
}
