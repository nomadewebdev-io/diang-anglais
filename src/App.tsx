import React, { useEffect, useState } from 'react';
import {
  IconCalendarToday,
  IconCards,
  IconChart,
  IconFlame,
  IconRoadmap,
} from './components/Icons';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ProgramView } from './components/ProgramView';
import { ProgressView } from './components/ProgressView';
import { ReviewView } from './components/ReviewView';
import { TodayView } from './components/TodayView';
import { getDefaultTargetLevel, calculateStreak } from './lib/planner';
import { addDaysISO, formatDateISO } from './lib/sm2';
import {
  createInitialAppState,
  loadAppState,
  saveAppState,
} from './lib/storage';
import {
  AppState,
  PlacementResult,
  SM2CardState,
  StudyPlan,
  UserProfile,
} from './lib/types';

export type MainTab = 'today' | 'review' | 'program' | 'progress';

const NAV_TABS: Array<{
  id: MainTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'today', label: "Aujourd'hui", icon: IconCalendarToday },
  { id: 'review', label: 'Réviser', icon: IconCards },
  { id: 'program', label: 'Programme', icon: IconRoadmap },
  { id: 'progress', label: 'Progrès', icon: IconChart },
];

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>(() => loadAppState());
  const [activeTab, setActiveTab] = useState<MainTab>('today');

  useEffect(() => {
    document.title = 'Diang-Anglais';
  }, []);

  useEffect(() => {
    saveAppState(state);
  }, [state]);

  const todayStr = formatDateISO(new Date());
  const streak = calculateStreak(state.studyDates, todayStr);

  const registerStudyToday = (dates: string[]): string[] => {
    return dates.includes(todayStr) ? dates : [...dates, todayStr];
  };

  const handleCompleteProfile = (profile: UserProfile) => {
    setState((prev) => ({
      ...prev,
      profile,
      onboardingStep: 'placement',
    }));
  };

  const handleCompletePlacement = (placementResult: PlacementResult) => {
    setState((prev) => ({
      ...prev,
      placementResult,
      onboardingStep: 'plan',
    }));
  };

  const handleCompletePlan = (studyPlan: StudyPlan) => {
    setState((prev) => ({
      ...prev,
      studyPlan,
      onboardingStep: 'ready',
    }));
    setActiveTab('today');
  };

  const handleRateCard = (cardId: string, updatedState: SM2CardState) => {
    setState((prev) => ({
      ...prev,
      sm2States: {
        ...prev.sm2States,
        [cardId]: updatedState,
      },
      studyDates: registerStudyToday(prev.studyDates),
    }));
  };

  const handleCompleteActivity = (
    sessionId: string,
    activityId: string,
    minutesEarned: number,
    score?: number
  ) => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;

      const updatedSessions = prev.studyPlan.sessions.map((session) => {
        if (session.id !== sessionId) return session;

        const updatedActivities = session.activities.map((act) =>
          act.id === activityId
            ? { ...act, completed: true, score: score ?? act.score }
            : act
        );
        const allCompleted = updatedActivities.every((a) => a.completed);

        return {
          ...session,
          activities: updatedActivities,
          completed: allCompleted,
          completedAt: allCompleted ? new Date().toISOString() : session.completedAt,
        };
      });

      return {
        ...prev,
        studyPlan: {
          ...prev.studyPlan,
          sessions: updatedSessions,
        },
        studyDates: registerStudyToday(prev.studyDates),
        totalMinutesStudied: prev.totalMinutesStudied + minutesEarned,
      };
    });
  };

  const handleRecordPracticeMinutes = (
    minutes: number,
    kind: 'flashcards' | 'lesson' | 'dictation' | 'quiz'
  ) => {
    setState((prev) => ({
      ...prev,
      studyDates: registerStudyToday(prev.studyDates),
      totalMinutesStudied: prev.totalMinutesStudied + minutes,
      dictationCompletedCount:
        kind === 'dictation'
          ? prev.dictationCompletedCount + 1
          : prev.dictationCompletedCount,
      quizzesCompletedCount:
        kind === 'quiz' ? prev.quizzesCompletedCount + 1 : prev.quizzesCompletedCount,
    }));
  };

  const handleCompleteMilestoneTest = (
    weekNumber: number,
    score: number,
    total: number,
    passed: boolean
  ) => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;
      return {
        ...prev,
        studyPlan: {
          ...prev.studyPlan,
          milestoneTests: {
            ...prev.studyPlan.milestoneTests,
            [weekNumber]: {
              milestoneIndex: weekNumber,
              weekNumber,
              score,
              total,
              passed,
              completedAt: new Date().toISOString(),
            },
          },
        },
        studyDates: registerStudyToday(prev.studyDates),
        totalMinutesStudied: prev.totalMinutesStudied + 10,
        quizzesCompletedCount: prev.quizzesCompletedCount + 1,
      };
    });
  };

  const handleCompleteFinalTest = (
    score: number,
    total: number,
    passed: boolean
  ) => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;
      const newCurrentLevel = passed
        ? prev.studyPlan.config.targetLevel
        : prev.studyPlan.config.currentLevel;
      const newTargetLevel = passed
        ? getDefaultTargetLevel(newCurrentLevel)
        : prev.studyPlan.config.targetLevel;

      return {
        ...prev,
        studyPlan: {
          ...prev.studyPlan,
          config: {
            ...prev.studyPlan.config,
            currentLevel: newCurrentLevel,
            targetLevel: newTargetLevel,
          },
          finalTest: {
            score,
            total,
            passed,
            completedAt: new Date().toISOString(),
          },
        },
        studyDates: registerStudyToday(prev.studyDates),
        totalMinutesStudied: prev.totalMinutesStudied + 15,
        quizzesCompletedCount: prev.quizzesCompletedCount + 1,
      };
    });
  };

  const handleDismissCatchUpMessage = () => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;
      return {
        ...prev,
        studyPlan: {
          ...prev.studyPlan,
          catchUpMessage: undefined,
        },
      };
    });
  };

  const handleTriggerCatchUpSimulation = () => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;
      const dayStep = Math.max(
        1,
        Math.floor(7 / Math.max(1, prev.studyPlan.config.sessionsPerWeek))
      );
      let uncompletedIdx = 0;
      const updatedSessions = prev.studyPlan.sessions.map((session) => {
        if (session.completed) return session;
        const weeksAhead = Math.floor(
          uncompletedIdx / prev.studyPlan!.config.sessionsPerWeek
        );
        const slot = uncompletedIdx % prev.studyPlan!.config.sessionsPerWeek;
        const offsetDays = weeksAhead * 7 + Math.min(6, slot * dayStep);
        const newDate = addDaysISO(todayStr, offsetDays);
        uncompletedIdx += 1;
        return {
          ...session,
          scheduledDate: newDate,
        };
      });

      return {
        ...prev,
        studyPlan: {
          ...prev.studyPlan,
          sessions: updatedSessions,
          lastCatchUpDate: todayStr,
          catchUpMessage:
            "Votre calendrier a été réajusté à partir d'aujourd'hui pour suivre votre rythme réel, sans aucune pénalité.",
        },
      };
    });
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF8F5] text-[#111827] pb-20">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-[#FAF8F5]/95 border-b border-[#E4DFD3] px-4 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F4C3A] text-[#FAF8F5] flex items-center justify-center font-bold text-sm">
              DA
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-[#111827] block leading-none">
                Diang-Anglais
              </span>
              <span className="text-[11px] text-[#6B7280] font-medium">
                Parcours CECRL A1 → B2
              </span>
            </div>
          </div>

          {state.onboardingStep === 'ready' && state.studyPlan && (
            <div className="flex items-center gap-2.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#E4DFD3] text-xs font-bold text-[#111827]">
                <IconFlame className="w-3.5 h-3.5 text-[#C85A32]" />
                <span>{streak} j</span>
              </div>
              <div className="px-2.5 py-1 rounded-full bg-[#E6F0EC] text-[#0F4C3A] text-xs font-bold">
                {state.studyPlan.config.currentLevel} →{' '}
                {state.studyPlan.config.targetLevel}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-5">
        {state.onboardingStep !== 'ready' || !state.studyPlan ? (
          <OnboardingFlow
            step={state.onboardingStep}
            initialProfile={state.profile}
            initialPlacement={state.placementResult}
            onCompleteProfile={handleCompleteProfile}
            onCompletePlacement={handleCompletePlacement}
            onCompletePlan={handleCompletePlan}
            onImportState={(imported) => setState(imported)}
          />
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayView
                state={state}
                onRateCard={handleRateCard}
                onCompleteActivity={handleCompleteActivity}
                onCompleteMilestoneTest={handleCompleteMilestoneTest}
                onCompleteFinalTest={handleCompleteFinalTest}
                onDismissCatchUpMessage={handleDismissCatchUpMessage}
                onTriggerCatchUpSimulation={handleTriggerCatchUpSimulation}
              />
            )}

            {activeTab === 'review' && (
              <ReviewView
                state={state}
                onRateCard={handleRateCard}
                onRecordPracticeMinutes={handleRecordPracticeMinutes}
              />
            )}

            {activeTab === 'program' && (
              <ProgramView
                state={state}
                onUpdatePlan={(newPlan) =>
                  setState((prev) => ({ ...prev, studyPlan: newPlan }))
                }
                onCompleteMilestoneTest={handleCompleteMilestoneTest}
                onCompleteFinalTest={handleCompleteFinalTest}
              />
            )}

            {activeTab === 'progress' && (
              <ProgressView
                state={state}
                onImportState={(imported) => setState(imported)}
                onRetakePlacementTest={() =>
                  setState((prev) => ({
                    ...prev,
                    onboardingStep: 'placement',
                  }))
                }
                onResetAll={() => setState(createInitialAppState())}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      {state.onboardingStep === 'ready' && state.studyPlan && (
        <nav
          aria-label="Navigation principale"
          className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[#E4DFD3] px-2 py-1.5"
        >
          <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'text-[#0F4C3A] bg-[#E6F0EC]/70'
                      : 'text-[#6B7280] hover:text-[#111827]'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-0.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;
