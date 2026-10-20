// Monopoly tokens. The server stores the id; the client owns the rendering.

import type { PlayerToken } from '../game/types/game.types';

export const AVATARS = [
  'tophat',
  'car',
  'dog',
  'ship',
  'boot',
  'cat',
  'duck',
  'wheelbarrow',
] as const;

export type Avatar = (typeof AVATARS)[number];

const LABELS: Record<Avatar, string> = {
  tophat: 'Top Hat',
  car: 'Racecar',
  dog: 'Scottie Dog',
  ship: 'Battleship',
  boot: 'Boot',
  cat: 'Cat',
  duck: 'Rubber Duck',
  wheelbarrow: 'Wheelbarrow',
};

// The playing piece each avatar brings to the table (rendered from the 3D models).
const PIECES: Record<Avatar, PlayerToken> = {
  tophat: 'top_hat',
  car: 'race_car',
  dog: 'scottie_dog',
  ship: 'battleship',
  boot: 'boot',
  cat: 'cat',
  duck: 'rubber_duck',
  wheelbarrow: 'wheelbarrow',
};

export function isAvatar(value: string): value is Avatar {
  return (AVATARS as readonly string[]).includes(value);
}

export function avatarLabel(avatar: string): string {
  return isAvatar(avatar) ? LABELS[avatar] : LABELS.tophat;
}

export function avatarPiece(avatar: string): PlayerToken {
  return isAvatar(avatar) ? PIECES[avatar] : PIECES.tophat;
}
