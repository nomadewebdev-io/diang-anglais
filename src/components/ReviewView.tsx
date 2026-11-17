import React, { useEffect, useState } from 'react';
import { EMPTY_CATALOG, loadFullCatalogForMode } from '../lib/catalog';
import { ContentCatalog } from '../lib/planner';
import {
  getConstructionUnits,
  getNextConstructionUnitForLevel,
  isUnitUnlocked,
  UNIT_UNLOCK_THRESHOLD,
} from '../lib/construction';
import { getDueAndNewCardsForToday } from '../lib/progression';
import { getLevelsForMode, SKILL_LABELS_FR } from '../lib/placementTest';
import { formatDateISO } from '../lib/sm2';
import { AppState, CEFRLevel, SkillType, SM2CardState } from '../lib/types';
import { ConstructionPractice } from './ConstructionPractice';
import { DictationPractice } from './DictationPractice';
import { FlashcardsPractice } from './FlashcardsPractice';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBookOpen,
  IconCards,
  IconCheck,
  IconKeyboard,
  IconVolume,
} from './Icons';
import { LessonPractice } from './LessonPractice';
import { QuizPractice } from './QuizPractice';

interface ReviewViewProps {
  state: AppState;
  onRateCard: (cardId: string, updatedState: SM2CardState) => void;
  onRecordConstructionItemSM2: (itemId: string, firstTrySuccess: boolean) => void;
  onCompleteConstructionUnit: (
    level: CEFRLevel,
    unit: number,
    firstTryCorrect: number,
    total: number
  ) => void;
  onUnlockNextConstructionUnit: (level: CEFRLevel, currentUnit: number) => void;
  onRecordPracticeMinutes: (
    minutes: number,
    kind: 'flashcards' | 'lesson' | 'dictation' | 'quiz' | 'construction'
  ) => void;
}

type ReviewMode =
  | 'menu'
  | 'flashcards'
  | 'lessons'
  | 'dictation'
  | 'quiz'
  | 'construction';

