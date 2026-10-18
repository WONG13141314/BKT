import { useCallback, useRef, useState } from 'react';
import { authService } from '../../auth/services/auth.service';
import type { PublicPlayer, StoredProfile } from '../../auth/types/auth.types';

/**
 * When this browser's signed-in profile is not seated in the game (for
 * example a shared school laptop), switch to the saved profile that is, or
 * let the learner choose between several.
 */
export function useGameSeatRecovery({ roomCode, playerName, setPlayer, disconnectSocket, clearGame }: {
  roomCode: string | null;
  playerName: string | undefined;
  setPlayer: (player: PublicPlayer) => void;
  disconnectSocket: () => void;
  clearGame: () => void;
}) {
  const [seatRecoveryMessage, setSeatRecoveryMessage] = useState<string | null>(null);
  const [seatChoices, setSeatChoices] = useState<StoredProfile[]>([]);
  const [isSeatRecovering, setIsSeatRecovering] = useState(false);
  const seatRecoveryRef = useRef(false);

  const switchToGameSeat = useCallback(async (profile: StoredProfile) => {
    if (seatRecoveryRef.current) return;
    seatRecoveryRef.current = true;
    setIsSeatRecovering(true);
    setSeatChoices([]);
    setSeatRecoveryMessage(`Restoring ${profile.displayName}'s game seat…`);

    try {
      const restored = await authService.switchTo(profile);
      if (!restored) throw new Error('The saved profile has expired.');
      if (roomCode) sessionStorage.setItem(`mm.game-seat.${roomCode}`, restored.id);
      // The old socket is authenticated as the wrong profile. Replacing it is
      // essential; changing React state alone cannot change a socket identity.
      disconnectSocket();
      setPlayer(restored);
      setSeatRecoveryMessage(null);
    } catch (error) {
      setSeatRecoveryMessage(
        error instanceof Error ? error.message : 'Could not restore the player for this game.'
      );
    } finally {
      seatRecoveryRef.current = false;
      setIsSeatRecovering(false);
    }
  }, [disconnectSocket, roomCode, setPlayer]);

  const recoverGameSeat = useCallback((seats: { playerId: string; name: string }[]) => {
    if (seatRecoveryRef.current) return;
    // Never leave a stale board visible as WAIT while identity is unresolved.
    clearGame();

    const savedProfiles = authService.getStoredProfiles();
    const candidates = savedProfiles.filter((profile) =>
      seats.some((seat) => seat.playerId === profile.id)
    );
    const preferredId = roomCode ? sessionStorage.getItem(`mm.game-seat.${roomCode}`) : null;
    const preferred = candidates.find((profile) => profile.id === preferredId);

    if (preferred || candidates.length === 1) {
      void switchToGameSeat(preferred ?? candidates[0]);
      return;
    }

    setSeatChoices(candidates);
    setSeatRecoveryMessage(candidates.length > 1
      ? 'Choose the player who joined this game.'
      : `${playerName ?? 'This profile'} did not join this game.`);
  }, [playerName, roomCode, clearGame, switchToGameSeat]);

  /** The learner is seated: clear any recovery prompt. */
  const clearSeatRecovery = useCallback(() => {
    setSeatRecoveryMessage(null);
    setSeatChoices([]);
  }, []);

  return { seatRecoveryMessage, seatChoices, isSeatRecovering, switchToGameSeat, recoverGameSeat, clearSeatRecovery };
}
