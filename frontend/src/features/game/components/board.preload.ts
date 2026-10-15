import { hasWebGL2 } from './BoardRendering';

export const loadBoardPiecesScene = () => import('./BoardPiecesScene');
export const loadPhysicsDice = () => import('./PhysicsDice');

/** Fetch the 3D chunks before the board mounts, e.g. while the lobby is open. */
export function preloadBoardScenes(): void {
  if (!hasWebGL2()) return;
  // A failed prefetch is retried by React.lazy when the board actually mounts.
  void loadPhysicsDice().catch(() => undefined);
  void loadBoardPiecesScene().catch(() => undefined);
}
