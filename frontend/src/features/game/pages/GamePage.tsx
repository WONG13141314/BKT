import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Board } from '../components/Board';
import { DiceRoller } from '../components/DiceRoller';
import { PlayerPanel } from '../components/PlayerPanel';
import { TurnIndicator } from '../components/TurnIndicator';
import { GameOverScreen } from '../components/GameOverScreen';
import { GameNotifications } from '../components/GameNotification';
import { PropertyCard } from '../components/PropertyCard';
import { QuestionPopup } from '../../questions/components/QuestionPopup';
import { BOARD_TILES } from '../config/board.config';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import { MathChallenge, AnswerResult, Player } from '../types/game.types';
import { ArrowRight, Banknote, Loader2, AlertCircle, Hourglass } from 'lucide-react';
import './GamePage.css';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get('code');
  const gameId = roomCode ? `game_${roomCode}` : null;

  // Extract my user ID from token
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

  // We maintain a local copy of the challenge so the popup stays open when the server clears it
  const [activeChallenge, setActiveChallenge] = useState<MathChallenge | null>(null);
  const [challengePlayerId, setChallengePlayerId] = useState<string | null>(null);
  const [selectedPropertyTile, setSelectedPropertyTile] = useState<number | null>(null);

  const [showChallengePopup, setShowChallengePopup] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const prevChallengeIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;

    const prevPhase = prevPhaseRef.current;
    const prevChallengeId = prevChallengeIdRef.current;
    const currentChallengeId = activeChallenge?.id ?? null;

    if (gameState.turnPhase === 'MATH_CHALLENGE') {
      // Back-to-back MATH_CHALLENGE (e.g. dice question → tile question):
      // The challenge ID changed but the phase stayed the same.
      // Insert a delay so the player sees the dice result + token movement first.
      const isChallengeSwitch = prevPhase === 'MATH_CHALLENGE'
        && currentChallengeId !== null
        && prevChallengeId !== null
        && currentChallengeId !== prevChallengeId;

      if (isChallengeSwitch) {
        // Hide popup, wait for movement animation, then show new challenge
        setShowChallengePopup(false);
        const timer = setTimeout(() => setShowChallengePopup(true), 2000);
        return () => clearTimeout(timer);
      } else if (prevPhase && prevPhase !== 'MATH_CHALLENGE') {
        // Transitioning from a non-challenge phase (e.g. ROLL → MATH_CHALLENGE)
        // Show immediately since this is the dice question at the start of the turn
        setShowChallengePopup(true);
      } else if (!prevPhase) {
        // First mount / reconnect — show immediately
        setShowChallengePopup(true);
      }
      // If prevPhase === 'MATH_CHALLENGE' but same challenge ID, keep current state
    } else {
      setShowChallengePopup(false);
    }

    prevPhaseRef.current = gameState.turnPhase;
    prevChallengeIdRef.current = currentChallengeId;
  }, [gameState?.turnPhase, activeChallenge?.id]);

  const { emitRoll, emitAnswer, emitBuild, emitBail, emitEndTurn } = useGameSocket(gameId, {
    onStateUpdate: (state) => {
      setGameState(state);
      // If the server still has a challenge, keep it synced. 
      // If the server cleared it, we keep our local copy until handleContinue runs.
      if (state.currentChallenge) {
        setActiveChallenge(state.currentChallenge);
      } else if (state.turnPhase !== 'MATH_CHALLENGE') {
        // Challenge resolved — clear waiting state for other players
        setChallengePlayerId(null);
      }
    },
    onChallenge: (data) => {
      // Only show the popup if this client is the active player
      setChallengePlayerId(data.playerId);
      setActiveChallenge(data.challenge);
      setAnswerResult(null);
    },
    onChallengeStarted: (data) => {
      setChallengePlayerId(data.playerId);
    },
    onAnswerResult: (data) => {
      setAnswerResult(data.result);
      if (data.result.isCorrect) {
        addNotification('reward', data.result.reward.description);
      } else if (data.result.penalty) {
        addNotification('penalty', data.result.penalty.description);
      }
    },
    onGameFinished: (data) => {
      setFinalScores(data.scores);
    },
    onError: (data) => {
      addNotification('info', data.message);
    },
  });

  // ---- Interaction Handlers ----

  const handleRollClick = useCallback(() => {
    emitRoll();
  }, [emitRoll]);

  const handleAnswer = useCallback((selectedIndex: number, timeMs: number) => {
    emitAnswer(selectedIndex, timeMs);
  }, [emitAnswer]);

  const handleContinue = useCallback(() => {
    setActiveChallenge(null);
    setAnswerResult(null);
    setChallengePlayerId(null);
  }, []);

  const handleEndTurn = useCallback(() => {
    emitEndTurn();
  }, [emitEndTurn]);

  const handleTileClick = useCallback((tileIndex: number) => {
    const tile = BOARD_TILES[tileIndex];
    if (tile?.type === 'PROPERTY') {
      setSelectedPropertyTile(tileIndex);
    }
  }, []);

  // ---- Render ----

  if (!roomCode) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message surface-2">
          <AlertCircle size={24} />
          <h2>No Game Room specified.</h2>
          <button className="action-btn action-btn--primary" onClick={() => navigate('/join')}>
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message surface-2">
          <Loader2 size={28} className="icon-spin" />
          <h2>Loading Game...</h2>
        </div>
      </div>
    );
  }

  // Game Over
  if (gameState.phase === 'FINISHED' && finalScores) {
    return (
      <GameOverScreen
        scores={finalScores}
        players={gameState.players}
        onExit={() => navigate('/join')}
      />
    );
  }

  return (
    <div className={`game-page ${showChallengePopup ? 'game-page--quiz-active' : ''}`}>
      {/* Turn Indicator */}
      <TurnIndicator
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        turnPhase={gameState.turnPhase}
        round={gameState.round}
        maxRounds={gameState.maxRounds}
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
          players={gameState.players}
          properties={gameState.properties}
          currentPlayerIndex={gameState.currentPlayerIndex}
          onTileClick={handleTileClick}
        />

        {/* Right Panel: Dice + Actions */}
        <div className="game-sidebar">
          <DiceRoller
            diceValues={gameState.diceValues}
            movementBonus={gameState.movementBonus}
            isMyTurn={isMyTurn}
            turnPhase={gameState.turnPhase}
            onRollClick={handleRollClick}
          />

          {/* Action Buttons */}
          {gameState.turnPhase === 'ACTION' && isMyTurn && (
            <div className="game-actions">
              <button className="action-btn action-btn--end" onClick={handleEndTurn}>
                End Turn
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          
          {/* Pay Bail Button */}
          {gameState.turnPhase === 'ACTION' && isMyTurn && currentPlayer?.isInJail && (
             <div className="game-actions">
               <button className="action-btn action-btn--build" onClick={() => emitBail()}>
                 <Banknote size={16} />
                 Pay Bail ($50)
               </button>
             </div>
          )}

          {/* Current Player Quick Stats */}
          {currentPlayer && (
            <div className="game-quick-stats surface-2">
              <div className="quick-stat">
                <span className="quick-stat__label">Money</span>
                <span className={`quick-stat__value ${currentPlayer.money < 0 ? 'money--negative' : ''}`}>
                  ${currentPlayer.money.toLocaleString()}
                </span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat__label">Streak</span>
                <span className="quick-stat__value">
                  {currentPlayer.streak > 0 ? currentPlayer.streak : '—'}
                </span>
              </div>
              <div className="quick-stat">
                <span className="quick-stat__label">Position</span>
                <span className="quick-stat__value">
                  {BOARD_TILES[currentPlayer.position]?.name || `Tile ${currentPlayer.position}`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Math Challenge Side Panel */}
      {showChallengePopup && activeChallenge && isMyTurn && (
        <QuestionPopup
          key={activeChallenge.id}
          challenge={activeChallenge}
          onAnswer={handleAnswer}
          answerResult={answerResult}
          onContinue={handleContinue}
        />
      )}
      
      {/* Waiting indicator for other players */}
      {showChallengePopup && challengePlayerId && !isMyTurn && (
        <div className="challenge-waiting-overlay">
          <div className="challenge-waiting surface-2">
            <Hourglass size={32} className="waiting-icon" />
            <p>{gameState?.players.find(p => p.id === challengePlayerId)?.name} is answering a question...</p>
          </div>
        </div>
      )}

      {/* Property Card Modal */}
      {selectedPropertyTile !== null && currentPlayer && (
        <PropertyCard
          tile={BOARD_TILES[selectedPropertyTile]}
          property={gameState.properties.find((p) => p.tileIndex === selectedPropertyTile) || {
            tileIndex: selectedPropertyTile, ownerId: null, houses: 0, hasHotel: false,
          }}
          owner={(() => {
            const prop = gameState.properties.find((p) => p.tileIndex === selectedPropertyTile);
            return prop?.ownerId ? gameState.players.find((p) => p.id === prop.ownerId) || null : null;
          })()}
          currentPlayer={currentPlayer}
          mode="INFO"
          onClose={() => setSelectedPropertyTile(null)}
          onBuild={() => {
            emitBuild(selectedPropertyTile);
            setSelectedPropertyTile(null);
          }}
          canBuild={isMyTurn && gameState.turnPhase === 'ACTION' && 
            gameState.properties.find((p) => p.tileIndex === selectedPropertyTile)?.ownerId === currentPlayer?.id
          }
        />
      )}

      {/* Notifications */}
      <GameNotifications
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
}
