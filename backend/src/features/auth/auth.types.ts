/** Client-safe profile fields shared by the HTTP and realtime APIs. */
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
