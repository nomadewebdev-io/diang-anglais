import React, { useState } from 'react';
import { formatDateISO } from '../lib/sm2';
import {
  parseImportedProgressJSON,
  serializeProgressJSON,
} from '../lib/storage';
import { AppState, ThemePreference } from '../lib/types';
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconMonitor,
  IconMoon,
  IconSun,
  IconUpload,
} from './Icons';

interface SettingsViewProps {
  state: AppState;
  onChangeTheme: (theme: ThemePreference) => void;
  onImportState: (newState: AppState) => void;
  onResetAll: () => void;
  onClose: () => void;
}

const THEME_OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'light',
    label: 'Clair',
    description: 'Fond sable doux et contrastes sombres pour la journée.',
    icon: IconSun,
  },
  {
    id: 'dark',
    label: 'Sombre',
    description: 'Fond ardoise foncé reposant pour les yeux en soirée.',
    icon: IconMoon,
  },
  {
    id: 'system',
    label: 'Système',
    description: 'Suit automatiquement le réglage de votre appareil (par défaut).',
    icon: IconMonitor,
  },
];

export function SettingsView({
  state,
  onChangeTheme,
  onImportState,
  onResetAll,
  onClose,
}: SettingsViewProps): React.ReactElement {
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const todayStr = formatDateISO(new Date());

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
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header row */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-5 sm:p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] hover:opacity-90 transition cursor-pointer"
            aria-label="Fermer les paramètres"
          >
            <IconArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#111827] dark:text-[#F3F4F6]">
              Paramètres
            </h1>
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB]">
              Apparence, sauvegarde JSON et gestion de vos données locales.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold transition cursor-pointer"
        >
          Retour
        </button>
      </div>

      {/* Theme Selection */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6">
        <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
          Thème d’affichage
        </h2>
        <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-4">
          Choisissez le mode visuel de l’application. Le mode « Système » s’adapte en direct au
          réglage de votre appareil.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = state.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeTheme(opt.id)}
                aria-pressed={isSelected}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
                  isSelected
                    ? 'border-[#0F4C3A] dark:border-[#6EE7B7] bg-[#E6F0EC] dark:bg-[#13362B] ring-1 ring-[#0F4C3A] dark:ring-[#6EE7B7]'
                    : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:bg-white dark:hover:bg-[#2C3632]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`p-2 rounded-lg ${
                      isSelected
                        ? 'bg-[#0F4C3A] text-white'
                        : 'bg-[#E4DFD3]/70 dark:bg-[#343F3B] text-[#374151] dark:text-[#D1D5DB]'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </span>
                  {isSelected && (
                    <span className="text-xs font-bold text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center gap-1">
                      <IconCheck className="w-3.5 h-3.5" />
                      <span>Actif</span>
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
                    {opt.label}
                  </div>
                  <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB] mt-0.5 leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Export / Import JSON */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6">
        <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
          Sauvegarde et restauration (JSON)
        </h2>
        <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-4">
          Votre progression est stockée automatiquement sous la clé versionnée{' '}
          <code className="px-1.5 py-0.5 rounded bg-[#FAF8F5] dark:bg-[#252D2A] text-xs">
            diang-anglais:v1
          </code>
          . Vous pouvez exporter ou importer une sauvegarde complète au format JSON.
        </p>

        {importFeedback && (
          <div
            role="status"
            className={`mb-4 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              importFeedback.type === 'success'
                ? 'bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]'
                : 'bg-[#FDF1EC] dark:bg-[#3A2018] text-[#9A3412] dark:text-[#FDBA8C]'
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

          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#111827] dark:text-[#F3F4F6] text-xs font-semibold transition cursor-pointer">
            <IconUpload className="w-4 h-4" />
            <span>Importer un fichier JSON</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportJSON}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {/* Reset All Data with Confirmation */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-[#FDF1EC] dark:bg-[#3A2018] text-[#C85A32] dark:text-[#FDBA8C] shrink-0">
            <IconAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
              Réinitialiser mes données
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mb-4">
              Cette action efface votre profil, votre programme hebdomadaire et vos statistiques
              SM-2 sur cet appareil pour repartir de l’accueil.
            </p>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="px-4 py-2.5 rounded-xl border border-[#C85A32] text-[#9A3412] dark:text-[#FDBA8C] bg-[#FDF1EC] dark:bg-[#3A2018] text-xs font-semibold transition cursor-pointer"
              >
                Réinitialiser mes données
              </button>
            ) : (
              <div className="p-4 rounded-xl bg-[#FDF1EC] dark:bg-[#3A2018] border border-[#C85A32]/40 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#9A3412] dark:text-[#FDBA8C]">
                  Confirmez-vous la suppression définitive de votre progression locale ?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetAll();
                      setConfirmReset(false);
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-lg bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs font-semibold cursor-pointer"
                  >
                    Confirmer la réinitialisation
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#252D2A] border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#111827] dark:text-[#F3F4F6] cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
