import { hasWebGL2 } from './BoardRendering';

export const loadBoardPiecesScene = () => import('./BoardPiecesScene');
export const loadPhysicsDice = () => import('./PhysicsDice');

let preloading: Promise<unknown> | null = null;

/**
 * Download the game page and 3D scenes, and compile the dice physics engine,
 * before the board mounts so it opens with 3D dice and tokens already in place.
 */
export function preloadBoardScenes(): void {
  if (preloading || !hasWebGL2()) return;
  preloading = Promise.all([
    import('../pages/GamePage'),
    loadPhysicsDice().then((module) => module.warmUpPhysics()),
    loadBoardPiecesScene(),
  ]).catch(() => {
    // React.lazy retries a failed download when the board actually mounts.
    preloading = null;
  });
}
