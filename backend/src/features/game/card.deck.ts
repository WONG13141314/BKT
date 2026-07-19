// ============================================
// Challenge Card Deck — 12 Cards
// 7 Luck cards (instant effect) + 5 Math cards (BKT question)
// All amounts in RM
// ============================================

import { ChallengeCard } from './game.types';

// ---- Card Definitions ----

export const CHALLENGE_CARDS: ChallengeCard[] = [
  // === LUCK CARDS (7) — instant effect, no question ===
  {
    id: 1,
    name: 'Duit Raya!',
    description: 'You receive RM80 as a festive gift! 🎉',
    isMathCard: false,
    effect: { type: 'GAIN_MONEY', amount: 80 },
  },
  {
    id: 2,
    name: 'Hari Jadi!',
    description: "It's your birthday! Collect RM25 from each player! 🎂",
    isMathCard: false,
    effect: { type: 'COLLECT_FROM_EACH', amount: 25 },
  },
  {
    id: 3,
    name: 'Oops!',
    description: 'You broke a window! Pay RM40 to the bank. 💔',
    isMathCard: false,
    effect: { type: 'LOSE_MONEY', amount: 40 },
  },
  {
    id: 4,
    name: 'Lompat!',
    description: 'Jump forward 3 spaces! 🦘',
    isMathCard: false,
    effect: { type: 'MOVE_FORWARD', spaces: 3 },
  },
  {
    id: 5,
    name: 'Undur!',
    description: 'Go back 2 spaces! 🔙',
    isMathCard: false,
    effect: { type: 'MOVE_BACKWARD', spaces: 2 },
  },
  {
    id: 6,
    name: 'Polis!',
    description: 'The police caught you! Go to Jail! 🚔',
    isMathCard: false,
    effect: { type: 'GO_TO_JAIL' },
  },
  {
    id: 7,
    name: 'Nasib Baik!',
    description: 'Lucky you! Gain a free Level Up token! ⭐',
    isMathCard: false,
    effect: { type: 'FREE_LEVEL_UP_TOKEN' },
  },

  // === MATH CHALLENGE CARDS (5) — BKT-selected question ===
  {
    id: 8,
    name: 'Bonus Besar!',
    description: 'Answer correctly for a BIG bonus! 💰',
    isMathCard: true,
    effect: { type: 'NOTHING' },  // Placeholder — actual effect depends on answer
    correctReward: { type: 'GAIN_MONEY', amount: 120 },
    wrongOutcome: { type: 'GAIN_MONEY', amount: 40 },  // Still positive!
  },
  {
    id: 9,
    name: 'Diskaun Istimewa!',
    description: 'Solve this for a special discount on your next purchase! 🏷️',
    isMathCard: true,
    effect: { type: 'NOTHING' },
    correctReward: { type: 'DISCOUNT_TOKEN', percent: 30 },
    wrongOutcome: { type: 'NOTHING' },
  },
  {
    id: 10,
    name: 'Perisai Sewa!',
    description: 'Answer correctly to shield yourself from the next rent! 🛡️',
    isMathCard: true,
    effect: { type: 'NOTHING' },
    correctReward: { type: 'RENT_SHIELD' },
    wrongOutcome: { type: 'NOTHING' },
  },
  {
    id: 11,
    name: 'Curian Pintar!',
    description: 'Can you outsmart the richest player? 🧠',
    isMathCard: true,
    effect: { type: 'NOTHING' },
    correctReward: { type: 'STEAL_FROM_RICHEST', amount: 50 },
    wrongOutcome: { type: 'NOTHING' },
  },
  {
    id: 12,
    name: 'Hadiah Matematik!',
    description: 'A math prize awaits! 🏆',
    isMathCard: true,
    effect: { type: 'NOTHING' },
    correctReward: { type: 'GAIN_MONEY', amount: 60 },
    wrongOutcome: { type: 'GAIN_MONEY', amount: 30 },
  },
];

// ---- Deck Utilities ----

/**
 * Create a shuffled deck of card IDs.
 * Returns an array of card IDs in random order.
 */
export function createShuffledDeck(): number[] {
  const ids = CHALLENGE_CARDS.map((c) => c.id);
  return shuffleArray(ids);
}

/**
 * Draw the next card from the deck.
 * If the deck is exhausted, reshuffle and reset index.
 * Returns the card and the updated deck state.
 */
export function drawCard(
  deck: number[],
  currentIndex: number
): { card: ChallengeCard; newIndex: number; newDeck: number[] } {
  let activeDeck = deck;
  let index = currentIndex;

  // Reshuffle if exhausted
  if (index >= activeDeck.length) {
    activeDeck = createShuffledDeck();
    index = 0;
  }

  const cardId = activeDeck[index];
  const card = CHALLENGE_CARDS.find((c) => c.id === cardId)!;

  return {
    card,
    newIndex: index + 1,
    newDeck: activeDeck,
  };
}

/**
 * Get a card by its ID
 */
export function getCardById(id: number): ChallengeCard | undefined {
  return CHALLENGE_CARDS.find((c) => c.id === id);
}

// ---- Internal ----

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
