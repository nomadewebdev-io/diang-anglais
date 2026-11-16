import React, { useState } from 'react';
import { MAX_LOCAL_PROFILES } from '../lib/storage';
import { LocalProfileRecord, ProfileMode } from '../lib/types';
import { IconArrowRight, IconCheck, IconPlus, IconShield } from './Icons';

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

interface ProfileCreationFormProps {
  title?: string;
  subtitle?: string;
  onCreate: (name: string, mode: ProfileMode) => void;
  onCancel?: () => void;
}

export function ProfileCreationForm({
  title = 'Qui apprend ?',
  subtitle = 'Choisis un espace adapté sur cet appareil. Aucun compte ni e-mail requis.',
  onCreate,
  onCancel,
}: ProfileCreationFormProps): React.ReactElement {
  const [selectedMode, setSelectedMode] = useState<ProfileMode | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMode) {
      setError('Choisis d’abord Enfant ou Ado / Adulte.');
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Entre un prénom ou un pseudo.');
      return;
    }
    onCreate(trimmed, selectedMode);
  };

  return (
    <div className="bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-[#111827] dark:text-[#F3F4F6] mb-1.5">
          {title}
        </h1>
        <p className="text-sm text-[#4B5563] dark:text-[#D1D5DB]">{subtitle}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <button
            type="button"
            onClick={() => {
              setSelectedMode('child');
              if (error) setError(null);
            }}
            className={`min-h-[88px] p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
              selectedMode === 'child'
                ? 'border-[#0F4C3A] dark:border-[#6EE7B7] bg-[#E6F0EC] dark:bg-[#13362B]'
                : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:border-[#0F4C3A]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]">
                Enfant (8-12 ans)
              </span>
              {selectedMode === 'child' && (
                <IconCheck className="w-5 h-5 text-[#0F4C3A] dark:text-[#6EE7B7] shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
              Séances courtes, mots illustrés et rythme doux.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedMode('adult');
              if (error) setError(null);
            }}
            className={`min-h-[88px] p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
              selectedMode === 'adult'
                ? 'border-[#0F4C3A] dark:border-[#6EE7B7] bg-[#E6F0EC] dark:bg-[#13362B]'
                : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A] hover:border-[#0F4C3A]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-base font-bold text-[#111827] dark:text-[#F3F4F6]">
                Ado / Adulte
              </span>
              {selectedMode === 'adult' && (
                <IconCheck className="w-5 h-5 text-[#0F4C3A] dark:text-[#6EE7B7] shrink-0" />
              )}
            </div>
            <p className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
              Parcours complet du niveau A1 à B2.
            </p>
          </button>
        </div>

        <div>
          <label
            htmlFor="profile-name-input"
            className="block text-sm font-semibold text-[#111827] dark:text-[#F3F4F6] mb-1.5"
          >
            Prénom ou pseudo
          </label>
          <input
            id="profile-name-input"
            type="text"
            maxLength={32}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder={
              selectedMode === 'child' ? 'Ex. Awa, Omar' : 'Ex. Aminata, Moussa'
            }
            className="w-full min-h-[52px] px-4 py-3 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] bg-[#FAF8F5] dark:bg-[#252D2A] text-base text-[#111827] dark:text-[#F3F4F6] focus:outline-none focus:ring-2 focus:ring-[#0F4C3A]"
          />
          <p className="text-xs text-[#6B7280] dark:text-[#9CA3AF] mt-1.5 flex items-center gap-1.5">
            <IconShield className="w-3.5 h-3.5 shrink-0" />
            <span>Stocké uniquement sur cet appareil. Aucun e-mail demandé.</span>
          </p>
        </div>

        {error && (
          <p role="alert" className="text-xs font-semibold text-[#C85A32] dark:text-[#FCA5A5]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] text-sm font-semibold text-[#374151] dark:text-[#D1D5DB] cursor-pointer"
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            className="flex-1 min-h-[56px] inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-base font-semibold transition cursor-pointer"
          >
            <span>Commencer</span>
            <IconArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

interface ProfileSwitcherModalProps {
  profiles: LocalProfileRecord[];
  activeProfileId: string;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string, mode: ProfileMode) => void;
  onDeleteProfile: (profileId: string) => void;
  onClose: () => void;
}

export function ProfileSwitcherModal({
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onDeleteProfile,
  onClose,
}: ProfileSwitcherModalProps): React.ReactElement {
  const [isCreating, setIsCreating] = useState(false);

  if (isCreating) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Nouveau profil"
      >
        <div className="w-full max-w-xl">
          <ProfileCreationForm
            title="Ajouter un profil"
            subtitle={`Jusqu’à ${MAX_LOCAL_PROFILES} profils séparés sur cet appareil.`}
            onCreate={(name, mode) => {
              onCreateProfile(name, mode);
              onClose();
            }}
            onCancel={() => setIsCreating(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-switcher-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <IconShield className="w-5 h-5 text-[#0F4C3A] dark:text-[#6EE7B7]" />
            <h2
              id="profile-switcher-title"
              className="text-lg font-bold text-[#111827] dark:text-[#F3F4F6]"
            >
              Profils sur cet appareil
            </h2>
          </div>
          <span className="text-xs font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
            {profiles.length} / {MAX_LOCAL_PROFILES}
          </span>
        </div>

        <div className="space-y-2.5">
          {profiles.map((prof) => {
            const isActive = prof.id === activeProfileId;
            return (
              <div
                key={prof.id}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  isActive
                    ? 'border-[#0F4C3A] dark:border-[#6EE7B7] bg-[#E6F0EC] dark:bg-[#13362B]'
                    : 'border-[#E4DFD3] dark:border-[#343F3B] bg-[#FAF8F5] dark:bg-[#252D2A]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectProfile(prof.id);
                    onClose();
                  }}
                  className="flex-1 flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-[#0F4C3A] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {getInitials(prof.name)}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-[#111827] dark:text-[#F3F4F6]">
                      {prof.name}
                    </div>
                    <div className="text-xs text-[#4B5563] dark:text-[#D1D5DB]">
                      {prof.mode === 'child' ? 'Enfant (8-12 ans)' : 'Ado / Adulte'} ·{' '}
                      {prof.state.xp} XP
                    </div>
                  </div>
                </button>

                {isActive ? (
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-[#1E2422] text-[#0F4C3A] dark:text-[#6EE7B7]">
                    Actif
                  </span>
                ) : (
                  profiles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteProfile(prof.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#9A3412] dark:text-[#FCA5A5] hover:bg-[#FDF1EC] dark:hover:bg-[#3A1D16] cursor-pointer"
                    >
                      Retirer
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5 pt-2">
          {profiles.length < MAX_LOCAL_PROFILES && (
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-3 px-4 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold cursor-pointer"
            >
              <IconPlus className="w-4 h-4" />
              <span>Nouveau profil</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-xl border border-[#D5CFC2] dark:border-[#45534E] text-xs font-semibold text-[#374151] dark:text-[#D1D5DB] cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
