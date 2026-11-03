import { describe, expect, it } from 'vitest';
import duelSource from './MathDuel.tsx?raw';
import duelStyles from './MathDuel.css?raw';
import answerStyles from './AnswerFeedback.css?raw';
import revealSource from './CardReveal.tsx?raw';
import revealStyles from './CardReveal.css?raw';
import gameOverStyles from './GameOverScreen.css?raw';

/** Plain class names used in a component's JSX. */
function classNames(source: string): string[] {
  return [...source.matchAll(/className="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
}

describe('full-screen panels own their styles', () => {
  // The Rent Defence panel once borrowed its overlay from another component's
  // stylesheet; when that file was removed the panel fell to the page's foot.
  it.each([
    ['MathDuel', duelSource, duelStyles + answerStyles],
    ['CardReveal', revealSource, revealStyles],
  ])('%s defines every class it uses in the stylesheets it imports', (_name, source, styles) => {
    const missing = classNames(source).filter((name) => !styles.includes(`.${name}`));
    expect(missing).toEqual([]);
  });

  it('keeps the Rent Defence panel fixed over the table', () => {
    expect(duelStyles).toMatch(/\.duel-overlay\s*\{[^}]*position:\s*fixed/);
  });

  it('never squeezes the final score table out of the game-over column', () => {
    expect(gameOverStyles).toMatch(/\.gameover-container > \*\s*\{[^}]*flex-shrink:\s*0/);
  });
});
