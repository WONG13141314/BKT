import { Player, TileEvent } from '../types/game.types';
import { TokenIcon } from './TokenIcon';
import './TurnIndicator.css';

export interface TurnFlash {
  id: number;
  tone: 'good' | 'bad';
  text: string;
}

interface TurnIndicatorProps {
  currentPlayer: Player | null;
  isMyTurn: boolean;
  turnPhase: string;
  /** The board's live route line: "Tolak Lane · 2 of 6", or "Landed on …" once the piece stops. */
  routeLabel: string | null;
  /** True while the piece is walking, so the route line is the whole story. */
  moving: boolean;
  /** Name of the space the active player is on. */
  spaceName: string | null;
  pendingTileEvent: TileEvent | null;
  /** Seconds before the server acts for an onlooker's view; hidden on your own turn. */
  secondsLeft: number | null;
  /** A brief outcome for onlookers, e.g. "Correct!", shown beside the status. */
  flash: TurnFlash | null;
}

/** One line saying what the active player is doing now, phrased for you or for onlookers. */
export function getTurnStatus({
  isMyTurn,
  turnPhase,
  routeLabel,
  moving,
  spaceName,
  pendingTileEvent,
}: Pick<TurnIndicatorProps, 'isMyTurn' | 'turnPhase' | 'routeLabel' | 'moving' | 'spaceName' | 'pendingTileEvent'>): string | null {
  if (moving && routeLabel) return `Moving · ${routeLabel}`;
  const space = pendingTileEvent?.tileName ?? spaceName ?? 'this space';

  if (isMyTurn) {
    switch (turnPhase) {
      case 'ROLL_PHASE': return 'Roll the dice';
      case 'MOVING': return 'Moving your token';
      case 'BUY_DECISION': return `${space} · offer, buy or skip`;
      case 'SMART_BUY_CHALLENGE': return `Answer for the bank offer on ${space}`;
      case 'CARD_DRAW': return 'Draw your Challenge Card';
      case 'CARD_MATH_CHALLENGE': return 'Answer the Challenge Card';
      case 'JAIL_DECISION': return `In ${spaceName ?? 'jail'} · choose how to leave`;
      case 'JAIL_CHALLENGE': return 'Answer to escape';
      case 'MATH_DUEL': return 'Rent Defence duel!';
      case 'END_TURN': return routeLabel ? `${routeLabel} · end your turn when ready` : 'Review the board, then end turn';
      default: return routeLabel;
    }
  }

  switch (turnPhase) {
    case 'ROLL_PHASE': return 'Getting ready to roll';
    case 'MOVING': return 'Moving';
    case 'BUY_DECISION': return `Deciding whether to buy ${space}`;
    case 'SMART_BUY_CHALLENGE': return `Answering for a bank offer on ${space}`;
    case 'CARD_DRAW': return 'Drawing a Challenge Card';
    case 'CARD_MATH_CHALLENGE': return 'Answering a Challenge Card question';
    case 'JAIL_DECISION': return `In ${spaceName ?? 'jail'} · deciding how to leave`;
    case 'JAIL_CHALLENGE': return 'Answering to escape jail';
    // A duel involves the owner too, so it is never just "their" turn.
    case 'MATH_DUEL': return 'Rent Defence duel';
    case 'END_TURN': return routeLabel ? `${routeLabel} · finishing turn` : 'Finishing turn';
    default: return routeLabel;
  }
}

export function TurnIndicator(props: TurnIndicatorProps) {
  const { currentPlayer, isMyTurn, secondsLeft, flash } = props;
  if (!currentPlayer) return null;

  const status = getTurnStatus(props);
  const showClock = !isMyTurn && secondsLeft !== null && secondsLeft <= 60;

  return (
    <div className="turn-banner-wrapper">
      <div
        className={`turn-banner ${isMyTurn ? 'turn-banner--you' : ''}`}
        style={{ '--player-color': currentPlayer.color } as React.CSSProperties}
        role="status"
        aria-live="polite"
      >
        <span className="turn-banner__token" aria-hidden="true"><TokenIcon token={currentPlayer.tokenType} size={30} /></span>
        <span className="turn-banner__text">
          <span className="turn-banner__who">
            {isMyTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
          </span>
          {status && <span className="turn-banner__hint">{status}</span>}
        </span>
        {flash && (
          <span key={flash.id} className={`turn-banner__flash turn-banner__flash--${flash.tone}`}>{flash.text}</span>
        )}
        {!flash && showClock && (
          <span className="turn-banner__clock" aria-label={`${secondsLeft} seconds left`}>{secondsLeft}s</span>
        )}
      </div>
    </div>
  );
}
