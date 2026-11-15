import { describe, expect, it } from 'vitest';
import { catalog } from '../catalog';
import {
  advanceConstructionQueue,
  buildShuffledTiles,
  createConstructionQueue,
  evaluateConstruction,
  getConstructionUnits,
  getNextConstructionUnitForLevel,
  isUnitUnlocked,
  recordUnitCompletion,
  unlockNextUnitManually,
  updateConstructionSM2,
} from '../construction';
import { generateStudyPlan } from '../planner';
import { ConstructionItem, PlacementResult, StudyPlanConfig } from '../types';

const SAMPLE_ITEMS: ConstructionItem[] = [
  {
    id: 'con-a1-u01-01',
    level: 'A1',
    unit: 1,
    unitTitleFr: 'Se présenter',
    order: 1,
    promptFr: 'Je suis Fatou.',
    answers: ['I am Fatou.', "I'm Fatou."],
    tiles: ['is', 'you'],
    noteFr: 'Utilisez I am.',
  },
  {
    id: 'con-a1-u01-02',
    level: 'A1',
    unit: 1,
    unitTitleFr: 'Se présenter',
    order: 2,
    promptFr: 'Je suis étudiant.',
    answers: ['I am a student.', "I'm a student."],
    tiles: ['the', 'are'],
  },
  {
    id: 'con-a1-u01-03',
    level: 'A1',
    unit: 1,
    unitTitleFr: 'Se présenter',
    order: 3,
    promptFr: 'Je suis à Dakar.',
    answers: ['I am in Dakar.', "I'm in Dakar."],
    tiles: ['at', 'on'],
  },
];

