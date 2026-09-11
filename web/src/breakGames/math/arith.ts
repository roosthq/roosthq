// Shared arithmetic-problem generator for the Math break games (Speed
// Match, Path to the Flag) - these are pacing breaks, not the real quiz
// content bank, so difficulty just needs to track grade roughly, not match
// server-side EduQuestion content exactly.
export interface Problem {
  prompt: string;
  answer: number;
}

export function randomProblem(grade: number): Problem {
  if (grade <= 1) {
    const a = 1 + Math.floor(Math.random() * 9);
    const b = 1 + Math.floor(Math.random() * 9);
    return { prompt: `${a} + ${b}`, answer: a + b };
  }
  if (grade <= 3) {
    const useSub = Math.random() < 0.5;
    const a = 5 + Math.floor(Math.random() * 20);
    const b = 1 + Math.floor(Math.random() * (useSub ? a - 1 : 20));
    return useSub ? { prompt: `${a} - ${b}`, answer: a - b } : { prompt: `${a} + ${b}`, answer: a + b };
  }
  const op = Math.random();
  if (op < 0.4) {
    const a = 2 + Math.floor(Math.random() * 10);
    const b = 2 + Math.floor(Math.random() * 10);
    return { prompt: `${a} × ${b}`, answer: a * b };
  }
  if (op < 0.7) {
    const b = 2 + Math.floor(Math.random() * 9);
    const answer = 2 + Math.floor(Math.random() * 10);
    return { prompt: `${answer * b} ÷ ${b}`, answer };
  }
  const a = 10 + Math.floor(Math.random() * 80);
  const b = 10 + Math.floor(Math.random() * 80);
  return { prompt: `${a} + ${b}`, answer: a + b };
}

// The correct answer plus 2 plausible-but-wrong decoys, shuffled.
export function withChoices(p: Problem): { prompt: string; choices: number[]; answer: number } {
  const decoys = new Set<number>();
  while (decoys.size < 2) {
    const delta = 1 + Math.floor(Math.random() * 4);
    const candidate = Math.random() < 0.5 ? p.answer + delta : Math.max(0, p.answer - delta);
    if (candidate !== p.answer) decoys.add(candidate);
  }
  const choices = [p.answer, ...decoys].sort(() => Math.random() - 0.5);
  return { prompt: p.prompt, choices, answer: p.answer };
}
