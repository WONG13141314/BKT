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
import { BOARD_TILES } from '../config/board.config';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  MathChallenge,
  MasteryReport,
  formatRM,
} from '../types/game.types';
import {
  ArrowRight,
  Banknote,
  Loader2,
  AlertCircle,
  Hourglass,
  ShieldCheck,
  Zap,
  Star,
  Lock,
  DollarSign,
  SkipForward,
} from 'lucide-react';
import './GamePage.css';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get('code');
  const gameId = roomCode ? `game_${roomCode}` : null;

  const myUserId = (() => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return '';
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId;
    } catch {
      return '';
    }
  })();

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
  } = useGameState(myUserId);

  const [activeChallenge, setActiveChallenge] = useState<MathChallenge | null>(null);
  const [challengePlayerId, setChallengePlayerId] = useState<string | null>(null);
  const [masteryReports, setMasteryReports] = useState<MasteryReport[] | null>(null);
  const [botActionMessage, setBotActionMessage] = useState<string | null>(null);
  const challengeStartTime = useRef<number>(Date.now());

  const {
    emitRoll,
    emitDiceAnswer,
    emitBuyFull,
    emitSmartBuy,
    emitSmartBuyAnswer,
    emitSkipBuy,
    emitPayRent,
    emitRentDefense,
    emitRentDefenseAnswer,
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
    },
    onChallenge: (data) => {
      setChallengePlayerId(data.playerId);
      setActiveChallenge(data.challenge);
      setAnswerResult(null);
      challengeStartTime.current = Date.now();
    },
    onChallengeStarted: (data) => {
      setChallengePlayerId(data.playerId);
    },
    onAnswerResult: (data) => {
      setAnswerResult(data.result);
      const isCorrect = data.result.isCorrect;
      const type = isCorrect ? 'reward' : 'penalty';
      const desc = data.result.reward.description ? ` (${data.result.reward.description})` : '';
      const msg = isCorrect
        ? `✅ Correct!${desc}`
        : `❌ Incorrect! Answer: ${data.result.correctAnswer}${desc}`;
      addNotification(type, msg);

      // Auto-close modal smoothly after brief selection display
      setTimeout(() => {
        setActiveChallenge(null);
        setAnswerResult(null);
        setChallengePlayerId(null);
      }, 600);
    },
    onGameFinished: (data) => {
      setFinalScores(data.scores);
      setMasteryReports(data.masteryReports ?? null);
    },
    onBotAction: (data) => {
      const actionLabels: Record<string, string> = {
        roll: 'rolling dice',
        dice_answer: 'answering dice challenge',
        move: 'moving',
        resolve: 'resolving tile',
        smart_buy_start: 'trying Smart Buy',
        smart_buy_answer: 'answering',
        buy_full: 'buying property',
        skip_buy: 'skipping purchase',
        rent_defense_start: 'defending rent',
        rent_defense_answer: 'answering',
        pay_rent: 'paying rent',
        card_ack: 'reading card',
        card_answer: 'answering card challenge',
        jail_math_start: 'attempting jail escape',
        jail_bail: 'paying bail',
        jail_wait: 'waiting in jail',
        jail_answer: 'answering',
        level_up_start: 'attempting Level Up',
        level_up_answer: 'answering',
        level_up_decline: 'skipping Level Up',
        end_turn: 'ending turn',
      };
      const label = actionLabels[data.action] || data.action;
      setBotActionMessage(`🤖 ${data.botName} is ${label}...`);
      // Keep bot action banner slightly longer for readability
      setTimeout(() => setBotActionMessage(null), 2500); 
    },
    onError: (data) => {
      addNotification('info', data.message);
    },
  });

  // ---- Pacing Logic (Delaying UI for animations) ----
  const [activePhase, setActivePhase] = useState<string | null>(null);
  const [isPawnMoving, setIsPawnMoving] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const lastCardNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    
    const currentPhase = gameState.turnPhase;
    const prevPhase = prevPhaseRef.current;
    
    if (currentPhase !== prevPhase) {
      prevPhaseRef.current = currentPhase;
      setActivePhase(currentPhase);
    }

    // Passive player challenge card notification
    if (currentPhase === 'CARD_DRAW' && gameState.pendingTileEvent?.card && !isMyTurn) {
      const cardKey = `${gameState.currentPlayerIndex}_${gameState.pendingTileEvent.card.name}`;
      if (lastCardNotifiedRef.current !== cardKey) {
        lastCardNotifiedRef.current = cardKey;
        const playerName = currentPlayer?.name || 'Player';
        addNotification('info', `⚡ ${playerName} drew Challenge Card: ${gameState.pendingTileEvent.card.name}`);
      }
    }
  }, [gameState, isMyTurn, currentPlayer?.name, addNotification]);

  // Auto-request missing active challenge if in challenge phase
  useEffect(() => {
    if (gameState && isChallengePhase(gameState.turnPhase) && isMyTurn && !activeChallenge) {
      emitRequestChallenge();
    }
  }, [gameState?.turnPhase, isMyTurn, activeChallenge, emitRequestChallenge]);


  // ---- Answer Handler ----
  const handleAnswer = useCallback((selectedIndex: number) => {
    const timeMs = Date.now() - challengeStartTime.current;
    if (!gameState) return;

    switch (gameState.turnPhase) {
      case 'DICE_CHALLENGE':
        emitDiceAnswer(selectedIndex, timeMs);
        break;
      case 'SMART_BUY_CHALLENGE':
        emitSmartBuyAnswer(selectedIndex, timeMs);
        break;
      case 'RENT_CHALLENGE':
        emitRentDefenseAnswer(selectedIndex, timeMs);
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
  }, [gameState?.turnPhase, emitDiceAnswer, emitSmartBuyAnswer, emitRentDefenseAnswer, emitCardAnswer, emitJailAnswer, emitLevelUpAnswer]);



  // ---- Render helpers ----
  function isChallengePhase(phase: string): boolean {
    return ['DICE_CHALLENGE', 'SMART_BUY_CHALLENGE', 'RENT_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE', 'LEVEL_UP_CHALLENGE'].includes(phase);
  }

  function renderQuestion() {
    if (!activeChallenge) return null;

    const questionData = activeChallenge.questionData;
    if (questionData.type === 'column') {
      return (
        <ColumnQuestion
          question={questionData}
          options={activeChallenge.options}
          onAnswer={handleAnswer}
          disabled={!!answerResult}
          timeLimit={activeChallenge.timeLimit}
          hintContent={activeChallenge.hintContent}
        />
      );
    } else if (questionData.type === 'long_division') {
      return (
        <LongDivisionQuestion
          question={questionData}
          options={activeChallenge.options}
          onAnswer={handleAnswer}
          disabled={!!answerResult}
          timeLimit={activeChallenge.timeLimit}
          hintContent={activeChallenge.hintContent}
        />
      );
    } else {
      return (
        <McqQuestion
          question={questionData}
          options={activeChallenge.options}
          onAnswer={handleAnswer}
          disabled={!!answerResult}
          timeLimit={activeChallenge.timeLimit}
          hintContent={activeChallenge.hintContent}
        />
      );
    }
  }

  // ---- Loading / Error states ----
  if (!roomCode) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message">
          <AlertCircle size={24} />
          <h2>No Game Room specified.</h2>
          <button className="action-btn action-btn--primary" onClick={() => navigate('/join')}>Go Back</button>
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
        onExit={() => navigate('/join')}
      />
    );
  }

  const renderPhase = activePhase || gameState.turnPhase;
  const isAnimating = isPawnMoving;
  const isChallenge = isChallengePhase(renderPhase) && isMyTurn && !isAnimating;
  const showChallenge = isChallenge && !!activeChallenge;
  const showChallengeLoading = isChallenge && !activeChallenge;
  const showCardDraw = renderPhase === 'CARD_DRAW' && isMyTurn && !isAnimating;


  return (
    <div className={`game-page ${showChallenge || showChallengeLoading ? 'game-page--quiz-active' : ''}`}>
      {/* Turn Indicator */}
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
          myPlayerId={myUserId}
          round={gameState.round}
          maxRounds={gameState.maxRounds}
        />

        {/* Center: Board */}
        <Board
          gameState={gameState}
          currentPlayerId={myUserId}
          onMovementChange={setIsPawnMoving}
        />

        {/* Right Panel: Dice + Actions */}
        <div className="game-sidebar">
          <DiceRoller
            diceValues={gameState.diceValues}
            isMyTurn={isMyTurn}
            turnPhase={gameState.turnPhase}
            onRollClick={emitRoll}
          />

          {/* Bot action overlay */}
          {botActionMessage && (
            <div className="bot-action-banner">
              {botActionMessage}
            </div>
          )}

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

          {/* RENT_PAYMENT: Pay / Defend */}
          {renderPhase === 'RENT_PAYMENT' && isMyTurn && !isAnimating && gameState.pendingTileEvent && (
            <div className="game-actions decision-panel">
              <h3 className="decision-title">
                Rent: {formatRM(gameState.pendingTileEvent.rentAmount!)}
              </h3>
              <button className="action-btn action-btn--primary" onClick={emitRentDefense}>
                <ShieldCheck size={16} /> Rent Defense (half rent)
              </button>
              <button className="action-btn action-btn--secondary" onClick={emitPayRent}>
                <Banknote size={16} /> Pay Full Rent
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
                🧮 Math Escape
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
                  {currentPlayer.streak > 0 ? `🔥 ${currentPlayer.streak}` : '—'}
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
              <span className="challenge-context">⚡ Card Challenge</span>
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
    DICE_CHALLENGE: '🎲 Dice Challenge',
    SMART_BUY: '🏷️ Smart Buy',
    RENT_DEFENSE: '🛡️ Rent Defense',
    CHALLENGE_CARD: '⚡ Challenge Card',
    JAIL_ESCAPE: '🔓 Jail Escape',
    LEVEL_UP: '⭐ Level Up',
  };
  return labels[context] || context;
}
