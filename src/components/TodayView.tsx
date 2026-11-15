import React, { useState } from 'react';
import { catalog } from '../lib/catalog';
import { SKILL_LABELS_FR } from '../lib/placementTest';
import {
  getMilestoneWeeks,
} from '../lib/planner';
import {
  BONUS_PAUSE_THRESHOLD,
  calculateStrictStreak,
  computeBadges,
  formatFrenchDateNatural,
  getBonusSessionsStats,
  getDueAndNewCardsForToday,
  getNextUncompletedSession,
  getPlanScheduleStatus,
  getWeeklyActiveDaysCount,
  shouldRecommendConsolidation,
} from '../lib/progression';
import { formatDateISO } from '../lib/sm2';
import {
  AppState,
  CEFRLevel,
  SessionActivity,
  SM2CardState,
  StudySession,
} from '../lib/types';
import { ConstructionPractice } from './ConstructionPractice';
import { DictationPractice } from './DictationPractice';
import { FlashcardsPractice } from './FlashcardsPractice';
import {
  IconArrowRight,
  IconAward,
  IconBookOpen,
  IconCards,
  IconCheck,
  IconFlame,
  IconKeyboard,
  IconRefresh,
  IconVolume,
} from './Icons';
import { LessonPractice } from './LessonPractice';
import { QuizPractice } from './QuizPractice';

interface TodayViewProps {
  state: AppState;
  onRateCard: (cardId: string, updatedState: SM2CardState) => void;
  onRecordConstructionItemSM2: (itemId: string, firstTrySuccess: boolean) => void;
  onCompleteConstructionUnit: (
    level: CEFRLevel,
    unit: number,
    firstTryCorrect: number,
    total: number
  ) => void;
  onCompleteActivity: (
    sessionId: string,
    activityId: string,
    minutesEarned: number,
    score?: number,
    answeredRatio?: number
  ) => void;
  onCompleteMilestoneTest: (
    weekNumber: number,
    score: number,
    total: number,
    passed: boolean
  ) => void;
  onCompleteFinalTest: (score: number, total: number, passed: boolean) => void;
  onDismissCatchUpMessage: () => void;
  onTriggerCatchUpSimulation: () => void;
}

