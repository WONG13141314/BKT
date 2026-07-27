import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Board } from '../components/Board';
import { DiceRoller } from '../components/DiceRoller';
import { PlayerPanel } from '../components/PlayerPanel';
import { TurnIndicator } from '../components/TurnIndicator';
import { GameOverScreen } from '../components/GameOverScreen';
import { GameNotifications } from '../components/GameNotification';
import { ColumnQuestion } from '../components/ColumnQuestion';
import { LongDivisionQuestion } from '../components/LongDivisionQuestion';
import { McqQuestion } from '../components/McqQuestion';
import { ChallengeCardModal } from '../components/ChallengeCardModal';
import { MathDuel } from '../components/MathDuel';
import { BOARD_TILES } from '../config/board.config';
import { usePlayer } from '../../auth/PlayerContext';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  MathChallenge,
  MasteryReport,
  PublicDuelState,
  formatRM,
} from '../types/game.types';
import {
  ArrowRight,
  Banknote,
  Loader2,
  AlertCircle,
  Hourglass,
  Zap,
  Star,
  Lock,
  DollarSign,
  SkipForward,
} from 'lucide-react';
import './GamePage.css';

type PacingState = 'IDLE' | 'DICE_FEEDBACK' | 'PAWN_MOVING' | 'TILE_LANDING' | 'EVENT_ACTIVE';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get('code');
  const gameId = roomCode ? `game_${roomCode}` : null;

  const { player } = usePlayer();
  const myPlayerId = player?.id ?? '';

  const {
    gameState,
    currentPlayer,
    isMyTurn,
    answerResult,
    finalScores,
    notifications,
    setGameState,
    setAnswerResult,
    setFinalScores,
    addNotification,
    dismissNotification,
  } = useGameState(myPlayerId);

  const [activeChallenge, setActiveChallenge] = useState<MathChallenge | null>(null);
  const [challengePlayerId, setChallengePlayerId] = useState<string | null>(null);
  const [masteryReports, setMasteryReports] = useState<MasteryReport[] | null>(null);

  // Duel state is separate from `gameState`: it is redacted per recipient, so it
  // arrives on its own channel rather than inside the shared state broadcast.
  const [duel, setDuel] = useState<PublicDuelState | null>(null);
  const [duelChallenge, setDuelChallenge] = useState<MathChallenge | null>(null);

  const challengeStartTime = useRef<number>(Date.now());

  // Game Flow Pacing States
  const [pacingState, setPacingState] = useState<PacingState>('EVENT_ACTIVE');

  const landingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    emitRoll,
    emitRollAnswer,
    emitBuyFull,
    emitSmartBuy,
    emitSmartBuyAnswer,
    emitSkipBuy,
    emitDuelAnswer,
    emitCardAck,
    emitCardAnswer,
    emitJailMath,
    emitJailAnswer,
    emitJailBail,
    emitJailWait,
    emitLevelUp,
    emitLevelUpAnswer,
    emitLevelUpDecline,
    emitEndTurn,
    emitRequestChallenge,
  } = useGameSocket(gameId, {
    onStateUpdate: (state) => {
      setGameState(state);
      if (state.currentChallenge) {
        setActiveChallenge(state.currentChallenge);
        challengeStartTime.current = Date.now();
      } else if (!isChallengePhase(state.turnPhase)) {
        setChallengePlayerId(null);
      }
      // The server has moved past the duel — clear it immediately so it
      // cannot linger into the next player's turn.
      if (state.turnPhase !== 'MATH_DUEL') {
        setDuel(null);
        setDuelChallenge(null);
      }
    },
    onChallenge: (data) => {
      setChallengePlayerId(data.playerId);
      setActiveChallenge(data.challenge);
      setAnswerResult(null);
      challengeStartTime.current = Date.now();
      // The duel reveal lingers deliberately so the table can read it, but the
      // server has already advanced the turn. Drop it the moment the next
      // question arrives, or it would cover the new player's challenge.
      setDuel(null);
    },
    onChallengeStarted: (data) => {
      setChallengePlayerId(data.playerId);
    },
    onAnswerResult: (data) => {
      setAnswerResult(data.result);

      const { isCorrect, timedOut, correctAnswer } = data.result;
      // Onlookers receive the outcome only — no reward or answer details.
      const desc = data.result.reward?.description ? ` (${data.result.reward.description})` : '';

      let msg: string;
      if (isCorrect) {
        msg = `Correct${desc}`;
      } else if (timedOut) {
        msg = correctAnswer ? `Time's up — answer was ${correctAnswer}${desc}` : "Time's up";
      } else {
        msg = correctAnswer ? `Incorrect — answer was ${correctAnswer}${desc}` : 'Incorrect';
      }
      addNotification(isCorrect ? 'reward' : 'penalty', msg);

      // Hold the panel open long enough to read the revealed answer.
      const holdMs = isCorrect ? 900 : 1800;

      if (gameState?.turnPhase === 'ROLL_CHALLENGE') {
        setPacingState('DICE_FEEDBACK');
        setTimeout(() => {
          setActiveChallenge(null);
          setAnswerResult(null);
          setChallengePlayerId(null);
          setPacingState('PAWN_MOVING');
        }, holdMs);
      } else {
        setTimeout(() => {
          setActiveChallenge(null);
          setAnswerResult(null);
          setChallengePlayerId(null);
        }, holdMs);
      }
    },
    onDuel: (data) => {
      // Ignore re-sent resolved duels — they've already been handled by
      // onDuelResult and would re-show the card after the timeout cleared it.
      if (data.duel.resolution) return;
      setDuel(data.duel);
      setDuelChallenge(data.myChallenge);
      if (data.myChallenge) challengeStartTime.current = Date.now();
    },
    onDuelResult: (data) => {
      setDuel(data.duel);
      setDuelChallenge(null);
      addNotification(
        data.resolution.outcome === 'DRAW_NEITHER' ? 'info' : 'reward',
        data.resolution.headline
      );
      // Hold the reveal long enough to read it, then clear for the next turn.
      setTimeout(() => setDuel(null), 3200);
    },
    onGameFinished: (data) => {
      setFinalScores(data.scores);
      setMasteryReports(data.masteryReports ?? null);
    },
    onBotAction: () => {
      // Bot actions are communicated through board animations (dice, piece movement).
      // No text banner needed.
    },
    onError: (data) => {
      addNotification('info', data.message);
    },
  });

  // ---- Pacing Logic (Delaying UI for animations) ----
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [isPawnMoving, setIsPawnMoving] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const prevPlayerIdxRef = useRef<number | null>(null);

  const handleMovementChange = useCallback((isMoving: boolean) => {
    setIsPawnMoving(isMoving);
    if (isMoving) {
      setPacingState('PAWN_MOVING');
    }
  }, []);

  const handleMovementComplete = useCallback(() => {
    setIsPawnMoving(false);
    if (!gameState) return;

    setPacingState('TILE_LANDING');

    if (landingTimerRef.current) clearTimeout(landingTimerRef.current);
    landingTimerRef.current = setTimeout(() => {
      setPacingState('EVENT_ACTIVE');
    }, 850);
  }, [gameState]);

  useEffect(() => {
    if (!gameState) return;
    
    const currentPhase = gameState.turnPhase;
    const prevPhase = prevPhaseRef.current;
    const prevIdx = prevPlayerIdxRef.current;
    
    // When the active player changes (new turn), reset pacing so the new
    // player's UI controls aren't blocked by stale animation state from the
    // previous turn.
    if (prevIdx !== null && prevIdx !== gameState.currentPlayerIndex) {
      setPacingState('EVENT_ACTIVE');
      setIsPawnMoving(false);
      setActivePhase(currentPhase);
      if (landingTimerRef.current) {
        clearTimeout(landingTimerRef.current);
        landingTimerRef.current = null;
      }
    } else if (currentPhase !== prevPhase) {
      setActivePhase(currentPhase);
    }

    prevPhaseRef.current = currentPhase;
    prevPlayerIdxRef.current = gameState.currentPlayerIndex;
  }, [gameState]);

  // Auto-request missing active challenge if in challenge phase
  useEffect(() => {
    if (gameState && isChallengePhase(gameState.turnPhase) && isMyTurn && !activeChallenge && pacingState === 'EVENT_ACTIVE') {
      emitRequestChallenge();
    }
  }, [gameState?.turnPhase, isMyTurn, activeChallenge, pacingState, emitRequestChallenge]);


  // ---- Answer Handler ----
  const handleAnswer = useCallback((selectedIndex: number) => {
    const timeMs = Date.now() - challengeStartTime.current;
    if (!gameState) return;

    switch (gameState.turnPhase) {
      case 'ROLL_CHALLENGE':
        emitRollAnswer(selectedIndex, timeMs);
        break;
      case 'SMART_BUY_CHALLENGE':
        emitSmartBuyAnswer(selectedIndex, timeMs);
        break;
      case 'CARD_MATH_CHALLENGE':
        emitCardAnswer(selectedIndex, timeMs);
        break;
      case 'JAIL_CHALLENGE':
        emitJailAnswer(selectedIndex, timeMs);
        break;
      case 'LEVEL_UP_CHALLENGE':
        emitLevelUpAnswer(selectedIndex, timeMs);
        break;
    }
  }, [gameState?.turnPhase, emitRollAnswer, emitSmartBuyAnswer, emitCardAnswer, emitJailAnswer, emitLevelUpAnswer]);

  /**
   * Duel answers go on their own channel: the property owner answers during
   * someone else's turn, so this must not be gated on whose turn it is.
   */
  const handleDuelAnswer = useCallback((selectedIndex: number) => {
    emitDuelAnswer(selectedIndex, Date.now() - challengeStartTime.current);
    setDuelChallenge(null);
  }, [emitDuelAnswer]);



  // ---- Render helpers ----
  function isChallengePhase(phase: string): boolean {
    return ['ROLL_CHALLENGE', 'SMART_BUY_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE', 'LEVEL_UP_CHALLENGE'].includes(phase);
  }

  /** Render a question body. Shared by solo challenges and duels. */
  function renderChallengeBody(
    challenge: MathChallenge,
    onAnswer: (index: number) => void,
    revealedAnswer: string | null,
    disabled: boolean
  ) {
    const shared = {
      options: challenge.options,
      onAnswer,
      disabled,
      expiresAt: challenge.expiresAt,
      timeLimit: challenge.timeLimit,
      hintContent: challenge.hintContent,
    };
    const questionData = challenge.questionData;

    if (questionData.type === 'column') {
      return <ColumnQuestion {...shared} question={questionData} revealedAnswer={revealedAnswer} />;
    }
    if (questionData.type === 'long_division') {
      return (
        <LongDivisionQuestion {...shared} question={questionData} revealedAnswer={revealedAnswer} />
      );
    }
    return <McqQuestion {...shared} question={questionData} />;
  }

  function renderQuestion() {
    if (!activeChallenge) return null;
    // The server only tells us the answer once it has graded the attempt.
    return renderChallengeBody(
      activeChallenge,
      handleAnswer,
      answerResult?.correctAnswer ?? null,
      !!answerResult
    );
  }

  /**
   * A duel question never reveals its answer inline — the verdict is shown on
   * the duel card once both sides are in, so both players learn the result at
   * the same moment.
   */
  function renderDuelQuestion(challenge: MathChallenge) {
    return renderChallengeBody(challenge, handleDuelAnswer, null, false);
  }

  // ---- Loading / Error states ----
  if (!roomCode) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message">
          <AlertCircle size={24} />
          <h2>No Game Room specified.</h2>
          <button className="action-btn action-btn--primary" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message">
          <Loader2 size={28} className="icon-spin" />
          <h2>Loading Game...</h2>
        </div>
      </div>
    );
  }

  // ---- Game Over ----
  if (gameState.phase === 'FINISHED' && finalScores) {
    return (
      <GameOverScreen
        scores={finalScores}
        players={gameState.players}
        masteryReports={masteryReports}
        onExit={() => navigate('/')}
      />
    );
  }

  const renderPhase = activePhase || gameState.turnPhase;
  const isPacingBusy = isPawnMoving || pacingState === 'PAWN_MOVING' || pacingState === 'TILE_LANDING' || pacingState === 'DICE_FEEDBACK';
  const isAnimating = isPacingBusy;
  const isChallenge = isChallengePhase(renderPhase) && isMyTurn && !isAnimating;
  const showChallenge = isChallenge && !!activeChallenge;
  const showChallengeLoading = isChallenge && !activeChallenge;
  const showCardDraw = renderPhase === 'CARD_DRAW' && isMyTurn && !isAnimating;


  return (
    <div className={`game-page ${showChallenge || showChallengeLoading ? 'game-page--quiz-active' : ''}`}>
      <TurnIndicator
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        turnPhase={gameState.turnPhase}
      />

      {/* Main Layout */}
      <div className="game-layout">
        {/* Left Panel */}
        <PlayerPanel
          players={gameState.players}
          currentPlayerIndex={gameState.currentPlayerIndex}
          myPlayerId={myPlayerId}
          round={gameState.round}
          maxRounds={gameState.maxRounds}
        />

        {/* Center: Board */}
        <Board
          gameState={gameState}
          currentPlayerId={myPlayerId}
          onMovementChange={handleMovementChange}
          onMovementComplete={handleMovementComplete}
        />

        {/* Right Panel: Dice + Actions */}
        <div className="game-sidebar">
          <DiceRoller
            diceValues={gameState.diceValues}
            diceCount={gameState.diceCount}
            isMyTurn={isMyTurn}
            turnPhase={gameState.turnPhase}
            onRollClick={emitRoll}
          />

          {/* === DECISION UIs (only for active human player when movement animation completes) === */}

          {/* BUY_DECISION: Buy / Smart Buy / Skip */}
          {renderPhase === 'BUY_DECISION' && isMyTurn && !isAnimating && gameState.pendingTileEvent && (
            <div className="game-actions decision-panel">
              <h3 className="decision-title">
                {gameState.pendingTileEvent.tileName} — {formatRM(gameState.pendingTileEvent.propertyPrice!)}
              </h3>
              <button className="action-btn action-btn--primary" onClick={emitSmartBuy}>
                <Zap size={16} /> Smart Buy (20% off)
              </button>
              <button className="action-btn action-btn--secondary" onClick={emitBuyFull}>
                <DollarSign size={16} /> Buy Full Price
              </button>
              <button className="action-btn action-btn--ghost" onClick={emitSkipBuy}>
                <SkipForward size={16} /> Skip
              </button>
            </div>
          )}

          {/* JAIL_DECISION: Math / Bail / Wait */}
          {renderPhase === 'JAIL_DECISION' && isMyTurn && !isAnimating && (
            <div className="game-actions decision-panel">
              <h3 className="decision-title">
                <Lock size={16} /> You're in Jail!
              </h3>
              <button className="action-btn action-btn--primary" onClick={emitJailMath}>
                Math Escape
              </button>
              <button className="action-btn action-btn--secondary" onClick={emitJailBail}>
                <Banknote size={16} /> Pay Bail ({formatRM(50)})
              </button>
              <button className="action-btn action-btn--ghost" onClick={emitJailWait}>
                <Hourglass size={16} /> Wait
              </button>
            </div>
          )}

          {/* LEVEL_UP_OFFER: Accept / Decline */}
          {renderPhase === 'LEVEL_UP_OFFER' && isMyTurn && !isAnimating && gameState.pendingTileEvent && (
            <div className="game-actions decision-panel">
              <h3 className="decision-title">
                <Star size={16} /> Level Up: {gameState.pendingTileEvent.tileName}
              </h3>
              <p className="decision-subtitle">
                Cost: {currentPlayer?.hasLevelUpToken ? 'FREE (token)' : formatRM(gameState.pendingTileEvent.propertyPrice!)}
              </p>
              <button className="action-btn action-btn--primary" onClick={emitLevelUp}>
                <Star size={16} /> Accept Challenge
              </button>
              <button className="action-btn action-btn--ghost" onClick={emitLevelUpDecline}>
                <SkipForward size={16} /> Decline
              </button>
            </div>
          )}

          {/* END_TURN */}
          {renderPhase === 'END_TURN' && isMyTurn && !isAnimating && (
            <div className="game-actions">
              <button className="action-btn action-btn--end" onClick={emitEndTurn}>
                End Turn <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Current Player Quick Stats */}
          {currentPlayer && (
            <div className="game-quick-stats">
              <div className="quick-stat">
                <span className="quick-stat__label"><Banknote size={16} /> Money</span>
                <span className={`quick-stat__value ${currentPlayer.money < 0 ? 'money--negative' : 'money--positive'}`}>
                  {formatRM(currentPlayer.money)}
                </span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat__label"><Zap size={16} /> Streak</span>
                <span className="quick-stat__value">
                  {currentPlayer.streak > 0 ? currentPlayer.streak : '—'}
                </span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat__label"><Star size={16} /> Position</span>
                <span className="quick-stat__value">
                  {BOARD_TILES[currentPlayer.position]?.name || `Tile ${currentPlayer.position}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Math Duel — shown to the whole table, not just the active player. */}
      {duel && (
        <MathDuel
          duel={duel}
          players={gameState.players}
          myPlayerId={myPlayerId}
          isMyTurnToAnswer={!!duelChallenge}
          questionSlot={duelChallenge ? renderDuelQuestion(duelChallenge) : null}
        />
      )}

      {/* Math Challenge Panel */}
      {showChallenge && (
        <div className="challenge-overlay">
          <div className="challenge-panel">
            <div className="challenge-header">
              <span className="challenge-context">{formatContext(activeChallenge!.context)}</span>
              <span className="challenge-skill">{activeChallenge!.skillName}</span>
            </div>
            {renderQuestion()}
          </div>
        </div>
      )}

      {/* Challenge Loading / Recovery Overlay */}
      {showChallengeLoading && (
        <div className="challenge-overlay">
          <div className="challenge-panel challenge-panel--loading">
            <div className="challenge-header">
              <span className="challenge-context">Card Challenge</span>
            </div>
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <Loader2 size={32} className="icon-spin" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ margin: '8px 0', fontSize: '1.25rem' }}>Loading Question...</h3>
              <p style={{ color: '#6b7280', margin: '4px 0 16px', fontSize: '0.9rem' }}>
                Fetching your challenge from the server.
              </p>
              <button
                className="action-btn action-btn--primary"
                onClick={emitRequestChallenge}
                style={{ margin: '0 auto' }}
              >
                Fetch Question
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Challenge Card Modal */}
      {showCardDraw && (
        <ChallengeCardModal
          card={gameState.pendingTileEvent?.card || {
            id: 8,
            name: 'Challenge Card',
            description: 'You drew a Challenge Card! Click OK to continue.',
            isMathCard: false,
            effect: { type: 'NOTHING' }
          }}
          onClose={emitCardAck}
        />
      )}

      {/* Waiting indicator for other players */}
      {isChallengePhase(gameState.turnPhase) && challengePlayerId && !isMyTurn && (
        <div className="challenge-waiting-overlay">
          <div className="challenge-waiting">
            <Hourglass size={32} className="waiting-icon" />
            <p>{gameState.players.find(p => p.id === challengePlayerId)?.name} is answering...</p>
          </div>
        </div>
      )}

      {/* Notifications */}
      <GameNotifications
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
}

function formatContext(context: string): string {
  const labels: Record<string, string> = {
    ROLL_CHALLENGE: 'Roll Challenge',
    MATH_DUEL: 'Math Duel',
    SMART_BUY: 'Smart Buy',
    CHALLENGE_CARD: 'Challenge Card',
    JAIL_ESCAPE: 'Jail Escape',
    LEVEL_UP: 'Level Up',
  };
  return labels[context] || context;
}
