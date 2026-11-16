import React, { useState } from 'react';
import { getCatalogForMode } from '../lib/catalog';
import { getLevelsForMode, SKILL_LABELS_FR } from '../lib/placementTest';
import {
  analyzeFeasibility,
  generateStudyPlan,
  getMilestoneWeeks,
} from '../lib/planner';
import { formatFrenchDateNatural } from '../lib/progression';
import { formatDateISO } from '../lib/sm2';
import {
  AppState,
  CEFRLevel,
  StudyPlan,
  StudyPlanConfig,
  StudySession,
} from '../lib/types';
import {
  IconAlert,
  IconAward,
  IconCheck,
  IconRefresh,
} from './Icons';
import { QuizPractice } from './QuizPractice';

interface ProgramViewProps {
  state: AppState;
  onUpdatePlan: (newPlan: StudyPlan) => void;
  onCompleteMilestoneTest: (
    weekNumber: number,
    score: number,
    total: number,
    passed: boolean
  ) => void;
  onCompleteFinalTest: (score: number, total: number, passed: boolean) => void;
}

export function ProgramView({
  state,
  onUpdatePlan,
  onCompleteMilestoneTest,
  onCompleteFinalTest,
}: ProgramViewProps): React.ReactElement {
  const catalog = getCatalogForMode(state.mode);
  const availableLevels = getLevelsForMode(state.mode);
  const plan = state.studyPlan;

  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [targetLevel, setTargetLevel] = useState<CEFRLevel>(
    plan?.config.targetLevel ?? 'A2'
  );
  const [durationWeeks, setDurationWeeks] = useState<number>(
    plan?.config.durationWeeks ?? 16
  );
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(
    plan?.config.sessionsPerWeek ?? 4
  );
  const [minutesPerSession, setMinutesPerSession] = useState<number>(
    plan?.config.minutesPerSession ?? 30
  );
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [activeMilestoneWeek, setActiveMilestoneWeek] = useState<number | null>(null);
  const [isFinalTestOpen, setIsFinalTestOpen] = useState(false);

  if (!plan) {
    return (
      <div className="p-6 text-center text-sm text-[#4B5563]">
        Aucun programme généré.
      </div>
    );
  }

  if (activeMilestoneWeek !== null) {
    const questions = catalog.placement
      .filter(
        (q) =>
          q.level === plan.config.currentLevel || q.level === plan.config.targetLevel
      )
      .slice(0, 8);
    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={questions.length > 0 ? questions : catalog.placement.slice(0, 8)}
          title={`Mini-test de fin de palier — Semaine ${activeMilestoneWeek}`}
          subtitle="Validation des acquis du palier"
          passingScore={65}
          onClose={() => setActiveMilestoneWeek(null)}
          onComplete={({ scorePercentage, total, passed }) => {
            onCompleteMilestoneTest(activeMilestoneWeek, scorePercentage, total, passed);
            setActiveMilestoneWeek(null);
          }}
        />
      </div>
    );
  }

  if (isFinalTestOpen) {
    const targetQuestions = catalog.placement.filter(
      (q) => q.level === plan.config.targetLevel
    );
    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={
            targetQuestions.length >= 6
              ? targetQuestions
              : catalog.placement.slice(-10)
          }
          title={`Test final — Validation du niveau ${plan.config.targetLevel}`}
          subtitle="Obtenez au moins 70 % pour valider le passage au niveau supérieur"
          passingScore={70}
          onClose={() => setIsFinalTestOpen(false)}
          onComplete={({ scorePercentage, total, passed }) => {
            onCompleteFinalTest(scorePercentage, total, passed);
            setIsFinalTestOpen(false);
          }}
        />
      </div>
    );
  }

  const draftConfig: StudyPlanConfig = {
    currentLevel: plan.config.currentLevel,
    targetLevel,
    durationWeeks,
    sessionsPerWeek,
    minutesPerSession,
    startDate: formatDateISO(new Date()),
  };
  const feasibility = analyzeFeasibility(draftConfig);
  const currentFeasibility = analyzeFeasibility(plan.config);

  const handleRegenerate = () => {
    const updated = generateStudyPlan(
      draftConfig,
      state.placementResult,
      catalog,
      state.profile?.goal
    );
    onUpdatePlan(updated);
    setSelectedWeek(1);
    setIsEditingPlan(false);
  };

  // Group sessions by weekNumber
  const weeksMap = new Map<number, StudySession[]>();
  for (const s of plan.sessions) {
    const list = weeksMap.get(s.weekNumber) ?? [];
    list.push(s);
    weeksMap.set(s.weekNumber, list);
  }
  const allWeekNumbers = Array.from(weeksMap.keys()).sort((a, b) => a - b);
  const activeWeekSessions = weeksMap.get(selectedWeek) ?? [];
  const milestoneWeeks = getMilestoneWeeks(plan.config.durationWeeks);
  const isMilestone = milestoneWeeks.includes(selectedWeek);
  const milestoneRecord = plan.milestoneTests[selectedWeek];

  return (
    <div className="space-y-6">
      {/* Program Header & Feasibility Status */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A] mb-1">
              Plan {plan.config.currentLevel} → {plan.config.targetLevel}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
              Programme sur {plan.config.durationWeeks} semaines
            </h1>
            <p className="text-xs sm:text-sm text-[#4B5563]">
              {plan.config.sessionsPerWeek} séances / semaine ·{' '}
              {plan.config.minutesPerSession} min / séance ({currentFeasibility.plannedHours} h
              planifiées pour ~{currentFeasibility.estimatedHoursNeeded} h estimées)
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsEditingPlan((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] hover:bg-white text-xs font-semibold text-[#111827] transition cursor-pointer"
          >
            <IconRefresh className="w-4 h-4" />
            <span>{isEditingPlan ? 'Fermer les réglages' : 'Ajuster durée ou rythme'}</span>
          </button>
        </div>

        {state.placementResult && (
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] text-xs text-[#374151] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Adaptation aux points faibles :</strong> temps majoré sur{' '}
              <span className="text-[#9A3412] font-semibold">
                {state.placementResult.weaknesses
                  .map((w) => SKILL_LABELS_FR[w])
                  .join(', ')}
              </span>
            </span>
            <span className="text-[#6B7280]">
              {plan.sessions.filter((s) => s.completed).length} / {plan.sessions.length} séances
              terminées
            </span>
          </div>
        )}

        {/* Plan Reconfiguration Drawer */}
        {isEditingPlan && (
          <div className="mt-5 pt-5 border-t border-[#E4DFD3] space-y-4">
            <h2 className="text-sm font-bold text-[#111827]">
              Modifier les paramètres du plan et recalculer la faisabilité
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">
                  Niveau cible
                </label>
                <select
                  value={targetLevel}
                  onChange={(e) => setTargetLevel(e.target.value as CEFRLevel)}
                  className="w-full px-3 py-2 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-sm font-semibold"
                >
                  {availableLevels.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      Niveau {lvl}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">
                  Durée (semaines)
                </label>
                <input
                  type="number"
                  min={2}
                  max={52}
                  value={durationWeeks}
                  onChange={(e) =>
                    setDurationWeeks(Math.min(52, Math.max(2, Number(e.target.value) || 4)))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-sm font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">
                  Séances / semaine
                </label>
                <select
                  value={sessionsPerWeek}
                  onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-sm font-semibold"
                >
                  {[2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} séances
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">
                  Minutes / séance
                </label>
                <select
                  value={minutesPerSession}
                  onChange={(e) => setMinutesPerSession(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-sm font-semibold"
                >
                  {[15, 20, 30, 45, 60, 90].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border text-xs ${
                feasibility.isRealistic
                  ? 'bg-[#E6F0EC]/70 border-[#0F4C3A]/30 text-[#0F4C3A]'
                  : 'bg-[#FDF1EC] border-[#C85A32]/40 text-[#9A3412]'
              }`}
            >
              <div className="flex items-center gap-2 font-bold mb-1">
                {feasibility.isRealistic ? (
                  <IconCheck className="w-4 h-4" />
                ) : (
                  <IconAlert className="w-4 h-4" />
                )}
                <span>
                  {feasibility.plannedHours} h prévues / ~{feasibility.estimatedHoursNeeded} h
                  recommandées
                </span>
              </div>
              <p className="mb-2">{feasibility.message}</p>
              {!feasibility.isRealistic && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDurationWeeks(feasibility.suggestedWeeks)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#C85A32]/40 font-semibold cursor-pointer"
                  >
                    Passer à {feasibility.suggestedWeeks} semaines
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionsPerWeek(feasibility.suggestedSessionsPerWeek);
                      setMinutesPerSession(feasibility.suggestedMinutesPerSession);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#C85A32]/40 font-semibold cursor-pointer"
                  >
                    Passer à {feasibility.suggestedSessionsPerWeek} ×{' '}
                    {feasibility.suggestedMinutesPerSession} min
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleRegenerate}
                className="px-5 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
              >
                Appliquer ce nouveau programme
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Week Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {allWeekNumbers.map((w) => {
          const weekSessions = weeksMap.get(w) ?? [];
          const allDone = weekSessions.length > 0 && weekSessions.every((s) => s.completed);
          const isSelected = selectedWeek === w;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setSelectedWeek(w)}
              className={`shrink-0 px-4 py-2.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isSelected
                  ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                  : allDone
                  ? 'bg-[#E6F0EC] text-[#0F4C3A] border-[#0F4C3A]/30'
                  : 'bg-white text-[#374151] border-[#E4DFD3] hover:bg-[#FAF8F5]'
              }`}
            >
              <span>Semaine {w}</span>
              {allDone && <IconCheck className="w-3.5 h-3.5" />}
            </button>
          );
        })}
      </div>

      {/* Sessions in Selected Week */}
      <div className="space-y-4">
        {activeWeekSessions.map((session) => (
          <div
            key={session.id}
            className="bg-white border border-[#E4DFD3] rounded-2xl p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <span className="text-xs font-bold text-[#0F4C3A] block">
                  Prévue : {formatFrenchDateNatural(session.scheduledDate)} · Niveau {session.level}
                </span>
                <h3 className="text-base font-bold text-[#111827]">{session.title}</h3>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  session.completed
                    ? 'bg-[#E6F0EC] text-[#0F4C3A]'
                    : 'bg-[#FAF8F5] text-[#4B5563] border border-[#E4DFD3]'
                }`}
              >
                {session.completed ? 'Terminée' : `${session.totalMinutes} min`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              {session.activities.map((act) => (
                <div
                  key={act.id}
                  className={`p-3 rounded-xl border text-xs ${
                    act.completed
                      ? 'bg-[#E6F0EC]/50 border-[#0F4C3A]/30 text-[#0F4C3A]'
                      : act.isPriorityWeakness
                      ? 'bg-[#FDF1EC]/70 border-[#C85A32]/30 text-[#111827]'
                      : 'bg-[#FAF8F5] border-[#E4DFD3] text-[#374151]'
                  }`}
                >
                  <div className="font-bold flex items-center justify-between gap-1">
                    <span>{act.title}</span>
                    <span>{act.durationMinutes}m</span>
                  </div>
                  {act.isPriorityWeakness && (
                    <span className="inline-block mt-1 text-[10px] font-bold text-[#9A3412]">
                      Priorité point faible
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Milestone & Final Exam Footer Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isMilestone && (
          <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 flex items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase text-[#0F4C3A] block">
                Fin de palier · Semaine {selectedWeek}
              </span>
              <h3 className="text-sm font-bold text-[#111827]">
                Mini-test de validation du palier
              </h3>
              {milestoneRecord && (
                <p className="text-xs text-[#4B5563] mt-0.5">
                  Dernier score : {milestoneRecord.score} %
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveMilestoneWeek(selectedWeek)}
              className="px-4 py-2.5 rounded-xl bg-[#0F4C3A] text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              Passer le mini-test
            </button>
          </div>
        )}

        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase text-[#C85A32] flex items-center gap-1">
              <IconAward className="w-3.5 h-3.5" />
              <span>Certification de fin de parcours</span>
            </span>
            <h3 className="text-sm font-bold text-[#111827]">
              Test final — Passage au niveau {plan.config.targetLevel}
            </h3>
            {plan.finalTest && (
              <p className="text-xs text-[#4B5563] mt-0.5">
                Score enregistré : {plan.finalTest.score} % (
                {plan.finalTest.passed ? 'Validé' : 'En cours'})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsFinalTestOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs font-semibold shrink-0 cursor-pointer"
          >
            Passer le test final
          </button>
        </div>
      </div>
    </div>
  );
}
