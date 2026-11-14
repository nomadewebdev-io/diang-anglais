export interface WordComparisonResult {
  expectedWord: string;
  typedWord: string;
  isCorrect: boolean;
}

export interface DictationEvaluation {
  words: WordComparisonResult[];
  correctCount: number;
  totalExpected: number;
  accuracyPercentage: number;
  isFullyCorrect: boolean;
}

export function normalizeWordToken(word: string): string {
  return word
    .trim()
    .replace(/[’‘`]/g, "'")
    .replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')
    .toLowerCase();
}

export function tokenizeSentence(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .filter((token) => normalizeWordToken(token).length > 0);
}

export function evaluateDictation(
  expectedSentence: string,
  userInput: string
): DictationEvaluation {
  const expectedTokens = tokenizeSentence(expectedSentence);
  const typedTokens = tokenizeSentence(userInput);

  if (expectedTokens.length === 0) {
    return {
      words: [],
      correctCount: 0,
      totalExpected: 0,
      accuracyPercentage: 100,
      isFullyCorrect: true,
    };
  }

  const words: WordComparisonResult[] = [];
  let correctCount = 0;

  // Align tokens with simple lookahead to avoid shifting the entire rest of the sentence if 1 word is omitted
  let typedCursor = 0;

  for (let i = 0; i < expectedTokens.length; i++) {
    const expectedRaw = expectedTokens[i];
    const expectedNorm = normalizeWordToken(expectedRaw);
    const currentTypedRaw = typedTokens[typedCursor] ?? '';
    const currentTypedNorm = normalizeWordToken(currentTypedRaw);

    if (currentTypedNorm === expectedNorm) {
      correctCount += 1;
      words.push({
        expectedWord: expectedRaw,
        typedWord: currentTypedRaw,
        isCorrect: true,
      });
      typedCursor += 1;
    } else {
      // Check if the user skipped this expected word and typed the next expected word
      const nextExpectedRaw = expectedTokens[i + 1];
      const nextExpectedNorm = nextExpectedRaw ? normalizeWordToken(nextExpectedRaw) : null;

      if (nextExpectedNorm && currentTypedNorm === nextExpectedNorm) {
        // User omitted expectedRaw; keep typedCursor for next iteration
        words.push({
          expectedWord: expectedRaw,
          typedWord: '',
          isCorrect: false,
        });
      } else {
        words.push({
          expectedWord: expectedRaw,
          typedWord: currentTypedRaw,
          isCorrect: false,
        });
        if (typedCursor < typedTokens.length) {
          typedCursor += 1;
        }
      }
    }
  }

  const accuracyPercentage = Math.round((correctCount / expectedTokens.length) * 100);
  const isFullyCorrect =
    correctCount === expectedTokens.length && typedTokens.length === expectedTokens.length;

  return {
    words,
    correctCount,
    totalExpected: expectedTokens.length,
    accuracyPercentage,
    isFullyCorrect,
  };
}
