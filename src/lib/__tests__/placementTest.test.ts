import { describe, expect, it } from 'vitest';
import {
  adjustAdaptiveLevel,
  createAdaptiveSession,
  evaluatePlacementTest,
  recordAdaptiveAnswer,
  selectNextAdaptiveQuestion,
} from '../placementTest';
import { catalog } from '../catalog';

describe('placementTest — logique adaptative CECRL A1 → B2', () => {
  it('augmente le niveau après une bonne réponse et le plafonne à B2', () => {
    expect(adjustAdaptiveLevel('A1', true)).toBe('A2');
    expect(adjustAdaptiveLevel('A2', true)).toBe('B1');
    expect(adjustAdaptiveLevel('B1', true)).toBe('B2');
    expect(adjustAdaptiveLevel('B2', true)).toBe('B2');
  });

  it('baisse le niveau après une erreur et le maintient au minimum à A1', () => {
    expect(adjustAdaptiveLevel('B2', false)).toBe('B1');
    expect(adjustAdaptiveLevel('B1', false)).toBe('A2');
    expect(adjustAdaptiveLevel('A2', false)).toBe('A1');
    expect(adjustAdaptiveLevel('A1', false)).toBe('A1');
  });

  it('sélectionne 20 questions sans doublon en équilibrant les 4 compétences', () => {
    let session = createAdaptiveSession(catalog.placement.length, 20, 'A1');

    for (let i = 0; i < 20; i++) {
      const nextQ = selectNextAdaptiveQuestion(catalog.placement, session);
      expect(nextQ).not.toBeNull();
      if (!nextQ) break;

      // Simuler une réussite sur 2 questions sur 3
      const chosenOption =
        i % 3 !== 0 ? nextQ.answerIndex : (nextQ.answerIndex + 1) % nextQ.options.length;
      session = recordAdaptiveAnswer(session, nextQ, chosenOption);
    }

    expect(session.answered).toHaveLength(20);
    const uniqueIds = new Set(session.answered.map((a) => a.question.id));
    expect(uniqueIds.size).toBe(20);

    const result = evaluatePlacementTest(session.answered);
    expect(['A1', 'A2', 'B1', 'B2']).toContain(result.determinedLevel);
    expect(result.skillScores.vocab.total).toBeGreaterThan(0);
    expect(result.skillScores.grammar.total).toBeGreaterThan(0);
    expect(result.skillScores.reading.total).toBeGreaterThan(0);
    expect(result.skillScores.listening.total).toBeGreaterThan(0);
    expect(result.weaknesses.length).toBeGreaterThan(0);
  });

  it('identifie précisément une faiblesse sur une compétence échouée', () => {
    let session = createAdaptiveSession(catalog.placement.length, 12, 'A2');

    for (let i = 0; i < 12; i++) {
      const q = selectNextAdaptiveQuestion(catalog.placement, session);
      if (!q) break;
      // Échouer systématiquement en listening, réussir les autres
      const selected =
        q.skill === 'listening' ? (q.answerIndex + 1) % q.options.length : q.answerIndex;
      session = recordAdaptiveAnswer(session, q, selected);
    }

    const result = evaluatePlacementTest(session.answered);
    expect(result.skillScores.listening.percentage).toBe(0);
    expect(result.weaknesses).toContain('listening');
  });
});