export function TodayView({
  state,
  onRateCard,
  onRecordConstructionItemSM2,
  onCompleteConstructionUnit,
  onCompleteActivity,
  onCompleteMilestoneTest,
  onCompleteFinalTest,
  onDismissCatchUpMessage,
  onTriggerCatchUpSimulation,
}: TodayViewProps): React.ReactElement {
  const [activeActivity, setActiveActivity] = useState<{
    session: StudySession;
    activity: SessionActivity;
  } | null>(null);

  const [activeMilestoneWeek, setActiveMilestoneWeek] = useState<number | null>(null);
  const [isFinalTestOpen, setIsFinalTestOpen] = useState(false);

  const plan = state.studyPlan;
  if (!plan) {
    return (
      <div className="p-6 text-center text-sm text-[#4B5563]">
        Aucun programme actif.
      </div>
    );
  }

  const todayStr = formatDateISO(new Date());
  const todaySession = getNextUncompletedSession(plan);
  const streak = calculateStrictStreak(
    state.dailyLogs,
    todayStr,
    state.studyDates
  );
  const scheduleStatus = getPlanScheduleStatus(plan, todayStr);
  const weeklyActiveDays = getWeeklyActiveDaysCount(state.dailyLogs, todayStr);
  const bonusStats = getBonusSessionsStats(state.dailyLogs, todayStr);
  const todayLog = state.dailyLogs[todayStr];
  const dailyGoalReached = (todayLog?.sessionsCompleted ?? 0) >= 1;
  const consolidationCheck = shouldRecommendConsolidation(plan, todayStr);
  const badges = computeBadges(state, todayStr);

  const completedSessionsCount = scheduleStatus.completedCount;
  const totalSessionsCount = scheduleStatus.totalCount;
  const planProgressPercent =
    totalSessionsCount > 0
      ? Math.round((completedSessionsCount / totalSessionsCount) * 100)
      : 0;

  // Active Milestone Test modal/view
  if (activeMilestoneWeek !== null) {
    const milestoneQuestions = catalog.placement
      .filter((q) => q.level === plan.config.currentLevel || q.level === plan.config.targetLevel)
      .slice(0, 8);
    const fallbackQuestions =
      milestoneQuestions.length >= 4 ? milestoneQuestions : catalog.placement.slice(0, 8);

    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={fallbackQuestions}
          title={`Mini-test de fin de palier — Semaine ${activeMilestoneWeek}`}
          subtitle="Vérification des acquis intermédiaires"
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

  // Active Final Level Validation Test
  if (isFinalTestOpen) {
    const targetQuestions = catalog.placement.filter(
      (q) => q.level === plan.config.targetLevel
    );
    const finalQuestions =
      targetQuestions.length >= 6 ? targetQuestions : catalog.placement.slice(-10);

    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={finalQuestions}
          title={`Test final — Validation du niveau ${plan.config.targetLevel}`}
          subtitle="Validez au moins 70 % pour certifier votre passage au niveau cible"
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

  // Active session activity execution
  if (activeActivity) {
    const { session, activity } = activeActivity;

    if (activity.type === 'vocab') {
      const sessionCards = catalog.cards.filter((c) => activity.itemIds.includes(c.id));
      const { dueCards, newCards } = getDueAndNewCardsForToday(
        sessionCards.length > 0 ? sessionCards : catalog.cards,
        state.sm2States,
        todayLog?.newCardsCount ?? 0,
        state.dailyNewCardsLimit ?? 20,
        todayStr
      );
      const cardsToUse = dueCards.length > 0 ? dueCards : newCards.slice(0, 6);

      if (cardsToUse.length === 0) {
        return (
          <div className="max-w-2xl mx-auto bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 text-center space-y-4">
            <h3 className="text-lg font-bold text-[#111827] dark:text-[#F3F4F6]">
              Révisions à jour, reviens demain pour consolider
            </h3>
            <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
              Toutes vos cartes SM-2 dues ont déjà été révisées et votre plafond quotidien de nouvelles cartes est atteint.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  onCompleteActivity(
                    session.id,
                    activity.id,
                    activity.durationMinutes,
                    100,
                    1
                  );
                  setActiveActivity(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
              >
                Valider ce créneau
              </button>
              <button
                type="button"
                onClick={() => setActiveActivity(null)}
                className="px-5 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#374151] dark:text-[#D1D5DB] cursor-pointer"
              >
                Retour
              </button>
            </div>
          </div>
        );
      }

      return (
        <div className="max-w-2xl mx-auto">
          <FlashcardsPractice
            cards={cardsToUse}
            sm2States={state.sm2States}
            title={`${activity.title} · Semaine ${session.weekNumber}`}
            onRateCard={onRateCard}
            onClose={() => setActiveActivity(null)}
            onComplete={(reviewedCount) => {
              const ratio =
                cardsToUse.length > 0 ? reviewedCount / cardsToUse.length : 1;
              onCompleteActivity(
                session.id,
                activity.id,
                activity.durationMinutes,
                100,
                ratio
              );
              setActiveActivity(null);
            }}
          />
        </div>
      );
    }

    if (activity.type === 'grammar') {
      const lesson =
        catalog.lessons.find((l) => activity.itemIds.includes(l.id)) ?? catalog.lessons[0];

      return (
        <div className="max-w-2xl mx-auto">
          <LessonPractice
            lesson={lesson}
            onClose={() => setActiveActivity(null)}
            onComplete={(score) => {
              onCompleteActivity(session.id, activity.id, activity.durationMinutes, score);
              setActiveActivity(null);
            }}
          />
        </div>
      );
    }

    if (activity.type === 'construction') {
      const allConstructions = catalog.constructions ?? [];
      const unitItems = allConstructions.filter((c) =>
        activity.itemIds.includes(c.id)
      );
      const itemsToUse =
        unitItems.length > 0 ? unitItems : allConstructions.slice(0, 10);
      const firstItem = itemsToUse[0];

      return (
        <div className="max-w-2xl mx-auto">
          <ConstructionPractice
            items={itemsToUse}
            title={activity.title}
            subtitle={activity.description}
            onRecordItemSM2={onRecordConstructionItemSM2}
            onClose={() => setActiveActivity(null)}
            onComplete={({ firstTryCorrect, total, percentage, answeredRatio }) => {
              if (firstItem) {
                onCompleteConstructionUnit(
                  firstItem.level,
                  firstItem.unit,
                  firstTryCorrect,
                  total
                );
              }
              onCompleteActivity(
                session.id,
                activity.id,
                activity.durationMinutes,
                percentage,
                answeredRatio
              );
              setActiveActivity(null);
            }}
          />
        </div>
      );
    }

    if (activity.type === 'dictation') {
      const sentences = catalog.sentences.filter((s) => activity.itemIds.includes(s.id));
      const sentencesToUse =
        sentences.length > 0 ? sentences : catalog.sentences.slice(0, 3);

      return (
        <div className="max-w-2xl mx-auto">
          <DictationPractice
            sentences={sentencesToUse}
            title={`${activity.title} · Semaine ${session.weekNumber}`}
            onClose={() => setActiveActivity(null)}
            onComplete={(avgScore) => {
              onCompleteActivity(session.id, activity.id, activity.durationMinutes, avgScore);
              setActiveActivity(null);
            }}
          />
        </div>
      );
    }

    // 'listening' or 'quiz'
    const matchedQuestions = catalog.placement.filter((q) =>
      activity.itemIds.includes(q.id)
    );
    const questionsToUse =
      matchedQuestions.length > 0
        ? matchedQuestions
        : catalog.placement
            .filter((q) =>
              activity.type === 'listening' ? q.skill === 'listening' : q.skill !== 'listening'
            )
            .slice(0, 4);

    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={questionsToUse}
          title={activity.title}
          subtitle={`Semaine ${session.weekNumber} · Séance ${session.sessionNumberInWeek}`}
          onClose={() => setActiveActivity(null)}
          onComplete={({ scorePercentage }) => {
            onCompleteActivity(
              session.id,
              activity.id,
              activity.durationMinutes,
              scorePercentage
            );
            setActiveActivity(null);
          }}
        />
      </div>
    );
  }

  const milestoneWeeks = getMilestoneWeeks(plan.config.durationWeeks);
  const currentMilestoneWeek =
    todaySession && milestoneWeeks.includes(todaySession.weekNumber)
      ? todaySession.weekNumber
      : milestoneWeeks[0] ?? 1;
  const milestoneDone = plan.milestoneTests[currentMilestoneWeek];

  const getActivityIcon = (type: SessionActivity['type']) => {
    switch (type) {
      case 'vocab':
        return IconCards;
      case 'grammar':
        return IconBookOpen;
      case 'listening':
        return IconVolume;
      case 'dictation':
        return IconKeyboard;
      default:
        return IconCheck;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bento Summary */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 bg-[#0F4C3A] text-white rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-white/15 text-[#FAF8F5]">
                Parcours {plan.config.currentLevel} → {plan.config.targetLevel}
              </span>
              <span className="text-xs text-[#E6F0EC]">
                Objectif : {state.profile?.goal ?? 'travail'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1">
              Bonjour {state.profile?.firstName ?? ''}
            </h1>
            <p className="text-sm text-[#E6F0EC]/90">
              {todaySession
                ? `Votre séance du jour dure ${todaySession.totalMinutes} minutes et renforce vos priorités (${todaySession.focusSkills
                    .map((s) => SKILL_LABELS_FR[s])
                    .join(', ')}).`
                : 'Vous avez complété toutes les séances de votre programme.'}
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div>
              <span className="text-[#E6F0EC]/80 block">
                Progression · {scheduleStatus.statusLabel}
              </span>
              <span className="text-base font-bold">
                {completedSessionsCount} / {totalSessionsCount} séances ({planProgressPercent} %)
              </span>
              <span className="text-[11px] text-[#E6F0EC]/80 block mt-0.5">
                Fin estimée : {formatFrenchDateNatural(scheduleStatus.estimatedEndDate, todayStr)}
              </span>
            </div>
            <div className="w-full sm:w-44 h-2 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C85A32]"
                style={{ width: `${planProgressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="md:col-span-4 bg-white border border-[#E4DFD3] rounded-2xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#6B7280] block">
                Série de jours
              </span>
              <div className="text-3xl font-bold text-[#111827] mt-0.5">
                {streak} {streak > 1 ? 'jours' : 'jour'}
              </div>
            </div>
            <div className="w-11 h-11 rounded-xl bg-[#FDF1EC] text-[#C85A32] flex items-center justify-center">
              <IconFlame className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E4DFD3] space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#4B5563]">XP accumulés</span>
              <span className="font-bold text-[#0F4C3A] dark:text-[#6EE7B7]">
                {state.xp ?? 0} XP
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#4B5563]">Jours actifs cette semaine</span>
              <span className="font-bold text-[#111827]">
                {weeklyActiveDays}/7
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#4B5563]">Séances bonus (jour / sem.)</span>
              <span className="font-bold text-[#111827]">
                {bonusStats.today} / {bonusStats.week}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onTriggerCatchUpSimulation}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#E4DFD3] bg-[#FAF8F5] hover:bg-[#F3EFE6] text-xs font-semibold text-[#374151] transition cursor-pointer"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            <span>Réajuster le calendrier à aujourd’hui</span>
          </button>
        </div>
      </div>

      {/* Daily Goal & Gentle Guardrails */}
      {dailyGoalReached && (
        <div className="p-4 rounded-2xl bg-[#E6F0EC] dark:bg-[#13362B] border border-[#0F4C3A]/20 dark:border-[#6EE7B7]/30 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-[#0F4C3A] dark:text-[#6EE7B7]">
              Objectif du jour atteint
            </div>
            <p className="text-xs text-[#374151] dark:text-[#D1D5DB]">
              {bonusStats.today >= BONUS_PAUSE_THRESHOLD
                ? 'Bravo pour votre régularité aujourd’hui ! Une pause est conseillée pour mieux retenir, mais vous pouvez continuer librement.'
                : 'Vous pouvez vous arrêter ici ou continuer sur la séance suivante avec un bonus dégressif (+25 % sur la 1re séance bonus).'}
            </p>
          </div>
          {todaySession && (
            <button
              type="button"
              onClick={() => {
                const nextAct =
                  todaySession.activities.find((a) => !a.completed) ??
                  todaySession.activities[0];
                if (nextAct) {
                  setActiveActivity({ session: todaySession, activity: nextAct });
                }
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#0F4C3A] hover:bg-[#0A3628] text-white transition cursor-pointer shrink-0"
            >
              <span>Continuer</span>
              <IconArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {consolidationCheck.recommend && (
        <div className="p-4 rounded-2xl bg-[#FDF1EC] dark:bg-[#3A2018] border border-[#C85A32]/30 space-y-1">
          <div className="text-xs font-bold text-[#9A3412] dark:text-[#FDBA8C]">
            Consolidation recommandée (48 h)
          </div>
          <p className="text-xs text-[#374151] dark:text-[#E5E7EB]">
            Vous avez terminé toutes les séances en {consolidationCheck.elapsedDays} j (moins de la moitié des {consolidationCheck.plannedDays} j prévus). Nous recommandons 48 h de révision SM-2 avant le test final, sans bloquer votre accès.
          </p>
        </div>
      )}

      {/* Sober Badges Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {badges.map((badge) => (
          <div
            key={badge.id}
            className={`p-3 rounded-xl border text-xs ${
              badge.earned
                ? 'bg-white dark:bg-[#1E2422] border-[#0F4C3A]/40 dark:border-[#6EE7B7]/40'
                : 'bg-[#FAF8F5] dark:bg-[#191F1D] border-[#E4DFD3] dark:border-[#343F3B] opacity-70'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-0.5">
              <span className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                {badge.label}
              </span>
              {badge.earned && (
                <IconCheck className="w-3.5 h-3.5 text-[#0F4C3A] dark:text-[#6EE7B7] shrink-0" />
              )}
            </div>
            <p className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] leading-snug">
              {badge.description}
            </p>
          </div>
        ))}
      </div>

      {/* Automatic Non-Guilt Catch-up Notice */}
      {plan.catchUpMessage && (
        <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#0F4C3A]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#E6F0EC] text-[#0F4C3A]">
              <IconRefresh className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#0F4C3A]">
                Rattrapage automatique activé
              </div>
              <p className="text-xs sm:text-sm text-[#374151]">
                {plan.catchUpMessage}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismissCatchUpMessage}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#D5CFC2] text-[#374151] hover:bg-[#F3EFE6] cursor-pointer"
          >
            Compris
          </button>
        </div>
      )}

      {/* Today's Session Card */}
      {todaySession && (
        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-7 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                  {dailyGoalReached ? 'Disponible maintenant' : 'Séance du jour'} · Niveau {todaySession.level}
                </span>
                {dailyGoalReached && (
                  <span className="text-xs font-medium text-[#6B7280]">
                    prévue {formatFrenchDateNatural(todaySession.scheduledDate, todayStr)}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-[#111827]">
                {todaySession.title}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#6B7280] block">
                Prévue : {formatFrenchDateNatural(todaySession.scheduledDate, todayStr)}
              </span>
              <span className="text-sm font-bold text-[#0F4C3A]">
                {todaySession.activities.filter((a) => a.completed).length} /{' '}
                {todaySession.activities.length} activités terminées
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {todaySession.activities.map((act) => {
              const Icon = getActivityIcon(act.type);
              return (
                <div
                  key={act.id}
                  className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    act.completed
                      ? 'bg-[#FAF8F5] border-[#E4DFD3] opacity-85'
                      : act.isPriorityWeakness
                      ? 'bg-white border-[#C85A32]/40'
                      : 'bg-white border-[#E4DFD3]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        act.completed
                          ? 'bg-[#E6F0EC] text-[#0F4C3A]'
                          : act.isPriorityWeakness
                          ? 'bg-[#FDF1EC] text-[#C85A32]'
                          : 'bg-[#FAF8F5] text-[#374151]'
                      }`}
                    >
                      {act.completed ? (
                        <IconCheck className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-[#111827]">
                          {act.title}
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E4DFD3] text-[#4B5563]">
                          {act.durationMinutes} min
                        </span>
                        {act.isPriorityWeakness && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#FDF1EC] text-[#9A3412]">
                            Renforcement point faible
                          </span>
                        )}
                        {act.completed && typeof act.score === 'number' && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#E6F0EC] text-[#0F4C3A]">
                            Score : {act.score} %
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#4B5563] mt-1">
                        {act.description}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setActiveActivity({ session: todaySession, activity: act })
                    }
                    className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                      act.completed
                        ? 'border border-[#D5CFC2] bg-white text-[#374151] hover:bg-[#F3EFE6]'
                        : 'bg-[#0F4C3A] hover:bg-[#0A3628] text-white'
                    }`}
                  >
                    <span>
                      {act.completed
                        ? 'Refaire'
                        : dailyGoalReached
                          ? 'Continuer'
                          : 'Démarrer'}
                    </span>
                    <IconArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestone Mini-Test & Final Level Validation Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0F4C3A]">
                Mini-test de fin de palier
              </span>
              {milestoneDone ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                  Validé ({milestoneDone.score} %)
                </span>
              ) : scheduleStatus.deltaSessions > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                  Disponible en avance
                </span>
              ) : null}
            </div>
            <h3 className="text-base font-bold text-[#111827] mb-1">
              Bilan du palier — Semaine {currentMilestoneWeek}
            </h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Vérifiez la solidité de vos acquis sur le vocabulaire, la grammaire et l’écoute de
              ce palier.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveMilestoneWeek(currentMilestoneWeek)}
            className="w-full py-2.5 px-4 rounded-xl border border-[#0F4C3A] text-[#0F4C3A] hover:bg-[#E6F0EC] text-xs font-semibold transition cursor-pointer"
          >
            {milestoneDone ? 'Repasser le mini-test de palier' : 'Passer le mini-test de palier'}
          </button>
        </div>

        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#C85A32]">
                Passage au niveau suivant
              </span>
              {plan.finalTest?.passed && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                  Niveau {plan.config.targetLevel} validé ({plan.finalTest.score} %)
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-[#111827] mb-1 flex items-center gap-2">
              <IconAward className="w-4 h-4 text-[#C85A32]" />
              <span>Test final de niveau {plan.config.targetLevel}</span>
            </h3>
            <p className="text-xs text-[#4B5563] mb-4">
              Évaluation complète pour valider votre passage officiel au niveau{' '}
              {plan.config.targetLevel}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsFinalTestOpen(true)}
            className="w-full py-2.5 px-4 rounded-xl bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs font-semibold transition cursor-pointer"
          >
            {plan.finalTest?.passed
              ? `Refaire le test final (${plan.config.targetLevel})`
              : `Passer le test final (${plan.config.targetLevel})`}
          </button>
        </div>
      </div>
    </div>
  );
}
