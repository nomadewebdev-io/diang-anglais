import React, { useEffect, useState } from 'react';
import { preloadAudioClip, speakEnglish } from '../lib/audio';
import { DictationEvaluation, evaluateDictation } from '../lib/dictation';
import { SentenceItem } from '../lib/types';
import { IconArrowLeft, IconArrowRight, IconCheck, IconVolume } from './Icons';

interface DictationPracticeProps {
  sentences: SentenceItem[];
  title?: string;
  onComplete: (averageAccuracy: number) => void;
  onClose?: () => void;
}

export function DictationPractice({
  sentences,
  title = 'Mode Dictée (audio en-US)',
  onComplete,
  onClose,
}: DictationPracticeProps): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [evaluation, setEvaluation] = useState<DictationEvaluation | null>(null);
  const [scores, setScores] = useState<number[]>([]);

  useEffect(() => {
    const active = sentences[index];
    if (active) {
      preloadAudioClip(active.en);
    }
    const next = sentences[index + 1];
    if (next) {
      preloadAudioClip(next.en);
    }
  }, [sentences, index]);

  if (sentences.length === 0) {
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 text-center">
        <p className="text-sm text-[#4B5563]">Aucune phrase disponible pour la dictée.</p>
      </div>
    );
  }

  if (index >= sentences.length) {
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 100;
    return (
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#E6F0EC] text-[#0F4C3A] flex items-center justify-center mx-auto mb-4">
          <IconCheck className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-bold text-[#111827] mb-1">Dictée terminée</h3>
        <p className="text-sm text-[#4B5563] mb-6">
          Précision moyenne sur cette série :{' '}
          <strong className="text-[#0F4C3A]">{avg} %</strong>
        </p>
        <button
          type="button"
          onClick={() => onComplete(avg)}
          className="px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
        >
          Valider et continuer
        </button>
      </div>
    );
  }

  const currentSentence = sentences[index];

  const handleCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typedText.trim()) return;
    const result = evaluateDictation(currentSentence.en, typedText);
    setEvaluation(result);
    setScores((prev) => [...prev, result.accuracyPercentage]);
  };

  const handleNext = () => {
    setTypedText('');
    setEvaluation(null);
    setIndex((i) => i + 1);
  };

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
          <span className="text-sm font-bold text-[#111827]">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
            {currentSentence.level}
          </span>
          <span className="text-xs font-semibold text-[#4B5563]">
            Phrase {index + 1} / {sentences.length}
          </span>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#E4DFD3] mb-5">
        <p className="text-xs font-semibold text-[#4B5563] mb-3">
          Écoutez attentivement la phrase puis saisissez-la en anglais :
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => speakEnglish(currentSentence.en, 0.94)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold transition cursor-pointer"
          >
            <IconVolume className="w-4 h-4" />
            <span>Écouter la phrase</span>
          </button>
          <button
            type="button"
            onClick={() => speakEnglish(currentSentence.en, 0.7)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white hover:bg-[#F3EFE6] text-[#111827] border border-[#D5CFC2] text-xs font-semibold transition cursor-pointer"
          >
            <span>Débit lent (0.70x)</span>
          </button>
        </div>
        <p className="text-xs text-[#6B7280] mt-3">
          Indice (sens en français) : « {currentSentence.fr} »
        </p>
      </div>

      <form onSubmit={handleCheck} className="space-y-4">
        <div>
          <label
            htmlFor="dictation-input"
            className="block text-xs font-semibold text-[#111827] mb-1.5"
          >
            Votre transcription en anglais
          </label>
          <textarea
            id="dictation-input"
            rows={2}
            disabled={evaluation !== null}
            value={typedText}
            onChange={(e) => setTypedText(e.target.value)}
            placeholder="Tapez ici la phrase entendue..."
            className="w-full px-4 py-3 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] text-[#111827] text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C3A] focus:bg-white"
          />
        </div>

        {!evaluation ? (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!typedText.trim()}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition ${
                typedText.trim()
                  ? 'bg-[#C85A32] hover:bg-[#B04B25] text-white cursor-pointer'
                  : 'bg-[#E4DFD3] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              Vérifier mot par mot
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#374151]">
                  Correction mot par mot
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    evaluation.accuracyPercentage >= 80
                      ? 'bg-[#E6F0EC] text-[#0F4C3A]'
                      : 'bg-[#FDF1EC] text-[#9A3412]'
                  }`}
                >
                  Précision : {evaluation.accuracyPercentage} % ({evaluation.correctCount}/
                  {evaluation.totalExpected} mots)
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {evaluation.words.map((w, i) => (
                  <div
                    key={i}
                    className={`px-3 py-2 rounded-lg border text-xs ${
                      w.isCorrect
                        ? 'bg-[#E6F0EC] border-[#0F4C3A]/30 text-[#0F4C3A]'
                        : 'bg-[#FDF1EC] border-[#C85A32]/40 text-[#9A3412]'
                    }`}
                  >
                    <div className="font-bold">{w.expectedWord}</div>
                    {!w.isCorrect && (
                      <div className="text-[11px] line-through opacity-80 mt-0.5">
                        {w.typedWord || '(omis)'}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-[#E4DFD3] text-xs text-[#4B5563]">
                Phrase attendue : <strong className="text-[#111827]">{currentSentence.en}</strong>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-sm font-semibold cursor-pointer"
              >
                <span>
                  {index + 1 === sentences.length ? 'Voir le bilan' : 'Phrase suivante'}
                </span>
                <IconArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
