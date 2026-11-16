import React, { useState } from 'react';
import {
  generateParentChallenge,
  ParentChallenge,
  verifyParentChallenge,
} from '../lib/parentGate';
import { IconAlert, IconShield } from './Icons';

interface ParentGateModalProps {
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ParentGateModal({
  title = 'Espace parent',
  onSuccess,
  onCancel,
}: ParentGateModalProps): React.ReactElement {
  const [challenge, setChallenge] = useState<ParentChallenge>(() =>
    generateParentChallenge()
  );
  const [answerInput, setAnswerInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyParentChallenge(challenge, answerInput)) {
      onSuccess();
      return;
    }
    setErrorMsg('Ce résultat est incorrect. Voici un nouveau calcul.');
    setAnswerInput('');
    setChallenge(generateParentChallenge());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="parent-gate-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] p-6 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center justify-center shrink-0">
            <IconShield className="w-5 h-5" />
          </div>
          <div>
            <h2
              id="parent-gate-title"
              className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]"
            >
              {title}
            </h2>
            <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
              Vérification réservée aux parents
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-xl bg-[#FAF8F5] dark:bg-[#191F1D] border border-[#E4DFD3] dark:border-[#343F3B] text-center">
            <label
              htmlFor="parent-gate-input"
              className="block text-sm font-semibold text-[#374151] dark:text-[#D1D5DB] mb-2"
            >
              {challenge.questionFr}
            </label>
            <input
              id="parent-gate-input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={answerInput}
              onChange={(e) => {
                setAnswerInput(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="Réponse"
              className="w-32 mx-auto text-center px-3 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-white dark:bg-[#252D2A] text-lg font-bold text-[#111827] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
            />
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="flex items-center gap-2 text-xs text-[#9A3412] dark:text-[#FCA5A5] bg-[#FDF1EC] dark:bg-[#3A1D16] p-3 rounded-xl border border-[#C85A32]/30"
            >
              <IconAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 py-3 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
            >
              Continuer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
