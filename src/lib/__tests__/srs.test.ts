import { describe, expect, it } from 'vitest';
import { createInitialSM2State } from '../sm2';
import {
  buildCardChoices,
  classifyResponseToSM2,
  formatReviewClassificationLabel,
  getCardDirection,
  getResponseThresholds,
  shouldUseReverseDirection,
  SilentResponseTimer,
  SRS_TIMING_CONFIG,
} from '../srs';
import { FlashcardItem, SM2CardState } from '../types';

const sampleCard: FlashcardItem = {
  id: 'card-a1-01',
  en: 'boarding pass',
  fr: "carte d'embarquement",
  example: 'Please show your boarding pass.',
  exampleFr: "Veuillez montrer votre carte d'embarquement.",
  level: 'A1',
  theme: 'voyage',
  distractors: ['passeport', 'valise'],
  distractorsEn: ['passport', 'suitcase'],
};

describe('srs automatic SM-2 classification', () => {
  it('maps "Je ne sais pas" to quality 0 and wrong answer to quality 1 (again)', () => {
    const prev = createInitialSM2State('card-a1-01', '2026-11-15');

    const dontKnow = classifyResponseToSM2({
      isCorrect: false,
      isDontKnow: true,
      responseTimeMs: 3000,
      card: sampleCard,
      previousState: prev,
      todayStr: '2026-11-15',
    });
    expect(dontKnow.quality).toBe(0);
    expect(dontKnow.rating).toBe('again');
    expect(dontKnow.nextState.repetitions).toBe(0);
    expect(dontKnow.nextState.nextReviewDate).toBe('2026-11-16');

    const wrong = classifyResponseToSM2({
      isCorrect: false,
      isDontKnow: false,
      responseTimeMs: 2000,
      card: sampleCard,
      previousState: prev,
      todayStr: '2026-11-15',
    });
    expect(wrong.quality).toBe(1);
    expect(wrong.rating).toBe('again');
    expect(wrong.nextState.nextReviewDate).toBe('2026-11-16');
  });

  it('maps fast, normal, and slow correct answers to easy (5), good (4), and hard (3) with level & length thresholds', () => {
    const a1Thresh = getResponseThresholds('A1', 6);
    const b2Thresh = getResponseThresholds('B2', 6);
    expect(a1Thresh.fastMaxMs).toBeGreaterThan(b2Thresh.fastMaxMs);
    expect(a1Thresh.normalMaxMs).toBeGreaterThan(b2Thresh.normalMaxMs);

    const longWordThresh = getResponseThresholds('B2', 18);
    expect(longWordThresh.fastMaxMs).toBeGreaterThan(b2Thresh.fastMaxMs);

    // Card already succeeded once (repetitions = 1) -> eligible for easy (5)
    const learnedState: SM2CardState = {
      cardId: 'card-a1-01',
      interval: 1,
      repetitions: 1,
      easeFactor: 2.5,
      nextReviewDate: '2026-11-15',
    };

    const fast = classifyResponseToSM2({
      isCorrect: true,
      isDontKnow: false,
      responseTimeMs: 1800,
      card: sampleCard,
      previousState: learnedState,
      todayStr: '2026-11-15',
    });
    expect(fast.quality).toBe(5);
    expect(fast.rating).toBe('easy');
    expect(formatReviewClassificationLabel(fast.rating, fast.nextState)).toContain(
      'Classée : Facile'
    );

    const normal = classifyResponseToSM2({
      isCorrect: true,
      isDontKnow: false,
      responseTimeMs: 7000,
      card: sampleCard,
      previousState: learnedState,
      todayStr: '2026-11-15',
    });
    expect(normal.quality).toBe(4);
    expect(normal.rating).toBe('good');

    const slow = classifyResponseToSM2({
      isCorrect: true,
      isDontKnow: false,
      responseTimeMs: 16000,
      card: sampleCard,
      previousState: learnedState,
      todayStr: '2026-11-15',
    });
    expect(slow.quality).toBe(3);
    expect(slow.rating).toBe('hard');
  });

  it('enforces new-card guard: never exceeds "good" (4) on first success even if fast', () => {
    const freshState = createInitialSM2State('card-a1-01', '2026-11-15');
    expect(freshState.repetitions).toBe(0);

    const res = classifyResponseToSM2({
      isCorrect: true,
      isDontKnow: false,
      responseTimeMs: 900,
      card: sampleCard,
      previousState: freshState,
      todayStr: '2026-11-15',
    });
    expect(res.quality).toBe(4);
    expect(res.rating).toBe('good');
    expect(res.cappedByNewCardGuard).toBe(true);
  });

  it('pauses SilentResponseTimer when tab is hidden and caps elapsed time at 20 s', () => {
    const timer = new SilentResponseTimer(1000, SRS_TIMING_CONFIG.maxResponseTimeMs);
    // 2500 ms active
    timer.pause(3500);
    // 60000 ms while tab hidden (must be ignored)
    timer.resume(63500);
    // 1500 ms active after resume
    expect(timer.getElapsedMs(65000)).toBe(4000);

    // Cap at 20000 ms
    expect(timer.getElapsedMs(120000)).toBe(20000);
  });

  it('alternates to reverse direction (FR -> EN) after 2 consecutive successes', () => {
    const base = createInitialSM2State('card-a1-01', '2026-11-15');
    expect(shouldUseReverseDirection({ ...base, repetitions: 0 })).toBe(false);
    expect(shouldUseReverseDirection({ ...base, repetitions: 1 })).toBe(false);
    expect(getCardDirection({ ...base, repetitions: 2 })).toBe('fr-to-en');
    expect(getCardDirection({ ...base, repetitions: 3 })).toBe('en-to-fr');
    expect(getCardDirection({ ...base, repetitions: 4 })).toBe('fr-to-en');
  });

  it('falls back to same theme/level cards when distractors are missing and shuffles options cleanly', () => {
    const cardWithoutDistractors: FlashcardItem = {
      id: 'card-test-1',
      en: 'luggage',
      fr: 'bagages',
      example: 'My luggage is heavy.',
      exampleFr: 'Mes bagages sont lourds.',
      level: 'A1',
      theme: 'voyage',
    };
    const fallbackPool: FlashcardItem[] = [
      cardWithoutDistractors,
      {
        id: 'card-test-2',
        en: 'passport',
        fr: 'passeport',
        example: 'Show your passport.',
        exampleFr: 'Montrez votre passeport.',
        level: 'A1',
        theme: 'voyage',
      },
      {
        id: 'card-test-3',
        en: 'ticket',
        fr: 'billet',
        example: 'Buy a ticket.',
        exampleFr: 'Achetez un billet.',
        level: 'A1',
        theme: 'voyage',
      },
      {
        id: 'card-test-4',
        en: 'desk',
        fr: 'bureau',
        example: 'Clean desk.',
        exampleFr: 'Bureau propre.',
        level: 'A1',
        theme: 'travail',
      },
    ];

    // Deterministic RNG returning 0.2 -> mixes order predictably
    const enToFr = buildCardChoices(
      cardWithoutDistractors,
      'en-to-fr',
      fallbackPool,
      () => 0.2
    );
    expect(enToFr.options).toHaveLength(3);
    expect(new Set(enToFr.options).size).toBe(3);
    expect(enToFr.options[enToFr.answerIndex]).toBe('bagages');
    expect(enToFr.options).toContain('passeport');
    expect(enToFr.options).toContain('billet');
    expect(enToFr.options).not.toContain('bureau');

    const frToEn = buildCardChoices(
      sampleCard,
      'fr-to-en',
      fallbackPool,
      () => 0.8
    );
    expect(frToEn.prompt).toBe("carte d'embarquement");
    expect(frToEn.options[frToEn.answerIndex]).toBe('boarding pass');
    expect(frToEn.options).toContain('passport');
    expect(frToEn.options).toContain('suitcase');
  });
});
