import React from 'react';
import { LegalDocumentKind } from '../lib/types';
import { IconArrowLeft, IconShield } from './Icons';

interface LegalViewProps {
  kind: LegalDocumentKind;
  onClose: () => void;
  onSwitchKind?: (kind: LegalDocumentKind) => void;
}

export function LegalView({
  kind,
  onClose,
  onSwitchKind,
}: LegalViewProps): React.ReactElement {
  const isPrivacy = kind === 'privacy';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div className="w-full max-w-xl max-h-[88vh] flex flex-col bg-white dark:bg-[#1E2422] border border-[#E4DFD3] dark:border-[#343F3B] rounded-2xl shadow-lg overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E4DFD3] dark:border-[#343F3B]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#E6F0EC] dark:bg-[#13362B] text-[#0F4C3A] dark:text-[#6EE7B7] flex items-center justify-center shrink-0">
              <IconShield className="w-4 h-4" />
            </div>
            <h2
              id="legal-modal-title"
              className="text-base font-bold text-[#111827] dark:text-[#F3F4F6] truncate"
            >
              {isPrivacy ? 'Politique de confidentialité' : "Conditions d'utilisation"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#4B5563] dark:text-[#D1D5DB] hover:bg-[#FAF8F5] dark:hover:bg-[#252D2A] cursor-pointer"
          >
            <IconArrowLeft className="w-3.5 h-3.5" />
            <span>Fermer</span>
          </button>
        </div>

        {onSwitchKind && (
          <div className="px-5 pt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onSwitchKind('privacy')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isPrivacy
                  ? 'bg-[#0F4C3A] text-white'
                  : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#4B5563] dark:text-[#D1D5DB]'
              }`}
            >
              Confidentialité
            </button>
            <button
              type="button"
              onClick={() => onSwitchKind('terms')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                !isPrivacy
                  ? 'bg-[#0F4C3A] text-white'
                  : 'bg-[#FAF8F5] dark:bg-[#252D2A] text-[#4B5563] dark:text-[#D1D5DB]'
              }`}
            >
              Conditions d&apos;utilisation
            </button>
          </div>
        )}

        <div className="px-5 py-4 overflow-y-auto space-y-4 text-sm leading-relaxed text-[#374151] dark:text-[#D1D5DB]">
          {isPrivacy ? (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  1. Données collectées
                </h3>
                <p>
                  Diang-Anglais collecte uniquement les données nécessaires à ton apprentissage :
                  ton adresse email (pour l&apos;authentification du compte adulte), le prénom ou pseudo
                  de chaque profil, ta progression (cartes révisées, séances, score de placement, XP)
                  et tes préférences (voix, vitesse audio, thème).
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  2. Usage strictement limité et zéro traceur
                </h3>
                <p>
                  Tes données servent exclusivement au fonctionnement de l&apos;application et à la
                  synchronisation entre tes appareils. Aucune publicité, aucun outil d&apos;analyse,
                  aucun traceur tiers et aucune revente ou partage commercial ne sont pratiqués.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  3. Profils enfants (8-12 ans)
                </h3>
                <p>
                  Les comptes sont réservés aux adultes. Les profils enfants sont créés et gérés par
                  le parent sous son compte, avec un simple prénom ou pseudo, sans adresse email ni
                  compte propre. L&apos;accès aux réglages et au changement de profil est protégé par
                  un contrôle parental local.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  4. Export et suppression sur demande
                </h3>
                <p>
                  Tu peux à tout moment exporter l&apos;ensemble de tes données au format JSON ou
                  supprimer définitivement ton compte depuis{' '}
                  <strong>Paramètres &gt; Compte</strong>. La suppression efface immédiatement ton
                  compte et tous les profils associés côté serveur ainsi que sur l&apos;appareil.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  1. Objet du service
                </h3>
                <p>
                  Diang-Anglais est une application d&apos;apprentissage structuré de l&apos;anglais
                  pour francophones (niveaux A0 à B2), utilisable en ligne et hors ligne après
                  chargement.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  2. Accès et comptes adultes
                </h3>
                <p>
                  La création d&apos;un compte est réservée aux personnes majeures (ou sous
                  responsabilité d&apos;un parent/tuteur). Chaque compte peut héberger jusqu&apos;à
                  4 profils d&apos;apprentissage (adulte ou enfant). Tu es responsable de la
                  confidentialité de tes identifiants de connexion.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  3. Responsabilité parentale
                </h3>
                <p>
                  Les profils enfants sont créés par un adulte responsable. Ils ne disposent ni
                  d&apos;email ni d&apos;identifiant propre et restent rattachés au compte du parent.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-[#111827] dark:text-[#F3F4F6]">
                  4. Voix et contenus
                </h3>
                <p>
                  Les voix proposées (Ragui, Fatou Sarre, Omare, Boubacar) sont des voix de
                  synthèse neuronales générées localement à partir de modèles ouverts ; elles ne
                  représentent pas des personnes réelles.
                </p>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
