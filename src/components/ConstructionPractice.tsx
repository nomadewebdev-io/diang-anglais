import React, { useEffect, useMemo, useState } from 'react';
import { preloadAudioClip, speakEnglish } from '../lib/audio';
import {
  advanceConstructionQueue,
  buildShuffledTiles,
  ConstructionEvaluation,
  ConstructionQueueEntry,
  createConstructionQueue,
  evaluateConstruction,
  TileToken,
  UNIT_UNLOCK_THRESHOLD,
} from '../lib/construction';
import { ConstructionItem } from '../lib/types';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconRefresh,
  IconVolume,
} from './Icons';

interface ConstructionPracticeProps {
  items: ConstructionItem[];
  title: string;
  subtitle?: string;
  hasNextUnit?: boolean;
  onRecordItemSM2: (itemId: string, firstTrySuccess: boolean) => void;
  onComplete: (summary: {
    firstTryCorrect: number;
    total: number;
    percentage: number;
    answeredRatio: number;
  }) => void;
  onSkipToNextUnit?: () => void;
  onClose?: () => void;
}

type StepFeedback =
  | {
      kind: 'correct' | 'wrong' | 'dont_know';
      evaluation: ConstructionEvaluation;
    }
  | null;

export function ConstructionPractice({
  items,
  title,
  subtitle,
  hasNextUnit = false,
  onRecordItemSM2,
  onComplete,
  onSkipToNextUnit,
  onClose,
}: ConstructionPracticeProps): React.ReactElement {
  const [queue, setQueue] = useState<ConstructionQueueEntry[]>(() =>
    createConstructionQueue(items)
  );
  const [selectedTiles, setSelectedTiles] = useState<TileToken[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [feedback, setFeedback] = useState<StepFeedback>(null);
  const [firstTrySuccessIds, setFirstTrySuccessIds] = useState<string[]>([]);
  const [dontKnowIds, setDontKnowIds] = useState<string[]>([]);
  const [completedUniqueIds, setCompletedUniqueIds] = useState<string[]>([]);
  const [completionRecorded, setCompletionRecorded] = useState(false);

  const currentEntry = queue[0] ?? null;
  const currentItem = currentEntry?.item ?? null;
  const useTilesMode =
    currentItem !== null &&
    (currentItem.level === 'A1' || currentItem.level === 'A2');

  const availableTiles = useMemo(() => {
    if (!currentItem || !useTilesMode) return [];
    return buildShuffledTiles(currentItem.answers[0], currentItem.tiles ?? []);
  }, [currentItem?.id, queue.length, useTilesMode]);

  const selectedTileIds = useMemo(
    () => new Set(selectedTiles.map((t) => t.id)),
    [selectedTiles]
  );

  useEffect(() => {
    if (currentItem) {
      preloadAudioClip(currentItem.answers[0]);
    }
    const nextItem = queue[1]?.item;
    if (nextItem) {
      preloadAudioClip(nextItem.answers[0]);
    }
  }, [currentItem, queue]);

  const totalUnique = items.length;
  const firstTryCount = firstTrySuccessIds.length;
  const scorePercentage =
    totalUnique > 0 ? Math.round((firstTryCount / totalUnique) * 100) : 100;
  const answeredRatio =
    totalUnique > 0
      ? Math.max(0, (totalUnique - dontKnowIds.length) / totalUnique)
      : 1;

  useEffect(() => {
    if (queue.length === 0 && totalUnique > 0 && !completionRecorded) {
      setCompletionRecorded(true);
    }
  }, [queue.length, totalUnique, completionRecorded]);

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 text-center">
        <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
          Aucune phrase disponible pour cette unité.
        </p>
      </div>
    );
  }

  if (!currentEntry || !currentItem) {
    const unlockedNext = scorePercentage >= UNIT_UNLOCK_THRESHOLD;

    return (
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center justify-center mx-auto">
          <IconCheck className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
            Série terminée
          </h3>
          <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">
            Réussite du premier coup :{' '}
            <strong className="text-[#0F4C3A] dark:text-[#6EE7B7]">
              {firstTryCount} / {totalUnique} ({scorePercentage} %)
            </strong>
          </p>
        </div>

        <div
          className={`p-4 rounded-xl text-xs sm:text-sm leading-relaxed ${
            unlockedNext
              ? 'bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]'
              : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB] border border-[#E4DFD3] dark:border-[#343F3B]'
          }`}
        >
          {unlockedNext
            ? hasNextUnit
              ? 'Bravo ! Vous avez dépassé le seuil de 80 % et débloqué l’unité suivante.'
              : 'Bravo ! Toutes les phrases de cette unité sont maîtrisées et ajoutées à votre suivi SM-2.'
              : 'Bon entraînement ! Les phrases à consolider ont été programmées dans votre révision SM-2. Vous pouvez réessayer pour atteindre 80 % ou passer à la suite.'}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() =>
              onComplete({
                firstTryCorrect: firstTryCount,
                total: totalUnique,
                percentage: scorePercentage,
                answeredRatio,
              })
            }
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
          >
            Valider et continuer
          </button>

          {!unlockedNext && hasNextUnit && onSkipToNextUnit && (
            <button
              type="button"
              onClick={() => {
                onComplete({
                  firstTryCorrect: firstTryCount,
                  total: totalUnique,
                  percentage: scorePercentage,
                  answeredRatio,
                });
                onSkipToNextUnit();
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] text-sm font-semibold transition cursor-pointer"
            >
              Passer à la suite
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentUserText = useTilesMode
    ? selectedTiles.map((t) => t.text).join(' ')
    : typedAnswer;

  const playCorrectAudio = (text: string) => {
    const nextText = queue[1]?.item.answers[0];
    speakEnglish(text, undefined, { preloadNextText: nextText });
  };

  const handleSelectTile = (tile: TileToken) => {
    if (feedback) return;
    setSelectedTiles((prev) => [...prev, tile]);
  };

  const handleRemoveTile = (tileId: string) => {
    if (feedback) return;
    setSelectedTiles((prev) => prev.filter((t) => t.id !== tileId));
  };

  const handleClearTiles = () => {
    if (feedback) return;
    setSelectedTiles([]);
  };

  const handleCheck = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (feedback || !currentUserText.trim()) return;

    const evaluation = evaluateConstruction(currentUserText, currentItem.answers);
    setFeedback({
      kind: evaluation.isCorrect ? 'correct' : 'wrong',
      evaluation,
    });
    playCorrectAudio(currentItem.answers[0]);
  };

  const handleDontKnow = () => {
    if (feedback) return;
    setDontKnowIds((prev) =>
      prev.includes(currentItem.id) ? prev : [...prev, currentItem.id]
    );
    const evaluation = evaluateConstruction('', currentItem.answers);
    setFeedback({
      kind: 'dont_know',
      evaluation,
    });
    playCorrectAudio(currentItem.answers[0]);
  };

  const handleContinue = () => {
    if (!feedback) return;
    const wasCorrect = feedback.kind === 'correct';
    const { nextQueue, completedItem } = advanceConstructionQueue(queue, wasCorrect);

    if (completedItem) {
      if (!completedUniqueIds.includes(completedItem.item.id)) {
        setCompletedUniqueIds((prev) => [...prev, completedItem.item.id]);
      }
      if (completedItem.firstTrySuccess) {
        setFirstTrySuccessIds((prev) =>
          prev.includes(completedItem.item.id)
            ? prev
            : [...prev, completedItem.item.id]
        );
      }
      onRecordItemSM2(completedItem.item.id, completedItem.firstTrySuccess);
    }

    setQueue(nextQueue);
    setSelectedTiles([]);
    setTypedAnswer('');
    setFeedback(null);
  };

  const progressFraction =
    totalUnique > 0
      ? Math.min(100, Math.round((completedUniqueIds.length / totalUnique) * 100))
      : 0;

  return (
    <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-5 sm:p-7 shadow-xs">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-[#E4DFD3] dark:border-[#343F3B] text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] cursor-pointer shrink-0"
              aria-label="Retour"
            >
              <IconArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6] truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-xs text-[#6B7280] dark:text-[#9CA3AF] truncate">
                {subtitle}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {currentEntry.isRetry && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#FDF1EC] dark:bg-[#3A2018] text-[#9A3412] dark:text-[#FDBA8C]">
              À consolider
            </span>
          )}
          <span className="text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
            {Math.min(completedUniqueIds.length + 1, totalUnique)} / {totalUnique}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-[#E4DFD3] dark:bg-[#343F3B] rounded-full overflow-hidden mb-6">
        <div
          className="h-full bg-[#0F4C3A] dark:bg-[#6EE7B7] transition-all duration-300"
          style={{ width: `${progressFraction}%` }}
        />
      </div>

      {/* Prompt in French */}
      <div className="bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] rounded-xl p-4 sm:p-5 mb-5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
            Traduisez en anglais ({currentItem.level})
          </span>
          <span className="text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7]">
            {useTilesMode ? 'Touchez les mots' : 'Saisie libre'}
          </span>
        </div>
        <p className="text-lg sm:text-xl font-bold text-[#111827] dark:text-[#F3F4F6] leading-snug">
          {currentItem.promptFr}
        </p>
      </div>

      {/* Input Area: Tiles for A1-A2, Textarea/Input for B1-B2 */}
      {useTilesMode ? (
        <div className="space-y-4">
          {/* Selected Answer Zone */}
          <div
            aria-label="Votre phrase construite"
            className="min-h-[68px] p-3.5 rounded-xl border-2 border-dashed border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5]/70 dark:bg-[#191F1D] flex flex-wrap items-center gap-2"
          >
            {selectedTiles.length === 0 ? (
              <span className="text-xs sm:text-sm text-[#6B7280] dark:text-[#9CA3AF]">
                Touchez les mots ci-dessous dans le bon ordre...
              </span>
            ) : (
              selectedTiles.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  disabled={Boolean(feedback)}
                  onClick={() => handleRemoveTile(tile.id)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#0F4C3A] text-white text-sm font-semibold shadow-xs hover:bg-[#0A3628] transition cursor-pointer disabled:opacity-80"
                >
                  {tile.text}
                </button>
              ))
            )}
          </div>

          {/* Available Tile Bank */}
          <div className="flex flex-wrap gap-2">
            {availableTiles.map((tile) => {
              const isUsed = selectedTileIds.has(tile.id);
              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={isUsed || Boolean(feedback)}
                  onClick={() => handleSelectTile(tile)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-sm font-semibold transition ${
                    isUsed
                      ? 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#F3EFE6] dark:bg-[#252D2A] text-transparent select-none cursor-default'
                      : 'border-[#D5CFC2] dark:border-[#45534E] bg-white dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] hover:border-[#0F4C3A] dark:hover:border-[#6EE7B7] cursor-pointer'
                  }`}
                >
                  {tile.text}
                </button>
              );
            })}
          </div>

          {!feedback && selectedTiles.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClearTiles}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF] hover:text-[#111827] dark:hover:text-[#F3F4F6] cursor-pointer"
              >
                <IconRefresh className="w-3.5 h-3.5" />
                <span>Effacer</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleCheck} className="space-y-3">
          <label
            htmlFor="construction-free-input"
            className="block text-xs font-semibold text-[#4B5563] dark:text-[#D1D5DB]"
          >
            Écrivez la phrase en anglais :
          </label>
          <input
            id="construction-free-input"
            type="text"
            value={typedAnswer}
            onChange={(e) => setTypedAnswer(e.target.value)}
            disabled={Boolean(feedback)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Tapez votre phrase ici..."
            className="w-full px-4 py-3.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-sm sm:text-base text-[#111827] dark:text-[#F3F4F6] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
          />
        </form>
      )}

      {/* Feedback Panel */}
      {feedback && (
        <div
          role="status"
          className={`mt-5 p-4 rounded-xl border space-y-3 ${
            feedback.kind === 'correct'
              ? 'bg-[#E6F0EC] dark:bg-[#13362B] border-[#0F4C3A]/20 dark:border-[#6EE7B7]/30'
              : 'bg-[#FDF1EC] dark:bg-[#3A2018] border-[#C85A32]/30'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm font-bold ${
                feedback.kind === 'correct'
                  ? 'text-[#0F4C3A] dark:text-[#6EE7B7]'
                  : 'text-[#9A3412] dark:text-[#FDBA8C]'
              }`}
            >
              {feedback.kind === 'correct'
                ? 'Bravo ! Phrase correcte.'
                : feedback.kind === 'dont_know'
                ? 'Voici la phrase à retenir — elle reviendra tout à l’heure.'
                : 'Presque ! Regardez l’écart surligné ci-dessous — elle reviendra 2 fois.'}
            </span>
            <button
              type="button"
              onClick={() => playCorrectAudio(currentItem.answers[0])}
              aria-label="Réécouter la phrase correcte"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E2422] border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] cursor-pointer shrink-0"
            >
              <IconVolume className="w-3.5 h-3.5" />
              <span>Écouter</span>
            </button>
          </div>

          {/* Highlighted Expected Sentence */}
          <div className="p-3 rounded-lg bg-white/80 dark:bg-[#1E2422] text-sm sm:text-base font-medium leading-relaxed flex flex-wrap gap-1.5">
            {feedback.kind === 'correct' ? (
              <span className="text-[#0F4C3A] dark:text-[#6EE7B7] font-semibold">
                {feedback.evaluation.expected}
              </span>
            ) : (
              feedback.evaluation.expectedDiff.map((tok, i) => (
                <span
                  key={`${tok.word}-${i}`}
                  className={
                    tok.matched
                      ? 'text-[#111827] dark:text-[#F3F4F6]'
                      : 'px-1.5 py-0.5 rounded bg-[#FDE6D8] dark:bg-[#5C2B1B] text-[#9A3412] dark:text-[#FDBA8C] font-bold underline decoration-2'
                  }
                >
                  {tok.word}
                </span>
              ))
            )}
          </div>

          {currentItem.noteFr && (
            <p className="text-xs sm:text-sm text-[#374151] dark:text-[#E5E7EB] leading-relaxed">
              {currentItem.noteFr}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons (One-hand friendly at bottom) */}
      <div className="mt-6 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {!feedback ? (
          <>
            <button
              type="button"
              onClick={handleDontKnow}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-xs sm:text-sm font-semibold text-[#4B5563] dark:text-[#D1D5DB] hover:bg-[#F3EFE6] dark:hover:bg-[#2C3632] transition cursor-pointer"
            >
              Je ne sais pas
            </button>
            <button
              type="button"
              onClick={() => handleCheck()}
              disabled={!currentUserText.trim()}
              className="min-h-[48px] flex-1 sm:flex-none px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] disabled:opacity-45 text-white text-sm font-semibold transition cursor-pointer"
            >
              Vérifier
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleContinue}
            className="min-h-[48px] w-full sm:w-auto sm:ml-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
          >
            <span>Continuer</span>
            <IconArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
