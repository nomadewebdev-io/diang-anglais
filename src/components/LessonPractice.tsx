import React, { useState } from 'react';
import { speakEnglish } from '../lib/audio';
import { LessonItem } from '../lib/types';
import { IconArrowLeft, IconArrowRight, IconCheck, IconVolume } from './Icons';

interface LessonPracticeProps {
  lesson: LessonItem;
  onComplete: (scorePercentage: number) => void;
  onClose?: () => void;
}

export function LessonPractice({
  lesson,
  onComplete,
  onClose,
}: LessonPracticeProps): React.ReactElement {
  const [stage, setStage] = useState<'theory' | 'exercises' | 'done'>('theory');
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const currentExercise = lesson.exercises[exerciseIdx];

  const handleValidateExercise = () => {
    if (selectedOption === null || !currentExercise) return;
    if (selectedOption === currentExercise.answerIndex) {
      setCorrectCount((c) => c + 1);
    }
    setIsSubmitted(true);
  };

  const handleNextExercise = () => {
    setSelectedOption(null);
    setIsSubmitted(false);
    if (exerciseIdx + 1 < lesson.exercises.length) {
      setExerciseIdx((i) => i + 1);
    } else {
      setStage('done');
    }
  };

  if (stage === 'done') {
    const score =
      lesson.exercises.length > 0
        ? Math.round((correctCount / lesson.exercises.length) * 100)
        : 100;
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] text-[#0F4C3A] flex items-center justify-center mx-auto mb-4">
          <IconCheck className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#111827] mb-1">{lesson.title}</h3>
        <p className="text-sm text-[#4B5563] mb-6">
          Leçon terminée avec un score d’application de{' '}
          <strong className="text-[#0F4C3A]">{score} %</strong> ({correctCount}/
          {lesson.exercises.length}).
        </p>
        <button
          type="button"
          onClick={() => onComplete(score)}
          className="px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
        >
          Enregistrer et continuer
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-7 shadow-xs">
      <div className="flex items-center justify-between gap-2 mb-5">
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
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
            Grammaire {lesson.level}
          </span>
        </div>
        <span className="text-xs font-semibold text-[#4B5563]">
          {stage === 'theory'
            ? 'Explication et exemples'
            : `Exercice ${exerciseIdx + 1} / ${lesson.exercises.length}`}
        </span>
      </div>

      {stage === 'theory' ? (
        <div className="space-y-5">
          <h2 className="text-xl font-bold text-[#111827]">{lesson.title}</h2>
          <div className="p-4 sm:p-5 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] text-sm text-[#1F2937] leading-relaxed">
            {lesson.explanationFr}
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B7280] mb-3">
              Exemples en contexte
            </h3>
            <div className="space-y-2.5">
              {lesson.examples.map((ex, i) => (
                <div
                  key={i}
                  className="p-3.5 rounded-xl border border-[#E4DFD3] bg-white flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#111827]">{ex.en}</p>
                    <p className="text-xs text-[#4B5563] mt-0.5">{ex.fr}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakEnglish(ex.en, 0.92)}
                    className="p-2 rounded-lg bg-[#FAF8F5] text-[#0F4C3A] hover:bg-[#E6F0EC] shrink-0 cursor-pointer"
                    aria-label="Écouter l'exemple"
                  >
                    <IconVolume className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setStage('exercises')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
            >
              <span>Passer aux exercices d’application</span>
              <IconArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <h3 className="text-base sm:text-lg font-bold text-[#111827]">
            {currentExercise.prompt}
          </h3>
          <div className="space-y-2.5">
            {currentExercise.options.map((opt, idx) => {
              const isSelected = selectedOption === idx;
              const isAnswer = idx === currentExercise.answerIndex;
              let itemStyle = 'border-[#E4DFD3] bg-[#FAF8F5] text-[#111827]';

              if (isSubmitted) {
                if (isAnswer) {
                  itemStyle = 'border-[#0F4C3A] bg-[#E6F0EC] text-[#0F4C3A] font-semibold';
                } else if (isSelected) {
                  itemStyle = 'border-[#C85A32] bg-[#FDF1EC] text-[#9A3412]';
                }
              } else if (isSelected) {
                itemStyle =
                  'border-[#0F4C3A] bg-[#E6F0EC]/60 text-[#0F4C3A] font-semibold ring-1 ring-[#0F4C3A]';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isSubmitted}
                  onClick={() => setSelectedOption(idx)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border text-sm transition cursor-pointer ${itemStyle}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            {!isSubmitted ? (
              <button
                type="button"
                disabled={selectedOption === null}
                onClick={handleValidateExercise}
                className={`px-5 py-3 rounded-xl text-sm font-semibold transition ${
                  selectedOption !== null
                    ? 'bg-[#C85A32] hover:bg-[#B04B25] text-white cursor-pointer'
                    : 'bg-[#E4DFD3] text-[#9CA3AF] cursor-not-allowed'
                }`}
              >
                Vérifier
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNextExercise}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold cursor-pointer"
              >
                <span>Continuer</span>
                <IconArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
