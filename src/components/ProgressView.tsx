import React, { useState } from 'react';
import { getCatalogForMode } from '../lib/catalog';
import {
  ALL_SKILLS,
  getPlacementLockStatus,
  SKILL_LABELS_FR,
} from '../lib/placementTest';
import { calculateStrictStreak } from '../lib/progression';
import { formatDateISO } from '../lib/sm2';
import {
  parseImportedProgressJSON,
  serializeProgressJSON,
} from '../lib/storage';
import { AppState } from '../lib/types';
import {
  IconAlert,
  IconAward,
  IconCheck,
  IconDownload,
  IconFlame,
  IconRefresh,
  IconSettings,
  IconShield,
  IconUpload,
} from './Icons';
import { ParentGateModal } from './ParentGateModal';

interface ProgressViewProps {
  state: AppState;
  onImportState: (newState: AppState) => void;
  onRetakePlacementTest: () => void;
  onResetAll: () => void;
  onOpenSettings?: () => void;
}

export function ProgressView({
  state,
  onImportState,
  onRetakePlacementTest,
  onResetAll,
  onOpenSettings,
}: ProgressViewProps): React.ReactElement {
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showLockNotice, setShowLockNotice] = useState(false);
  const [isParentGateOpen, setIsParentGateOpen] = useState(false);
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);

  const catalog = getCatalogForMode(state.mode);
  const isChild = state.mode === 'child';

  const lockStatus = getPlacementLockStatus(state.placementResult);

  const todayStr = formatDateISO(new Date());
  const streak = calculateStrictStreak(state.dailyLogs, todayStr, state.studyDates);

  // SM-2 Card Mastery Stats
  const totalCards = catalog.cards.length;
  const sm2Entries = Object.values(state.sm2States);
  const masteredCards = sm2Entries.filter((s) => s.interval >= 7).length;
  const learningCards = sm2Entries.filter(
    (s) => s.repetitions > 0 && s.interval < 7
  ).length;
  const unseenCards = Math.max(0, totalCards - masteredCards - learningCards);

  const handleExportJSON = () => {
    const jsonString = serializeProgressJSON(state);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diang-anglais-progression-${todayStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const result = parseImportedProgressJSON(content, todayStr);
      if (result.ok) {
        onImportState(result.state);
        setImportFeedback({
          type: 'success',
          message: 'Progression restaurée avec succès depuis le fichier JSON.',
        });
      } else {
        setImportFeedback({
          type: 'error',
          message: result.error,
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Profile & Level Summary */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#0F4C3A] block mb-1">
              Tableau de progression · {state.profile?.firstName ?? 'Apprenant'}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
              Niveau actuel :{' '}
              <span className="text-[#0F4C3A]">
                {state.studyPlan?.config.currentLevel ??
                  state.placementResult?.determinedLevel ??
                  'A1'}
              </span>{' '}
              → Cible :{' '}
              <span className="text-[#C85A32]">
                {state.studyPlan?.config.targetLevel ?? 'A2'}
              </span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              if (lockStatus.isLocked) {
                setShowLockNotice(true);
              } else {
                onRetakePlacementTest();
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:bg-white dark:hover:bg-[#1E2422] text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] cursor-pointer"
          >
            <IconRefresh className="w-4 h-4" />
            <span>Refaire le test de niveau adaptatif</span>
          </button>
        </div>

        {showLockNotice && lockStatus.isLocked && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-[#FDF1EC] dark:bg-[#3A1D16] border border-[#C85A32]/40 text-xs sm:text-sm text-[#9A3412] dark:text-[#FDBA74] flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 flex-1">
              <IconAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{lockStatus.messageFr}</span>
            </div>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                <IconSettings className="w-4 h-4" />
                <span>Paramètres &gt; Réinitialiser mes données</span>
              </button>
            )}
          </div>
        )}

        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
            <div className="flex items-center justify-between text-xs text-[#6B7280] mb-1">
              <span>Série active</span>
              <IconFlame className="w-4 h-4 text-[#C85A32]" />
            </div>
            <div className="text-2xl font-bold text-[#111827]">
              {streak} {streak > 1 ? 'jours' : 'jour'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
            <div className="text-xs text-[#6B7280] mb-1">Temps total étudié</div>
            <div className="text-2xl font-bold text-[#111827]">
              {state.totalMinutesStudied} min
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
            <div className="text-xs text-[#6B7280] mb-1">Cartes SM-2 étudiées</div>
            <div className="text-2xl font-bold text-[#0F4C3A]">
              {masteredCards + learningCards} / {totalCards}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
            <div className="text-xs text-[#6B7280] mb-1">Expérience &amp; Activités</div>
            <div className="text-2xl font-bold text-[#111827]">
              {state.xp} XP
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">
              {state.dictationCompletedCount + state.quizzesCompletedCount} dictées &amp; quiz
            </div>
          </div>
        </div>
      </div>

      {/* Skills Profile & SM-2 Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7 bg-white border border-[#E4DFD3] rounded-2xl p-6">
          <h2 className="text-base font-bold text-[#111827] mb-4">
            Profil par compétence (Test de niveau CECRL)
          </h2>
          {state.placementResult ? (
            <div className="space-y-4">
              {ALL_SKILLS.map((skill) => {
                const perf = state.placementResult!.skillScores[skill];
                const isWeak = state.placementResult!.weaknesses.includes(skill);
                return (
                  <div key={skill}>
                    <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                      <span className="text-[#111827]">
                        {SKILL_LABELS_FR[skill]}
                        {isWeak && (
                          <span className="ml-2 px-2 py-0.5 rounded-md bg-[#FDF1EC] text-[#9A3412] text-[10px]">
                            Priorité renforcée
                          </span>
                        )}
                      </span>
                      <span className="font-bold text-[#0F4C3A]">{perf.percentage} %</span>
                    </div>
                    <div className="w-full h-2.5 bg-[#F3EFE6] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${isWeak ? 'bg-[#C85A32]' : 'bg-[#0F4C3A]'}`}
                        style={{ width: `${perf.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#6B7280]">
              Passez le test de niveau pour afficher votre diagnostic détaillé par compétence.
            </p>
          )}
        </div>

        <div className="md:col-span-5 bg-white border border-[#E4DFD3] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-[#111827] mb-4">
              Mémorisation espacée (SM-2)
            </h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#E6F0EC]/60 border border-[#0F4C3A]/20">
                <span className="font-semibold text-[#0F4C3A]">
                  Maîtrisées (intervalle ≥ 7 j)
                </span>
                <span className="font-bold text-sm text-[#0F4C3A]">{masteredCards}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FDF1EC] border border-[#C85A32]/30">
                <span className="font-semibold text-[#9A3412]">
                  En cours de consolidation
                </span>
                <span className="font-bold text-sm text-[#9A3412]">{learningCards}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3]">
                <span className="font-semibold text-[#4B5563]">
                  Nouvelles cartes à découvrir
                </span>
                <span className="font-bold text-sm text-[#111827]">{unseenCards}</span>
              </div>
            </div>
          </div>

          {state.studyPlan?.finalTest && (
            <div className="mt-4 pt-4 border-t border-[#E4DFD3] flex items-center gap-2 text-xs text-[#0F4C3A] font-semibold">
              <IconAward className="w-4 h-4" />
              <span>
                Test final : {state.studyPlan.finalTest.score} % (
                {state.studyPlan.finalTest.passed ? 'Validé' : 'Non validé'})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Export / Import JSON Section */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6">
        <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
          Sauvegarde et portabilité (Export / Import JSON)
        </h2>
        {isChild && !isParentUnlocked ? (
          <div className="space-y-3 mt-2">
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB]">
              L’export, l’import et la réinitialisation sont protégés par l’espace parent.
            </p>
            <button
              type="button"
              onClick={() => setIsParentGateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
            >
              <IconShield className="w-4 h-4" />
              <span>Accéder à l’espace parent</span>
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-4">
              Vos données sont enregistrées hors-ligne sur cet appareil (localStorage). Exportez un
              fichier JSON pour conserver une copie ou transférer votre progression.
            </p>

            {importFeedback && (
              <div
                className={`mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  importFeedback.type === 'success'
                    ? 'bg-[#E6F0EC] text-[#0F4C3A]'
                    : 'bg-[#FDF1EC] text-[#9A3412]'
                }`}
              >
                <IconCheck className="w-4 h-4 shrink-0" />
                <span>{importFeedback.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleExportJSON}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold transition cursor-pointer"
              >
                <IconDownload className="w-4 h-4" />
                <span>Exporter ma progression (.json)</span>
              </button>

              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D5CFC2] bg-[#FAF8F5] hover:bg-white text-[#111827] text-xs font-semibold transition cursor-pointer">
                <IconUpload className="w-4 h-4" />
                <span>Importer un fichier JSON</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJSON}
                  className="sr-only"
                />
              </label>

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="ml-auto text-xs font-medium text-[#6B7280] hover:text-[#9A3412] underline cursor-pointer"
                >
                  Réinitialiser toutes les données
                </button>
              ) : (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-[#9A3412] font-semibold">
                    Confirmer la remise à zéro ?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onResetAll();
                      setConfirmReset(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#C85A32] text-white text-xs font-semibold cursor-pointer"
                  >
                    Oui, effacer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-1.5 rounded-lg border border-[#D5CFC2] text-xs font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isParentGateOpen && (
        <ParentGateModal
          onSuccess={() => {
            setIsParentUnlocked(true);
            setIsParentGateOpen(false);
          }}
          onCancel={() => setIsParentGateOpen(false)}
        />
      )}
    </div>
  );
}
