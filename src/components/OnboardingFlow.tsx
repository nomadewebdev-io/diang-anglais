import React, { useCallback, useEffect, useRef, useState } from 'react';
import { preloadAudioClip, speakEnglish } from '../lib/audio';
import { loadCatalogForProfile, loadPlacementBank } from '../lib/catalog';
import {
  abandonPlacementSession,
  AdaptiveTestSession,
  ALL_SKILLS,
  createAdaptiveSession,
  DONT_KNOW_LABEL_FR,
  DONT_KNOW_OPTION_INDEX,
  drawNextPlacementQuestion,
  evaluatePlacementTest,
  getLevelsForMode,
  getPlacementLockStatus,
  getQuestionTimeLimitSeconds,
  KIDS_PLACEMENT_QUESTION_COUNT,
  MAX_LISTENING_PLAYS,
  recordAdaptiveAnswer,
  SKILL_LABELS_FR,
  toPlacementSessionState,
} from '../lib/placementTest';
import {
  analyzeFeasibility,
  generateStudyPlan,
  getDefaultPlanPreferences,
  getDefaultTargetLevel,
} from '../lib/planner';
import { formatDateISO } from '../lib/sm2';
import { parseImportedProgressJSON } from '../lib/storage';
import {
  AppState,
  CEFRLevel,
  LearningGoal,
  OnboardingStep,
  PlacementQuestion,
  PlacementResult,
  PlacementSessionState,
  ProfileMode,
  StudyPlan,
  StudyPlanConfig,
  UserProfile,
} from '../lib/types';
import {
  IconAlert,
  IconArrowRight,
  IconBriefcase,
  IconCheck,
  IconCompass,
  IconGraduation,
  IconMessage,
  IconSettings,
  IconUpload,
  IconVolume,
} from './Icons';

interface OnboardingFlowProps {
  step: OnboardingStep;
  mode?: ProfileMode;
  initialProfile: UserProfile | null;
  initialPlacement: PlacementResult | null;
  seenQuestionIds?: string[];
  placementSession?: PlacementSessionState | null;
  hasExistingStudyPlan?: boolean;
  onCompleteProfile: (profile: UserProfile) => void;
  onCompletePlacement: (
    result: PlacementResult,
    sessionState?: PlacementSessionState,
    seenQuestionIds?: string[]
  ) => void;
  onUpdatePlacementSession?: (
    sessionState: PlacementSessionState,
    seenQuestionIds: string[]
  ) => void;
  onCompletePlan: (plan: StudyPlan) => void;
  onImportState: (state: AppState) => void;
  onOpenSettings?: () => void;
  onCancelLockedRetake?: () => void;
}

const GOAL_OPTIONS: Array<{
  id: LearningGoal;
  label: string;
  subtitle: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'travail',
    label: 'Travail et affaires',
    subtitle: 'Réunions, appels clients, négociations et courriels professionnels.',
    icon: IconBriefcase,
  },
  {
    id: 'voyage',
    label: 'Voyage et mobilité',
    subtitle: 'Aéroports, réservations, formalités douanières et déplacements.',
    icon: IconCompass,
  },
  {
    id: 'études',
    label: 'Études et bourses',
    subtitle: 'Cours universitaires, articles de recherche et examens internationaux.',
    icon: IconGraduation,
  },
  {
    id: 'conversation',
    label: 'Conversation quotidienne',
    subtitle: 'Échanges fluides au quotidien, discussions et écoute naturelle.',
    icon: IconMessage,
  },
];

interface ActivePlacementState {
  session: AdaptiveTestSession;
  currentQuestion: PlacementQuestion | null;
  seenIds: string[];
}

function createInitialPlacementState(
  placementBank: PlacementQuestion[],
  initialSeenIds: string[],
  mode: ProfileMode = 'adult'
): ActivePlacementState {
  const allowedLevels = getLevelsForMode(mode);
  const targetCount = mode === 'child' ? KIDS_PLACEMENT_QUESTION_COUNT : 20;
  const initialLevel: CEFRLevel = mode === 'child' ? 'A0' : 'A1';
  const freshSession = createAdaptiveSession(
    placementBank.length,
    targetCount,
    initialLevel,
    new Date().toISOString(),
    allowedLevels
  );
  const drawn = drawNextPlacementQuestion(
    placementBank,
    freshSession,
    initialSeenIds
  );
  return {
    session: drawn.session,
    currentQuestion: drawn.question,
    seenIds: drawn.seenQuestionIds,
  };
}

