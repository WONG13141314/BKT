// Jail: going to jail, Math Escape, bail and waiting.

import { GameState, AnswerResult, RewardResult } from '../game.types';
import { SkillName, BAIL_COST, MAX_JAIL_TURNS } from '../game.constants';
import { BOARD_TILES } from '../board.config';
import { selectChallenge } from '../../../bkt/bkt.selector';
import { answerEvidence, buildAnswerResult, getCurrentPlayer, rememberIssuedQuestion, updatePlayerAfterAnswer, updatePlayerInList, updatePlayerMastery } from './players';
import { rollDie } from './turn';

// ---- JAIL ----

export function resolveGoToJail(state: GameState): GameState {
  // Go directly to jail — turn ends. Jail decision happens on player's NEXT turn.
  return {
    ...sendToJail(state, state.currentPlayerIndex),
    turnPhase: 'END_TURN',
  };
}

export function sendToJail(state: GameState, playerIdx: number): GameState {
  const jailTileIdx = BOARD_TILES.findIndex((t) => t.type === 'JAIL');

  return {
    ...state,
    players: updatePlayerInList(state.players, playerIdx, (p) => ({
      ...p,
      position: jailTileIdx >= 0 ? jailTileIdx : 5,
      isInJail: true,
      jailTurns: 0,
    })),
  };
}

/** Player attempts math escape from jail */
export function startJailMathEscape(state: GameState): GameState {
  const player = getCurrentPlayer(state);

  const challenge = selectChallenge({
    masteryStates: player.masteryStates,
    context: 'JAIL_ESCAPE',
    consecutiveFailures: player.consecutiveFailures,
    skillAttempts: player.skillAttempts,
    recentQuestionFingerprints: player.recentQuestionFingerprints,
    recentSkillHistory: player.recentIssuedSkills,
    previousDifficultyBySkill: player.lastQuestionDifficulty,
  });

  return {
    ...state,
    players: updatePlayerInList(state.players, state.currentPlayerIndex, (seat) => rememberIssuedQuestion(seat, challenge)),
    turnPhase: 'JAIL_CHALLENGE',
    currentChallenge: challenge,
  };
}

/** Process jail escape answer */
export function processJailEscapeAnswer(
  state: GameState,
  selectedIndex: number | null,
  receivedAt: number = Date.now()
): { newState: GameState; result: AnswerResult } {
  const player = getCurrentPlayer(state);
  const challenge = state.currentChallenge!;
  const { isCorrect, timedOut } = answerEvidence(challenge, selectedIndex, receivedAt);

  const { newMastery, previousMastery } = updatePlayerMastery(
    player, challenge.skillName as SkillName, isCorrect, challenge.difficulty, timedOut,
    challenge.hintRequestedAt !== undefined
  );

  let updatedPlayers = updatePlayerAfterAnswer(state, isCorrect, challenge, newMastery, timedOut);
  const newJailTurns = player.jailTurns + 1;

  if (isCorrect || newJailTurns >= MAX_JAIL_TURNS) {
    // Freed! Player gets a normal turn (either via correct math answer or reaching max jail turns)
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      isInJail: false,
      jailTurns: 0,
    }));

    const reward: RewardResult = isCorrect
      ? { type: 'JAIL_BREAK', value: 0, description: 'You escaped jail! Take your turn!' }
      : { type: 'NONE', value: 0, description: 'Max jail turns reached! Released from jail!' };

    // Leaving jail is its own roll, and it is always a full two dice. `diceCount`
    // must be reset with it, or a snapshot from the removed one-die rule keeps
    // showing a forfeited die.
    return {
      newState: {
        ...state,
        players: updatedPlayers,
        diceValues: [rollDie(), rollDie()],
        diceRollId: state.diceRollId + 1,
        diceCount: 2,
        turnPhase: 'MOVING',
        currentChallenge: null,
      },
      result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player, timedOut),
    };
  } else {
    // Stay jailed for now, increment jail turns
    updatedPlayers = updatePlayerInList(updatedPlayers, state.currentPlayerIndex, (p) => ({
      ...p,
      jailTurns: newJailTurns,
    }));

    const reward: RewardResult = {
      type: 'NONE',
      value: 0,
      description: 'Still in jail. Better luck next turn!',
    };

    return {
      newState: {
        ...state,
        players: updatedPlayers,
        turnPhase: 'END_TURN',
        currentChallenge: null,
      },
      result: buildAnswerResult(isCorrect, challenge, newMastery, previousMastery, reward, player, timedOut),
    };
  }
}

/** Player pays bail */
export function payBail(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  if (player.money < BAIL_COST) return state;

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    money: p.money - BAIL_COST,
    isInJail: false,
    jailTurns: 0,
  }));

  return {
    ...state,
    players: updatedPlayers,
    diceValues: [rollDie(), rollDie()],
    diceRollId: state.diceRollId + 1,
    diceCount: 2,
    turnPhase: 'MOVING',
  };
}

/** Player waits in jail */
export function waitInJail(state: GameState): GameState {
  const player = getCurrentPlayer(state);
  const newJailTurns = player.jailTurns + 1;

  // Auto-release after MAX_JAIL_TURNS
  if (newJailTurns >= MAX_JAIL_TURNS) {
    const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
      ...p,
      isInJail: false,
      jailTurns: 0,
    }));

    return {
      ...state,
      players: updatedPlayers,
      diceValues: [rollDie(), rollDie()],
      diceRollId: state.diceRollId + 1,
      diceCount: 2,
      turnPhase: 'MOVING',
    };
  }

  const updatedPlayers = updatePlayerInList(state.players, state.currentPlayerIndex, (p) => ({
    ...p,
    jailTurns: newJailTurns,
  }));

  return {
    ...state,
    players: updatedPlayers,
    turnPhase: 'END_TURN',
  };
}
