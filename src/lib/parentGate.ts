export interface ParentChallenge {
  a: number;
  b: number;
  questionFr: string;
  answer: number;
}

/**
 * Génère un petit calcul de contrôle (ex. 7 × 8) pour l'espace parent.
 * Aucune question fixe ni mot de passe stocké.
 */
export function generateParentChallenge(
  rng: () => number = Math.random
): ParentChallenge {
  const a = 4 + Math.floor(rng() * 6); // 4..9
  const b = 4 + Math.floor(rng() * 6); // 4..9
  return {
    a,
    b,
    questionFr: `Combien font ${a} × ${b} ?`,
    answer: a * b,
  };
}

export function verifyParentChallenge(
  challenge: ParentChallenge,
  userInput: string
): boolean {
  const trimmed = userInput.trim();
  if (!/^\d+$/.test(trimmed)) {
    return false;
  }
  return Number(trimmed) === challenge.answer;
}
