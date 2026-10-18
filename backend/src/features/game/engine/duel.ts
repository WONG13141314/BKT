// The rent Math Duel between the visitor and the property owner.

import { GameState, PlayerState, TileConfig, DuelState, DuelSide, DuelOutcome, DuelResolution } from '../game.types';
import { SkillName, LANDLORD_BONUS, DUEL_DRAW_RENT_RATIO, formatRM } from '../game.constants';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { answerAcceptedUntil, answerEvidence, applyAnswerToPlayer, updatePlayerInList, updatePlayerMastery } from './players';

// ---- MATH DUEL ----

/**
 * Set up a duel over one property's rent.
 *
 * A property's skill theme gently weights each selection rather than forcing
 * either learner into it. Each player receives an independently selected
 * question at their own BKT difficulty and answer window. The selector adapts
 * to each player's evidence; equivalent challenge remains an evaluation goal.
 */
export function buildDuel(
  challenger: PlayerState,
  owner: PlayerState,
  tile: TileConfig,
  rent: number
): DuelState {
  const startedAt = Date.now();

  const questionFor = (player: PlayerState) =>
    ({ ...selectChallenge({
      masteryStates: player.masteryStates,
      context: 'MATH_DUEL',
      consecutiveFailures: player.consecutiveFailures,
      skillAttempts: player.skillAttempts,
      propertySkillTheme: tile.skillTheme ?? undefined,
      recentQuestionFingerprints: player.recentQuestionFingerprints,
      recentSkillHistory: player.recentIssuedSkills,
      previousDifficultyBySkill: player.lastQuestionDifficulty,
    }), startedAt });

  const side = (player: PlayerState): DuelSide => ({
    playerId: player.id,
    challenge: questionFor(player),
    selectedIndex: null,
    isCorrect: null,
    timedOut: false,
    timeMs: null,
    previousMastery: null,
    newMastery: null,
  });

  return {
    tileIndex: tile.index,
    tileName: tile.name,
    rentAmount: rent,
    challenger: side(challenger),
    owner: side(owner),
    startedAt,
    resolution: null,
  };
}

/**
 * Record one duellist's answer. Returns unchanged state if this player is not in
 * the duel or has already answered — a second submission cannot overwrite a
 * graded answer.
 */
export function submitDuelAnswer(
  state: GameState,
  playerId: string,
  selectedIndex: number | null,
  receivedAt: number = Date.now()
): GameState {
  const duel = state.duelState;
  if (!duel || duel.resolution) return state;

  const which =
    duel.challenger.playerId === playerId
      ? 'challenger'
      : duel.owner.playerId === playerId
        ? 'owner'
        : null;

  if (!which || duel[which].selectedIndex !== null || duel[which].timedOut) return state;

  if (receivedAt >= duelSideExpiresAt(duel[which])) {
    return expireDuelSides(state, receivedAt);
  }

  const side = duel[which];
  const { isCorrect, timedOut, timeMs } = answerEvidence(side.challenge, selectedIndex, receivedAt);
  const answered: DuelSide = {
    ...side,
    selectedIndex,
    isCorrect,
    timedOut,
    timeMs,
  };

  return { ...state, duelState: { ...duel, [which]: answered } };
}

export function bothDuellistsAnswered(state: GameState): boolean {
  const duel = state.duelState;
  return !!duel && isDuelSideComplete(duel.challenger) && isDuelSideComplete(duel.owner);
}

export function isDuelSideComplete(side: DuelSide): boolean {
  return side.selectedIndex !== null || side.timedOut === true;
}

export function duelSideExpiresAt(side: DuelSide): number {
  return answerAcceptedUntil(side.challenge);
}

/** The next authoritative duel deadline is the earliest unanswered side. */
export function nextDuelDeadline(duel: DuelState): number | null {
  const pending = [duel.challenger, duel.owner]
    .filter((side) => !isDuelSideComplete(side))
    .map(duelSideExpiresAt);
  return pending.length > 0 ? Math.min(...pending) : null;
}

/** Marks only the learner(s) whose individual answer window has expired. */
export function expireDuelSides(state: GameState, now: number = Date.now()): GameState {
  const duel = state.duelState;
  if (!duel || duel.resolution) return state;

  const expire = (side: DuelSide): DuelSide =>
    !isDuelSideComplete(side) && now >= duelSideExpiresAt(side)
      ? { ...side, timedOut: true, isCorrect: false, timeMs: Math.max(0, now - side.challenge.startedAt) }
      : side;
  const challenger = expire(duel.challenger);
  const owner = expire(duel.owner);
  if (challenger === duel.challenger && owner === duel.owner) return state;

  return { ...state, duelState: { ...duel, challenger, owner } };
}

