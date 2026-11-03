import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChallengeCard } from '../types/game.types';
import type { TableCardDraw } from '../components/tabletop/TabletopScene';

/** How long the drawer may leave the deck before the top card is drawn for them. */
export const AUTO_DRAW_MS = 6_000;
/** Onlookers' draw starts once the camera has reached the deck. */
export const WATCH_DRAW_MS = 900;
/** If the board never reports the card arriving (a hidden tab, a lost scene), show it anyway. */
export const DRAW_FALLBACK_MS = 2_600;

type Stage = TableCardDraw['stage'];

interface DrawState {
  key: string;
  stage: Stage;
  origin: { x: number; y: number } | null;
}

/**
 * The stages of drawing one Challenge Card: the top card waits on the deck,
 * is drawn (picked by the drawer, or on its own for onlookers), rises off the
 * board, and is then shown on screen. Nothing here talks to the server: the
 * drawer's OK on the shown card is the acknowledgement.
 */
export function useCardDraw(card: ChallengeCard | null, drawKey: string | null, isDrawer: boolean) {
  const [state, setState] = useState<DrawState | null>(null);
  const current = state && state.key === drawKey ? state : null;
  const stage: Stage | null = drawKey ? current?.stage ?? 'ready' : null;

  useEffect(() => {
    setState(drawKey ? { key: drawKey, stage: 'ready', origin: null } : null);
  }, [drawKey]);

  const advance = useCallback((from: Stage, to: Stage, origin: DrawState['origin'] = null) => {
    setState((previous) => previous && previous.key === drawKey && previous.stage === from
      ? { ...previous, stage: to, origin: origin ?? previous.origin }
      : previous);
  }, [drawKey]);

  const pick = useCallback(() => advance('ready', 'drawing'), [advance]);
  const onDrawn = useCallback((point: { x: number; y: number } | null) => advance('drawing', 'shown', point), [advance]);

  useEffect(() => {
    if (stage === 'ready') {
      const timer = setTimeout(pick, isDrawer ? AUTO_DRAW_MS : WATCH_DRAW_MS);
      return () => clearTimeout(timer);
    }
    if (stage === 'drawing') {
      const timer = setTimeout(() => onDrawn(null), DRAW_FALLBACK_MS);
      return () => clearTimeout(timer);
    }
  }, [stage, isDrawer, pick, onDrawn]);

  const cardId = card?.id;
  const cardName = card?.name;
  const cardDescription = card?.description;
  const isMathCard = card?.isMathCard;
  const tableCard = useMemo(
    () => (cardName !== undefined ? { name: cardName, description: cardDescription ?? '', isMathCard: !!isMathCard } : null),
    // The server resends the card with every snapshot; only a different card is a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardId, cardName, cardDescription, isMathCard],
  );

  const tableDraw = useMemo<TableCardDraw | null>(() => (drawKey && stage && tableCard ? {
    id: drawKey,
    card: tableCard,
    stage,
    onPick: isDrawer ? pick : undefined,
    onDrawn,
  } : null), [drawKey, stage, tableCard, isDrawer, pick, onDrawn]);

  return { stage, origin: current?.origin ?? null, pick, tableDraw };
}
