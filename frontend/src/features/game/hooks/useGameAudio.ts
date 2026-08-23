import { useCallback, useEffect, useRef } from 'react';
import { useAudio, useAudioScene } from '../../../shared/audio/AudioContext';
import type { SoundEffect } from '../../../shared/audio/audio-engine';
import { GameState } from '../types/game.types';

export function gameStateSounds(previous: GameState, current: GameState): SoundEffect[] {
  if (previous.id !== current.id) return [];
  const sounds: SoundEffect[] = [];

  if (current.diceRollId !== previous.diceRollId) sounds.push('diceRoll');
  if (current.currentPlayerIndex !== previous.currentPlayerIndex) sounds.push('turn');

  if (current.turnPhase !== previous.turnPhase) {
    if (current.turnPhase === 'CARD_DRAW') sounds.push('card');
    if (current.turnPhase === 'MATH_DUEL') sounds.push('duel');
    if (current.turnPhase === 'JAIL_DECISION') sounds.push('jail');
    if (['SMART_BUY_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE'].includes(current.turnPhase)) {
      sounds.push('challenge');
    }
  }

  const boughtProperty = current.properties.some((property) => {
    const oldProperty = previous.properties.find((item) => item.tileIndex === property.tileIndex);
    return !oldProperty?.ownerId && !!property.ownerId;
  });
  const builtHouse = current.properties.some((property) => {
    const oldProperty = previous.properties.find((item) => item.tileIndex === property.tileIndex);
    return property.isLeveledUp && !oldProperty?.isLeveledUp;
  });
  const newBankruptcy = current.players.some((player) => {
    const oldPlayer = previous.players.find((item) => item.id === player.id);
    return player.isBankrupt && oldPlayer && !oldPlayer.isBankrupt;
  });
  const escapedJail = current.players.some((player) => {
    const oldPlayer = previous.players.find((item) => item.id === player.id);
    return !player.isInJail && oldPlayer?.isInJail;
  });
  const moneyChanged = current.players.some((player) => {
    const oldPlayer = previous.players.find((item) => item.id === player.id);
    return oldPlayer && oldPlayer.money !== player.money;
  });

  // Specific outcomes take priority so a purchase does not also make a
  // generic cash noise during the same committed state update.
  if (newBankruptcy) sounds.push('bankrupt');
  else if (builtHouse) sounds.push('house');
  else if (boughtProperty) sounds.push('property');
  else if (escapedJail) sounds.push('jailEscape');
  else if (moneyChanged) sounds.push('money');

  return sounds;
}

/** Maps authoritative game-state transitions to table-wide sound cues. */
export function useGameAudio(gameState: GameState | null) {
  const { play } = useAudio();
  const previousRef = useRef<GameState | null>(null);
  useAudioScene('game');

  useEffect(() => {
    if (!gameState) return;
    const previous = previousRef.current;
    previousRef.current = gameState;
    if (!previous) return;
    gameStateSounds(previous, gameState).forEach(play);
  }, [gameState, play]);

  const playMovementStep = useCallback((tileIndex: number) => {
    play(tileIndex === 0 ? 'passGo' : 'tokenStep');
  }, [play]);

  return { play, playMovementStep };
}