export function ReviewView({
  state,
  onRateCard,
  onRecordConstructionItemSM2,
  onCompleteConstructionUnit,
  onUnlockNextConstructionUnit,
  onRecordPracticeMinutes,
}: ReviewViewProps): React.ReactElement {
  const [mode, setMode] = useState<ReviewMode>('menu');
  const [levelFilter, setLevelFilter] = useState<CEFRLevel | 'ALL'>('ALL');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [quizSkillFilter, setQuizSkillFilter] = useState<SkillType | 'ALL'>('ALL');
  const [catalog, setCatalog] = useState<ContentCatalog>(EMPTY_CATALOG);
  const availableLevels = getLevelsForMode(state.mode);

  useEffect(() => {
    let cancelled = false;
    void loadFullCatalogForMode(state.mode).then((loaded) => {
      if (!cancelled) setCatalog(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [state.mode]);
  const [constructionLevel, setConstructionLevel] = useState<CEFRLevel>(
    state.studyPlan?.config.currentLevel ?? availableLevels[0]
  );
  const [activeConstructionUnit, setActiveConstructionUnit] = useState<number | null>(
    null
  );
  const [includeNewCards, setIncludeNewCards] = useState(false);

  const todayStr = formatDateISO(new Date());

  const filteredCards =
    levelFilter === 'ALL'
      ? catalog.cards
      : catalog.cards.filter((c) => c.level === levelFilter);
  const todayNewCount = state.dailyLogs[todayStr]?.newCardsCount ?? 0;
  const { dueCards, newCards, remainingNewQuota } = getDueAndNewCardsForToday(
    filteredCards,
    state.sm2States,
    todayNewCount,
    state.dailyNewCardsLimit ?? 20,
    todayStr
  );

  const { dueCards: allDueCards } = getDueAndNewCardsForToday(
    catalog.cards,
    state.sm2States,
    todayNewCount,
    state.dailyNewCardsLimit ?? 20,
    todayStr
  );
  const dueTodayCount = allDueCards.length;

  const allConstructions = catalog.constructions ?? [];
  const constructionUnits = getConstructionUnits(allConstructions, constructionLevel);
  const currentActiveUnit = getNextConstructionUnitForLevel(
    allConstructions,
    state.constructionProgress,
    constructionLevel
  );

  if (mode === 'construction' && activeConstructionUnit !== null) {
    const unitSummary =
      constructionUnits.find((u) => u.unit === activeConstructionUnit) ??
      constructionUnits[0];
    const hasNext = constructionUnits.some(
      (u) => u.unit === (unitSummary?.unit ?? 0) + 1
    );

    if (unitSummary) {
      return (
        <div className="max-w-2xl mx-auto">
          <ConstructionPractice
            key={`${unitSummary.level}-${unitSummary.unit}`}
            items={unitSummary.items}
            title={`Construire · ${unitSummary.level} Unité ${unitSummary.unit}`}
            subtitle={unitSummary.unitTitleFr}
            hasNextUnit={hasNext}
            onRecordItemSM2={onRecordConstructionItemSM2}
            onClose={() => setActiveConstructionUnit(null)}
            onSkipToNextUnit={() => {
              onUnlockNextConstructionUnit(unitSummary.level, unitSummary.unit);
              setActiveConstructionUnit(unitSummary.unit + 1);
            }}
            onComplete={({ firstTryCorrect, total }) => {
              onCompleteConstructionUnit(
                unitSummary.level,
                unitSummary.unit,
                firstTryCorrect,
                total
              );
              onRecordPracticeMinutes(10, 'construction');
              setActiveConstructionUnit(null);
            }}
          />
        </div>
      );
    }
  }

  if (mode === 'construction') {
    const activeUnitProg = currentActiveUnit
      ? state.constructionProgress[currentActiveUnit.key]
      : undefined;

    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="p-2 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] cursor-pointer"
              aria-label="Retour à la révision"
            >
              <IconArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-[#111827] dark:text-[#F3F4F6]">
                Construis la phrase
              </h1>
              <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB]">
                Progression par unités : 80 % de réussite débloque l’unité suivante, sans jamais bloquer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-[#FAF8F5] dark:bg-[#252D2A] p-1.5 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B]">
            {availableLevels.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setConstructionLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  constructionLevel === lvl
                    ? 'bg-[#0F4C3A] text-white'
                    : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-white dark:hover:bg-[#1E2422]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {currentActiveUnit && (
          <div className="bg-[#E6F0EC] dark:bg-[#13362B] border border-[#0F4C3A]/20 dark:border-[#6EE7B7]/30 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0F4C3A] dark:text-[#6EE7B7]">
                Unité en cours · {currentActiveUnit.level}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-[#111827] dark:text-[#F3F4F6] mt-0.5">
                Unité {currentActiveUnit.unit} — {currentActiveUnit.unitTitleFr}
              </h2>
              <p className="text-xs text-[#374151] dark:text-[#D1D5DB] mt-1">
                {activeUnitProg
                  ? `Meilleur score : ${activeUnitProg.bestRate} % (${currentActiveUnit.items.length} phrases)`
                  : `${currentActiveUnit.items.length} phrases progressives · ${
                      constructionLevel === 'A1' || constructionLevel === 'A2'
                        ? 'Tuiles à toucher'
                        : 'Saisie libre'
                    }`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveConstructionUnit(currentActiveUnit.unit)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
            >
              <span>Commencer l’unité {currentActiveUnit.unit}</span>
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {constructionUnits.map((unitSummary) => {
            const prog = state.constructionProgress[unitSummary.key];
            const unlocked = isUnitUnlocked(
              state.constructionProgress,
              unitSummary.level,
              unitSummary.unit
            );
            const bestRate = prog?.bestRate ?? 0;
            const passed = bestRate >= UNIT_UNLOCK_THRESHOLD;

            return (
              <div
                key={unitSummary.key}
                className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                  unlocked
                    ? 'bg-white dark:bg-[#1E2422] border-[#E4DFD3] dark:border-[#343F3B]'
                    : 'bg-[#FAF8F5] dark:bg-[#191F1D] border-[#E4DFD3]/70 dark:border-[#2C3632]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-[#0F4C3A] dark:text-[#6EE7B7]">
                      Unité {unitSummary.unit}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        passed
                          ? 'bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]'
                          : prog
                          ? 'bg-[#FDF1EC] dark:bg-[#3A2018] text-[#9A3412] dark:text-[#FDBA8C]'
                          : 'bg-[#F3EFE6] dark:bg-[#252D2A] text-[#6B7280] dark:text-[#9CA3AF]'
                      }`}
                    >
                      {prog ? `${bestRate} %` : unlocked ? 'Prête' : 'À débloquer (80 %)'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
                    {unitSummary.unitTitleFr}
                  </h3>
                  <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-1">
                    {unitSummary.items.length} phrases
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#E4DFD3]/70 dark:border-[#343F3B]">
                  {unlocked ? (
                    <button
                      type="button"
                      onClick={() => setActiveConstructionUnit(unitSummary.unit)}
                      className="w-full px-3.5 py-2 rounded-lg bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold transition cursor-pointer"
                    >
                      {prog ? 'Rejouer l’unité' : 'Construire'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onUnlockNextConstructionUnit(
                          unitSummary.level,
                          unitSummary.unit - 1
                        );
                        setActiveConstructionUnit(unitSummary.unit);
                      }}
                      className="w-full px-3.5 py-2 rounded-lg border border-[#D5CFC2] dark:border-[#45534E] bg-white dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB] text-xs font-semibold transition cursor-pointer"
                    >
                      Passer à la suite
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mode === 'flashcards') {
    const cardsToPractice =
      dueCards.length > 0
        ? dueCards.slice(0, 12)
        : includeNewCards
          ? newCards.slice(0, 12)
          : [];

    if (cardsToPractice.length === 0) {
      return (
        <div className="max-w-2xl mx-auto bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-[#111827] dark:text-[#F3F4F6]">
            Révisions à jour, reviens demain pour consolider
          </h2>
          <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
            {remainingNewQuota > 0 && newCards.length > 0
              ? `Aucune carte SM-2 n’est due pour l’instant. Vous pouvez découvrir jusqu’à ${Math.min(remainingNewQuota, newCards.length)} nouvelles cartes ou pratiquer une autre activité.`
              : 'Toutes vos révisions SM-2 sont à jour et votre plafond quotidien de nouvelles cartes est atteint.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {remainingNewQuota > 0 && newCards.length > 0 && (
              <button
                type="button"
                onClick={() => setIncludeNewCards(true)}
                className="px-4 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
              >
                Découvrir de nouvelles cartes ({Math.min(12, newCards.length)})
              </button>
            )}
            <button
              type="button"
              onClick={() => setMode('construction')}
              className="px-4 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] text-xs sm:text-sm font-semibold transition cursor-pointer"
            >
              Ouvrir Construire
            </button>
            <button
              type="button"
              onClick={() => setMode('menu')}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
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
          cards={cardsToPractice}
          sm2States={state.sm2States}
          fallbackPool={catalog.cards}
          mode={state.mode}
          title={
            levelFilter === 'ALL'
              ? 'Vocabulaire · Tous niveaux'
              : `Vocabulaire · Niveau ${levelFilter}`
          }
          onRateCard={onRateCard}
          onClose={() => {
            setIncludeNewCards(false);
            setMode('menu');
          }}
          onComplete={(count) => {
            onRecordPracticeMinutes(Math.max(5, count * 2), 'flashcards');
            setIncludeNewCards(false);
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'lessons' && selectedLessonId) {
    const lesson =
      catalog.lessons.find((l) => l.id === selectedLessonId) ?? catalog.lessons[0];
    return (
      <div className="max-w-2xl mx-auto">
        <LessonPractice
          lesson={lesson}
          onClose={() => setSelectedLessonId(null)}
          onComplete={() => {
            onRecordPracticeMinutes(12, 'lesson');
            setSelectedLessonId(null);
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'dictation') {
    const sentences =
      levelFilter === 'ALL'
        ? catalog.sentences
        : catalog.sentences.filter((s) => s.level === levelFilter);
    return (
      <div className="max-w-2xl mx-auto">
        <DictationPractice
          sentences={sentences.slice(0, 6)}
          title={
            levelFilter === 'ALL'
              ? 'Dictée audio · Tous niveaux'
              : `Dictée audio · Niveau ${levelFilter}`
          }
          onClose={() => setMode('menu')}
          onComplete={() => {
            onRecordPracticeMinutes(10, 'dictation');
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'quiz') {
    const pool = catalog.placement.filter((q) => {
      const matchLevel = levelFilter === 'ALL' || q.level === levelFilter;
      const matchSkill = quizSkillFilter === 'ALL' || q.skill === quizSkillFilter;
      return matchLevel && matchSkill;
    });
    const questions = pool.length > 0 ? pool.slice(0, 8) : catalog.placement.slice(0, 8);

    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={questions}
          title="Quiz d’entraînement QCM & Écoute"
          subtitle={
            quizSkillFilter === 'ALL'
              ? 'Toutes compétences'
              : `Focus : ${SKILL_LABELS_FR[quizSkillFilter]}`
          }
          onClose={() => setMode('menu')}
          onComplete={() => {
            onRecordPracticeMinutes(10, 'quiz');
            setMode('menu');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
            Atelier de révision libre
          </h1>
          <p className="text-xs sm:text-sm text-[#4B5563]">
            Travaillez vos cartes mémoire SM-2, la dictée mot par mot, les leçons grammaticales
            ou les quiz audio.
          </p>
        </div>

        {/* Level Filter */}
        <div className="flex items-center gap-1.5 bg-[#FAF8F5] p-1.5 rounded-xl border border-[#E4DFD3]">
          <button
            type="button"
            onClick={() => setLevelFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              levelFilter === 'ALL'
                ? 'bg-[#0F4C3A] text-white'
                : 'text-[#374151] hover:bg-white'
            }`}
          >
            Tous
          </button>
          {availableLevels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                levelFilter === lvl
                  ? 'bg-[#0F4C3A] text-white'
                  : 'text-[#374151] hover:bg-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Asymmetric Bento Practice Selection */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Flashcards SM-2 */}
        <div className="md:col-span-7 bg-white border border-[#E4DFD3] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="p-2.5 rounded-xl bg-[#E6F0EC] text-[#0F4C3A]">
                <IconCards className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FDF1EC] text-[#C85A32]">
                {dueTodayCount === 0
                  ? 'Révisions à jour'
                  : `${dueTodayCount} cartes à revoir aujourd’hui`}
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#111827] mb-1">
              Flashcards SM-2 avec audio
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] mb-4">
              Mémorisation espacée selon vos réponses (À revoir, Difficile, Bien, Facile) avec
              écoute de chaque mot et exemple en anglais américain.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIncludeNewCards(false);
              setMode('flashcards');
            }}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            {dueCards.length > 0
              ? `Réviser les cartes dues (${dueCards.length})`
              : newCards.length > 0 && remainingNewQuota > 0
                ? `Découvrir de nouvelles cartes (${Math.min(remainingNewQuota, newCards.length)} dispo)`
                : 'Révisions à jour'}
          </button>
        </div>

        {/* Dictation Mode */}
        <div className="md:col-span-5 bg-white border border-[#E4DFD3] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="p-2.5 rounded-xl bg-[#FDF1EC] text-[#C85A32]">
                <IconKeyboard className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold text-[#6B7280]">
                Correction mot par mot
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#111827] mb-1">
              Mode Dictée
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] mb-4">
              Écoutez une phrase complète à vitesse normale ou réduite, tapez-la et visualisez la
              correction mot par mot.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode('dictation')}
            className="w-full px-5 py-3 rounded-xl bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            Démarrer une dictée
          </button>
        </div>
      </div>

      {/* Construire la phrase card */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]">
              Construire
            </span>
            {currentActiveUnit && (
              <span className="text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
                {currentActiveUnit.level} · Unité {currentActiveUnit.unit} en cours
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-[#111827] dark:text-[#F3F4F6]">
            Construis la phrase
          </h2>
          <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mt-0.5">
            Assemblez des phrases de plus en plus riches à partir des acquis précédents (tuiles en
            A1-A2, saisie libre en B1-B2) avec correction bienveillante et audio.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMode('construction')}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
        >
          <span>Ouvrir Construire</span>
          <IconArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Quiz QCM & Audio section */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] text-[#0F4C3A]">
              <IconVolume className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#111827]">
                Quiz QCM et Compréhension orale
              </h2>
              <p className="text-xs text-[#4B5563]">
                Sélectionnez une compétence spécifique ou testez-vous sur l’ensemble des questions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMode('quiz')}
            className="px-5 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold transition cursor-pointer"
          >
            Lancer le quiz QCM
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuizSkillFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              quizSkillFilter === 'ALL'
                ? 'bg-[#E6F0EC] border-[#0F4C3A] text-[#0F4C3A]'
                : 'bg-[#FAF8F5] border-[#E4DFD3] text-[#4B5563]'
            }`}
          >
            Toutes compétences
          </button>
          {(['vocab', 'grammar', 'reading', 'listening'] as SkillType[]).map((sk) => (
            <button
              key={sk}
              type="button"
              onClick={() => setQuizSkillFilter(sk)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                quizSkillFilter === sk
                  ? 'bg-[#E6F0EC] border-[#0F4C3A] text-[#0F4C3A]'
                  : 'bg-[#FAF8F5] border-[#E4DFD3] text-[#4B5563]'
              }`}
            >
              {SKILL_LABELS_FR[sk]}
            </button>
          ))}
        </div>
      </div>

      {/* Lessons List */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <IconBookOpen className="w-5 h-5 text-[#0F4C3A]" />
          <h2 className="text-base sm:text-lg font-bold text-[#111827]">
            Leçons de grammaire et exercices ({catalog.lessons.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalog.lessons
            .filter((l) => levelFilter === 'ALL' || l.level === levelFilter)
            .map((lesson) => (
              <div
                key={lesson.id}
                className="p-4 rounded-xl border border-[#E4DFD3] bg-[#FAF8F5] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                      Niveau {lesson.level}
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      {lesson.exercises.length} exercices
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#111827]">
                    {lesson.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLessonId(lesson.id);
                    setMode('lessons');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F4C3A] hover:underline cursor-pointer"
                >
                  <IconCheck className="w-3.5 h-3.5" />
                  <span>Étudier la leçon et s’exercer</span>
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
