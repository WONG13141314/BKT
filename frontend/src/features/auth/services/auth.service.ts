// ============================================
// Auth service — anonymous-first identity
//
// The token in localStorage IS the player's identity. It is written once and
// then reused forever; nothing in this file clears it except an explicit
// sign-out or a server telling us the profile is gone. The old flow wiped the
// token on every visit to the join screen, which is why every session looked
// like a different person to the BKT engine.
// ============================================

import { apiFetch } from '../../../shared/utils/api';
import { Avatar } from '../avatars';
import { AuthResult, PublicPlayer, StoredProfile } from '../types/auth.types';

const TOKEN_KEY = 'mm.token';
const PROFILES_KEY = 'mm.profiles';
const MAX_REMEMBERED_PROFILES = 6;

// ---- Local storage ----

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Profiles previously used on this device, most recent first. */
export function getStoredProfiles(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProfile[];
    return Array.isArray(parsed)
      ? parsed.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      : [];
  } catch {
    return [];
  }
}

function rememberProfile(player: PublicPlayer, token: string) {
  const others = getStoredProfiles().filter((p) => p.id !== player.id);
  const updated: StoredProfile[] = [
    {
      id: player.id,
      displayName: player.displayName,
      avatar: player.avatar,
      token,
      lastUsedAt: Date.now(),
    },
    ...others,
  ].slice(0, MAX_REMEMBERED_PROFILES);

  localStorage.setItem(PROFILES_KEY, JSON.stringify(updated));
}

function forgetProfile(playerId: string) {
  const remaining = getStoredProfiles().filter((p) => p.id !== playerId);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(remaining));
}

function persist(result: AuthResult): PublicPlayer {
  setToken(result.token);
  rememberProfile(result.player, result.token);
  return result.player;
}

// ---- API ----

export const authService = {
  getToken,
  getStoredProfiles,

  /** First visit: create a permanent profile without a signup step. */
  createGuest: async (displayName: string, avatar: Avatar): Promise<PublicPlayer> => {
    const result: AuthResult = await apiFetch('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ displayName, avatar }),
    });
    return persist(result);
  },

  /**
   * Return visit: swap the stored token for a fresh one and get the same
   * profile back. Returns null when there is no usable token, in which case
   * the UI asks for a nickname.
   */
  restore: async (): Promise<PublicPlayer | null> => {
    if (!getToken()) return null;

    try {
      const result: AuthResult = await apiFetch('/auth/refresh', { method: 'POST' });
      return persist(result);
    } catch {
      // Expired token, or the profile was removed server-side.
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  },

  /** Shared device: switch to another profile already used here. */
  switchTo: async (profile: StoredProfile): Promise<PublicPlayer | null> => {
    setToken(profile.token);
    const player = await authService.restore();
    if (!player) forgetProfile(profile.id);
    return player;
  },

  /** Opt in to a username + PIN so the profile works on other devices. */
  claim: async (username: string, pin: string): Promise<PublicPlayer> => {
    const { player } = await apiFetch('/auth/claim', {
      method: 'POST',
      body: JSON.stringify({ username, pin }),
    });
    rememberProfile(player, getToken() ?? '');
    return player;
  },

  /** Restore a claimed profile on a device that has never seen it. */
  signIn: async (username: string, pin: string): Promise<PublicPlayer> => {
    const result: AuthResult = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ username, pin }),
    });
    return persist(result);
  },

  updateProfile: async (data: { displayName?: string; avatar?: Avatar }): Promise<PublicPlayer> => {
    const { player } = await apiFetch('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    rememberProfile(player, getToken() ?? '');
    return player;
  },

  /** Sign out of the active profile but keep it listed on this device. */
  signOut: () => {
    localStorage.removeItem(TOKEN_KEY);
  },
};
