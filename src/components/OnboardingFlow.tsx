import React, { useState } from 'react';
import { speakEnglish } from '../lib/audio';
import { catalog } from '../lib/catalog';
import {
  ALL_SKILLS,
  CEFR_LEVELS,
  createAdaptiveSession,
  evaluatePlacementTest,
  recordAdaptiveAnswer,
  selectNextAdaptiveQuestion,
  SKILL_LABELS_FR,
} from '../lib/placementTest';
import {
  analyzeFeasibility,
  generateStudyPlan,
  getDefaultTargetLevel,
} from '../lib/planner';
import { formatDateISO } from '../lib/sm2';
import { parseImportedProgressJSON } from '../lib/storage';
import {
  AppState,
  CEFRLevel,
  LearningGoal,
  OnboardingStep,
  PlacementResult,
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
  IconUpload,
  IconVolume,
} from './Icons';

interface OnboardingFlowProps {
  step: OnboardingStep;
  initialProfile: UserProfile | null;
  initialPlacement: PlacementResult | null;
  onCompleteProfile: (profile: UserProfile) => void;
  onCompletePlacement: (result: PlacementResult) => void;
  onCompletePlan: (plan: StudyPlan) => void;
  onImportState: (state: AppState) => void;
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

export function OnboardingFlow({
  step,
  initialProfile,
  initialPlacement,
  onCompleteProfile,
  onCompletePlacement,
  onCompletePlan,
  onImportState,
}: OnboardingFlowProps): React.ReactElement {
  // Step 1: Profile state
  const [firstName, setFirstName] = useState(initialProfile?.firstName ?? '');
  const [selectedGoal, setSelectedGoal] = useState<LearningGoal>(
    initialProfile?.goal ?? 'travail'
  );
  const [profileError, setProfileError] = useState('');
  const [importError, setImportError] = useState('');

  // Step 2: Adaptive Placement Test state (~20 questions)
  const [adaptiveSession, setAdaptiveSession] = useState(() =>
    createAdaptiveSession(catalog.placement.length, 20, 'A1')
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{
    isCorrect: boolean;
    nextLevel: CEFRLevel;
  } | null>(null);

  // Step 3: Plan builder state
  const determinedLevel: CEFRLevel = initialPlacement?.determinedLevel ?? 'A1';
  const [targetLevel, setTargetLevel] = useState<CEFRLevel>(() =>
    getDefaultTargetLevel(determinedLevel)
  );
  const [durationWeeks, setDurationWeeks] = useState<number>(16);
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(4);
  const [minutesPerSession, setMinutesPerSession] = useState<number>(30);

  // Sync default target level when placement completes
  React.useEffect(() => {
    if (initialPlacement) {
      setTargetLevel(getDefaultTargetLevel(initialPlacement.determinedLevel));
    }
  }, [initialPlacement]);

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
        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex items-center justify-between gap-4 mb-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] text-[#0F4C3A]">
              Étape 1 sur 3 · Profil
            </span>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F4C3A] hover:text-[#0A3628] cursor-pointer border border-[#E4DFD3] rounded-lg px-3 py-1.5 bg-[#FAF8F5]">
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
              className="mb-6 p-3.5 rounded-xl bg-[#FDF1EC] border border-[#C85A32]/30 text-sm text-[#9A3412]"
            >
              {importError}
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] tracking-tight mb-2">
            Construisons votre parcours d’anglais
          </h1>
          <p className="text-[#4B5563] text-sm sm:text-base mb-8 leading-relaxed">
            Indiquez votre prénom et votre priorité actuelle. Nous évaluerons ensuite votre niveau
            CECRL (A1 à B2) pour calibrer chaque séance.
          </p>

          <form onSubmit={handleProfileSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="firstName-input"
                className="block text-sm font-semibold text-[#111827] mb-2"
              >
                Votre prénom
              </label>
              <input
                id="firstName-input"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ex. Aminata, Moussa, Ibrahima..."
                className="w-full px-4 py-3 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-[#111827] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] focus:bg-white transition"
              />
              {profileError && (
                <p className="mt-2 text-xs font-medium text-[#C85A32]">{profileError}</p>
              )}
            </div>

            <div>
              <span className="block text-sm font-semibold text-[#111827] mb-3">
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
                      className={`text-left p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-[#0F4C3A] bg-[#E6F0EC]/60 ring-1 ring-[#0F4C3A]'
                          : 'border-[#E4DFD3] bg-[#FAF8F5]/60 hover:bg-white hover:border-[#C5BEB0]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span
                          className={`p-2 rounded-lg ${
                            isSelected
                              ? 'bg-[#0F4C3A] text-white'
                              : 'bg-[#E4DFD3]/60 text-[#374151]'
                          }`}
                        >
                          <Icon className="w-5 h-5" />
                        </span>
                        {isSelected && (
                          <span className="text-xs font-semibold text-[#0F4C3A] px-2 py-0.5 rounded-full bg-white border border-[#0F4C3A]/20">
                            Sélectionné
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-[#111827] text-sm mb-1">
                          {option.label}
                        </div>
                        <div className="text-xs text-[#4B5563] leading-relaxed">
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
    const currentQuestion = selectNextAdaptiveQuestion(
      catalog.placement,
      adaptiveSession
    );
    const questionNumber = adaptiveSession.answered.length + 1;
    const totalQuestions = adaptiveSession.maxQuestions;
    const progressPercent = Math.round(
      (adaptiveSession.answered.length / totalQuestions) * 100
    );

    const handleConfirmAnswer = () => {
      if (!currentQuestion || selectedOption === null) return;
      const isCorrect = selectedOption === currentQuestion.answerIndex;
      const updatedSession = recordAdaptiveAnswer(
        adaptiveSession,
        currentQuestion,
        selectedOption
      );
      setLastFeedback({
        isCorrect,
        nextLevel: updatedSession.currentLevel,
      });
      setAdaptiveSession(updatedSession);
      setSelectedOption(null);

      if (updatedSession.answered.length >= updatedSession.maxQuestions) {
        const result = evaluatePlacementTest(updatedSession.answered);
        onCompletePlacement(result);
      }
    };

    const handleSkipTestToA1 = () => {
      const fallbackResult = evaluatePlacementTest([]);
      onCompletePlacement(fallbackResult);
    };

    if (!currentQuestion) {
      const result = evaluatePlacementTest(adaptiveSession.answered);
      return (
        <div className="max-w-xl mx-auto px-4 py-12 text-center">
          <button
            type="button"
            onClick={() => onCompletePlacement(result)}
            className="px-6 py-3 rounded-xl bg-[#0F4C3A] text-white font-semibold"
          >
            Voir mes résultats
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] text-[#0F4C3A]">
              Étape 2 sur 3 · Test adaptatif ({questionNumber} / {totalQuestions})
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[#4B5563]">
                Compétence :{' '}
                <strong className="text-[#111827]">
                  {SKILL_LABELS_FR[currentQuestion.skill]}
                </strong>
              </span>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#F3EFE6] text-[#0F4C3A] border border-[#E4DFD3]">
                Calibrage {currentQuestion.level}
              </span>
            </div>
          </div>

          <div className="w-full h-2 bg-[#F3EFE6] rounded-full overflow-hidden mb-6">
            <div
              className="h-full bg-[#0F4C3A] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {lastFeedback && (
            <div
              className={`mb-5 px-3.5 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between ${
                lastFeedback.isCorrect
                  ? 'bg-[#E6F0EC] text-[#0F4C3A]'
                  : 'bg-[#F3EFE6] text-[#4B5563]'
              }`}
            >
              <span>
                {lastFeedback.isCorrect
                  ? 'Réponse exacte — la difficulté augmente.'
                  : 'Réponse incorrecte — la difficulté s’ajuste.'}
              </span>
              <span className="font-semibold">
                Niveau testé : {lastFeedback.nextLevel}
              </span>
            </div>
          )}

          <h2 className="text-lg sm:text-xl font-bold text-[#111827] mb-4 leading-snug">
            {currentQuestion.prompt}
          </h2>

          {currentQuestion.skill === 'listening' && currentQuestion.audioText && (
            <div className="mb-6 p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => speakEnglish(currentQuestion.audioText ?? '', 0.95)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
                >
                  <IconVolume className="w-4 h-4" />
                  <span>Écouter l’extrait (en-US)</span>
                </button>
                <button
                  type="button"
                  onClick={() => speakEnglish(currentQuestion.audioText ?? '', 0.72)}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#D5CFC2] bg-white hover:bg-[#F3EFE6] text-[#111827] text-xs font-semibold transition cursor-pointer"
                >
                  <span>Écoute lente (0.75x)</span>
                </button>
              </div>
              <span className="text-xs text-[#6B7280]">
                Cliquez pour écouter autant de fois que nécessaire
              </span>
            </div>
          )}

          <div className="space-y-2.5 mb-6">
            {currentQuestion.options.map((option, idx) => {
              const isSelected = selectedOption === idx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm font-medium transition flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'border-[#0F4C3A] bg-[#E6F0EC]/70 text-[#0F4C3A] font-semibold ring-1 ring-[#0F4C3A]'
                      : 'border-[#E4DFD3] bg-[#FAF8F5]/50 hover:bg-white text-[#111827]'
                  }`}
                >
                  <span>{option}</span>
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center text-xs ${
                      isSelected
                        ? 'border-[#0F4C3A] bg-[#0F4C3A] text-white'
                        : 'border-[#C5BEB0]'
                    }`}
                  >
                    {isSelected && <IconCheck className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E4DFD3]">
            <button
              type="button"
              onClick={handleSkipTestToA1}
              className="text-xs font-medium text-[#6B7280] hover:text-[#111827] underline cursor-pointer"
            >
              Je débute complètement (démarrer directement en A1)
            </button>
            <button
              type="button"
              disabled={selectedOption === null}
              onClick={handleConfirmAnswer}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition ${
                selectedOption !== null
                  ? 'bg-[#C85A32] hover:bg-[#B04B25] text-white cursor-pointer'
                  : 'bg-[#E4DFD3] text-[#9CA3AF] cursor-not-allowed'
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
  const startIdx = CEFR_LEVELS.indexOf(determinedLevel);
  const availableTargets = CEFR_LEVELS.filter((_, idx) => idx >= startIdx);

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
    const generated = generateStudyPlan(
      planConfig,
      initialPlacement,
      catalog,
      initialProfile?.goal
    );
    onCompletePlan(generated);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Placement Test Summary */}
      {initialPlacement && (
        <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] text-[#0F4C3A] mb-2">
                Bilan du test de niveau
              </span>
              <h1 className="text-2xl font-bold text-[#111827]">
                {initialProfile?.firstName ? `${initialProfile.firstName}, votre` : 'Votre'} niveau
                actuel est <span className="text-[#0F4C3A]">{determinedLevel}</span>
              </h1>
            </div>
            <div className="px-4 py-3 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] text-right">
              <div className="text-xs text-[#4B5563]">Score global</div>
              <div className="text-2xl font-bold text-[#0F4C3A]">
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
                  className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]"
                >
                  <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                    <span className="text-[#111827]">{SKILL_LABELS_FR[skill]}</span>
                    <span className={isWeak ? 'text-[#C85A32]' : 'text-[#0F4C3A]'}>
                      {perf.percentage} % ({perf.correct}/{perf.total})
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[#E4DFD3] rounded-full overflow-hidden">
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
            <div className="p-3.5 rounded-xl bg-[#E6F0EC]/60 border border-[#0F4C3A]/20">
              <div className="font-bold text-[#0F4C3A] mb-1">Points forts acquis</div>
              <p className="text-[#111827]">
                {initialPlacement.strengths.length > 0
                  ? initialPlacement.strengths.map((s) => SKILL_LABELS_FR[s]).join(', ')
                  : 'Bases en cours de construction'}
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[#FDF1EC] border border-[#C85A32]/30">
              <div className="font-bold text-[#9A3412] mb-1">
                Priorités renforcées dans votre futur programme
              </div>
              <p className="text-[#111827]">
                {initialPlacement.weaknesses.map((w) => SKILL_LABELS_FR[w]).join(', ')} (+40 % de
                temps dédié par séance)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan Configuration & Feasibility */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 shadow-xs">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase bg-[#E6F0EC] text-[#0F4C3A] mb-3">
          Étape 3 sur 3 · Choix du plan et faisabilité
        </span>
        <h2 className="text-xl sm:text-2xl font-bold text-[#111827] mb-2">
          Paramétrez votre rythme d’apprentissage
        </h2>
        <p className="text-sm text-[#4B5563] mb-6">
          Choisissez votre niveau cible, la durée souhaitée en semaines et votre disponibilité
          hebdomadaire.
        </p>

        <div className="space-y-6">
          {/* Target Level */}
          <div>
            <label className="block text-sm font-semibold text-[#111827] mb-2">
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
                        : 'border-[#E4DFD3] bg-[#FAF8F5] text-[#111827] hover:bg-white'
                    }`}
                  >
                    <div className="text-base font-bold">{lvl}</div>
                    <div
                      className={`text-xs ${
                        isSelected ? 'text-[#E6F0EC]' : 'text-[#6B7280]'
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
                className="text-sm font-semibold text-[#111827]"
              >
                Durée du programme : <span className="text-[#0F4C3A]">{durationWeeks} semaines</span>
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
                className="w-20 px-2.5 py-1 text-sm font-semibold text-center rounded-lg border border-[#D5CFC2] bg-[#FAF8F5]"
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
                      : 'bg-[#FAF8F5] text-[#374151] border-[#E4DFD3] hover:bg-white'
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
              <label className="block text-sm font-semibold text-[#111827] mb-2">
                Séances par semaine :{' '}
                <span className="text-[#0F4C3A]">{sessionsPerWeek} séances / sem.</span>
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
                        : 'bg-[#FAF8F5] text-[#374151] border-[#E4DFD3] hover:bg-white'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#111827] mb-2">
                Durée d’une séance :{' '}
                <span className="text-[#0F4C3A]">{minutesPerSession} min</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[15, 20, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinutesPerSession(m)}
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                      minutesPerSession === m
                        ? 'bg-[#0F4C3A] text-white border-[#0F4C3A]'
                        : 'bg-[#FAF8F5] text-[#374151] border-[#E4DFD3] hover:bg-white'
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
                ? 'bg-[#E6F0EC]/70 border-[#0F4C3A]/30'
                : 'bg-[#FDF1EC] border-[#C85A32]/40'
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
                  <h3 className="text-sm font-bold text-[#111827]">
                    Calcul de faisabilité ({determinedLevel} → {targetLevel})
                  </h3>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white border border-[#E4DFD3]">
                    {feasibility.plannedHours} h prévues / ~{feasibility.estimatedHoursNeeded} h
                    recommandées
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-[#374151] leading-relaxed mb-3">
                  {feasibility.message}
                </p>

                {!feasibility.isRealistic && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={handleApplyRealisticDuration}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF8F5] text-[#0F4C3A] border border-[#0F4C3A]/30 text-xs font-semibold transition cursor-pointer"
                    >
                      Option 1 : Allonger à {feasibility.suggestedWeeks} semaines
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyRealisticPace}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FAF8F5] text-[#C85A32] border border-[#C85A32]/30 text-xs font-semibold transition cursor-pointer"
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
