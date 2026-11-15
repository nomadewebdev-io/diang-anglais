import { beforeEach, describe, expect, it } from 'vitest';
import { catalog } from '../catalog';
import {
  abandonPlacementSession,
  adjustAdaptiveLevel,
  AnsweredPlacementItem,
  createAdaptiveSession,
  detectLevelInconsistency,
  DONT_KNOW_OPTION_INDEX,
  drawNextPlacementQuestion,
  evaluatePlacementTest,
  getPlacementLockStatus,
  getQuestionTimeLimitSeconds,
  MAX_LISTENING_PLAYS,
  recordAdaptiveAnswer,
  selectNextAdaptiveQuestion,
  shuffleQuestionOptions,
  toPlacementSessionState,
} from '../placementTest';
import {
  clearAppState,
  loadAppState,
  saveAppState,
} from '../storage';
import { PlacementQuestion } from '../types';

function makeDummyQuestion(
  id: string,
  level: PlacementQuestion['level'],
  skill: PlacementQuestion['skill'] = 'vocab'
): PlacementQuestion {
  return {
    id,
    level,
    skill,
    prompt: `Question test ${id}`,
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    answerIndex: 1,
    ...(skill === 'listening' ? { audioText: `Audio text for ${id}` } : {}),
  };
}

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('placementTest — tirage sans répétition, anti-triche et validation à 70 %', () => {
  beforeEach(() => {
    const mockStorage = createMemoryStorage();
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: mockStorage,
      },
      writable: true,
      configurable: true,
    });
  });

  it('ne retire jamais deux fois une question déjà vue tant que le stock non vu le permet, puis réutilise les plus anciennes', () => {
    const a1Questions = catalog.placement.filter((q) => q.level === 'A1');
    expect(a1Questions).toHaveLength(100);

    let seenIds: string[] = [];
    const drawnOrder: string[] = [];

    // Tirer les 100 questions A1 sur 5 sessions de 20 questions (en répondant faux pour rester en A1)
    for (let s = 0; s < 5; s++) {
      let session = createAdaptiveSession(a1Questions.length, 20, 'A1');
      for (let i = 0; i < 20; i++) {
        const drawn = drawNextPlacementQuestion(a1Questions, session, seenIds);
        expect(drawn.question).not.toBeNull();
        const q = drawn.question!;
        // Vérifier que cette question n'avait encore jamais été tirée dans les 100 premières
        expect(drawnOrder).not.toContain(q.id);
        drawnOrder.push(q.id);

        seenIds = drawn.seenQuestionIds;
        const wrongIdx = (q.answerIndex + 1) % q.options.length;
        session = recordAdaptiveAnswer(drawn.session, q, wrongIdx);
      }
    }

    expect(drawnOrder).toHaveLength(100);
    expect(new Set(drawnOrder).size).toBe(100);
    expect(seenIds).toEqual(drawnOrder);

    // Maintenant que les 100 questions A1 ont toutes été vues, la suivante doit réutiliser la plus ancienne (drawnOrder[0])
    const sixthSession = createAdaptiveSession(a1Questions.length, 20, 'A1');
    const reusedFirst = drawNextPlacementQuestion(a1Questions, sixthSession, seenIds);
    expect(reusedFirst.question?.id).toBe(drawnOrder[0]);

    // Et la suivante dans cette même session doit réutiliser la deuxième plus ancienne (drawnOrder[1])
    const afterFirstReuse = recordAdaptiveAnswer(
      reusedFirst.session,
      reusedFirst.question!,
      (reusedFirst.question!.answerIndex + 1) % 4
    );
    const reusedSecond = drawNextPlacementQuestion(
      a1Questions,
      afterFirstReuse,
      reusedFirst.seenQuestionIds
    );
    expect(reusedSecond.question?.id).toBe(drawnOrder[1]);
  });

  it('passe une session quittée ou rechargée en "abandoned" et produit une série différente à la tentative suivante', () => {
    let seenIds: string[] = [];
    let session1 = createAdaptiveSession(catalog.placement.length, 20, 'A1');
    const session1Ids: string[] = [];

    // L'utilisateur voit et répond à 6 questions, puis voit la 7e question avant de quitter/recharger
    for (let i = 0; i < 6; i++) {
      const drawn = drawNextPlacementQuestion(catalog.placement, session1, seenIds);
      expect(drawn.question).not.toBeNull();
      const q = drawn.question!;
      session1Ids.push(q.id);
      seenIds = drawn.seenQuestionIds;
      session1 = recordAdaptiveAnswer(drawn.session, q, q.answerIndex);
    }

    // 7e question affichée à l'écran au moment où l'utilisateur recharge la page
    const seventh = drawNextPlacementQuestion(catalog.placement, session1, seenIds);
    expect(seventh.question).not.toBeNull();
    session1Ids.push(seventh.question!.id);
    session1 = seventh.session;
    seenIds = seventh.seenQuestionIds;

    // Sauvegarde dans le storage pendant que la session est "in_progress"
    const appState = clearAppState();
    saveAppState({
      ...appState,
      seenQuestionIds: seenIds,
      placementSession: toPlacementSessionState(session1),
    });

    // Au rechargement (loadAppState), la session en cours doit passer automatiquement en "abandoned"
    const reloadedState = loadAppState();
    expect(reloadedState.placementSession?.status).toBe('abandoned');
    for (const id of session1Ids) {
      expect(reloadedState.seenQuestionIds).toContain(id);
    }

    // Vérifier aussi abandonPlacementSession directement
    const abandonedDirect = abandonPlacementSession(session1, seenIds);
    expect(abandonedDirect.session.status).toBe('abandoned');

    // Tentative suivante : tire une nouvelle série de 20 questions sans aucune question de la session abandonnée
    let session2 = createAdaptiveSession(catalog.placement.length, 20, 'A1');
    let seenForSession2 = reloadedState.seenQuestionIds;
    const session2Ids: string[] = [];

    for (let i = 0; i < 20; i++) {
      const drawn = drawNextPlacementQuestion(
        catalog.placement,
        session2,
        seenForSession2
      );
      expect(drawn.question).not.toBeNull();
      const q = drawn.question!;
      session2Ids.push(q.id);
      seenForSession2 = drawn.seenQuestionIds;
      session2 = recordAdaptiveAnswer(drawn.session, q, q.answerIndex);
    }

    expect(session2Ids).toHaveLength(20);
    for (const oldId of session1Ids) {
      expect(session2Ids).not.toContain(oldId);
    }
  });

  it("mélange l'ordre des options à chaque affichage et recalcule answerIndex avec exactitude", () => {
    const sampleQuestion = catalog.placement[0];
    const correctText = sampleQuestion.options[sampleQuestion.answerIndex];

    const distinctOrders = new Set<string>();

    for (let i = 0; i < 25; i++) {
      const shuffled = shuffleQuestionOptions(sampleQuestion);

      // L'ordre des options change par rapport à l'ordre initial du fichier
      expect(shuffled.options).not.toEqual(sampleQuestion.options);

      // Les mêmes 4 choix sont présents
      expect([...shuffled.options].sort()).toEqual([...sampleQuestion.options].sort());

      // answerIndex pointe toujours vers la bonne réponse exacte
      expect(shuffled.options[shuffled.answerIndex]).toBe(correctText);

      distinctOrders.add(shuffled.options.join('||'));
    }

    expect(distinctOrders.size).toBeGreaterThan(1);
  });

  it('ne fait pas monter le niveau avec "Je ne sais pas" et le compte comme neutre (ni point ni pénalité)', () => {
    expect(adjustAdaptiveLevel('A1', false, true)).toBe('A1');
    expect(adjustAdaptiveLevel('A2', false, true)).toBe('A2');
    expect(adjustAdaptiveLevel('B1', false, true)).toBe('B1');
    expect(adjustAdaptiveLevel('B2', false, true)).toBe('B2');

    // Même si isCorrect était passé à true par erreur, isDontKnow bloque toute montée de niveau
    expect(adjustAdaptiveLevel('A2', true, true)).toBe('A2');

    let session = createAdaptiveSession(catalog.placement.length, 20, 'A2');
    const q = selectNextAdaptiveQuestion(catalog.placement, session)!;

    // Réponse via DONT_KNOW_OPTION_INDEX (-1) ou réponse vide (null)
    session = recordAdaptiveAnswer(session, q, DONT_KNOW_OPTION_INDEX);
    expect(session.currentLevel).toBe('A2');
    expect(session.answered[0].isDontKnow).toBe(true);
    expect(session.answered[0].isCorrect).toBe(false);
    expect(session.answered[0].selectedIndex).toBeNull();

    // Limites de temps anti-triche : 30s vocab/grammar, 45s reading/listening, 2 écoutes max
    expect(getQuestionTimeLimitSeconds('vocab')).toBe(30);
    expect(getQuestionTimeLimitSeconds('grammar')).toBe(30);
    expect(getQuestionTimeLimitSeconds('reading')).toBe(45);
    expect(getQuestionTimeLimitSeconds('listening')).toBe(45);
    expect(MAX_LISTENING_PLAYS).toBe(2);
  });

  it('respecte la règle des 70 % (minimum 3 questions par niveau) et pose 2 à 4 questions de confirmation en cas d’incohérence', () => {
    // Cas 1 : A1 validé (4/4 = 100%), A2 validé (3/4 = 75% >= 70%), B1 échoué (2/3 = 66.7% < 70%) -> Niveau final A2
    const regularA2Answers: AnsweredPlacementItem[] = [
      { question: makeDummyQuestion('a1-1', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-2', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-3', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-4', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-1', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-2', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-3', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-4', 'A2'), selectedIndex: 0, isCorrect: false },
      { question: makeDummyQuestion('b1-1', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-2', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-3', 'B1'), selectedIndex: 0, isCorrect: false },
    ];
    expect(evaluatePlacementTest(regularA2Answers).determinedLevel).toBe('A2');

    // Cas 2 : B1 à 100% mais seulement 2 questions (< 3 minimum) -> B1 non validé, reste A2
    const luckyStreakB1: AnsweredPlacementItem[] = [
      { question: makeDummyQuestion('a1-1', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-2', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-3', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-1', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-2', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-3', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-1', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-2', 'B1'), selectedIndex: 1, isCorrect: true },
    ];
    expect(evaluatePlacementTest(luckyStreakB1).determinedLevel).toBe('A2');

    // Cas 3 : Incohérence (échec sur A2 avec 1/4 = 25%, mais réussite sur B1 avec 3/4 = 75%)
    const inconsistentAnswers: AnsweredPlacementItem[] = [
      { question: makeDummyQuestion('a1-1', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-2', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a1-3', 'A1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-1', 'A2'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('a2-2', 'A2'), selectedIndex: 0, isCorrect: false },
      { question: makeDummyQuestion('a2-3', 'A2'), selectedIndex: 0, isCorrect: false },
      { question: makeDummyQuestion('a2-4', 'A2'), selectedIndex: 0, isCorrect: false },
      { question: makeDummyQuestion('b1-1', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-2', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-3', 'B1'), selectedIndex: 1, isCorrect: true },
      { question: makeDummyQuestion('b1-4', 'B1'), selectedIndex: 0, isCorrect: false },
    ];

    const report = detectLevelInconsistency(inconsistentAnswers);
    expect(report.isInconsistent).toBe(true);
    expect(report.confirmationTargetLevels.length).toBeGreaterThanOrEqual(2);
    expect(report.confirmationTargetLevels.length).toBeLessThanOrEqual(4);

    // Sans validation de A2, B1 ne peut pas être accordé
    expect(evaluatePlacementTest(inconsistentAnswers).determinedLevel).toBe('A1');

    // Vérifier que recordAdaptiveAnswer ajoute bien 2 à 4 questions de confirmation à la fin du test de base
    let session = createAdaptiveSession(400, 10, 'A1');
    for (let i = 0; i < 10; i++) {
      const lvl = i < 3 ? 'A1' : i < 7 ? 'A2' : 'B1';
      const q = makeDummyQuestion(`q-${i}`, lvl);
      // Réussir A1 (3/3) et B1 (3/3), mais échouer A2 (1/4 = 25%)
      const isRight = lvl !== 'A2' || i === 3;
      session = recordAdaptiveAnswer(session, q, isRight ? 1 : 0);
    }

    expect(session.confirmationQuestionsAdded).toBeGreaterThanOrEqual(2);
    expect(session.confirmationQuestionsAdded).toBeLessThanOrEqual(4);
    expect(session.maxQuestions).toBe(10 + session.confirmationQuestionsAdded);
    expect(session.status).toBe('in_progress');
  });

  it('verrouille le résultat du test pendant 7 jours et autorise un nouveau test après 7 jours', () => {
    const completedAt = '2026-11-15T10:00:00.000Z';
    const result = evaluatePlacementTest(
      [
        { question: makeDummyQuestion('a1-1', 'A1'), selectedIndex: 1, isCorrect: true },
        { question: makeDummyQuestion('a1-2', 'A1'), selectedIndex: 1, isCorrect: true },
        { question: makeDummyQuestion('a1-3', 'A1'), selectedIndex: 1, isCorrect: true },
      ],
      completedAt
    );

    // 2 jours après le test : verrouillé (5 jours restants)
    const twoDaysLater = new Date('2026-11-17T10:00:00.000Z');
    const lock2Days = getPlacementLockStatus(result, twoDaysLater);
    expect(lock2Days.isLocked).toBe(true);
    expect(lock2Days.remainingDays).toBe(5);
    expect(lock2Days.messageFr).toContain('Paramètres > Réinitialiser mes données');

    // 6 jours et 23 heures après : toujours verrouillé
    const almostSevenDays = new Date('2026-11-22T09:00:00.000Z');
    expect(getPlacementLockStatus(result, almostSevenDays).isLocked).toBe(true);

    // Exactement 7 jours après : déverrouillé
    const sevenDaysLater = new Date('2026-11-22T10:00:01.000Z');
    const unlocked = getPlacementLockStatus(result, sevenDaysLater);
    expect(unlocked.isLocked).toBe(false);
    expect(unlocked.remainingDays).toBe(0);
  });
});
