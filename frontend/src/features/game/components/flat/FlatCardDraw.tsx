import { useLayoutEffect, useMemo, useRef } from 'react';
import { CARD_PRESENT, cardDrawFrame } from '../board.animation';
import type { TableCardDraw } from '../board.types';
import { CARD_SIZE, DECK_SCALE, DECK_SPOT } from '../tabletop/board.layout';
import { drawCardFace } from '../tabletop/board.art';
import type { SafeInsets } from '../tabletop/camera';
import { ArtCanvas } from './ArtCanvas';

/** Where the deck is on screen, and the board's pixels per unit there. */
export interface DeckView {
  project(x: number, z: number): [number, number];
  unit(): number;
}

/**
 * The top card coming off the deck, with the 3D table's timing: waiting, it
 * pulses gently; drawn, it lifts, turns face up and comes to the middle of the
 * open screen at the same size the 3D card is held up at. It stays there while
 * the card is being read.
 */
export function FlatCardDraw({ draw, back, deck: deckView, stage, insets }: {
  draw: TableCardDraw;
  back: HTMLCanvasElement;
  deck: DeckView;
  /** The table's size and where it is on screen. */
  stage: { width: number; height: number; left: number; top: number };
  insets: SafeInsets;
}) {
  const face = useMemo(() => drawCardFace(draw.card), [draw.card]);
  const card = useRef<HTMLDivElement>(null);
  const flip = useRef<HTMLDivElement>(null);
  const started = useRef<number | null>(null);
  const reported = useRef(false);
  const onDrawn = useRef(draw.onDrawn);
  onDrawn.current = draw.onDrawn;

  // The presented size: half the screen's height, at most 80% of its width.
  const aspect = CARD_SIZE.width / CARD_SIZE.depth;
  let height = CARD_PRESENT.height * stage.height;
  let width = height * aspect;
  if (width > CARD_PRESENT.width * stage.width) {
    width = CARD_PRESENT.width * stage.width;
    height = width / aspect;
  }

  useLayoutEffect(() => {
    if (draw.stage !== 'ready' && started.current === null) started.current = performance.now();
    const freeWidth = stage.width - insets.left - insets.right;
    const freeHeight = stage.height - insets.top - insets.bottom;
    const target = { x: insets.left + freeWidth / 2, y: insets.top + freeHeight / 2 - CARD_PRESENT.raise * stage.height };
    const deckTurn = -DECK_SPOT.yaw;
    let loop = 0;

    const render = (now: number) => {
      const element = card.current;
      if (!element || !flip.current) return false;
      const [deckX, deckY] = deckView.project(DECK_SPOT.x, DECK_SPOT.z);
      const unit = deckView.unit();
      const deck = { x: deckX, y: deckY, scale: (CARD_SIZE.depth * DECK_SCALE * unit) / height };
      let x = deck.x;
      let y = deck.y;
      let scale: number;
      let turn = deckTurn;
      let over = 0;
      let moving = true;
      if (started.current === null) {
        // Waiting to be drawn: a gentle pulse says "this one".
        scale = deck.scale * (1 + 0.03 * Math.sin(now / 260));
      } else {
        const step = cardDrawFrame((now - started.current) / 1000);
        const liftedScale = deck.scale * (1 + 0.25 * step.lift);
        const liftedY = deck.y - step.lift * 0.3 * unit;
        turn = deckTurn * (1 - step.lift);
        over = step.over;
        x = deck.x + (target.x - deck.x) * step.present;
        y = liftedY + (target.y - liftedY) * step.present;
        scale = liftedScale + (1 - liftedScale) * step.present;
        if (step.done) {
          moving = false;
          if (!reported.current) {
            reported.current = true;
            onDrawn.current({ x: stage.left + target.x, y: stage.top + target.y });
          }
        }
      }
      element.style.transform = `translate(${x - width / 2}px, ${y - height / 2}px) rotate(${turn}rad) scale(${scale})`;
      flip.current.style.transform = `rotateY(${over * 180}deg)`;
      return moving;
    };
    const tick = (now: number) => {
      loop = render(now) ? requestAnimationFrame(tick) : 0;
    };
    render(performance.now());
    loop = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(loop);
  }, [draw.stage, deckView, stage, insets, width, height]);

  return (
    <div ref={card} className="flat-card" style={{ width, height }} aria-hidden="true">
      <div ref={flip} className="flat-card__flip">
        <div className="flat-card__face"><ArtCanvas source={back} width={width} height={height} /></div>
        <div className="flat-card__face flat-card__face--front"><ArtCanvas source={face} width={width} height={height} /></div>
      </div>
    </div>
  );
}