/**
 * Settle the duel and move the money.
 *
 * | | Owner correct | Owner wrong |
 * |---|---|---|
 * | **Challenger correct** | draw — half rent | challenger wins — no rent |
 * | **Challenger wrong**   | owner wins — full rent | draw — full rent |
 *
 * The challenger can never pay more than the rent they owed before the duel
 * started, so a child who is struggling is never punished twice for it. The
 * owner's reward is paid by the bank rather than taken from the challenger, for
 * the same reason.
 *
 * Any side that has not answered when time runs out counts as wrong.
 */
export function resolveDuel(state: GameState): {
  newState: GameState;
  duel: DuelState;
  resolution: DuelResolution;
} {
  const duel = state.duelState!;

  const challengerCorrect = duel.challenger.isCorrect === true;
  const ownerCorrect = duel.owner.isCorrect === true;

  let outcome: DuelOutcome;
  let rentPaid: number;

  if (challengerCorrect && ownerCorrect) {
    outcome = 'DRAW_BOTH';
    rentPaid = Math.floor(duel.rentAmount * DUEL_DRAW_RENT_RATIO);
  } else if (challengerCorrect) {
    outcome = 'CHALLENGER_WINS';
    rentPaid = 0;
  } else if (ownerCorrect) {
    outcome = 'OWNER_WINS';
    rentPaid = duel.rentAmount;
  } else {
    outcome = 'DRAW_NEITHER';
    rentPaid = duel.rentAmount;
  }

  const landlordBonus = ownerCorrect ? LANDLORD_BONUS : 0;
  const headline = duelHeadline(outcome, rentPaid, duel.rentAmount, landlordBonus);

  // The shield is spent only when it actually blocks a payment, so winning the
  // duel outright keeps it for a later rent.
  const shieldBlocked = rentPaid > 0 &&
    state.players.find((p) => p.id === duel.challenger.playerId)?.hasRentShield === true
    ? rentPaid
    : 0;
  if (shieldBlocked > 0) rentPaid = 0;

  const resolution: DuelResolution = {
    outcome,
    rentPaid,
    landlordBonus,
    challengerCorrect,
    ownerCorrect,
    headline: shieldBlocked > 0 ? `${headline} Rent Shield blocked the ${formatRM(shieldBlocked)} payment.` : headline,
    ...(shieldBlocked > 0 ? { shieldBlocked } : {}),
  };

  // Apply both players' BKT updates, recording each transition on its side so
  // the attempt log has the before/after it cannot reconstruct later.
  let players = state.players;

  const settleSide = (side: DuelSide): DuelSide => {
    const idx = players.findIndex((p) => p.id === side.playerId);
    if (idx === -1) return side;

    const timedOut = side.timedOut === true || side.selectedIndex === null;
    const correct = !timedOut && side.isCorrect === true;
    const { newMastery, previousMastery } = updatePlayerMastery(
      players[idx], side.challenge.skillName as SkillName, correct, side.challenge.difficulty, timedOut,
      side.challenge.hintRequestedAt !== undefined
    );

    players = updatePlayerInList(players, idx, (p) => ({
      ...p,
      ...applyAnswerToPlayer(p, side.challenge.skillName, correct, newMastery, timedOut,
        side.challenge.hintRequestedAt !== undefined),
    }));

    // An unanswered side is graded wrong, and says so explicitly.
    return { ...side, isCorrect: correct, previousMastery, newMastery };
  };

  const challengerSide = settleSide(duel.challenger);
  const ownerSide = settleSide(duel.owner);

  const challengerIdx = players.findIndex((p) => p.id === challengerSide.playerId);
  const ownerIdx = players.findIndex((p) => p.id === ownerSide.playerId);

  players = players.map((p, idx) => {
    if (idx === challengerIdx) {
      return { ...p, money: p.money - rentPaid, hasRentShield: shieldBlocked > 0 ? false : p.hasRentShield };
    }
    if (idx === ownerIdx) return { ...p, money: p.money + rentPaid + landlordBonus };
    return p;
  });

  const settled: DuelState = {
    ...duel,
    challenger: challengerSide,
    owner: ownerSide,
    resolution,
  };

  return {
    newState: {
      ...state,
      players,
      duelState: settled,
      pendingTileEvent: null,
      turnPhase: 'END_TURN',
    },
    duel: settled,
    resolution,
  };
}

function duelHeadline(
  outcome: DuelOutcome,
  rentPaid: number,
  fullRent: number,
  bonus: number
): string {
  const bonusNote = bonus > 0 ? ` Landlord's bonus +${formatRM(bonus)}.` : '';

  switch (outcome) {
    case 'CHALLENGER_WINS':
      return `Rent defended — no rent to pay!`;
    case 'OWNER_WINS':
      return `Property held. Rent ${formatRM(fullRent)}.${bonusNote}`;
    case 'DRAW_BOTH':
      return `Both correct — rent halved to ${formatRM(rentPaid)}.${bonusNote}`;
    case 'DRAW_NEITHER':
    default:
      return `Neither answer stood. Rent ${formatRM(fullRent)}.`;
  }
}
