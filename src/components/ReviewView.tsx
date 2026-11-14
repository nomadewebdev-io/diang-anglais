import React, { useState } from 'react';
import { catalog } from '../lib/catalog';
import { CEFR_LEVELS, SKILL_LABELS_FR } from '../lib/placementTest';
import { formatDateISO, getDueCards } from '../lib/sm2';
import { AppState, CEFRLevel, SkillType, SM2CardState } from '../lib/types';
import { DictationPractice } from './DictationPractice';
import { FlashcardsPractice } from './FlashcardsPractice';
import {
  IconBookOpen,
  IconCards,
  IconCheck,
  IconKeyboard,
  IconVolume,
} from './Icons';
import { LessonPractice } from './LessonPractice';
import { QuizPractice } from './QuizPractice';

interface ReviewViewProps {
  state: AppState;
  onRateCard: (cardId: string, updatedState: SM2CardState) => void;
  onRecordPracticeMinutes: (
    minutes: number,
    kind: 'flashcards' | 'lesson' | 'dictation' | 'quiz'
  ) => void;
}

type ReviewMode = 'menu' | 'flashcards' | 'lessons' | 'dictation' | 'quiz';

export function ReviewView({
  state,
  onRateCard,
  onRecordPracticeMinutes,
}: ReviewViewProps): React.ReactElement {
  const [mode, setMode] = useState<ReviewMode>('menu');
  const [levelFilter, setLevelFilter] = useState<CEFRLevel | 'ALL'>('ALL');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [quizSkillFilter, setQuizSkillFilter] = useState<SkillType | 'ALL'>('ALL');

  const todayStr = formatDateISO(new Date());

  const filteredCards =
    levelFilter === 'ALL'
      ? catalog.cards
      : catalog.cards.filter((c) => c.level === levelFilter);
  const dueCards = getDueCards(filteredCards, state.sm2States, todayStr);

  const dueTodayCount = catalog.cards.filter((c) => {
    const st = state.sm2States[c.id];
    return !st || st.nextReviewDate <= todayStr;
  }).length;

  if (mode === 'flashcards') {
    return (
      <div className="max-w-2xl mx-auto">
        <FlashcardsPractice
          cards={dueCards.slice(0, 12)}
          sm2States={state.sm2States}
          title={
            levelFilter === 'ALL'
              ? 'Révision SM-2 · Tous niveaux'
              : `Révision SM-2 · Niveau ${levelFilter}`
          }
          onRateCard={onRateCard}
          onClose={() => setMode('menu')}
          onComplete={(count) => {
            onRecordPracticeMinutes(Math.max(5, count * 2), 'flashcards');
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'lessons' && selectedLessonId) {
    const lesson =
      catalog.lessons.find((l) => l.id === selectedLessonId) ?? catalog.lessons[0];
    return (
      <div className="max-w-2xl mx-auto">
        <LessonPractice
          lesson={lesson}
          onClose={() => setSelectedLessonId(null)}
          onComplete={() => {
            onRecordPracticeMinutes(12, 'lesson');
            setSelectedLessonId(null);
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'dictation') {
    const sentences =
      levelFilter === 'ALL'
        ? catalog.sentences
        : catalog.sentences.filter((s) => s.level === levelFilter);
    return (
      <div className="max-w-2xl mx-auto">
        <DictationPractice
          sentences={sentences.slice(0, 6)}
          title={
            levelFilter === 'ALL'
              ? 'Dictée audio · Tous niveaux'
              : `Dictée audio · Niveau ${levelFilter}`
          }
          onClose={() => setMode('menu')}
          onComplete={() => {
            onRecordPracticeMinutes(10, 'dictation');
            setMode('menu');
          }}
        />
      </div>
    );
  }

  if (mode === 'quiz') {
    const pool = catalog.placement.filter((q) => {
      const matchLevel = levelFilter === 'ALL' || q.level === levelFilter;
      const matchSkill = quizSkillFilter === 'ALL' || q.skill === quizSkillFilter;
      return matchLevel && matchSkill;
    });
    const questions = pool.length > 0 ? pool.slice(0, 8) : catalog.placement.slice(0, 8);

    return (
      <div className="max-w-2xl mx-auto">
        <QuizPractice
          questions={questions}
          title="Quiz d’entraînement QCM & Écoute"
          subtitle={
            quizSkillFilter === 'ALL'
              ? 'Toutes compétences'
              : `Focus : ${SKILL_LABELS_FR[quizSkillFilter]}`
          }
          onClose={() => setMode('menu')}
          onComplete={() => {
            onRecordPracticeMinutes(10, 'quiz');
            setMode('menu');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
            Atelier de révision libre
          </h1>
          <p className="text-xs sm:text-sm text-[#4B5563]">
            Travaillez vos cartes mémoire SM-2, la dictée mot par mot, les leçons grammaticales
            ou les quiz audio.
          </p>
        </div>

        {/* Level Filter */}
        <div className="flex items-center gap-1.5 bg-[#FAF8F5] p-1.5 rounded-xl border border-[#E4DFD3]">
          <button
            type="button"
            onClick={() => setLevelFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              levelFilter === 'ALL'
                ? 'bg-[#0F4C3A] text-white'
                : 'text-[#374151] hover:bg-white'
            }`}
          >
            Tous
          </button>
          {CEFR_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                levelFilter === lvl
                  ? 'bg-[#0F4C3A] text-white'
                  : 'text-[#374151] hover:bg-white'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Asymmetric Bento Practice Selection */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Flashcards SM-2 */}
        <div className="md:col-span-7 bg-white border border-[#E4DFD3] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="p-2.5 rounded-xl bg-[#E6F0EC] text-[#0F4C3A]">
                <IconCards className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FDF1EC] text-[#C85A32]">
                {dueTodayCount} cartes à revoir aujourd’hui
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#111827] mb-1">
              Flashcards SM-2 avec audio
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] mb-4">
              Mémorisation espacée selon vos réponses (À revoir, Difficile, Bien, Facile) avec
              écoute de chaque mot et exemple en anglais américain.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode('flashcards')}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            Lancer une série de cartes ({dueCards.length} disponibles)
          </button>
        </div>

        {/* Dictation Mode */}
        <div className="md:col-span-5 bg-white border border-[#E4DFD3] rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="p-2.5 rounded-xl bg-[#FDF1EC] text-[#C85A32]">
                <IconKeyboard className="w-5 h-5" />
              </span>
              <span className="text-xs font-semibold text-[#6B7280]">
                Correction mot par mot
              </span>
            </div>
            <h2 className="text-lg font-bold text-[#111827] mb-1">
              Mode Dictée
            </h2>
            <p className="text-xs sm:text-sm text-[#4B5563] mb-4">
              Écoutez une phrase complète à vitesse normale ou réduite, tapez-la et visualisez la
              correction mot par mot.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode('dictation')}
            className="w-full px-5 py-3 rounded-xl bg-[#C85A32] hover:bg-[#B04B25] text-white text-xs sm:text-sm font-semibold transition cursor-pointer"
          >
            Démarrer une dictée
          </button>
        </div>
      </div>

      {/* Quiz QCM & Audio section */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E4DFD3] text-[#0F4C3A]">
              <IconVolume className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#111827]">
                Quiz QCM et Compréhension orale
              </h2>
              <p className="text-xs text-[#4B5563]">
                Sélectionnez une compétence spécifique ou testez-vous sur l’ensemble des questions.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMode('quiz')}
            className="px-5 py-2.5 rounded-xl bg-[#0F4C3A] hover:bg-[#0A3628] text-white text-xs font-semibold transition cursor-pointer"
          >
            Lancer le quiz QCM
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setQuizSkillFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              quizSkillFilter === 'ALL'
                ? 'bg-[#E6F0EC] border-[#0F4C3A] text-[#0F4C3A]'
                : 'bg-[#FAF8F5] border-[#E4DFD3] text-[#4B5563]'
            }`}
          >
            Toutes compétences
          </button>
          {(['vocab', 'grammar', 'reading', 'listening'] as SkillType[]).map((sk) => (
            <button
              key={sk}
              type="button"
              onClick={() => setQuizSkillFilter(sk)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                quizSkillFilter === sk
                  ? 'bg-[#E6F0EC] border-[#0F4C3A] text-[#0F4C3A]'
                  : 'bg-[#FAF8F5] border-[#E4DFD3] text-[#4B5563]'
              }`}
            >
              {SKILL_LABELS_FR[sk]}
            </button>
          ))}
        </div>
      </div>

      {/* Lessons List */}
      <div className="bg-white border border-[#E4DFD3] rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-4">
          <IconBookOpen className="w-5 h-5 text-[#0F4C3A]" />
          <h2 className="text-base sm:text-lg font-bold text-[#111827]">
            Leçons de grammaire et exercices ({catalog.lessons.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalog.lessons
            .filter((l) => levelFilter === 'ALL' || l.level === levelFilter)
            .map((lesson) => (
              <div
                key={lesson.id}
                className="p-4 rounded-xl border border-[#E4DFD3] bg-[#FAF8F5] flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-[#E6F0EC] text-[#0F4C3A]">
                      Niveau {lesson.level}
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      {lesson.exercises.length} exercices
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#111827]">
                    {lesson.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLessonId(lesson.id);
                    setMode('lessons');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0F4C3A] hover:underline cursor-pointer"
                >
                  <IconCheck className="w-3.5 h-3.5" />
                  <span>Étudier la leçon et s’exercer</span>
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
