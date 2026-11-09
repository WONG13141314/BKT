import { graphicsSupport } from './BoardRendering';

export const loadTabletopScene = () => import('./tabletop/TabletopScene');
const loadFlatDice = () => import('./flat/FlatDice');

let preloading: Promise<unknown> | null = null;

/**
 * Download the game page and the board this computer will use before the board
 * mounts, so it opens with the table already in place: the 3D table where the
 * graphics chip draws 3D, otherwise the flat board's small 3D dice view.
 */
export function preloadBoardScenes(): void {
  if (preloading) return;
  const support = graphicsSupport();
  preloading = Promise.all([
    import('../pages/GamePage'),
    support === 'hardware' ? loadTabletopScene() : support === 'software' ? loadFlatDice() : null,
  ]).catch(() => {
    // React.lazy retries a failed download when the board actually mounts.
    preloading = null;
  });
}
