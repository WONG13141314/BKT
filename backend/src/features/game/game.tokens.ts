// The eight playing pieces. A profile avatar names the piece a player brings to
// the table; the game stores the piece itself, so saved matches keep theirs.

export const PLAYER_TOKENS = [
  'race_car',
  'top_hat',
  'battleship',
  'boot',
  'scottie_dog',
  'cat',
  'rubber_duck',
  'wheelbarrow',
] as const;

export type PlayerToken = (typeof PLAYER_TOKENS)[number];

const AVATAR_TOKENS: Record<string, PlayerToken> = {
  car: 'race_car',
  tophat: 'top_hat',
  ship: 'battleship',
  boot: 'boot',
  dog: 'scottie_dog',
  cat: 'cat',
  duck: 'rubber_duck',
  wheelbarrow: 'wheelbarrow',
};

export function tokenForAvatar(avatar: string | undefined): PlayerToken | null {
  return (avatar && AVATAR_TOKENS[avatar]) || null;
}

/**
 * One distinct piece per seat, in seat order. A seat keeps its avatar's piece
 * unless an earlier seat already holds it (or the avatar is a retired one);
 * those seats take the first free piece instead.
 */
export function assignTokens(avatars: readonly (string | undefined)[]): PlayerToken[] {
  const taken = new Set<PlayerToken>();
  const chosen = avatars.map((avatar) => {
    const token = tokenForAvatar(avatar);
    if (!token || taken.has(token)) return null;
    taken.add(token);
    return token;
  });
  return chosen.map((token) => {
    if (token) return token;
    const free = PLAYER_TOKENS.find((candidate) => !taken.has(candidate)) ?? PLAYER_TOKENS[0];
    taken.add(free);
    return free;
  });
}
