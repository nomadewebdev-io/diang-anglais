import {
  calculateNextSM2State,
  createInitialSM2State,
  formatDateISO,
} from './sm2';
import {
  CEFRLevel,
  ConstructionItem,
  ConstructionUnitProgress,
  SM2CardState,
} from './types';

export const UNIT_UNLOCK_THRESHOLD = 80;
export const MISTAKE_REPEAT_COUNT = 2;

const CONTRACTION_MAP: Array<[RegExp, string]> = [
  [/\bi'm\b/g, 'i am'],
  [/\byou're\b/g, 'you are'],
  [/\bhe's\b/g, 'he is'],
  [/\bshe's\b/g, 'she is'],
  [/\bit's\b/g, 'it is'],
  [/\bwe're\b/g, 'we are'],
  [/\bthey're\b/g, 'they are'],
  [/\bthat's\b/g, 'that is'],
  [/\bthere's\b/g, 'there is'],
  [/\bhere's\b/g, 'here is'],
  [/\bwhat's\b/g, 'what is'],
  [/\bwho's\b/g, 'who is'],
  [/\bwhere's\b/g, 'where is'],
  [/\blet's\b/g, 'let us'],
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bwouldn't\b/g, 'would not'],
  [/\bshouldn't\b/g, 'should not'],
  [/\bcouldn't\b/g, 'could not'],
  [/\bmustn't\b/g, 'must not'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bwasn't\b/g, 'was not'],
  [/\bweren't\b/g, 'were not'],
  [/\bhaven't\b/g, 'have not'],
  [/\bhasn't\b/g, 'has not'],
  [/\bhadn't\b/g, 'had not'],
  [/\bi've\b/g, 'i have'],
  [/\byou've\b/g, 'you have'],
  [/\bwe've\b/g, 'we have'],
  [/\bthey've\b/g, 'they have'],
  [/\bi'll\b/g, 'i will'],
  [/\byou'll\b/g, 'you will'],
  [/\bhe'll\b/g, 'he will'],
  [/\bshe'll\b/g, 'she will'],
  [/\bit'll\b/g, 'it will'],
  [/\bwe'll\b/g, 'we will'],
  [/\bthey'll\b/g, 'they will'],
  [/\bi'd\b/g, 'i would'],
  [/\byou'd\b/g, 'you would'],
  [/\bhe'd\b/g, 'he would'],
  [/\bshe'd\b/g, 'she would'],
  [/\bwe'd\b/g, 'we would'],
  [/\bthey'd\b/g, 'they would'],
];

/**
 * Normalise une phrase anglaise pour la correction tolérante :
 * - minuscules, apostrophes droites
 * - suppression de la ponctuation finale et des virgules/points-virgules superflus
 * - réduction des espaces multiples
 * - expansion des contractions anglaises courantes
 */
export function normalizeConstructionText(text: string): string {
  let normalized = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[,;:.!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of CONTRACTION_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

export interface ConstructionWordDiff {
  word: string;
  matched: boolean;
}

export interface ConstructionEvaluation {
  isCorrect: boolean;
  expected: string;
  matchedAnswer?: string;
  expectedDiff: ConstructionWordDiff[];
  userText: string;
}

function tokenizeDisplayWords(sentence: string): string[] {
  return String(sentence ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Aligne les mots de la réponse attendue avec les mots saisis par l'apprenant
 * pour surligner précisément l'endroit de l'écart en cas d'erreur.
 */
export function computeExpectedWordDiff(
  expectedSentence: string,
  userSentence: string
): ConstructionWordDiff[] {
  const expectedDisplayWords = tokenizeDisplayWords(expectedSentence);
  const expectedNormWords = expectedDisplayWords.map((w) =>
    normalizeConstructionText(w)
  );
  const userNormWords = normalizeConstructionText(userSentence)
    .split(/\s+/)
    .filter(Boolean);

  // Also compare against expanded tokens so "I'm" highlights "I am" cleanly
  const userExpanded = new Set(userNormWords);
  let userCursor = 0;

  return expectedDisplayWords.map((displayWord, idx) => {
    const normTarget = expectedNormWords[idx];
    const targetParts = normTarget.split(/\s+/).filter(Boolean);

    let matched = false;
    if (
      userCursor < userNormWords.length &&
      targetParts.every((p, offset) => userNormWords[userCursor + offset] === p)
    ) {
      matched = true;
      userCursor += targetParts.length;
    } else if (
      targetParts.length > 0 &&
      targetParts.every((p) => userExpanded.has(p))
    ) {
      // Check if it appears shortly ahead (skipped/inserted word)
      const lookAhead = userNormWords.slice(userCursor, userCursor + 3);
      const foundIdx = lookAhead.indexOf(targetParts[0]);
      if (foundIdx !== -1) {
        matched = true;
        userCursor += foundIdx + targetParts.length;
      }
    }

    return {
      word: displayWord,
      matched,
    };
  });
}

export function evaluateConstruction(
  userInput: string,
  answers: string[]
): ConstructionEvaluation {
  const primaryExpected = answers[0] ?? '';
  const normUser = normalizeConstructionText(userInput);

  if (!normUser) {
    return {
      isCorrect: false,
      expected: primaryExpected,
      expectedDiff: computeExpectedWordDiff(primaryExpected, ''),
      userText: userInput,
    };
  }

  for (const candidate of answers) {
    if (normalizeConstructionText(candidate) === normUser) {
      return {
        isCorrect: true,
        expected: candidate,
        matchedAnswer: candidate,
        expectedDiff: tokenizeDisplayWords(candidate).map((word) => ({
          word,
          matched: true,
        })),
        userText: userInput,
      };
    }
  }

  return {
    isCorrect: false,
    expected: primaryExpected,
    expectedDiff: computeExpectedWordDiff(primaryExpected, userInput),
    userText: userInput,
  };
}

export interface TileToken {
  id: string;
  text: string;
}

/**
 * Découpe la phrase cible en tuiles de mots propres, y ajoute 2 à 3 distracteurs,
 * et mélange le tout de façon déterministe ou aléatoire.
 */
export function buildShuffledTiles(
  primaryAnswer: string,
  distractors: string[] = [],
  randomFn: () => number = Math.random
): TileToken[] {
  const cleanWords = primaryAnswer
    .trim()
    .replace(/[.!?]+$/g, '')
    .split(/\s+/)
    .map((w) => w.replace(/^[,;:]+|[,;:]+$/g, ''))
    .filter(Boolean);

  const existingLower = new Set(cleanWords.map((w) => w.toLowerCase()));
  const filteredDistractors = distractors
    .map((d) => d.trim())
    .filter((d) => d.length > 0 && !existingLower.has(d.toLowerCase()))
    .slice(0, 3);

  const allTokens: TileToken[] = [...cleanWords, ...filteredDistractors].map(
    (text, idx) => ({
      id: `tile-${idx}-${text}`,
      text,
    })
  );

  for (let i = allTokens.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [allTokens[i], allTokens[j]] = [allTokens[j], allTokens[i]];
  }

  return allTokens;
}

export interface ConstructionQueueEntry {
  item: ConstructionItem;
  remainingMistakeRepeats: number;
  hadMistake: boolean;
  isRetry: boolean;
}

export function createConstructionQueue(
  items: ConstructionItem[]
): ConstructionQueueEntry[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      item,
      remainingMistakeRepeats: 0,
      hadMistake: false,
      isRetry: false,
    }));
}

/**
 * Fait avancer la file d'exercice :
 * - En cas d'erreur ou "Je ne sais pas" : la phrase revient 2 fois plus loin dans la séance.
 * - En cas de réussite : si elle avait encore des répétitions planifiées, on décrémente.
 */
export function advanceConstructionQueue(
  queue: ConstructionQueueEntry[],
  wasCorrect: boolean
): {
  nextQueue: ConstructionQueueEntry[];
  completedItem?: { item: ConstructionItem; firstTrySuccess: boolean };
} {
  if (queue.length === 0) {
    return { nextQueue: [] };
  }

  const [current, ...rest] = queue;

  if (!wasCorrect) {
    const repeatsLeft = current.hadMistake
      ? Math.max(1, current.remainingMistakeRepeats)
      : MISTAKE_REPEAT_COUNT;
    const reinsertIndex = Math.min(rest.length, 2);
    const updatedEntry: ConstructionQueueEntry = {
      item: current.item,
      remainingMistakeRepeats: repeatsLeft,
      hadMistake: true,
      isRetry: true,
    };
    const nextQueue = [
      ...rest.slice(0, reinsertIndex),
      updatedEntry,
      ...rest.slice(reinsertIndex),
    ];
    return { nextQueue };
  }

  // Réponse correcte
  if (current.remainingMistakeRepeats > 1) {
    const reinsertIndex = Math.min(rest.length, 3);
    const updatedEntry: ConstructionQueueEntry = {
      item: current.item,
      remainingMistakeRepeats: current.remainingMistakeRepeats - 1,
      hadMistake: current.hadMistake,
      isRetry: true,
    };
    const nextQueue = [
      ...rest.slice(0, reinsertIndex),
      updatedEntry,
      ...rest.slice(reinsertIndex),
    ];
    return { nextQueue };
  }

  return {
    nextQueue: rest,
    completedItem: {
      item: current.item,
      firstTrySuccess: !current.hadMistake,
    },
  };
}

export function updateConstructionSM2(
  sm2States: Record<string, SM2CardState>,
  itemId: string,
  firstTrySuccess: boolean,
  todayStr: string = formatDateISO(new Date())
): SM2CardState {
  const prev = sm2States[itemId] ?? createInitialSM2State(itemId, todayStr);
  // Réussie du premier coup -> 'easy' (espace plus), sinon 'again' (revient vite en SM-2)
  return calculateNextSM2State(
    prev,
    firstTrySuccess ? 'easy' : 'again',
    todayStr
  );
}

export interface ConstructionUnitSummary {
  key: string;
  level: CEFRLevel;
  unit: number;
  unitTitleFr: string;
  items: ConstructionItem[];
}

export function getUnitKey(level: CEFRLevel, unit: number): string {
  return `${level}-u${unit}`;
}

export function getConstructionUnits(
  items: ConstructionItem[],
  levelFilter?: CEFRLevel
): ConstructionUnitSummary[] {
  const filtered = levelFilter
    ? items.filter((item) => item.level === levelFilter)
    : items;

  const map = new Map<string, ConstructionUnitSummary>();
  for (const item of filtered) {
    const key = getUnitKey(item.level, item.unit);
    if (!map.has(key)) {
      map.set(key, {
        key,
        level: item.level,
        unit: item.unit,
        unitTitleFr: item.unitTitleFr,
        items: [],
      });
    }
    map.get(key)!.items.push(item);
  }

  const levelOrder: Record<CEFRLevel, number> = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4 };
  return Array.from(map.values())
    .map((u) => ({
      ...u,
      items: [...u.items].sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => {
      if (a.level !== b.level) {
        return levelOrder[a.level] - levelOrder[b.level];
      }
      return a.unit - b.unit;
    });
}

export function isUnitUnlocked(
  progress: Record<string, ConstructionUnitProgress>,
  level: CEFRLevel,
  unit: number
): boolean {
  if (unit <= 1) return true;
  const prevKey = getUnitKey(level, unit - 1);
  const prev = progress[prevKey];
  if (!prev) return false;
  return (
    prev.bestRate >= UNIT_UNLOCK_THRESHOLD ||
    prev.completed ||
    Boolean(prev.unlockedManually)
  );
}

export function getNextConstructionUnitForLevel(
  items: ConstructionItem[],
  progress: Record<string, ConstructionUnitProgress>,
  level: CEFRLevel
): ConstructionUnitSummary | null {
  const units = getConstructionUnits(items, level);
  if (units.length === 0) return null;

  for (const unitSummary of units) {
    const prog = progress[unitSummary.key];
    if (!prog || (prog.bestRate < UNIT_UNLOCK_THRESHOLD && !prog.unlockedManually)) {
      return unitSummary;
    }
  }
  return units[0];
}

export function recordUnitCompletion(
  progress: Record<string, ConstructionUnitProgress>,
  level: CEFRLevel,
  unit: number,
  firstTryCount: number,
  totalCount: number,
  todayStr: string = formatDateISO(new Date())
): Record<string, ConstructionUnitProgress> {
  const key = getUnitKey(level, unit);
  const rate =
    totalCount > 0 ? Math.round((firstTryCount / totalCount) * 100) : 100;
  const prev = progress[key];
  const bestRate = Math.max(prev?.bestRate ?? 0, rate);
  return {
    ...progress,
    [key]: {
      attempts: (prev?.attempts ?? 0) + 1,
      firstTryCorrect: Math.max(prev?.firstTryCorrect ?? 0, firstTryCount),
      bestRate,
      completed: (prev?.completed ?? false) || bestRate >= UNIT_UNLOCK_THRESHOLD,
      unlockedManually: prev?.unlockedManually,
      lastPracticedAt: todayStr,
    },
  };
}

export function unlockNextUnitManually(
  progress: Record<string, ConstructionUnitProgress>,
  level: CEFRLevel,
  currentUnit: number
): Record<string, ConstructionUnitProgress> {
  const key = getUnitKey(level, currentUnit);
  const prev = progress[key];
  return {
    ...progress,
    [key]: {
      attempts: prev?.attempts ?? 0,
      firstTryCorrect: prev?.firstTryCorrect ?? 0,
      bestRate: prev?.bestRate ?? 0,
      completed: prev?.completed ?? false,
      unlockedManually: true,
      lastPracticedAt: prev?.lastPracticedAt,
    },
  };
}
