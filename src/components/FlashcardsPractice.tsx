import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { preloadAudioClip, speakEnglish } from '../lib/audio';
import { catalog } from '../lib/catalog';
import { createInitialSM2State, formatDateISO } from '../lib/sm2';
import {
  buildCardChoices,
  classifyResponseToSM2,
  ClassifyResponseResult,
  formatReviewClassificationLabel,
  getCardDirection,
  SilentResponseTimer,
} from '../lib/srs';
import { FlashcardItem, SM2CardState } from '../lib/types';
import {
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconVolume,
} from './Icons';

interface FlashcardsPracticeProps {
  cards: FlashcardItem[];
  sm2States: Record<string, SM2CardState>;
  fallbackPool?: FlashcardItem[];
  title?: string;
  onRateCard: (cardId: string, updatedState: SM2CardState) => void;
  onComplete: (reviewedCount: number, answeredRatio?: number) => void;
  onClose?: () => void;
}

interface CardFeedback {
  selectedIndex: number | null;
  isCorrect: boolean;
  isDontKnow: boolean;
  result: ClassifyResponseResult;
}

export function FlashcardsPractice({
  cards,
  sm2States,
  fallbackPool = catalog.cards,
  title = 'Vocabulaire',
  onRateCard,
  onComplete,
  onClose,
}: FlashcardsPracticeProps): React.ReactElement {
  const [queue, setQueue] = useState<FlashcardItem[]>(() => [...cards]);
  const [index, setIndex] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [genuineAnsweredCount, setGenuineAnsweredCount] = useState(0);
  const [feedback, setFeedback] = useState<CardFeedback | null>(null);

  const requeuedCardIdsRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<SilentResponseTimer>(new SilentResponseTimer());

  const currentCard = queue[index];
  const todayStr = formatDateISO(new Date());

  // Direction et choix figés pour l'index courant afin d'éviter un remélange au re-rendu
  const activeStep = useMemo(() => {
    if (!currentCard) return null;
    const prevState =
      sm2States[currentCard.id] ??
      createInitialSM2State(currentCard.id, todayStr);
    const direction = getCardDirection(prevState);
    const choices = buildCardChoices(currentCard, direction, fallbackPool);
    return {
      card: currentCard,
      prevState,
      direction,
      choices,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, currentCard?.id]);

  // Préchargement audio discret de la carte active et de la suivante
  useEffect(() => {
    if (currentCard) {
      preloadAudioClip(currentCard.en);
      preloadAudioClip(currentCard.example);
    }
    const next = queue[index + 1];
    if (next) {
      preloadAudioClip(next.en);
    }
  }, [queue, index, currentCard]);

  // Chronomètre silencieux : réinitialisation à chaque carte et pause si onglet masqué
  useEffect(() => {
    timerRef.current.reset(Date.now());
    const handleVisibilityChange = () => {
      if (document.hidden) {
        timerRef.current.pause(Date.now());
      } else {
        timerRef.current.resume(Date.now());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [index]);

  const submitAnswer = useCallback(
    (selectedIndex: number | null, isDontKnow: boolean) => {
      if (!activeStep || feedback !== null) return;

      const elapsedMs = timerRef.current.getElapsedMs(Date.now());
      const isCorrect =
        !isDontKnow && selectedIndex === activeStep.choices.answerIndex;

      const result = classifyResponseToSM2({
        isCorrect,
        isDontKnow,
        responseTimeMs: elapsedMs,
        card: activeStep.card,
        direction: activeStep.direction,
        previousState: activeStep.prevState,
        todayStr,
      });

      onRateCard(activeStep.card.id, result.nextState);
      setReviewedCount((prev) => prev + 1);
      if (!isDontKnow) {
        setGenuineAnsweredCount((prev) => prev + 1);
      }

      // En cas d'erreur ou "Je ne sais pas", la carte revient une fois dans la séance
      if (
        (isDontKnow || !isCorrect) &&
        !requeuedCardIdsRef.current.has(activeStep.card.id)
      ) {
        requeuedCardIdsRef.current.add(activeStep.card.id);
        setQueue((prev) => [...prev, activeStep.card]);
      }

      setFeedback({
        selectedIndex,
        isCorrect,
        isDontKnow,
        result,
      });
    },
    [activeStep, feedback, onRateCard, todayStr]
  );

  const handleNext = useCallback(() => {
    setFeedback(null);
    setIndex((prev) => prev + 1);
  }, []);

  // Navigation clavier : touches 1-2-3 pour répondre, Entrée/Espace pour passer à la suite
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (!activeStep) return;

      if (feedback === null) {
        if (event.key === '1' || event.key === '2' || event.key === '3') {
          event.preventDefault();
          submitAnswer(Number(event.key) - 1, false);
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStep, feedback, submitAnswer, handleNext]);

  if (cards.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 text-center">
        <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-4">
          Aucune carte à réviser dans cette sélection.
        </p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#0F4C3A] text-white text-xs font-semibold cursor-pointer"
          >
            Retour
          </button>
        )}
      </div>
    );
  }

  if (index >= queue.length || !activeStep) {
    const ratio =
      cards.length > 0 ? Math.min(1, genuineAnsweredCount / cards.length) : 1;
    return (
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center justify-center mx-auto mb-4">
          <IconCheck className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#111827] dark:text-[#F3F4F6] mb-2">
          Série terminée
        </h3>
        <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-6">
          Vous avez pratiqué {reviewedCount} carte{reviewedCount > 1 ? 's' : ''}. Vos
          prochaines révisions ont été ajustées automatiquement.
        </p>
        <button
          type="button"
          onClick={() => onComplete(reviewedCount, ratio)}
          className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
        >
          Valider et continuer
        </button>
      </div>
    );
  }

  const { card, prevState, direction, choices } = activeStep;
  const isReverse = direction === 'fr-to-en';
  const showEnglishAudioBeforeAnswer = !isReverse;

  return (
    <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-4 sm:p-7 shadow-xs">
      {/* En-tête de séance */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-[#E4DFD3] dark:border-[#343F3B] text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] cursor-pointer"
              aria-label="Retour"
            >
              <IconArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]">
            {card.level}
          </span>
          <span className="text-xs font-semibold text-[#4B5563] dark:text-[#D1D5DB]">
            {index + 1} / {queue.length}
          </span>
        </div>
      </div>

      {/* Surface de la carte */}
      <div className="rounded-2xl border border-[#D5CFC2] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#191F1D] p-5 sm:p-7 flex flex-col justify-between gap-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
            Thème : {card.theme}
          </span>
          {(showEnglishAudioBeforeAnswer || feedback !== null) && (
            <button
              type="button"
              onClick={() => speakEnglish(card.en, 0.92)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-[#252D2A] border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] hover:bg-[#E6F0EC] dark:hover:bg-[#13362B] transition cursor-pointer"
            >
              <IconVolume className="w-4 h-4" />
              <span>Écouter le mot</span>
            </button>
          )}
        </div>

        <div className="text-center py-2">
          <span className="text-xs font-medium text-[#6B7280] dark:text-[#9CA3AF] block mb-1.5">
            {isReverse
              ? 'Choisissez le mot anglais correspondant'
              : 'Choisissez la bonne signification'}
          </span>
          <div className="text-2xl sm:text-3xl font-bold text-[#111827] dark:text-[#F3F4F6] tracking-tight">
            {choices.prompt}
          </div>
        </div>

        {/* Répétitions / Facilité discrets */}
        <div className="text-[11px] text-[#6B7280] dark:text-[#9CA3AF] flex items-center justify-between pt-2 border-t border-[#E4DFD3]/70 dark:border-[#343F3B]">
          <span>Répétitions : {prevState.repetitions}</span>
          <span>Facilité : {prevState.easeFactor.toFixed(2)}</span>
        </div>
      </div>

      {/* Choix multiples (3 options + Je ne sais pas) */}
      <div className="mt-4 space-y-2.5">
        {choices.options.map((option, optIdx) => {
          const isSelected = feedback?.selectedIndex === optIdx;
          const isCorrectOption = optIdx === choices.answerIndex;

          let optionStyle =
            'border-[#D5CFC2] dark:border-[#343F3B] bg-white dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] hover:border-[#0F4C3A] dark:hover:border-[#6EE7B7] hover:bg-[#FAF8F5] dark:hover:bg-[#2A332F]';

          if (feedback !== null) {
            if (isCorrectOption) {
              optionStyle =
                'border-[#0F4C3A] dark:border-[#34D399] bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]';
            } else if (isSelected && !feedback.isCorrect) {
              optionStyle =
                'border-[#C85A32] dark:border-[#F87171] bg-[#FDF1EC] dark:bg-[#3A1D16] text-[#9A3412] dark:text-[#FCA5A5]';
            } else {
              optionStyle =
                'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#191F1D] text-[#6B7280] dark:text-[#9CA3AF] opacity-70';
            }
          }

          return (
            <button
              key={`${index}-${optIdx}`}
              type="button"
              disabled={feedback !== null}
              onClick={() => submitAnswer(optIdx, false)}
              className={`w-full min-h-[54px] px-4 py-3.5 rounded-xl border text-left transition flex items-center justify-between gap-3 ${optionStyle} ${
                feedback === null ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[#FAF8F5] dark:bg-[#1E2422] border border-[#D5CFC2] dark:border-[#45534E] text-xs font-bold text-[#4B5563] dark:text-[#D1D5DB] flex items-center justify-center shrink-0">
                  {optIdx + 1}
                </span>
                <span className="text-sm sm:text-base font-semibold break-words">
                  {option}
                </span>
              </div>

              {feedback !== null && isCorrectOption && (
                <IconCheck className="w-5 h-5 shrink-0 text-[#0F4C3A] dark:text-[#6EE7B7]" />
              )}
              {feedback !== null && isSelected && !feedback.isCorrect && (
                <IconAlert className="w-5 h-5 shrink-0 text-[#C85A32] dark:text-[#FCA5A5]" />
              )}
            </button>
          );
        })}

        {feedback === null && (
          <button
            type="button"
            onClick={() => submitAnswer(null, true)}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-xl border border-dashed border-[#D5CFC2] dark:border-[#45534E] text-xs sm:text-sm font-semibold text-[#4B5563] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] transition cursor-pointer"
          >
            Je ne sais pas
          </button>
        )}
      </div>

      {/* Retour détaillé après réponse */}
      {feedback !== null && (
        <div className="mt-5 space-y-4">
          <div
            role="status"
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              feedback.isCorrect
                ? 'bg-[#E6F0EC] dark:bg-[#13362B] border-[#0F4C3A]/30 dark:border-[#34D399]/30 text-[#0F4C3A] dark:text-[#6EE7B7]'
                : 'bg-[#FDF1EC] dark:bg-[#3A1D16] border-[#C85A32]/40 dark:border-[#F87171]/30 text-[#9A3412] dark:text-[#FDBA74]'
            }`}
          >
            {feedback.isCorrect ? (
              <IconCheck className="w-5 h-5 shrink-0 mt-0.5" />
            ) : (
              <IconAlert className="w-5 h-5 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="font-bold">
                {feedback.isCorrect
                  ? 'Bonne réponse'
                  : feedback.isDontKnow
                    ? 'Pas de souci, à mémoriser'
                    : 'Réponse incorrecte'}
              </div>
              {!feedback.isCorrect && (
                <p>
                  Bonne réponse :{' '}
                  <strong className="font-bold">{choices.correctAnswer}</strong>
                </p>
              )}
              <p className="font-semibold">
                {formatReviewClassificationLabel(
                  feedback.result.rating,
                  feedback.result.nextState
                )}
              </p>
            </div>
          </div>

          {/* Phrase d'exemple et audio */}
          <div className="p-4 rounded-xl bg-[#FAF8F5] dark:bg-[#191F1D] border border-[#E4DFD3] dark:border-[#343F3B] space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF] block mb-1">
                  {card.en} — {card.fr}
                </span>
                <p className="text-sm font-semibold text-[#111827] dark:text-[#F3F4F6]">
                  “{card.example}”
                </p>
              </div>
              <button
                type="button"
                onClick={() => speakEnglish(card.example, 0.92)}
                className="p-2.5 rounded-xl bg-white dark:bg-[#252D2A] border border-[#D5CFC2] dark:border-[#45534E] text-[#0F4C3A] dark:text-[#6EE7B7] hover:bg-[#E6F0EC] dark:hover:bg-[#13362B] shrink-0 cursor-pointer"
                aria-label="Écouter la phrase d'exemple"
              >
                <IconVolume className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
              {card.exampleFr}
            </p>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full min-h-[52px] py-3.5 px-5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span>
              {index + 1 >= queue.length ? 'Voir le bilan' : 'Suivant'}
            </span>
            <IconArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
