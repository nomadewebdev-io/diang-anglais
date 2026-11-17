import React, { useEffect, useState } from 'react';
import {
  clearAudioStorageCache,
  estimateAudioStorageBytes,
  PLAYBACK_SPEED_OPTIONS,
  playAudio,
  VOICE_SAMPLE_TEXT,
  VOICES,
} from '../lib/audio';
import { formatDateISO } from '../lib/sm2';
import {
  parseImportedProgressJSON,
  serializeProgressJSON,
} from '../lib/storage';
import {
  AppState,
  PlaybackSpeed,
  ThemePreference,
  VoiceId,
} from '../lib/types';
import {
  IconAlert,
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconMonitor,
  IconMoon,
  IconSun,
  IconUpload,
  IconVolume,
} from './Icons';

interface SettingsViewProps {
  state: AppState;
  onChangeTheme: (theme: ThemePreference) => void;
  onChangeVoice?: (voiceId: VoiceId) => void;
  onChangePlaybackRate?: (rate: PlaybackSpeed) => void;
  onChangeDailyNewCardsLimit?: (limit: number) => void;
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
  onChangeVoice,
  onChangePlaybackRate,
  onChangeDailyNewCardsLimit,
  onImportState,
  onResetAll,
  onClose,
}: SettingsViewProps): React.ReactElement {
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<VoiceId | null>(null);
  const [audioBytes, setAudioBytes] = useState<number>(0);
  const [audioClearedMsg, setAudioClearedMsg] = useState<string | null>(null);

  useEffect(() => {
    void estimateAudioStorageBytes().then(setAudioBytes);
  }, []);

  const todayStr = formatDateISO(new Date());
  const selectedVoiceId: VoiceId = state.voiceId ?? 'aminata';
  const selectedPlaybackRate: PlaybackSpeed = state.playbackRate ?? 1;

  const handlePreviewVoice = async (voiceId: VoiceId) => {
    setPreviewingVoiceId(voiceId);
    try {
      await playAudio(VOICE_SAMPLE_TEXT, {
        voiceId,
        playbackRate: selectedPlaybackRate,
      });
    } finally {
      window.setTimeout(() => {
        setPreviewingVoiceId((prev) => (prev === voiceId ? null : prev));
      }, 900);
    }
  };

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
              Voix du professeur, apparence, sauvegarde JSON et gestion des données.
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

      {/* Section Voix du professeur */}
      <section
        aria-labelledby="voice-settings-heading"
        className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2
              id="voice-settings-heading"
              className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]"
            >
              Voix du professeur
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB] mt-0.5">
              Choisissez la voix anglaise utilisée pour les cartes, la dictée, les leçons et le test
              de niveau.
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7]">
            Voix de synthèse naturelle
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Sélection de la voix du professeur"
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {VOICES.map((voice) => {
            const isSelected = selectedVoiceId === voice.id;
            const isPreviewing = previewingVoiceId === voice.id;
            const genderLabel = voice.genre === 'femme' ? 'Femme' : 'Homme';

            return (
              <div
                key={voice.id}
                className={`p-4 rounded-xl border transition flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-[#0F4C3A] dark:border-[#6EE7B7] bg-[#E6F0EC]/70 dark:bg-[#13362B] ring-1 ring-[#0F4C3A] dark:ring-[#6EE7B7]'
                    : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Choisir la voix ${voice.prenom} (${genderLabel}, ${voice.accentLabel})`}
                    onClick={() => onChangeVoice?.(voice.id)}
                    className="text-left flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0F4C3A] rounded-lg cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]">
                        {voice.prenom}
                      </span>
                      {voice.id === 'aminata' && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/80 dark:bg-[#1E2422] text-[#4B5563] dark:text-[#D1D5DB] border border-[#E4DFD3] dark:border-[#343F3B]">
                          Par défaut
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-[#4B5563] dark:text-[#D1D5DB] mt-1">
                      {genderLabel} · {voice.accentLabel}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeVoice?.(voice.id)}
                    aria-label={`Sélectionner ${voice.prenom}`}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F4C3A] text-white'
                        : 'bg-white dark:bg-[#1E2422] text-[#374151] dark:text-[#D1D5DB] border border-[#D5CFC2] dark:border-[#45534E] hover:bg-[#F3EFE6] dark:hover:bg-[#2C3632]'
                    }`}
                  >
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1">
                        <IconCheck className="w-3.5 h-3.5" />
                        <span>Choisie</span>
                      </span>
                    ) : (
                      <span>Choisir</span>
                    )}
                  </button>
                </div>

                <div className="pt-2 border-t border-[#E4DFD3]/80 dark:border-[#343F3B] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handlePreviewVoice(voice.id)}
                    aria-label={`Écouter un exemple de la voix ${voice.prenom}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-[#1E2422] hover:bg-[#F3EFE6] dark:hover:bg-[#2C3632] border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#0F4C3A] dark:text-[#6EE7B7] transition cursor-pointer"
                  >
                    <IconVolume className="w-3.5 h-3.5" />
                    <span>
                      {isPreviewing ? 'Lecture en cours...' : 'Écouter un exemple'}
                    </span>
                  </button>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7280] dark:text-[#9CA3AF]">
                    {voice.locale}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Vitesse de lecture */}
        <div className="pt-3 border-t border-[#E4DFD3] dark:border-[#343F3B]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3
                id="playback-speed-label"
                className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]"
              >
                Vitesse de lecture
              </h3>
              <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
                Ajuste la cadence de prononciation sur tous les exercices audio.
              </p>
            </div>

            <div
              role="radiogroup"
              aria-labelledby="playback-speed-label"
              className="inline-flex rounded-xl p-1 bg-[#FAF8F5] dark:bg-[#252D2A] border border-[#E4DFD3] dark:border-[#343F3B] gap-1"
            >
              {PLAYBACK_SPEED_OPTIONS.map((opt) => {
                const isSelected = selectedPlaybackRate === opt.rate;
                return (
                  <button
                    key={opt.rate}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onChangePlaybackRate?.(opt.rate)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#0F4C3A] text-white'
                        : 'text-[#374151] dark:text-[#D1D5DB] hover:bg-white dark:hover:bg-[#1E2422]'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-[#E4DFD3] dark:border-[#343F3B] flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-[#111827] dark:text-[#F3F4F6]">
                Espace audio utilisé : {(audioBytes / (1024 * 1024)).toFixed(1)} Mo
              </div>
              {audioClearedMsg && (
                <div className="text-xs text-[#0F4C3A] dark:text-[#6EE7B7] mt-0.5">
                  {audioClearedMsg}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                void clearAudioStorageCache().then(() => {
                  setAudioBytes(0);
                  setAudioClearedMsg('Cache audio libéré.');
                });
              }}
              className="px-3.5 py-2 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#374151] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] cursor-pointer"
            >
              Libérer l’espace audio
            </button>
          </div>
        </div>
      </section>

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

      {/* Daily New Cards Soft Limit */}
      <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] mb-1">
              Plafond de nouvelles cartes SM-2 par jour
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] dark:text-[#D1D5DB]">
              Limite souple recommandée pour mémoriser durablement sans surcharge (20 par défaut).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[10, 20, 30, 50].map((val) => {
              const active = (state.dailyNewCardsLimit ?? 20) === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => onChangeDailyNewCardsLimit?.(val)}
                  aria-pressed={active}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#0F4C3A] text-white'
                      : 'border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-[#374151] dark:text-[#D1D5DB]'
                  }`}
                >
                  {val} / j
                </button>
              );
            })}
          </div>
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
