// ============================================
// Game Engine — Mathopoly
// Pure state transitions for the turn state machine. Each part of the turn
// lives in ./engine; this module is the one public entry point.
// ============================================

export type { GamePlayerSeed } from './engine/setup';
export { initializeGameState } from './engine/setup';
export { getCurrentPlayer, getActivePlayers, hintsRemaining, requestChallengeHint, answerAcceptedUntil } from './engine/players';
export { startRollPhase, movePlayer, endTurn } from './engine/turn';
export { resolveTileEvent } from './engine/landing';
export { purchaseQuote, buyPropertyFullPrice, startSmartBuyChallenge, processSmartBuyAnswer, skipBuy, buildHouse } from './engine/property';
export { submitDuelAnswer, bothDuellistsAnswered, duelSideExpiresAt, nextDuelDeadline, expireDuelSides, resolveDuel } from './engine/duel';
export { processCardChallengeAnswer, acknowledgeCard } from './engine/cards';
export { startJailMathEscape, processJailEscapeAnswer, payBail, waitInJail } from './engine/jail';
export { calculateFinalScores, generateMasteryReport } from './engine/scoring';
