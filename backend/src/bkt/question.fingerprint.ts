import type { GeneratedQuestion } from './question.generator';

const DEFAULT_MAX_ATTEMPTS = 6;

/**
 * Identifies the learning task rather than the generated answer choices.
 * Addition and multiplication normalize their operands because reversing them
 * does not make a new question; subtraction and long division retain order.
 */
export function questionFingerprint(question: GeneratedQuestion): string {
  const data = question.questionData;

  if (data.type === 'column') {
    const operands = data.operation === '+' || data.operation === '×'
      ? [data.topNumber, data.bottomNumber].sort((a, b) => a - b)
      : [data.topNumber, data.bottomNumber];

    return [
      'column',
      data.operation,
      ...operands,
      data.missingPosition,
      data.missingDigitPlace ?? '-',
      data.missingDigitRow ?? '-',
    ].join(':');
  }

  if (data.type === 'long_division') {
    return [
      'division',
      data.dividend,
      data.divisor,
      data.missingTarget,
      data.missingStepIndex,
    ].join(':');
  }

  return ['mcq', data.text.trim().replace(/\s+/g, ' ')].join(':');
}

/** Generate a fresh task where possible, without risking an unbounded loop. */
export function generateDistinctQuestion(
  generate: () => GeneratedQuestion,
  recent: readonly string[],
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS
): GeneratedQuestion & { fingerprint: string } {
  const attempts = Math.max(1, Math.floor(maxAttempts));
  let latest: GeneratedQuestion & { fingerprint: string } | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const question = generate();
    latest = { ...question, fingerprint: questionFingerprint(question) };
    if (!recent.includes(latest.fingerprint)) return latest;
  }

  return latest!;
}
