import { ContentCatalog } from './planner';
import {
  CEFRLevel,
  ConstructionItem,
  FlashcardItem,
  LessonItem,
  PlacementQuestion,
  ProfileMode,
  SentenceItem,
} from './types';

export const EMPTY_CATALOG: ContentCatalog = {
  cards: [],
  lessons: [],
  placement: [],
  sentences: [],
  constructions: [],
};

type AdultLevel = 'A1' | 'A2' | 'B1' | 'B2';
type KidsLevel = 'A0' | 'A1' | 'A2';

const cache = new Map<string, unknown[]>();

async function loadCached<T>(key: string, loader: () => Promise<{ default: T[] }>): Promise<T[]> {
  if (cache.has(key)) {
    return cache.get(key) as T[];
  }
  const mod = await loader();
  const data = Array.isArray(mod.default) ? mod.default : [];
  cache.set(key, data);
  return data;
}

const adultLoaders: Record<
  'cards' | 'lessons' | 'placement' | 'sentences' | 'constructions',
  Record<AdultLevel, () => Promise<{ default: unknown[] }>>
> = {
  cards: {
    A1: () => import('../data/cards/a1.json'),
    A2: () => import('../data/cards/a2.json'),
    B1: () => import('../data/cards/b1.json'),
    B2: () => import('../data/cards/b2.json'),
  },
  lessons: {
    A1: () => import('../data/lessons/a1.json'),
    A2: () => import('../data/lessons/a2.json'),
    B1: () => import('../data/lessons/b1.json'),
    B2: () => import('../data/lessons/b2.json'),
  },
  placement: {
    A1: () => import('../data/placement/a1.json'),
    A2: () => import('../data/placement/a2.json'),
    B1: () => import('../data/placement/b1.json'),
    B2: () => import('../data/placement/b2.json'),
  },
  sentences: {
    A1: () => import('../data/sentences/a1.json'),
    A2: () => import('../data/sentences/a2.json'),
    B1: () => import('../data/sentences/b1.json'),
    B2: () => import('../data/sentences/b2.json'),
  },
  constructions: {
    A1: () => import('../data/constructions/a1.json'),
    A2: () => import('../data/constructions/a2.json'),
    B1: () => import('../data/constructions/b1.json'),
    B2: () => import('../data/constructions/b2.json'),
  },
};

const kidsLoaders: Record<
  'cards' | 'lessons' | 'placement' | 'sentences' | 'constructions',
  Record<KidsLevel, () => Promise<{ default: unknown[] }>>
> = {
  cards: {
    A0: () => import('../data/kids/cards/a0.json'),
    A1: () => import('../data/kids/cards/a1.json'),
    A2: () => import('../data/kids/cards/a2.json'),
  },
  lessons: {
    A0: () => import('../data/kids/lessons/a0.json'),
    A1: () => import('../data/kids/lessons/a1.json'),
    A2: () => import('../data/kids/lessons/a2.json'),
  },
  placement: {
    A0: () => import('../data/kids/placement/a0.json'),
    A1: () => import('../data/kids/placement/a1.json'),
    A2: () => import('../data/kids/placement/a2.json'),
  },
  sentences: {
    A0: () => import('../data/kids/sentences/a0.json'),
    A1: () => import('../data/kids/sentences/a1.json'),
    A2: () => import('../data/kids/sentences/a2.json'),
  },
  constructions: {
    A0: () => import('../data/kids/constructions/a0.json'),
    A1: () => import('../data/kids/constructions/a1.json'),
    A2: () => import('../data/kids/constructions/a2.json'),
  },
};

async function loadKindForLevels<T>(
  mode: ProfileMode,
  kind: 'cards' | 'lessons' | 'placement' | 'sentences' | 'constructions',
  levels: CEFRLevel[]
): Promise<T[]> {
  const uniqueLevels = Array.from(new Set(levels));
  const parts = await Promise.all(
    uniqueLevels.map((lvl) => {
      if (mode === 'child') {
        const loader = kidsLoaders[kind][lvl as KidsLevel];
        return loader ? loadCached<T>(`child:${kind}:${lvl}`, loader as () => Promise<{ default: T[] }>) : Promise.resolve([]);
      }
      const loader = adultLoaders[kind][lvl as AdultLevel];
      return loader ? loadCached<T>(`adult:${kind}:${lvl}`, loader as () => Promise<{ default: T[] }>) : Promise.resolve([]);
    })
  );
  return parts.flat();
}

export function getProfileRelevantLevels(
  mode: ProfileMode,
  currentLevel: CEFRLevel,
  targetLevel?: CEFRLevel
): CEFRLevel[] {
  const scale: CEFRLevel[] =
    mode === 'child' ? ['A0', 'A1', 'A2'] : ['A1', 'A2', 'B1', 'B2'];
  const startIdx = Math.max(0, scale.indexOf(currentLevel));
  const nextIdx = Math.min(scale.length - 1, startIdx + 1);
  const endIdx = targetLevel
    ? Math.max(nextIdx, scale.indexOf(targetLevel))
    : nextIdx;
  return scale.slice(startIdx, endIdx + 1);
}

/**
 * Charge dynamiquement uniquement les niveaux du profil (niveau actuel + suivant/cible),
 * sans charger la banque du test de niveau ni le contenu de l'autre mode.
 */
export async function loadCatalogForProfile(
  mode: ProfileMode,
  currentLevel: CEFRLevel,
  targetLevel?: CEFRLevel,
  includePlacement = false
): Promise<ContentCatalog> {
  const levels = getProfileRelevantLevels(mode, currentLevel, targetLevel);
  const [cards, lessons, sentences, constructions, placement] = await Promise.all([
    loadKindForLevels<FlashcardItem>(mode, 'cards', levels),
    loadKindForLevels<LessonItem>(mode, 'lessons', levels),
    loadKindForLevels<SentenceItem>(mode, 'sentences', levels),
    loadKindForLevels<ConstructionItem>(mode, 'constructions', levels),
    includePlacement
      ? loadKindForLevels<PlacementQuestion>(mode, 'placement', levels)
      : Promise.resolve([] as PlacementQuestion[]),
  ]);

  return { cards, lessons, placement, sentences, constructions };
}

/**
 * Charge la banque du test de niveau à la demande, uniquement au lancement du test.
 */
export async function loadPlacementBank(
  mode: ProfileMode
): Promise<PlacementQuestion[]> {
  const levels: CEFRLevel[] =
    mode === 'child' ? ['A0', 'A1', 'A2'] : ['A1', 'A2', 'B1', 'B2'];
  return loadKindForLevels<PlacementQuestion>(mode, 'placement', levels);
}

/**
 * Charge l'ensemble des niveaux pour un mode (utilisé à la demande par Réviser/Programme).
 */
export async function loadFullCatalogForMode(
  mode: ProfileMode
): Promise<ContentCatalog> {
  const levels: CEFRLevel[] =
    mode === 'child' ? ['A0', 'A1', 'A2'] : ['A1', 'A2', 'B1', 'B2'];
  const [cards, lessons, placement, sentences, constructions] = await Promise.all([
    loadKindForLevels<FlashcardItem>(mode, 'cards', levels),
    loadKindForLevels<LessonItem>(mode, 'lessons', levels),
    loadKindForLevels<PlacementQuestion>(mode, 'placement', levels),
    loadKindForLevels<SentenceItem>(mode, 'sentences', levels),
    loadKindForLevels<ConstructionItem>(mode, 'constructions', levels),
  ]);

  return { cards, lessons, placement, sentences, constructions };
}