export function OnboardingFlow({
  step,
  mode = 'adult',
  initialProfile,
  initialPlacement,
  seenQuestionIds = [],
  onCompleteProfile,
  onCompletePlacement,
  onUpdatePlacementSession,
  onCompletePlan,
  onImportState,
  onOpenSettings,
  onCancelLockedRetake,
}: OnboardingFlowProps): React.ReactElement {
  const isChild = mode === 'child';
  const [placementBank, setPlacementBank] = useState<PlacementQuestion[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  // Step 1: Profile state
  const [firstName, setFirstName] = useState(initialProfile?.firstName ?? '');
  const [selectedGoal, setSelectedGoal] = useState<LearningGoal>(
    initialProfile?.goal ?? 'travail'
  );
  const [profileError, setProfileError] = useState('');
  const [importError, setImportError] = useState('');

  // Step 2: Adaptive Placement Test state (~20 questions + confirmation if inconsistent)
  const lockStatus = getPlacementLockStatus(initialPlacement);

  const [placementState, setPlacementState] = useState<ActivePlacementState>(() =>
    createInitialPlacementState([], [], mode)
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [audioPlayCount, setAudioPlayCount] = useState<number>(0);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number>(30);

  const latestPlacementRef = useRef<ActivePlacementState>(placementState);
  latestPlacementRef.current = placementState;

  const onUpdateSessionRef = useRef(onUpdatePlacementSession);
  onUpdateSessionRef.current = onUpdatePlacementSession;

  // Charge la banque du test de niveau uniquement au lancement du test (si déverrouillé)
  useEffect(() => {
    if (step !== 'placement' || lockStatus.isLocked) {
      return;
    }

    let cancelled = false;
    void loadPlacementBank(mode).then((bank) => {
      if (cancelled) return;
      setPlacementBank(bank);
      const fresh = createInitialPlacementState(bank, seenQuestionIds, mode);
      setPlacementState(fresh);
      setSelectedOption(null);
      setAudioPlayCount(0);
      setTimeLeftSeconds(
        fresh.currentQuestion
          ? getQuestionTimeLimitSeconds(fresh.currentQuestion.skill)
          : 30
      );

      onUpdateSessionRef.current?.(
        toPlacementSessionState(fresh.session),
        fresh.seenIds
      );
    });

    const handleBeforeUnload = () => {
      const current = latestPlacementRef.current;
      if (current.session.status === 'in_progress') {
        const abandoned = abandonPlacementSession(current.session, current.seenIds);
        onUpdateSessionRef.current?.(
          toPlacementSessionState(abandoned.session),
          abandoned.seenQuestionIds
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      const current = latestPlacementRef.current;
      if (current.session.status === 'in_progress') {
        const abandoned = abandonPlacementSession(current.session, current.seenIds);
        onUpdateSessionRef.current?.(
          toPlacementSessionState(abandoned.session),
          abandoned.seenQuestionIds
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lockStatus.isLocked, mode]);

  const advancePlacementQuestion = useCallback(
    (chosenOption: number | null, forceDontKnow = false) => {
      const current = latestPlacementRef.current;
      const activeQuestion = current.currentQuestion;
      if (!activeQuestion) return;

      const isDontKnow =
        forceDontKnow ||
        chosenOption === null ||
        chosenOption === DONT_KNOW_OPTION_INDEX;

      const recordedSession = recordAdaptiveAnswer(
        current.session,
        activeQuestion,
        isDontKnow ? null : chosenOption,
        { isDontKnow }
      );

      if (recordedSession.status === 'completed') {
        const completedSessionState = toPlacementSessionState(recordedSession);
        const finalState: ActivePlacementState = {
          session: recordedSession,
          currentQuestion: null,
          seenIds: current.seenIds,
        };
        latestPlacementRef.current = finalState;
        setPlacementState(finalState);
        setSelectedOption(null);

        const result = evaluatePlacementTest(recordedSession.answered);
        onCompletePlacement(result, completedSessionState, current.seenIds);
        return;
      }

      const nextDrawn = drawNextPlacementQuestion(
        placementBank,
        recordedSession,
        current.seenIds
      );

      if (!nextDrawn.question) {
        const completedSession: AdaptiveTestSession = {
          ...recordedSession,
          status: 'completed',
        };
        const completedSessionState = toPlacementSessionState(completedSession);
        const finalState: ActivePlacementState = {
          session: completedSession,
          currentQuestion: null,
          seenIds: nextDrawn.seenQuestionIds,
        };
        latestPlacementRef.current = finalState;
        setPlacementState(finalState);
        setSelectedOption(null);

        const result = evaluatePlacementTest(completedSession.answered);
        onCompletePlacement(result, completedSessionState, nextDrawn.seenQuestionIds);
        return;
      }

      const nextState: ActivePlacementState = {
        session: nextDrawn.session,
        currentQuestion: nextDrawn.question,
        seenIds: nextDrawn.seenQuestionIds,
      };
      latestPlacementRef.current = nextState;
      setPlacementState(nextState);
      setSelectedOption(null);
      setAudioPlayCount(0);
      setTimeLeftSeconds(getQuestionTimeLimitSeconds(nextDrawn.question.skill));

      onUpdateSessionRef.current?.(
        toPlacementSessionState(nextDrawn.session),
        nextDrawn.seenQuestionIds
      );
    },
    [onCompletePlacement, placementBank]
  );

  // Per-question countdown timer (adult only); child mode has no visible countdown
  useEffect(() => {
    if (
      step !== 'placement' ||
      lockStatus.isLocked ||
      !placementState.currentQuestion ||
      placementState.session.status !== 'in_progress'
    ) {
      return;
    }

    if (placementState.currentQuestion.audioText) {
      preloadAudioClip(placementState.currentQuestion.audioText);
    }

    if (isChild) {
      return;
    }

    const timerId = window.setInterval(() => {
      setTimeLeftSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timerId);
          advancePlacementQuestion(DONT_KNOW_OPTION_INDEX, true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    step,
    lockStatus.isLocked,
    placementState.currentQuestion?.id,
    placementState.session.status,
    advancePlacementQuestion,
  ]);

  // Step 3: Plan builder state
  const defaultPrefs = getDefaultPlanPreferences(mode);
  const determinedLevel: CEFRLevel =
    initialPlacement?.determinedLevel ?? (isChild ? 'A0' : 'A1');
  const [targetLevel, setTargetLevel] = useState<CEFRLevel>(() =>
    getDefaultTargetLevel(determinedLevel, mode)
  );
  const [durationWeeks, setDurationWeeks] = useState<number>(
    defaultPrefs.durationWeeks
  );
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(
    defaultPrefs.sessionsPerWeek
  );
  const [minutesPerSession, setMinutesPerSession] = useState<number>(
    defaultPrefs.minutesPerSession
  );

  // Sync default target level when placement completes
  useEffect(() => {
    if (initialPlacement) {
      setTargetLevel(getDefaultTargetLevel(initialPlacement.determinedLevel, mode));
    }
  }, [initialPlacement, mode]);

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = firstName.trim();
    if (trimmed.length < 2) {
      setProfileError('Veuillez indiquer votre prénom (au moins 2 caractères).');
      return;
    }
    setProfileError('');
    onCompleteProfile({
      firstName: trimmed,
      goal: selectedGoal,
      createdAt: new Date().toISOString(),
    });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseImportedProgressJSON(content);
      if (parsed.ok) {
        setImportError('');
        onImportState(parsed.state);
      } else {
        setImportError(parsed.error);
      }
    };
    reader.readAsText(file);
  };

  if (step === 'profile') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between gap-4 mb-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]">
              Étape 1 sur 3 · Profil
            </span>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F4C3A] dark:text-[#6EE7B7] hover:text-[#0A3628] cursor-pointer border border-[#E4DFD3] dark:border-[#343F3B] rounded-lg px-3 py-1.5 bg-[#FAF8F5] dark:bg-[#252D2A]">
              <IconUpload className="w-4 h-4" />
              <span>Importer une sauvegarde JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileImport}
                className="sr-only"
              />
            </label>
          </div>

          {importError && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-[#FDF1EC] dark:bg-[#3A1D16] border border-[#C85A32]/30 text-sm text-[#9A3412] dark:text-[#FDBA74]"
            >
              {importError}
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-[#F3F4F6] tracking-tight mb-2">
            Construisons votre parcours d’anglais
          </h1>
          <p className="text-[#4B5563] dark:text-[#D1D5DB] text-sm sm:text-base mb-8 leading-relaxed">
            Indiquez votre prénom et votre priorité actuelle. Nous évaluerons ensuite votre niveau
            CECRL (A1 à B2) pour calibrer chaque séance.
          </p>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="firstName-input"
                className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-2"
              >
                Votre prénom
              </label>
              <input
                id="firstName-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex. Aminata, Moussa, Ibrahima..."
                className="w-full px-4 py-3 rounded-xl border border-[#D5CFC2] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] placeholder-[#6B7280] dark:placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] focus:bg-white dark:focus:bg-[#1E2422] transition"
              />
              {profileError && (
                <p className="mt-2 text-xs font-medium text-[#C85A32] dark:text-[#FDBA74]">
                  {profileError}
                </p>
              )}
            </div>

            <div>
              <span className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-3">
                Quel est votre objectif principal ?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {GOAL_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedGoal === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedGoal(option.id)}
                      className={`text-left p-4 rounded-xl border transition flex flex-col justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'border-[#0F4C3A] dark:border-[#34D399] bg-[#E6F0EC]/60 dark:bg-[#13362B] ring-1 ring-[#0F4C3A] dark:ring-[#34D399]'
                          : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5]/60 dark:bg-[#252D2A] hover:bg-white dark:hover:bg-[#1E2422] hover:border-[#C5BEB0]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-[#0F4C3A] text-white'
                              : 'bg-[#E4DFD3]/60 dark:bg-[#343F3B] text-[#374151] dark:text-[#D1D5DB]'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </span>
                        {isSelected && (
                          <span className="text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] px-2 py-0.5 rounded-full bg-white dark:bg-[#1E2422] border border-[#0F4C3A]/20">
                            Sélectionné
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-[#111827] dark:text-[#F3F4F6] text-sm mb-1">
                          {option.label}
                        </div>
                        <div className="text-xs text-[#4B5563] dark:text-[#D1D5DB] leading-relaxed">
                          {option.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white font-semibold text-sm transition cursor-pointer"
              >
                <span>Passer au test de niveau adaptatif</span>
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'placement') {
    if (lockStatus.isLocked && initialPlacement) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-[#FDF1EC] dark:bg-[#3A1D16] text-[#C85A32] dark:text-[#FDBA74]">
                <IconAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#C85A32] dark:text-[#FDBA74] block">
                  Résultat verrouillé 7 jours
                </span>
                <h1 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-[#F3F4F6]">
                  Niveau {initialPlacement.determinedLevel} déjà validé
                </h1>
              </div>
            </div>

            <p className="text-sm text-[#374151] dark:text-[#D1D5DB] leading-relaxed mb-6">
              {lockStatus.messageFr}
            </p>

            <div className="p-4 rounded-xl bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] text-xs text-[#4B5563] dark:text-[#D1D5DB] mb-6 space-y-1">
              <div>
                Niveau attribué :{' '}
                <strong className="text-[#0F4C3A] dark:text-[#6EE7B7]">
                  {initialPlacement.determinedLevel}
                </strong>{' '}
                ({initialPlacement.overallScore} % de réussite globale)
              </div>
              <div>
                Délai avant nouvelle évaluation :{' '}
                <strong className="text-[#111827] dark:text-[#F3F4F6]">
                  {lockStatus.remainingDays}{' '}
                  {lockStatus.remainingDays > 1 ? 'jours' : 'jour'}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
                >
                  <IconSettings className="w-4 h-4" />
                  <span>Paramètres &gt; Réinitialiser mes données</span>
                </button>
              )}

              {onCancelLockedRetake && (
                <button
                  type="button"
                  onClick={onCancelLockedRetake}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-[#D5CFC2] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:bg-white dark:hover:bg-[#1E2422] text-[#111827] dark:text-[#F3F4F6] text-xs sm:text-sm font-semibold transition cursor-pointer"
                >
                  <span>Retourner à mon parcours</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const { session: adaptiveSession, currentQuestion } = placementState;
    const questionNumber = adaptiveSession.answered.length + 1;
    const totalQuestions = adaptiveSession.maxQuestions;
    const isConfirmationPhase =
      adaptiveSession.confirmationQuestionsAdded > 0 &&
      adaptiveSession.answered.length >= adaptiveSession.baseMaxQuestions;
    const progressPercent = Math.round(
      (adaptiveSession.answered.length / totalQuestions) * 100
    );

    const handlePlayListeningAudio = (rate: number) => {
      if (!currentQuestion?.audioText || audioPlayCount >= MAX_LISTENING_PLAYS) {
        return;
      }
      setAudioPlayCount((prev) => prev + 1);
      speakEnglish(currentQuestion.audioText, rate);
    };

    const handleConfirmAnswer = () => {
      if (!currentQuestion || selectedOption === null) return;
      advancePlacementQuestion(
        selectedOption,
        selectedOption === DONT_KNOW_OPTION_INDEX
      );
    };

    if (!currentQuestion) {
      const result = evaluatePlacementTest(adaptiveSession.answered);
      return (
        <div className="max-w-xl mx-auto px-4 py-12 text-center">
          <button
            type="button"
            onClick={() =>
              onCompletePlacement(
                result,
                toPlacementSessionState({ ...adaptiveSession, status: 'completed' }),
                placementState.seenIds
              )
            }
            className="px-6 py-3 rounded-xl bg-[#0F4C3A] text-white font-semibold cursor-pointer"
          >
            Voir mes résultats
          </button>
        </div>
      );
    }

    const maxTimeSeconds = getQuestionTimeLimitSeconds(currentQuestion.skill);
    const isTimeLow = timeLeftSeconds <= 8;

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]">
              Étape 2 sur 3 · Test adaptatif ({questionNumber} / {totalQuestions})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#4B5563] dark:text-[#D1D5DB]">
                Compétence :{' '}
                <strong className="text-[#111827] dark:text-[#F3F4F6]">
                  {SKILL_LABELS_FR[currentQuestion.skill]}
                </strong>
              </span>
              {!isChild && (
                <span
                  data-testid="question-timer"
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${
                    isTimeLow
                      ? 'bg-[#FDF1EC] dark:bg-[#3A1D16] text-[#C85A32] dark:text-[#FDBA74] border-[#C85A32]/40'
                      : 'bg-[#F3EFE6] dark:bg-[#252D2A] text-[#0F4C3A] dark:text-[#6EE7B7] border-[#E4DFD3] dark:border-[#343F3B]'
                  }`}
                >
                  {timeLeftSeconds} s / {maxTimeSeconds} s
                </span>
              )}
            </div>
          </div>

          {isConfirmationPhase && (
            <div className="mb-4 px-3.5 py-2 rounded-xl bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7]">
              Question de confirmation supplémentaire pour vérifier la régularité de votre niveau.
            </div>
          )}

          <div className="w-full h-2 bg-[#F3EFE6] dark:bg-[#252D2A] rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-[#0F4C3A] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {currentQuestion.emoji && (
            <div className="text-4xl sm:text-5xl mb-3" aria-hidden="true">
              {currentQuestion.emoji}
            </div>
          )}

          <h2 className="text-lg sm:text-xl font-bold text-[#111827] dark:text-[#F3F4F6] mb-4 leading-snug">
            {currentQuestion.prompt}
          </h2>

          {currentQuestion.skill === 'listening' && currentQuestion.audioText && (
            <div className="mb-6 p-4 rounded-xl bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={audioPlayCount >= MAX_LISTENING_PLAYS}
                  onClick={() => handlePlayListeningAudio(0.95)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                    audioPlayCount < MAX_LISTENING_PLAYS
                      ? 'bg-[#0F4C3A] hover:bg-[#0A3628] text-white cursor-pointer'
                      : 'bg-[#E4DFD3] dark:bg-[#343F3B] text-[#6B7280] dark:text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  <IconVolume className="w-4 h-4" />
                  <span>Écouter l’extrait (en-US)</span>
                </button>
                <button
                  type="button"
                  disabled={audioPlayCount >= MAX_LISTENING_PLAYS}
                  onClick={() => handlePlayListeningAudio(0.72)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-semibold transition ${
                    audioPlayCount < MAX_LISTENING_PLAYS
                      ? 'border-[#D5CFC2] dark:border-[#343F3B] bg-white dark:bg-[#1E2422] hover:bg-[#F3EFE6] text-[#111827] dark:text-[#F3F4F6] cursor-pointer'
                      : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  <span>Écoute lente (0.75x)</span>
                </button>
              </div>
              <span className="text-xs font-semibold text-[#4B5563] dark:text-[#D1D5DB]">
                Écoutes : {audioPlayCount} / {MAX_LISTENING_PLAYS} maximum
              </span>
            </div>
          )}

          <div className="space-y-2.5 mb-6">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              return (
                <button
                  key={`${currentQuestion.id}-opt-${idx}`}
                  type="button"
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'border-[#0F4C3A] dark:border-[#34D399] bg-[#E6F0EC]/70 dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] font-semibold ring-1 ring-[#0F4C3A] dark:ring-[#34D399]'
                      : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5]/50 dark:bg-[#252D2A] hover:bg-white dark:hover:bg-[#1E2422] text-[#111827] dark:text-[#F3F4F6]'
                  }`}
                >
                  <span>{option}</span>
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                      isSelected
                        ? 'border-[#0F4C3A] bg-[#0F4C3A] text-white'
                        : 'border-[#C5BEB0] dark:border-[#4B5563]'
                    }`}
                  >
                    {isSelected && <IconCheck className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })}

            {/* Option neutre anti-triche : "Je ne sais pas" */}
            <button
              type="button"
              onClick={() => setSelectedOption(DONT_KNOW_OPTION_INDEX)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition flex items-center justify-between cursor-pointer ${
                selectedOption === DONT_KNOW_OPTION_INDEX
                  ? 'border-[#0F4C3A] dark:border-[#34D399] bg-[#E6F0EC]/70 dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] font-semibold ring-1 ring-[#0F4C3A] dark:ring-[#34D399]'
                  : 'border-dashed border-[#C5BEB0] dark:border-[#4B5563] bg-[#FAF8F5]/30 dark:bg-[#1E2422] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] text-[#4B5563] dark:text-[#D1D5DB]'
              }`}
            >
              <span>
                {isChild ? 'Je ne sais pas encore' : DONT_KNOW_LABEL_FR}
              </span>
              <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
                {isChild ? 'Tu peux passer sans souci' : 'Neutre (sans pénalité)'}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4DFD3] dark:border-[#343F3B]">
            <span className="text-xs text-[#6B7280] dark:text-[#9CA3AF]">
              Sans retour en arrière · Réponse vide au bout du temps = « {DONT_KNOW_LABEL_FR} »
            </span>
            <button
              type="button"
              disabled={selectedOption === null}
              onClick={handleConfirmAnswer}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition ${
                selectedOption !== null
                  ? 'bg-[#C85A32] hover:bg-[#B04B25] text-white cursor-pointer'
                  : 'bg-[#E4DFD3] dark:bg-[#343F3B] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              <span>
                {questionNumber === totalQuestions
                  ? 'Terminer le test et voir mon bilan'
                  : 'Valider et continuer'}
              </span>
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Results & Study Plan configuration + Feasibility calculation
  const allowedTargetLevels = getLevelsForMode(mode);
  const startIdx = Math.max(0, allowedTargetLevels.indexOf(determinedLevel));
  const availableTargets = allowedTargetLevels.filter((_, idx) => idx >= startIdx);

  const planConfig: StudyPlanConfig = {
    currentLevel: determinedLevel,
    targetLevel,
    durationWeeks,
    sessionsPerWeek,
    minutesPerSession,
    startDate: formatDateISO(new Date()),
  };

  const feasibility = analyzeFeasibility(planConfig);

  const handleApplyRealisticDuration = () => {
    setDurationWeeks(feasibility.suggestedWeeks);
  };

  const handleApplyRealisticPace = () => {
    setSessionsPerWeek(feasibility.suggestedSessionsPerWeek);
    setMinutesPerSession(feasibility.suggestedMinutesPerSession);
  };

  const handleGenerateProgram = () => {
    if (isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    void loadCatalogForProfile(mode, determinedLevel, targetLevel)
      .then((profileCatalog) => {
        const generated = generateStudyPlan(
          planConfig,
          initialPlacement,
          profileCatalog,
          initialProfile?.goal
        );
        onCompletePlan(generated);
      })
      .finally(() => {
        setIsGeneratingPlan(false);
      });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Placement Test Summary */}
      {initialPlacement && (
        <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] mb-2">
                Bilan du test de niveau (verrouillé 7 jours)
              </span>
              <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F3F4F6]">
                {initialProfile?.firstName ? `${initialProfile.firstName}, votre` : 'Votre'} niveau
                actuel est{' '}
                <span className="text-[#0F4C3A] dark:text-[#6EE7B7]">{determinedLevel}</span>
              </h1>
            </div>
            <div className="px-4 py-3 rounded-xl bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] text-right">
              <div className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">Score global</div>
              <div className="text-2xl font-bold text-[#0F4C3A] dark:text-[#6EE7B7]">
                {initialPlacement.overallScore} %
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {ALL_SKILLS.map((skill) => {
              const perf = initialPlacement.skillScores[skill];
              const isWeak = initialPlacement.weaknesses.includes(skill);
              return (
                <div
                  key={skill}
                  className="p-3.5 rounded-xl bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B]"
                >
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-[#111827] dark:text-[#F3F4F6]">
                      {SKILL_LABELS_FR[skill]}
                    </span>
                    <span
                      className={
                        isWeak
                          ? 'text-[#C85A32] dark:text-[#FDBA74]'
                          : 'text-[#0F4C3A] dark:text-[#6EE7B7]'
                      }
                    >
                      {perf.percentage} % ({perf.correct}/{perf.total})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#E4DFD3] dark:bg-[#343F3B] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${isWeak ? 'bg-[#C85A32]' : 'bg-[#0F4C3A]'}`}
                      style={{ width: `${perf.percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-[#E6F0EC]/60 dark:bg-[#13362B] border border-[#0F4C3A]/20">
              <div className="font-bold text-[#0F4C3A] dark:text-[#6EE7B7] mb-1">
                Points forts acquis
              </div>
              <p className="text-[#111827] dark:text-[#F3F4F6]">
                {initialPlacement.strengths.length > 0
                  ? initialPlacement.strengths.map((s) => SKILL_LABELS_FR[s]).join(', ')
                  : 'Bases en cours de construction'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FDF1EC] dark:bg-[#3A1D16] border border-[#C85A32]/30">
              <div className="font-bold text-[#9A3412] dark:text-[#FDBA74] mb-1">
                Priorités renforcées dans votre futur programme
              </div>
              <p className="text-[#111827] dark:text-[#F3F4F6]">
                {initialPlacement.weaknesses.map((w) => SKILL_LABELS_FR[w]).join(', ')} (+40 % de
                temps dédié par séance)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Configuration & Feasibility */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] mb-3">
          Étape 3 sur 3 · Choix du plan et faisabilité
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-[#111827] dark:text-[#F3F4F6] mb-2">
          Paramétrez votre rythme d’apprentissage
        </h2>
        <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-6">
          Choisissez votre niveau cible, la durée souhaitée en semaines et votre disponibilité
          hebdomadaire.
        </p>

        <div className="space-y-6">
          {/* Target Level */}
          <div>
            <label className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-2">
              Niveau cible CECRL (par défaut le niveau suivant)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {availableTargets.map((lvl) => {
                const isSelected = targetLevel === lvl;
                const isDefaultNext = lvl === getDefaultTargetLevel(determinedLevel);
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setTargetLevel(lvl)}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[#0F4C3A] bg-[#0F4C3A] text-white'
                        : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] hover:bg-white dark:hover:bg-[#1E2422]'
                    }`}
                  >
                    <div className="text-base font-bold">{lvl}</div>
                    <div
                      className={`text-xs ${
                        isSelected ? 'text-[#E6F0EC]' : 'text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      {isDefaultNext ? 'Recommandé' : 'Objectif avancé'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration in weeks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label
                htmlFor="duration-weeks-input"
                className="text-sm font-semibold text-[#111827] dark:text-[#F3F4F6]"
              >
                Durée du programme :{' '}
                <span className="text-[#0F4C3A] dark:text-[#6EE7B7]">{durationWeeks} semaines</span>
              </label>
              <input
                id="duration-weeks-input"
                type="number"
                min={2}
                max={52}
                value={durationWeeks}
                onChange={(e) =>
                  setDurationWeeks(Math.min(52, Math.max(2, Number(e.target.value) || 4)))
                }
                className="w-20 px-2.5 py-1 text-sm font-semibold text-center rounded-lg border border-[#D5CFC2] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[8, 12, 16, 24, 36, 48].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setDurationWeeks(w)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    durationWeeks === w
                      ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                      : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB] border-[#E4DFD3] dark:border-[#343F3B] hover:bg-white'
                  }`}
                >
                  {w} sem.
                </button>
              ))}
            </div>
          </div>

          {/* Sessions per week & Minutes per session */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-2">
                Séances par semaine :{' '}
                <span className="text-[#0F4C3A] dark:text-[#6EE7B7]">
                  {sessionsPerWeek} séances / sem.
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSessionsPerWeek(n)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      sessionsPerWeek === n
                        ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                        : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB] border-[#E4DFD3] dark:border-[#343F3B] hover:bg-white'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-2">
                Durée d’une séance :{' '}
                <span className="text-[#0F4C3A] dark:text-[#6EE7B7]">{minutesPerSession} min</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {(isChild ? [5, 6, 7, 8] : [15, 20, 30, 45, 60, 90]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutesPerSession(m)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      minutesPerSession === m
                        ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                        : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB] border-[#E4DFD3] dark:border-[#343F3B] hover:bg-white'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Feasibility Analysis Box */}
          <div
            className={`p-5 rounded-2xl border ${
              feasibility.isRealistic
                ? 'bg-[#E6F0EC]/70 dark:bg-[#13362B] border-[#0F4C3A]/30'
                : 'bg-[#FDF1EC] dark:bg-[#3A1D16] border-[#C85A32]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  feasibility.isRealistic
                    ? 'bg-[#0F4C3A] text-white'
                    : 'bg-[#C85A32] text-white'
                }`}
              >
                {feasibility.isRealistic ? (
                  <IconCheck className="w-5 h-5" />
                ) : (
                  <IconAlert className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
                    Calcul de faisabilité ({determinedLevel} → {targetLevel})
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B]">
                    {feasibility.plannedHours} h prévues / ~{feasibility.estimatedHoursNeeded} h
                    recommandées
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#374151] dark:text-[#D1D5DB] leading-relaxed mb-3">
                  {feasibility.message}
                </p>

                {!feasibility.isRealistic && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleApplyRealisticDuration}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#1E2422] hover:bg-[#FAF8F5] text-[#0F4C3A] dark:text-[#6EE7B7] border border-[#0F4C3A]/30 text-xs font-semibold transition cursor-pointer"
                    >
                      Option 1 : Allonger à {feasibility.suggestedWeeks} semaines
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyRealisticPace}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#1E2422] hover:bg-[#FAF8F5] text-[#C85A32] dark:text-[#FDBA74] border border-[#C85A32]/30 text-xs font-semibold transition cursor-pointer"
                    >
                      Option 2 : Passer à {feasibility.suggestedSessionsPerWeek} séances ×{' '}
                      {feasibility.suggestedMinutesPerSession} min/sem.
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleGenerateProgram}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white font-semibold text-sm transition cursor-pointer"
            >
              <span>Générer mon programme semaine par semaine</span>
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