describe('construction — correcteur tolérant, ré-injection SM-2 et planification', () => {
  it('ignore la casse, la ponctuation finale et les espaces superflus', () => {
    const res = evaluateConstruction('  i   am   fatou  ', [
      'I am Fatou.',
      "I'm Fatou.",
    ]);
    expect(res.isCorrect).toBe(true);

    const withPunct = evaluateConstruction('I am Fatou!!', ['I am Fatou.']);
    expect(withPunct.isCorrect).toBe(true);
  });

  it('accepte les contractions équivalentes (I’m / I am, don’t / do not) et les variantes', () => {
    const contracted = evaluateConstruction("i'm ready!", ['I am ready.']);
    expect(contracted.isCorrect).toBe(true);

    const expanded = evaluateConstruction('I do not speak Spanish', [
      "I don't speak Spanish.",
    ]);
    expect(expanded.isCorrect).toBe(true);

    const variant = evaluateConstruction('If it rains tomorrow, we will stay home', [
      'If it rains tomorrow, we will stay at home.',
      'If it rains tomorrow, we will stay home.',
    ]);
    expect(variant.isCorrect).toBe(true);
  });

  it('repère l’endroit exact de l’écart en cas d’erreur', () => {
    const res = evaluateConstruction('I is in Dakar', ['I am in Dakar.']);
    expect(res.isCorrect).toBe(false);
    const mismatched = res.expectedDiff.filter((d) => !d.matched).map((d) => d.word);
    expect(mismatched).toContain('am');
    expect(res.expectedDiff.find((d) => d.word === 'Dakar.')?.matched).toBe(true);
  });

  it('construit les tuiles mélangées avec les mots corrects et les distracteurs', () => {
    const tiles = buildShuffledTiles('I am in Dakar.', ['at', 'on'], () => 0.4);
    const texts = tiles.map((t) => t.text);
    expect(texts).toContain('I');
    expect(texts).toContain('am');
    expect(texts).toContain('in');
    expect(texts).toContain('Dakar');
    expect(texts).toContain('at');
    expect(texts).toContain('on');
    expect(tiles).toHaveLength(6);
  });

  it('ré-injecte une phrase ratée 2 fois dans la séance et espace plus les réussites du 1er coup en SM-2', () => {
    let queue = createConstructionQueue(SAMPLE_ITEMS);

    // 1re phrase ratée -> revient 2 fois
    const step1 = advanceConstructionQueue(queue, false);
    expect(step1.completedItem).toBeUndefined();
    expect(step1.nextQueue.filter((q) => q.item.id === 'con-a1-u01-01')).toHaveLength(1);
    expect(step1.nextQueue[2].item.id).toBe('con-a1-u01-01');
    expect(step1.nextQueue[2].remainingMistakeRepeats).toBe(2);

    // 2e phrase réussie du premier coup -> terminée tout de suite
    const step2 = advanceConstructionQueue(step1.nextQueue, true);
    expect(step2.completedItem?.item.id).toBe('con-a1-u01-02');
    expect(step2.completedItem?.firstTrySuccess).toBe(true);

    // 3e phrase réussie du premier coup
    const step3 = advanceConstructionQueue(step2.nextQueue, true);
    expect(step3.completedItem?.item.id).toBe('con-a1-u01-03');

    // Retour 1 de la 1re phrase (réussie) -> encore 1 répétition à faire
    const retry1 = advanceConstructionQueue(step3.nextQueue, true);
    expect(retry1.completedItem).toBeUndefined();
    expect(retry1.nextQueue[0].remainingMistakeRepeats).toBe(1);

    // Retour 2 de la 1re phrase (réussie) -> terminée avec firstTrySuccess = false
    const retry2 = advanceConstructionQueue(retry1.nextQueue, true);
    expect(retry2.completedItem?.item.id).toBe('con-a1-u01-01');
    expect(retry2.completedItem?.firstTrySuccess).toBe(false);
    expect(retry2.nextQueue).toHaveLength(0);

    // SM-2 : réussite du 1er coup -> intervalle plus long (3 jours) vs erreur -> 1 jour (due today)
    const sm2Good = updateConstructionSM2({}, 'con-a1-u01-02', true, '2026-11-15');
    const sm2Fail = updateConstructionSM2({}, 'con-a1-u01-01', false, '2026-11-15');
    expect(sm2Good.interval).toBeGreaterThan(sm2Fail.interval);
    expect(sm2Good.lastRating).toBe('easy');
    expect(sm2Fail.lastRating).toBe('again');
  });

  it('gère le déblocage à 80 % et le passage manuel sans blocage définitif', () => {
    const unitsA1 = getConstructionUnits(catalog.constructions ?? [], 'A1');
    expect(unitsA1).toHaveLength(12);

    let progress = {};
    expect(isUnitUnlocked(progress, 'A1', 1)).toBe(true);
    expect(isUnitUnlocked(progress, 'A1', 2)).toBe(false);

    // 70 % -> unité 2 toujours verrouillée
    progress = recordUnitCompletion(progress, 'A1', 1, 7, 10, '2026-11-15');
    expect(isUnitUnlocked(progress, 'A1', 2)).toBe(false);

    // Passer à la suite -> débloque unité 2 sans attendre 80 %
    const unlockedManually = unlockNextUnitManually(progress, 'A1', 1);
    expect(isUnitUnlocked(unlockedManually, 'A1', 2)).toBe(true);

    // 80 % -> débloque automatiquement l'unité 2
    progress = recordUnitCompletion(progress, 'A1', 1, 8, 10, '2026-11-15');
    expect(isUnitUnlocked(progress, 'A1', 2)).toBe(true);
    const nextUnit = getNextConstructionUnitForLevel(
      catalog.constructions ?? [],
      progress,
      'A1'
    );
    expect(nextUnit?.unit).toBe(2);
  });

  it('intègre "Construis la phrase" dans ~30 % des séances du programme dans l’ordre des unités', () => {
    const config: StudyPlanConfig = {
      currentLevel: 'A1',
      targetLevel: 'A2',
      durationWeeks: 3,
      sessionsPerWeek: 3,
      minutesPerSession: 30,
      startDate: '2026-11-15',
    };
    const placement: PlacementResult = {
      determinedLevel: 'A1',
      overallScore: 50,
      totalQuestions: 20,
      skillScores: {
        vocab: { correct: 3, total: 5, percentage: 60 },
        grammar: { correct: 2, total: 5, percentage: 40 },
        reading: { correct: 3, total: 5, percentage: 60 },
        listening: { correct: 2, total: 5, percentage: 40 },
      },
      strengths: ['vocab'],
      weaknesses: ['grammar', 'listening'],
      completedAt: '2026-11-15T09:00:00Z',
    };

    const plan = generateStudyPlan(config, placement, catalog, 'travail');
    const constructionActivities = plan.sessions.flatMap((s) =>
      s.activities.filter((a) => a.type === 'construction')
    );

    // 9 séances au total -> 3 séances (~33 %) ont une activité construction
    expect(constructionActivities).toHaveLength(3);
    expect(constructionActivities[0].title).toContain('Unité 1');
    expect(constructionActivities[1].title).toContain('Unité 2');
    expect(constructionActivities[2].title).toContain('Unité 3');
  });
});
