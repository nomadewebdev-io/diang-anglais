import React, { useState } from 'react';
import { speakEnglish } from '../lib/audio';
import { SKILL_LABELS_FR } from '../lib/placementTest';
import { PlacementQuestion } from '../lib/types';
import { IconArrowLeft, IconArrowRight, IconCheck, IconVolume } from './Icons';

interface QuizPracticeProps {
  questions: PlacementQuestion[];
  title?: string;
  subtitle?: string;
  passingScore?: number;
  onComplete: (result: { scorePercentage: number; correct: number; total: number; passed: boolean }) => void;
  onClose?: () => void;
}

export function QuizPractice({
  questions,
  title = 'Quiz QCM',
  subtitle,
  passingScore = 70,
  onComplete,
  onClose,
}: QuizPracticeProps): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  if (questions.length === 0) {
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 text-center">
        <p className="text-sm text-[#4B5563]">Aucune question disponible.</p>
      </div>
    );
  }

  if (index >= questions.length) {
    const scorePercentage = Math.round((correctCount / questions.length) * 100);
    const passed = scorePercentage >= passingScore;

    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 text-center">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            passed ? 'bg-[#E6F0EC] text-[#0F4C3A]' : 'bg-[#FDF1EC] text-[#C85A32]'
          }`}
        >
          <IconCheck className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#111827] mb-1">{title} terminé</h3>
        <p className="text-sm text-[#4B5563] mb-2">
          Score obtenu : <strong className="text-[#0F4C3A]">{scorePercentage} %</strong> (
          {correctCount} / {questions.length} bonnes réponses)
        </p>
        <p className="text-xs text-[#6B7280] mb-6">
          {passed
            ? `Objectif atteint (seuil fixé à ${passingScore} %).`
            : `Seuil de validation fixé à ${passingScore} %. Vous pourrez retenter ce test après quelques révisions.`}
        </p>
        <button
          type="button"
          onClick={() =>
            onComplete({
              scorePercentage,
              correct: correctCount,
              total: questions.length,
              passed,
            })
          }
          className="px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
        >
          Enregistrer ce résultat
        </button>
      </div>
    );
  }

  const currentQ = questions[index];

  const handleValidate = () => {
    if (selectedOption === null) return;
    if (selectedOption === currentQ.answerIndex) {
      setCorrectCount((c) => c + 1);
    }
    setIsSubmitted(true);
  };

  const handleNext = () => {
    setSelectedOption(null);
    setIsSubmitted(false);
    setIndex((i) => i + 1);
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
          <div>
            <span className="text-sm font-bold text-[#111827] block">{title}</span>
            {subtitle && <span className="text-xs text-[#6B7280]">{subtitle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#FAF8F5] border border-[#E4DFD3] text-[#374151]">
            {SKILL_LABELS_FR[currentQ.skill]} · {currentQ.level}
          </span>
          <span className="text-xs font-semibold text-[#4B5563]">
            {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <h3 className="text-base sm:text-lg font-bold text-[#111827] mb-4 leading-snug">
        {currentQ.prompt}
      </h3>

      {currentQ.audioText && (
        <div className="mb-5 p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => speakEnglish(currentQ.audioText ?? '', 0.94)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
          >
            <IconVolume className="w-4 h-4" />
            <span>Écouter l’audio (en-US)</span>
          </button>
          <button
            type="button"
            onClick={() => speakEnglish(currentQ.audioText ?? '', 0.72)}
            className="px-3 py-2 rounded-xl bg-white border border-[#D5CFC2] text-xs font-semibold text-[#111827] hover:bg-[#F3EFE6] cursor-pointer"
          >
            Écoute lente
          </button>
        </div>
      )}

      <div className="space-y-2.5 mb-5">
        {currentQ.options.map((opt, idx) => {
          const isSelected = selectedOption === idx;
          const isAnswer = idx === currentQ.answerIndex;
          let style = 'border-[#E4DFD3] bg-[#FAF8F5] text-[#111827]';

          if (isSubmitted) {
            if (isAnswer) {
              style = 'border-[#0F4C3A] bg-[#E6F0EC] text-[#0F4C3A] font-semibold';
            } else if (isSelected) {
              style = 'border-[#C85A32] bg-[#FDF1EC] text-[#9A3412]';
            }
          } else if (isSelected) {
            style =
              'border-[#0F4C3A] bg-[#E6F0EC]/60 text-[#0F4C3A] font-semibold ring-1 ring-[#0F4C3A]';
          }

          return (
            <button
              key={idx}
              type="button"
              disabled={isSubmitted}
              onClick={() => setSelectedOption(idx)}
              className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition cursor-pointer ${style}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      <div className="flex justify-end">
        {!isSubmitted ? (
          <button
            type="button"
            disabled={selectedOption === null}
            onClick={handleValidate}
            className={`px-6 py-3 rounded-xl text-sm font-semibold transition ${
              selectedOption !== null
                ? 'bg-[#C85A32] hover:bg-[#B04B25] text-white cursor-pointer'
                : 'bg-[#E4DFD3] text-[#9CA3AF] cursor-not-allowed'
            }`}
          >
            Valider
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold cursor-pointer"
          >
            <span>{index + 1 === questions.length ? 'Terminer' : 'Question suivante'}</span>
            <IconArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
