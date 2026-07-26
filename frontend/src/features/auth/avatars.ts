// Monopoly tokens. The server stores the id; the client owns the rendering.

export const AVATARS = [
  'tophat',
  'car',
  'dog',
  'ship',
  'boot',
  'thimble',
  'wheelbarrow',
  'iron',
] as const;

export type Avatar = (typeof AVATARS)[number];

const LABELS: Record<Avatar, string> = {
  tophat: 'Top Hat',
  car: 'Racecar',
  dog: 'Scottie Dog',
  ship: 'Battleship',
  boot: 'Boot',
  thimble: 'Thimble',
  wheelbarrow: 'Wheelbarrow',
  iron: 'Iron',
};

const TOKENS: Record<Avatar, string> = {
  tophat: '🎩',
  car: '🚗',
  dog: '🐕',
  ship: '🚢',
  boot: '👢',
  thimble: '🧵',
  wheelbarrow: '🛒',
  iron: '🧿',
};

function isAvatar(value: string): value is Avatar {
  return (AVATARS as readonly string[]).includes(value);
}

export function avatarLabel(avatar: string): string {
  return isAvatar(avatar) ? LABELS[avatar] : LABELS.tophat;
}

export function avatarToken(avatar: string): string {
  return isAvatar(avatar) ? TOKENS[avatar] : TOKENS.tophat;
}
