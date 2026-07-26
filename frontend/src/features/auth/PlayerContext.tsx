// Holds the signed-in player for the whole app.
//
// The profile is restored once on boot from the token in localStorage, so a
// returning player never re-enters anything and their BKT mastery carries over.

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authService } from './services/auth.service';
import { PublicPlayer } from './types/auth.types';

interface PlayerContextValue {
  player: PublicPlayer | null;
  /** True until the boot-time restore has settled. */
  isRestoring: boolean;
  setPlayer: (player: PublicPlayer | null) => void;
  signOut: () => void;
}

const PlayerContext = createContext<PlayerContextValue>({
  player: null,
  isRestoring: true,
  setPlayer: () => {},
  signOut: () => {},
});

export function usePlayer() {
  return useContext(PlayerContext);
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<PublicPlayer | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let cancelled = false;

    authService
      .restore()
      .then((restored) => {
        if (!cancelled) setPlayer(restored);
      })
      .finally(() => {
        if (!cancelled) setIsRestoring(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    authService.signOut();
    setPlayer(null);
  }, []);

  return (
    <PlayerContext.Provider value={{ player, isRestoring, setPlayer, signOut }}>
      {children}
    </PlayerContext.Provider>
  );
}
