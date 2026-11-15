import cardsData from '../data/cards.json';
import constructionsData from '../data/constructions.json';
import lessonsData from '../data/lessons.json';
import placementData from '../data/placement.json';
import sentencesData from '../data/sentences.json';
import { ContentCatalog } from './planner';
import {
  ConstructionItem,
  FlashcardItem,
  LessonItem,
  PlacementQuestion,
  SentenceItem,
} from './types';

export const catalog: ContentCatalog = {
  cards: cardsData as FlashcardItem[],
  lessons: lessonsData as LessonItem[],
  placement: placementData as PlacementQuestion[],
  sentences: sentencesData as SentenceItem[],
  constructions: constructionsData as ConstructionItem[],
};
