import { hasWebGL2 } from './BoardRendering';

export const loadTabletopScene = () => import('./tabletop/TabletopScene');

let preloading: Promise<unknown> | null = null;

/**
 * Download the game page and the 3D table, and compile the dice physics engine,
 * before the board mounts so it opens with the table already in place.
 */
export function preloadBoardScenes(): void {
  if (preloading || !hasWebGL2()) return;
  preloading = Promise.all([
    import('../pages/GamePage'),
    import('./PhysicsDice').then((module) => module.warmUpPhysics()),
    loadTabletopScene(),
  ]).catch(() => {
    // React.lazy retries a failed download when the board actually mounts.
    preloading = null;
  });
}
