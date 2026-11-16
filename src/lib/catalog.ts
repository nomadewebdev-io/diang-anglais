import cardsData from '../data/cards.json';
import constructionsData from '../data/constructions.json';
import lessonsData from '../data/lessons.json';
import placementData from '../data/placement.json';
import sentencesData from '../data/sentences.json';
import kidsCardsData from '../data/kids/cards.json';
import kidsConstructionsData from '../data/kids/constructions.json';
import kidsLessonsData from '../data/kids/lessons.json';
import kidsPlacementData from '../data/kids/placement.json';
import kidsSentencesData from '../data/kids/sentences.json';
import { ContentCatalog } from './planner';
import {
  ConstructionItem,
  FlashcardItem,
  LessonItem,
  PlacementQuestion,
  ProfileMode,
  SentenceItem,
} from './types';

export const adultCatalog: ContentCatalog = {
  cards: cardsData as FlashcardItem[],
  lessons: lessonsData as LessonItem[],
  placement: placementData as PlacementQuestion[],
  sentences: sentencesData as SentenceItem[],
  constructions: constructionsData as ConstructionItem[],
};

export const kidsCatalog: ContentCatalog = {
  cards: kidsCardsData as FlashcardItem[],
  lessons: kidsLessonsData as LessonItem[],
  placement: kidsPlacementData as PlacementQuestion[],
  sentences: kidsSentencesData as SentenceItem[],
  constructions: kidsConstructionsData as ConstructionItem[],
};

/** Alias historique (catalogue ado/adulte) */
export const catalog: ContentCatalog = adultCatalog;

/**
 * Retourne exclusivement le catalogue correspondant au mode du profil,
 * sans jamais mélanger les contenus adulte et enfant.
 */
export function getCatalogForMode(mode: ProfileMode): ContentCatalog {
  return mode === 'child' ? kidsCatalog : adultCatalog;
}
