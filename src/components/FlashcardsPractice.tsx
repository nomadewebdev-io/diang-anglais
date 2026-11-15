import React, { useEffect, useState } from 'react';
import { preloadAudioClip, speakEnglish } from '../lib/audio';
import {
  calculateNextSM2State,
  createInitialSM2State,
  formatDateISO,
} from '../lib/sm2';
import { FlashcardItem, SM2CardState, SM2Rating } from '../lib/types';
import { IconArrowLeft, IconCheck, IconVolume } from './Icons';

interface FlashcardsPracticeProps {
  cards: FlashcardItem[];
  sm2States: Record<string, SM2CardState>;
  title?: string;
  onRateCard: (cardId: string, updatedState: SM2CardState) => void;
  onComplete: (reviewedCount: number) => void;
  onClose?: () => void;
}

const RATING_BUTTONS: Array<{
  rating: SM2Rating;
  label: string;
  hint: string;
  style: string;
}> = [
  {
    rating: 'again',
    label: 'À revoir',
    hint: '< 1 j',
    style: 'border-[#C85A32]/40 bg-[#FDF1EC] text-[#9A3412] hover:bg-[#FCE4DA]',
  },
  {
    rating: 'hard',
    label: 'Difficile',
    hint: 'Court',
    style: 'border-[#D5CFC2] bg-[#FAF8F5] text-[#374151] hover:bg-[#F3EFE6]',
  },
  {
    rating: 'good',
    label: 'Bien',
    hint: 'Normal',
    style: 'border-[#0F4C3A]/30 bg-[#E6F0EC] text-[#0F4C3A] hover:bg-[#D5E6DF]',
  },
  {
    rating: 'easy',
    label: 'Facile',
    hint: 'Espacé',
    style: 'border-[#0F4C3A] bg-[#0F4C3A] text-white hover:bg-[#0A3628]',
  },
];

export function FlashcardsPractice({
  cards,
  sm2States,
  title = 'Cartes mémoire (SM-2)',
  onRateCard,
  onComplete,
  onClose,
}: FlashcardsPracticeProps): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    const active = cards[index];
    if (active) {
      preloadAudioClip(active.en);
      preloadAudioClip(active.example);
    }
    const next = cards[index + 1];
    if (next) {
      preloadAudioClip(next.en);
    }
  }, [cards, index]);

  if (cards.length === 0) {
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 text-center">
        <p className="text-sm text-[#4B5563] mb-4">
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

  if (index >= cards.length) {
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] text-[#0F4C3A] flex items-center justify-center mx-auto mb-4">
          <IconCheck className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#111827] mb-2">
          Série SM-2 terminée
        </h3>
        <p className="text-sm text-[#4B5563] mb-6">
          Vous avez évalué {reviewedCount} carte{reviewedCount > 1 ? 's' : ''}. Les intervalles de
          révision ont été mis à jour.
        </p>
        <button
          type="button"
          onClick={() => onComplete(reviewedCount)}
          className="px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
        >
          Valider et continuer
        </button>
      </div>
    );
  }

  const currentCard = cards[index];
  const todayStr = formatDateISO(new Date());
  const currentState =
    sm2States[currentCard.id] ?? createInitialSM2State(currentCard.id, todayStr);

  const handleSelectRating = (rating: SM2Rating) => {
    const nextState = calculateNextSM2State(currentState, rating, todayStr);
    onRateCard(currentCard.id, nextState);
    setReviewedCount((prev) => prev + 1);
    setIsFlipped(false);
    setIndex((prev) => prev + 1);
  };

  return (
    <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-7 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-[#E4DFD3] text-[#374151] hover:bg-[#FAF8F5] cursor-pointer"
              aria-label="Retour"
            >
              <IconArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm font-bold text-[#111827]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
            {currentCard.level}
          </span>
          <span className="text-xs font-semibold text-[#4B5563]">
            {index + 1} / {cards.length}
          </span>
        </div>
      </div>

      {/* Card Surface */}
      <div className="rounded-2xl border border-[#D5CFC2] bg-[#FAF8F5] p-6 sm:p-8 min-h-[240px] flex flex-col justify-between">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280]">
            Thème : {currentCard.theme}
          </span>
          <button
            type="button"
            onClick={() => speakEnglish(currentCard.en, 0.92)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#D5CFC2] text-xs font-semibold text-[#0F4C3A] hover:bg-[#E6F0EC] transition cursor-pointer"
          >
            <IconVolume className="w-4 h-4" />
            <span>Écouter le mot</span>
          </button>
        </div>

        <div className="my-6 text-center">
          <div className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2">
            {currentCard.en}
          </div>
          {!isFlipped ? (
            <p className="text-xs text-[#6B7280]">
              Prononcez ou traduisez mentalement avant de retourner la carte.
            </p>
          ) : (
            <div className="mt-4 pt-4 border-t border-[#E4DFD3] space-y-3 text-left">
              <div>
                <span className="text-xs font-semibold text-[#6B7280] block">
                  Traduction française
                </span>
                <span className="text-lg font-bold text-[#0F4C3A]">
                  {currentCard.fr}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-white border border-[#E4DFD3]">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-[#111827]">
                    “{currentCard.example}”
                  </p>
                  <button
                    type="button"
                    onClick={() => speakEnglish(currentCard.example, 0.92)}
                    className="p-1.5 rounded-lg bg-[#FAF8F5] text-[#0F4C3A] hover:bg-[#E6F0EC] shrink-0 cursor-pointer"
                    aria-label="Écouter la phrase d'exemple"
                  >
                    <IconVolume className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-[#4B5563]">{currentCard.exampleFr}</p>
              </div>
            </div>
          )}
        </div>

        <div className="text-xs text-[#6B7280] flex items-center justify-between">
          <span>Répétitions : {currentState.repetitions}</span>
          <span>Facilité : {currentState.easeFactor.toFixed(2)}</span>
        </div>
      </div>

      {/* Action Controls */}
      <div className="mt-5">
        {!isFlipped ? (
          <button
            type="button"
            onClick={() => setIsFlipped(true)}
            className="w-full py-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white font-semibold text-sm transition cursor-pointer"
          >
            Afficher la réponse
          </button>
        ) : (
          <div>
            <p className="text-xs font-semibold text-[#4B5563] mb-2.5 text-center">
              Comment avez-vous trouvé cette carte ? (Planification SM-2)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {RATING_BUTTONS.map((btn) => (
                <button
                  key={btn.rating}
                  type="button"
                  onClick={() => handleSelectRating(btn.rating)}
                  className={`py-3 px-3 rounded-xl border text-center transition cursor-pointer ${btn.style}`}
                >
                  <div className="text-sm font-bold">{btn.label}</div>
                  <div className="text-[11px] opacity-80">{btn.hint}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
