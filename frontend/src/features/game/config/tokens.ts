import type { PlayerToken } from '../types/game.types';

/** Compact marks for each piece in the interface; the board shows the 3D models. */
export const TOKEN_ICONS: Record<PlayerToken, string> = {
  race_car: '🏎️',
  top_hat: '🎩',
  battleship: '🚢',
  boot: '👢',
  scottie_dog: '🐕',
  cat: '🐈',
  rubber_duck: '🦆',
  wheelbarrow: '🛒',
};

export const TOKEN_NAMES: Record<PlayerToken, string> = {
  race_car: 'Race car',
  top_hat: 'Top hat',
  battleship: 'Battleship',
  boot: 'Boot',
  scottie_dog: 'Scottie dog',
  cat: 'Cat',
  rubber_duck: 'Rubber duck',
  wheelbarrow: 'Wheelbarrow',
};
