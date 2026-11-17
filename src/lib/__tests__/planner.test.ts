import { describe, expect, it } from 'vitest';
import {
  allocateSessionMinutes,
  analyzeFeasibility,
  applyAutomaticCatchUp,
  calculateStreak,
  estimateHoursForTarget,
  generateStudyPlan,
  getDefaultTargetLevel,
} from '../planner';
import { loadFullCatalogForMode } from '../catalog';
import { PlacementResult, StudyPlanConfig } from '../types';

const catalog = await loadFullCatalogForMode('adult');

describe('planner — faisabilité, génération du programme et rattrapage', () => {
  it('propose par défaut le niveau CECRL suivant', () => {
    expect(getDefaultTargetLevel('A1')).toBe('A2');
    expect(getDefaultTargetLevel('A2')).toBe('B1');
    expect(getDefaultTargetLevel('B1')).toBe('B2');
    expect(getDefaultTargetLevel('B2')).toBe('B2');
  });

  it('estime les heures nécessaires entre 100 h et 200 h selon le niveau cible', () => {
    expect(estimateHoursForTarget('A1', 'A2')).toBe(100);
    expect(estimateHoursForTarget('A2', 'B1')).toBe(130);
    expect(estimateHoursForTarget('B1', 'B2')).toBe(160);
    expect(estimateHoursForTarget('A1', 'B2')).toBe(200);
  });

  it('avertit et propose un plan réaliste quand le volume horaire est trop court', () => {
    const shortConfig: StudyPlanConfig = {
      currentLevel: 'A1',
      targetLevel: 'A2',
      durationWeeks: 6,
      sessionsPerWeek: 2,
      minutesPerSession: 20,
      startDate: '2026-11-15',
    };
    const analysis = analyzeFeasibility(shortConfig);
    expect(analysis.isRealistic).toBe(false);
    expect(analysis.plannedHours).toBe(4);
    expect(analysis.estimatedHoursNeeded).toBe(100);
    expect(analysis.suggestedWeeks).toBeGreaterThan(shortConfig.durationWeeks);
    expect(analysis.message.length).toBeGreaterThan(20);
  });

  it('valide un plan dont le volume horaire est réaliste', () => {
    const realisticConfig: StudyPlanConfig = {
      currentLevel: 'A1',
      targetLevel: 'A2',
      durationWeeks: 25,
      sessionsPerWeek: 4,
      minutesPerSession: 60,
      startDate: '2026-11-15',
    };
    const analysis = analyzeFeasibility(realisticConfig);
    expect(analysis.isRealistic).toBe(true);
    expect(analysis.status).toBe('optimal');
  });

  it('attribue plus de temps aux points faibles identifiés lors du test de niveau', () => {
    const allocation = allocateSessionMinutes(45, ['listening']);
    expect(allocation.listening.isPriority).toBe(true);
    expect(allocation.listening.minutes).toBeGreaterThan(allocation.vocab.minutes);

    const total =
      allocation.vocab.minutes +
      allocation.grammar.minutes +
      allocation.listening.minutes +
      allocation.dictation.minutes +
      allocation.quiz.minutes;
    expect(total).toBe(45);
  });

  it('génère le programme semaine par semaine et réajuste automatiquement les séances manquées', () => {
    const config: StudyPlanConfig = {
      currentLevel: 'A1',
      targetLevel: 'A2',
      durationWeeks: 4,
      sessionsPerWeek: 3,
      minutesPerSession: 30,
      startDate: '2026-11-01',
    };

    const mockPlacement: PlacementResult = {
      determinedLevel: 'A1',
      overallScore: 45,
      totalQuestions: 20,
      skillScores: {
        vocab: { correct: 4, total: 5, percentage: 80 },
        grammar: { correct: 2, total: 5, percentage: 40 },
        reading: { correct: 3, total: 5, percentage: 60 },
        listening: { correct: 1, total: 5, percentage: 20 },
      },
      strengths: ['vocab'],
      weaknesses: ['listening', 'grammar'],
      completedAt: '2026-11-01T10:00:00Z',
    };

    const plan = generateStudyPlan(config, mockPlacement, catalog, 'travail');
    expect(plan.sessions).toHaveLength(12);
    expect(plan.sessions[0].activities).toHaveLength(5);

    // Marquer la 1re séance comme complétée, puis simuler une date ultérieure (2026-11-15)
    plan.sessions[0].completed = true;
    const { plan: adjustedPlan, adjustedCount } = applyAutomaticCatchUp(plan, '2026-11-15');

    expect(adjustedCount).toBeGreaterThan(0);
    expect(adjustedPlan.sessions[1].scheduledDate).toBe('2026-11-15');
    expect(adjustedPlan.catchUpMessage).toBeDefined();
  });

  it('calcule correctement la série de jours consécutifs (streak)', () => {
    const dates = ['2026-11-12', '2026-11-13', '2026-11-14'];
    expect(calculateStreak(dates, '2026-11-14')).toBe(3);
    expect(calculateStreak(dates, '2026-11-15')).toBe(3);
    expect(calculateStreak(dates, '2026-11-16')).toBe(0);
  });
});
