import { describe, expect, it } from 'vitest';
import {
  calculateNextSM2State,
  createInitialSM2State,
  MIN_EASE_FACTOR,
} from '../sm2';
import { evaluateDictation } from '../dictation';
import { loadFullCatalogForMode } from '../catalog';

const catalog = await loadFullCatalogForMode('adult');

describe('sm2 & dictation & data catalog', () => {
  it('vérifie que les 4 fichiers JSON contiennent 800 cartes, 40 leçons, 400 questions et 300 phrases', () => {
    expect(catalog.cards).toHaveLength(800);
    expect(catalog.lessons).toHaveLength(40);
    expect(catalog.placement).toHaveLength(400);
    expect(catalog.sentences).toHaveLength(300);
  });

  it('applique correctement les 4 niveaux de révision SM-2 (À revoir, Difficile, Bien, Facile)', () => {
    const initial = createInitialSM2State('card-a1-01', '2026-11-14');

    const good1 = calculateNextSM2State(initial, 'good', '2026-11-14');
    expect(good1.repetitions).toBe(1);
    expect(good1.interval).toBe(1);
    expect(good1.nextReviewDate).toBe('2026-11-15');

    const good2 = calculateNextSM2State(good1, 'good', '2026-11-15');
    expect(good2.repetitions).toBe(2);
    expect(good2.interval).toBe(4);
    expect(good2.nextReviewDate).toBe('2026-11-19');

    const easy3 = calculateNextSM2State(good2, 'easy', '2026-11-19');
    expect(easy3.repetitions).toBe(3);
    expect(easy3.interval).toBeGreaterThan(4);
    expect(easy3.easeFactor).toBeGreaterThan(good2.easeFactor);

    const again = calculateNextSM2State(easy3, 'again', '2026-11-25');
    expect(again.repetitions).toBe(0);
    expect(again.interval).toBe(1);
    expect(again.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });

  it('corrige la dictée mot par mot avec tolérance à la casse et à la ponctuation', () => {
    const expected = 'Our meeting starts at nine o\'clock.';
    const perfect = evaluateDictation(expected, 'our meeting starts at nine o’clock');
    expect(perfect.isFullyCorrect).toBe(true);
    expect(perfect.accuracyPercentage).toBe(100);

    const partial = evaluateDictation(expected, 'Our meeting start at ten o\'clock.');
    expect(partial.isFullyCorrect).toBe(false);
    expect(partial.words[0].isCorrect).toBe(true); // Our
    expect(partial.words[1].isCorrect).toBe(true); // meeting
    expect(partial.words[2].isCorrect).toBe(false); // starts vs start
    expect(partial.words[3].isCorrect).toBe(true); // at
    expect(partial.words[4].isCorrect).toBe(false); // nine vs ten
    expect(partial.words[5].isCorrect).toBe(true); // o'clock
  });
});
