import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  IconCalendarToday,
  IconCards,
  IconChart,
  IconCloud,
  IconCloudOff,
  IconFlame,
  IconRoadmap,
  IconSettings,
} from './components/Icons';
import { getInitials } from './components/ProfileGateView';
import { TodayView } from './components/TodayView';

const AuthView = lazy(() =>
  import('./components/AuthView').then((m) => ({ default: m.AuthView }))
);
const LegalView = lazy(() =>
  import('./components/LegalView').then((m) => ({ default: m.LegalView }))
);
const OnboardingFlow = lazy(() =>
  import('./components/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow }))
);
const ParentGateModal = lazy(() =>
  import('./components/ParentGateModal').then((m) => ({ default: m.ParentGateModal }))
);
const ProfileCreationForm = lazy(() =>
  import('./components/ProfileGateView').then((m) => ({ default: m.ProfileCreationForm }))
);
const ProfileSwitcherModal = lazy(() =>
  import('./components/ProfileGateView').then((m) => ({ default: m.ProfileSwitcherModal }))
);
const ProgramView = lazy(() =>
  import('./components/ProgramView').then((m) => ({ default: m.ProgramView }))
);
const ProgressView = lazy(() =>
  import('./components/ProgressView').then((m) => ({ default: m.ProgressView }))
);
const ReviewView = lazy(() =>
  import('./components/ReviewView').then((m) => ({ default: m.ReviewView }))
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView }))
);

function ViewSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="h-36 rounded-2xl bg-[#E4DFD3]/60 dark:bg-[#252D2A]" />
      <div className="h-24 rounded-2xl bg-[#E4DFD3]/40 dark:bg-[#1E2422]" />
    </div>
  );
}
import {
  recordUnitCompletion,
  unlockNextUnitManually,
  updateConstructionSM2,
} from './lib/construction';
import { getDefaultTargetLevel } from './lib/planner';
import {
  calculateActivityXP,
  calculateStrictStreak,
  computeBadges,
} from './lib/progression';
import { addDaysISO, formatDateISO } from './lib/sm2';
import {
  addProfileToStore,
  clearAllLocalAccountData,
  createInitialAppState,
  createLocalProfile,
  deleteProfileFromStore,
  getActiveProfile,
  loadMultiProfileStore,
  resetActiveProfileInStore,
  saveMultiProfileStore,
  switchActiveProfile,
  updateActiveProfileState,
} from './lib/storage';
import { getBackendAdapter } from './lib/backend';
import {
  createSyncController,
  hasMeaningfulLocalData,
  SyncController,
} from './lib/sync';
import {
  applyThemeToDocument,
  subscribeToSystemThemeChanges,
} from './lib/theme';
import {
  AppState,
  CEFRLevel,
  LegalDocumentKind,
  MultiProfileStore,
  PlacementResult,
  PlacementSessionState,
  PlaybackSpeed,
  SM2CardState,
  StudyPlan,
  SyncStatus,
  ThemePreference,
  UserProfile,
  VoiceId,
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
  const [store, setStore] = useState<MultiProfileStore>(() =>
    loadMultiProfileStore()
  );
  const storeRef = useRef(store);
  storeRef.current = store;

  const [authStatus, setAuthStatus] = useState<
    'loading' | 'signed_out' | 'signed_in' | 'recovery'
  >('loading');
  const [authUser, setAuthUser] = useState<{ id: string; email: string | null } | null>(
    null
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced'
  );
  const [legalModalKind, setLegalModalKind] = useState<LegalDocumentKind | null>(null);
  const [pendingLocalImport, setPendingLocalImport] = useState(false);
  const syncControllerRef = useRef<SyncController | null>(null);

  const activeProfile = getActiveProfile(store);
  const state = activeProfile?.state ?? createInitialAppState('adult');

  const setState = (updater: AppState | ((prev: AppState) => AppState)) => {
    setStore((prevStore) =>
      updateActiveProfileState(
        prevStore,
        (prevState) =>
          typeof updater === 'function' ? updater(prevState) : updater,
        true
      )
    );
    syncControllerRef.current?.scheduleSync();
  };

  const [activeTab, setActiveTab] = useState<MainTab>('today');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);
  const [pendingGateAction, setPendingGateAction] = useState<
    'settings' | 'profiles' | null
  >(null);

  const openProtectedArea = (area: 'settings' | 'profiles') => {
    if (area === 'settings' && isSettingsOpen) {
      setIsSettingsOpen(false);
      return;
    }
    if (activeProfile?.mode === 'child') {
      setPendingGateAction(area);
    } else if (area === 'settings') {
      setIsSettingsOpen(true);
    } else {
      setIsProfileSwitcherOpen(true);
    }
  };

  useEffect(() => {
    document.title = 'Diang-Anglais';
  }, []);

  useEffect(() => {
    applyThemeToDocument(state.theme);
    if (state.theme !== 'system') {
      return;
    }
    return subscribeToSystemThemeChanges((prefersDark) => {
      applyThemeToDocument('system', document, prefersDark);
    });
  }, [state.theme]);

  useEffect(() => {
    let active = true;
    const backend = getBackendAdapter();

    const applySession = (
      session: { user: { id: string; email?: string | null } } | null
    ) => {
      if (!active) return;
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email ?? null });
        setAuthStatus('signed_in');
      } else {
        setAuthUser(null);
        setAuthStatus('signed_out');
      }
    };

    void (async () => {
      const session = await backend.getSession();
      applySession(session);
    })();

    const unsubscribe = backend.subscribeAuth((nextSession) => {
      applySession(nextSession);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (authStatus !== 'signed_in' || !authUser) {
      syncControllerRef.current?.dispose();
      syncControllerRef.current = null;
      return;
    }

    const importFlagKey = `diang-anglais:import-checked:${authUser.id}`;
    let alreadyCheckedImport = false;
    try {
      alreadyCheckedImport = window.localStorage.getItem(importFlagKey) === 'done';
    } catch {
      alreadyCheckedImport = true;
    }

    const controller = createSyncController({
      userId: authUser.id,
      adapter: getBackendAdapter(),
      getLocalStore: () => storeRef.current,
      onMergedStore: (merged) => {
        setStore(merged);
      },
      onStatusChange: (nextStatus) => {
        setSyncStatus(nextStatus);
      },
    });
    syncControllerRef.current = controller;

    if (!alreadyCheckedImport && hasMeaningfulLocalData(storeRef.current)) {
      setPendingLocalImport(true);
    } else {
      try {
        window.localStorage.setItem(importFlagKey, 'done');
      } catch {
        // Ignore storage error
      }
      void controller.syncNow();
    }

    return () => {
      controller.dispose();
      if (syncControllerRef.current === controller) {
        syncControllerRef.current = null;
      }
    };
  }, [authStatus, authUser]);

  const todayStr = formatDateISO(new Date());
  const streak = calculateStrictStreak(
    state.dailyLogs,
    todayStr,
    state.studyDates
  );

  const registerStudyToday = (dates: string[]): string[] => {
    return dates.includes(todayStr) ? dates : [...dates, todayStr];
  };

  const handleChangeTheme = (theme: ThemePreference) => {
    setState((prev) => ({
      ...prev,
      theme,
    }));
  };

  const handleChangeVoice = (voiceId: VoiceId) => {
    setState((prev) => ({
      ...prev,
      voiceId,
    }));
  };

  const handleChangePlaybackRate = (playbackRate: PlaybackSpeed) => {
    setState((prev) => ({
      ...prev,
      playbackRate,
    }));
  };

  const handleChangeDailyNewCardsLimit = (limit: number) => {
    const safeLimit = Math.min(100, Math.max(5, Math.round(limit)));
    setState((prev) => ({
      ...prev,
      dailyNewCardsLimit: safeLimit,
    }));
  };

  const handleResetAll = () => {
    setStore((prev) => resetActiveProfileInStore(prev));
    setActiveTab('today');
    syncControllerRef.current?.scheduleSync();
  };

  const handleConfirmImportLocal = () => {
    if (!authUser) return;
    try {
      window.localStorage.setItem(`diang-anglais:import-checked:${authUser.id}`, 'done');
    } catch {
      // Ignore storage error
    }
    setPendingLocalImport(false);
    void syncControllerRef.current?.syncNow();
  };

  const handleSkipImportLocal = () => {
    if (!authUser) return;
    try {
      window.localStorage.setItem(`diang-anglais:import-checked:${authUser.id}`, 'done');
    } catch {
      // Ignore storage error
    }
    const emptyStore: MultiProfileStore = {
      version: store.version,
      activeProfileId: '',
      profiles: [],
    };
    saveMultiProfileStore(emptyStore);
    setStore(emptyStore);
    setPendingLocalImport(false);
    void syncControllerRef.current?.syncNow();
  };

  const handleSignOut = async () => {
    syncControllerRef.current?.dispose();
    syncControllerRef.current = null;
    await getBackendAdapter().signOut();
    setIsSettingsOpen(false);
    setAuthUser(null);
    setAuthStatus('signed_out');
  };

  const handleDeleteAccount = async () => {
    const res = await getBackendAdapter().deleteAccount();
    if (!res.ok) return res;
    syncControllerRef.current?.dispose();
    syncControllerRef.current = null;
    clearAllLocalAccountData();
    setStore({ version: 2, activeProfileId: '', profiles: [] });
    setIsSettingsOpen(false);
    setAuthUser(null);
    setAuthStatus('signed_out');
    return { ok: true };
  };

  const handleCompleteProfile = (profile: UserProfile) => {
    setState((prev) => ({
      ...prev,
      profile,
      onboardingStep: 'placement',
    }));
  };

  const handleCompletePlacement = (
    placementResult: PlacementResult,
    sessionState?: PlacementSessionState,
    seenQuestionIds?: string[]
  ) => {
    setState((prev) => ({
      ...prev,
      placementResult,
      placementSession: sessionState ?? prev.placementSession,
      seenQuestionIds: seenQuestionIds ?? prev.seenQuestionIds,
      onboardingStep: 'plan',
    }));
  };

  const handleUpdatePlacementSession = (
    sessionState: PlacementSessionState,
    seenQuestionIds: string[]
  ) => {
    setState((prev) => ({
      ...prev,
      placementSession: sessionState,
      seenQuestionIds,
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
    setState((prev) => {
      const isNewCard = !prev.sm2States[cardId];
      const currentLog = prev.dailyLogs[todayStr] ?? {
        sessionsCompleted: 0,
        validatedMinutes: 0,
        bonusSessions: 0,
        newCardsCount: 0,
        xpEarned: 0,
      };
      return {
        ...prev,
        sm2States: {
          ...prev.sm2States,
          [cardId]: updatedState,
        },
        dailyLogs: isNewCard
          ? {
              ...prev.dailyLogs,
              [todayStr]: {
                ...currentLog,
                newCardsCount: currentLog.newCardsCount + 1,
              },
            }
          : prev.dailyLogs,
        studyDates: registerStudyToday(prev.studyDates),
      };
    });
  };

  const handleCompleteActivity = (
    sessionId: string,
    activityId: string,
    minutesEarned: number,
    score?: number,
    answeredRatio: number = 1
  ) => {
    setState((prev) => {
      if (!prev.studyPlan) return prev;

      const targetSession = prev.studyPlan.sessions.find((s) => s.id === sessionId);
      const targetActivity = targetSession?.activities.find(
        (a) => a.id === activityId
      );
      const isRepeat = Boolean(targetActivity?.completed);
      const currentLog = prev.dailyLogs[todayStr] ?? {
        sessionsCompleted: 0,
        validatedMinutes: 0,
        bonusSessions: 0,
        newCardsCount: 0,
        xpEarned: 0,
      };

      const bonusSessionIndexToday =
        currentLog.sessionsCompleted >= 1 ? currentLog.sessionsCompleted : 0;

      const xpEval = calculateActivityXP({
        durationMinutes: minutesEarned,
        answeredRatio,
        isRepeat,
        bonusSessionIndexToday,
      });

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

      const wasSessionCompleted = Boolean(targetSession?.completed);
      const updatedTarget = updatedSessions.find((s) => s.id === sessionId);
      const justFinishedSession =
        !wasSessionCompleted && Boolean(updatedTarget?.completed);

      const nextSessionsCompleted =
        currentLog.sessionsCompleted + (justFinishedSession ? 1 : 0);
      const nextBonusSessions =
        justFinishedSession && currentLog.sessionsCompleted >= 1
          ? currentLog.bonusSessions + 1
          : currentLog.bonusSessions;

      const nextDailyLogs = {
        ...prev.dailyLogs,
        [todayStr]: {
          ...currentLog,
          sessionsCompleted: nextSessionsCompleted,
          validatedMinutes:
            currentLog.validatedMinutes + (xpEval.eligible ? minutesEarned : 0),
          bonusSessions: nextBonusSessions,
          xpEarned: currentLog.xpEarned + xpEval.xp,
        },
      };

      const nextStateDraft: AppState = {
        ...prev,
        xp: prev.xp + xpEval.xp,
        dailyLogs: nextDailyLogs,
        studyPlan: {
          ...prev.studyPlan,
          sessions: updatedSessions,
        },
        studyDates: registerStudyToday(prev.studyDates),
        totalMinutesStudied: prev.totalMinutesStudied + minutesEarned,
      };

      const newlyEarned = computeBadges(nextStateDraft, todayStr)
        .filter((b) => b.earned)
        .map((b) => b.id);

      return {
        ...nextStateDraft,
        earnedBadges: newlyEarned,
      };
    });
  };

  const handleRecordPracticeMinutes = (
    minutes: number,
    kind: 'flashcards' | 'lesson' | 'dictation' | 'quiz' | 'construction'
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

  const handleRecordConstructionItemSM2 = (
    itemId: string,
    firstTrySuccess: boolean
  ) => {
    setState((prev) => ({
      ...prev,
      sm2States: {
        ...prev.sm2States,
        [itemId]: updateConstructionSM2(
          prev.sm2States,
          itemId,
          firstTrySuccess,
          todayStr
        ),
      },
      studyDates: registerStudyToday(prev.studyDates),
    }));
  };

  const handleCompleteConstructionUnit = (
    level: CEFRLevel,
    unit: number,
    firstTryCorrect: number,
    total: number
  ) => {
    setState((prev) => ({
      ...prev,
      constructionProgress: recordUnitCompletion(
        prev.constructionProgress,
        level,
        unit,
        firstTryCorrect,
        total,
        todayStr
      ),
      studyDates: registerStudyToday(prev.studyDates),
    }));
  };

  const handleUnlockNextConstructionUnit = (
    level: CEFRLevel,
    currentUnit: number
  ) => {
    setState((prev) => ({
      ...prev,
      constructionProgress: unlockNextUnitManually(
        prev.constructionProgress,
        level,
        currentUnit
      ),
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

  if (authStatus === 'loading') {
    return (
      <div className="min-h-dvh bg-[#FAF8F5] dark:bg-[#141817] flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ViewSkeleton />
        </div>
      </div>
    );
  }

  if (authStatus === 'signed_out' || authStatus === 'recovery') {
    return (
      <>
        <Suspense
          fallback={
            <div className="min-h-dvh bg-[#FAF8F5] dark:bg-[#141817] flex items-center justify-center p-6">
              <div className="w-full max-w-md">
                <ViewSkeleton />
              </div>
            </div>
          }
        >
          <AuthView
            initialMode={authStatus === 'recovery' ? 'recovery' : 'login'}
            onOpenLegal={(kind) => setLegalModalKind(kind)}
            onPasswordUpdated={() => setAuthStatus('signed_in')}
          />
        </Suspense>
        {legalModalKind && (
          <Suspense fallback={null}>
            <LegalView
              kind={legalModalKind}
              onSwitchKind={(k) => setLegalModalKind(k)}
              onClose={() => setLegalModalKind(null)}
            />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <div
      className={`min-h-dvh flex flex-col bg-[#FAF8F5] dark:bg-[#141817] text-[#111827] dark:text-[#F3F4F6] pb-20 ${
        state.mode === 'child' ? 'child-mode' : ''
      }`}
    >
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-[#FAF8F5] dark:bg-[#141817] border-b border-[#E4DFD3] dark:border-[#343F3B] px-4 pt-[calc(0.875rem+env(safe-area-inset-top))] pb-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0F4C3A] text-white flex items-center justify-center font-bold text-sm">
              DA
            </div>
            <div>
              <span className="font-bold text-base sm:text-lg tracking-tight text-[#111827] dark:text-[#F3F4F6] block leading-none">
                Diang-Anglais
              </span>
              <span className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] font-medium">
                {state.mode === 'child'
                  ? 'Mode Enfant · A0 → A2'
                  : 'Parcours CECRL A1 → B2'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              role="status"
              aria-label={`État de synchronisation : ${
                syncStatus === 'synced'
                  ? 'Synchronisé'
                  : syncStatus === 'syncing'
                    ? 'Synchronisation'
                    : syncStatus === 'offline'
                      ? 'Hors-ligne'
                      : 'Erreur'
              }`}
              title={
                syncStatus === 'synced'
                  ? 'Synchronisé'
                  : syncStatus === 'syncing'
                    ? 'Synchronisation en cours'
                    : syncStatus === 'offline'
                      ? 'Hors-ligne (sauvegarde locale active)'
                      : 'Erreur de synchronisation'
              }
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border ${
                syncStatus === 'offline'
                  ? 'bg-[#FEF3C7] dark:bg-[#78350F]/30 border-[#D97706]/30 text-[#92400E] dark:text-[#FCD34D]'
                  : syncStatus === 'error'
                    ? 'bg-[#FEE2E2] dark:bg-[#7F1D1D]/30 border-[#DC2626]/30 text-[#991B1B] dark:text-[#FCA5A5]'
                    : 'bg-white dark:bg-[#1E2422] border-[#E4DFD3] dark:border-[#343F3B] text-[#4B5563] dark:text-[#D1D5DB]'
              }`}
            >
              {syncStatus === 'offline' ? (
                <IconCloudOff className="w-3.5 h-3.5" />
              ) : (
                <IconCloud className="w-3.5 h-3.5" />
              )}
              <span>
                {syncStatus === 'synced'
                  ? 'Synchronisé'
                  : syncStatus === 'syncing'
                    ? 'Synchro...'
                    : syncStatus === 'offline'
                      ? 'Hors-ligne'
                      : 'Erreur'}
              </span>
            </span>

            {activeProfile && state.onboardingStep === 'ready' && state.studyPlan && (
              <>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] text-xs font-bold text-[#111827] dark:text-[#F3F4F6]">
                  <IconFlame className="w-3.5 h-3.5 text-[#C85A32]" />
                  <span>{streak} j</span>
                </div>
                <div className="hidden sm:block px-2.5 py-1 rounded-full bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] text-xs font-bold">
                  {state.studyPlan.config.currentLevel} →{' '}
                  {state.studyPlan.config.targetLevel}
                </div>
              </>
            )}

            {activeProfile && (
              <button
                type="button"
                onClick={() => openProtectedArea('profiles')}
                aria-label={`Changer de profil (${activeProfile.name})`}
                className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] hover:bg-[#F3EFE6] dark:hover:bg-[#252D2A] transition cursor-pointer"
              >
                <span className="w-6 h-6 rounded-full bg-[#0F4C3A] text-white text-[11px] font-bold flex items-center justify-center">
                  {getInitials(activeProfile.name)}
                </span>
                <span className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] max-w-[80px] truncate">
                  {activeProfile.name}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => openProtectedArea('settings')}
              aria-label="Ouvrir les paramètres"
              aria-expanded={isSettingsOpen}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                isSettingsOpen
                  ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                  : 'bg-white dark:bg-[#1E2422] border-[#E4DFD3] dark:border-[#343F3B] text-[#374151] dark:text-[#D1D5DB] hover:bg-[#F3EFE6] dark:hover:bg-[#252D2A]'
              }`}
            >
              <IconSettings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-5">
        <Suspense fallback={<ViewSkeleton />}>
          {!activeProfile ? (
          <ProfileCreationForm
            onCreate={(name, mode) => {
              const created = createLocalProfile(name, mode);
              setStore((prev) => addProfileToStore(prev, created));
              setActiveTab('today');
              syncControllerRef.current?.scheduleSync();
            }}
          />
        ) : isSettingsOpen ? (
          <SettingsView
            state={state}
            accountEmail={authUser?.email}
            syncStatus={syncStatus}
            onSyncNow={() => {
              void syncControllerRef.current?.syncNow();
            }}
            onSignOut={() => {
              void handleSignOut();
            }}
            onDeleteAccount={handleDeleteAccount}
            onOpenLegal={(kind) => setLegalModalKind(kind)}
            onChangeTheme={handleChangeTheme}
            onChangeVoice={handleChangeVoice}
            onChangePlaybackRate={handleChangePlaybackRate}
            onChangeDailyNewCardsLimit={handleChangeDailyNewCardsLimit}
            onImportState={(imported) => {
              setState(imported);
              setIsSettingsOpen(false);
            }}
            onResetAll={handleResetAll}
            onClose={() => setIsSettingsOpen(false)}
          />
        ) : state.onboardingStep !== 'ready' || !state.studyPlan ? (
          <OnboardingFlow
            key={activeProfile.id}
            step={state.onboardingStep}
            mode={state.mode}
            initialProfile={state.profile}
            initialPlacement={state.placementResult}
            seenQuestionIds={state.seenQuestionIds}
            placementSession={state.placementSession}
            hasExistingStudyPlan={Boolean(state.studyPlan)}
            onCompleteProfile={handleCompleteProfile}
            onCompletePlacement={handleCompletePlacement}
            onUpdatePlacementSession={handleUpdatePlacementSession}
            onCompletePlan={handleCompletePlan}
            onImportState={(imported) => setState(imported)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onCancelLockedRetake={() =>
              setState((prev) => ({
                ...prev,
                onboardingStep: prev.studyPlan ? 'ready' : 'plan',
              }))
            }
          />
        ) : (
          <>
            {activeTab === 'today' && (
              <TodayView
                state={state}
                onRateCard={handleRateCard}
                onRecordConstructionItemSM2={handleRecordConstructionItemSM2}
                onCompleteConstructionUnit={handleCompleteConstructionUnit}
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
                onRecordConstructionItemSM2={handleRecordConstructionItemSM2}
                onCompleteConstructionUnit={handleCompleteConstructionUnit}
                onUnlockNextConstructionUnit={handleUnlockNextConstructionUnit}
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
                onResetAll={handleResetAll}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            )}
          </>
        )}
        </Suspense>
      </main>

      {/* Bottom Navigation Bar */}
      {activeProfile && state.onboardingStep === 'ready' && state.studyPlan && (
        <nav
          aria-label="Navigation principale"
          className="fixed bottom-0 inset-x-0 z-30 bg-white dark:bg-[#1E2422] border-t border-[#E4DFD3] dark:border-[#343F3B] px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]"
        >
          <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id && !isSettingsOpen;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    setActiveTab(tab.id);
                  }}
                  className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl text-xs font-semibold transition cursor-pointer ${
                    isActive
                      ? 'text-[#0F4C3A] dark:text-[#6EE7B7] bg-[#E6F0EC]/70 dark:bg-[#13362B]'
                      : 'text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6]'
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

      {pendingGateAction && (
        <Suspense fallback={null}>
          <ParentGateModal
            onSuccess={() => {
              const action = pendingGateAction;
              setPendingGateAction(null);
              if (action === 'settings') setIsSettingsOpen(true);
              if (action === 'profiles') setIsProfileSwitcherOpen(true);
            }}
            onCancel={() => setPendingGateAction(null)}
          />
        </Suspense>
      )}

      {isProfileSwitcherOpen && activeProfile && (
        <Suspense fallback={null}>
          <ProfileSwitcherModal
            profiles={store.profiles}
            activeProfileId={activeProfile.id}
            onSelectProfile={(id) => {
              setStore((prev) => switchActiveProfile(prev, id));
              setIsSettingsOpen(false);
              setActiveTab('today');
            }}
            onCreateProfile={(name, mode) => {
              const created = createLocalProfile(name, mode);
              setStore((prev) => addProfileToStore(prev, created));
              setIsSettingsOpen(false);
              setActiveTab('today');
              syncControllerRef.current?.scheduleSync();
            }}
            onDeleteProfile={(id) => {
              setStore((prev) => deleteProfileFromStore(prev, id));
              void syncControllerRef.current?.deleteRemoteProfile(id);
            }}
            onClose={() => setIsProfileSwitcherOpen(false)}
          />
        </Suspense>
      )}

      {pendingLocalImport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-local-title"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 shadow-lg space-y-4">
            <h2
              id="import-local-title"
              className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]"
            >
              Importer mes données de cet appareil dans mon compte ?
            </h2>
            <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
              Une progression locale existe déjà sur cet appareil ({store.profiles.length}{' '}
              {store.profiles.length > 1 ? 'profils' : 'profil'}). Souhaites-tu la fusionner avec
              ton compte cloud ?
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConfirmImportLocal}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0B3B2D] text-white text-xs font-semibold cursor-pointer"
              >
                Importer dans mon compte
              </button>
              <button
                type="button"
                onClick={handleSkipImportLocal}
                className="flex-1 py-2.5 px-4 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] cursor-pointer"
              >
                Ignorer et charger mon compte
              </button>
            </div>
          </div>
        </div>
      )}

      {legalModalKind && (
        <Suspense fallback={null}>
          <LegalView
            kind={legalModalKind}
            onSwitchKind={(k) => setLegalModalKind(k)}
            onClose={() => setLegalModalKind(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
