export type { Avatar } from '../avatars';

export interface PublicPlayer {
  id: string;
  displayName: string;
  avatar: string;
  role: string;
  isClaimed: boolean;
  username: string | null;
}

export interface AuthResult {
  player: PublicPlayer;
  token: string;
}

/** A profile remembered on this device, so shared tablets can switch between them. */
export interface StoredProfile {
  id: string;
  displayName: string;
  avatar: string;
  token: string;
  lastUsedAt: number;
}
