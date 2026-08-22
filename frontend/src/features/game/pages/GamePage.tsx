import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Board } from '../components/Board';
import { PlayerPanel } from '../components/PlayerPanel';
import { SpaceDetailsPanel } from '../components/SpaceDetailsPanel';
import { TurnIndicator } from '../components/TurnIndicator';
import { GameOverScreen } from '../components/GameOverScreen';
import { GameNotifications } from '../components/GameNotification';
import { ColumnQuestion } from '../components/ColumnQuestion';
import { LongDivisionQuestion } from '../components/LongDivisionQuestion';
import { McqQuestion } from '../components/McqQuestion';
import { ChallengeCardModal } from '../components/ChallengeCardModal';
import { MathDuel } from '../components/MathDuel';
import { GameActionDock } from '../components/GameActionDock';
import { ChallengeDialog } from '../components/ChallengeDialog';
import { usePlayer } from '../../auth/PlayerContext';
import { authService } from '../../auth/services/auth.service';
import { StoredProfile } from '../../auth/types/auth.types';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import {
  MathChallenge,
  MasteryReport,
  PublicDuelState,
} from '../types/game.types';
import {
  Loader2,
  AlertCircle,
  Hourglass,
} from 'lucide-react';
import './GamePage.css';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get('code');
  const gameId = roomCode ? `game_${roomCode}` : null;

  const { player, setPlayer } = usePlayer();
  const { socket, connectSocket, disconnectSocket } = useSocket();
  const myPlayerId = player?.id ?? '';

  // A browser refresh can enter /game directly without passing through the
  // lobby. Restore the authenticated socket here as well so reconnect never
  // leaves the board permanently on "Loading Game".
  useEffect(() => {
    if (player && !socket) connectSocket();
  }, [player, socket, connectSocket]);

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
  const [masteryReport, setMasteryReport] = useState<MasteryReport | null>(null);
  const [selectedTile, setSelectedTile] = useState(0);
  const [rollRequested, setRollRequested] = useState(false);
  const [seatRecoveryMessage, setSeatRecoveryMessage] = useState<string | null>(null);
  const [seatChoices, setSeatChoices] = useState<StoredProfile[]>([]);
  const [isSeatRecovering, setIsSeatRecovering] = useState(false);
  const [fatalGameError, setFatalGameError] = useState<string | null>(null);
  const seatRecoveryRef = useRef(false);

  // Duel state is separate from `gameState`: it is redacted per recipient, so it
  // arrives on its own channel rather than inside the shared state broadcast.
  const [duel, setDuel] = useState<PublicDuelState | null>(null);
  const [duelChallenge, setDuelChallenge] = useState<MathChallenge | null>(null);
  const visibleChallengeIdRef = useRef<string | null>(null);

  // Visual motion may delay a modal briefly, but it must never become the
  // authority for the turn. The server phase always controls legal actions.
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [isPawnMoving, setIsPawnMoving] = useState(false);

  const switchToGameSeat = useCallback(async (profile: StoredProfile) => {
    if (seatRecoveryRef.current) return;
    seatRecoveryRef.current = true;
    setIsSeatRecovering(true);
    setSeatChoices([]);
    setSeatRecoveryMessage(`Restoring ${profile.displayName}'s game seat…`);

    try {
      const restored = await authService.switchTo(profile);
      if (!restored) throw new Error('The saved profile has expired.');
      if (roomCode) sessionStorage.setItem(`mm.game-seat.${roomCode}`, restored.id);
      // The old socket is authenticated as the wrong profile. Replacing it is
      // essential; changing React state alone cannot change a socket identity.
      disconnectSocket();
      setPlayer(restored);
      setSeatRecoveryMessage(null);
    } catch (error) {
      setSeatRecoveryMessage(
        error instanceof Error ? error.message : 'Could not restore the player for this game.'
      );
    } finally {
      seatRecoveryRef.current = false;
      setIsSeatRecovering(false);
    }
  }, [disconnectSocket, roomCode, setPlayer]);

  const recoverGameSeat = useCallback((seats: { playerId: string; name: string }[]) => {
    if (seatRecoveryRef.current) return;
    // Never leave a stale board visible as WAIT while identity is unresolved.
    setGameState(null);

    const savedProfiles = authService.getStoredProfiles();
    const candidates = savedProfiles.filter((profile) =>
      seats.some((seat) => seat.playerId === profile.id)
    );
    const preferredId = roomCode ? sessionStorage.getItem(`mm.game-seat.${roomCode}`) : null;
    const preferred = candidates.find((profile) => profile.id === preferredId);

    if (preferred || candidates.length === 1) {
      void switchToGameSeat(preferred ?? candidates[0]);
      return;
    }

    setSeatChoices(candidates);
    setSeatRecoveryMessage(candidates.length > 1
      ? 'Choose the player who joined this game.'
      : `${player?.displayName ?? 'This profile'} did not join this game.`);
  }, [player?.displayName, roomCode, setGameState, switchToGameSeat]);

  const {
    emitRoll,
    emitMovementComplete,
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
    emitEndTurn,
    emitBuildHouse,
    emitRequestChallenge,
  } = useGameSocket(gameId, {
    onStateUpdate: (state) => {
      const mySeat = state.players.find((seat) =>
        seat.playerId === myPlayerId || seat.id === myPlayerId
      );
      if (!mySeat) {
        recoverGameSeat(state.players
          .filter((seat) => !seat.isBot)
          .map((seat) => ({ playerId: seat.playerId, name: seat.name })));
        return;
      }
      if (roomCode) sessionStorage.setItem(`mm.game-seat.${roomCode}`, mySeat.playerId);
      setFatalGameError(null);
      setSeatRecoveryMessage(null);
      setSeatChoices([]);
      setGameState(state);
      if (state.turnPhase !== 'ROLL_PHASE' && state.turnPhase !== 'MOVING') {
        setSelectedTile(state.players[state.currentPlayerIndex]?.position ?? 0);
      }
      if (state.currentChallenge) {
        visibleChallengeIdRef.current = state.currentChallenge.id;
        setActiveChallenge(state.currentChallenge);
      } else if (!isChallengePhase(state.turnPhase)) {
        visibleChallengeIdRef.current = null;
        setChallengePlayerId(null);
      }
      // The server has moved past the duel — clear it if it's still unresolved,
      // but let it linger if we are showing the resolution result.
      if (state.turnPhase !== 'MATH_DUEL') {
        setDuel(prev => prev?.resolution ? prev : null);
        setDuelChallenge(null);
      }
    },
    onChallenge: (data) => {
      setChallengePlayerId(data.playerId);
      visibleChallengeIdRef.current = data.challenge.id;
      setActiveChallenge(data.challenge);
      setAnswerResult(null);
      // The duel reveal lingers deliberately so the table can read it, but the
      // server has already advanced the turn. Drop it the moment the next
      // question arrives, or it would cover the new player's challenge.
      setDuel(null);
    },
    onChallengeStarted: (data) => {
      setChallengePlayerId(data.playerId);
    },
    onAnswerResult: (data) => {
      const answeringSeat = gameState?.players.find((seat) => seat.id === data.playerId);
      const isMyAnswer = !!answeringSeat
        && (answeringSeat.playerId === myPlayerId || answeringSeat.id === myPlayerId);

      // Other players receive an outcome-only event for table synchronisation.
      // It must not open our private question card (which we never received)
      // or spam us with every bot's learning feedback.
      if (!isMyAnswer) return;

      setAnswerResult(data.result);

      const { isCorrect, timedOut, correctAnswer, feedback } = data.result;
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
      addNotification(isCorrect ? 'reward' : 'penalty', feedback ? `${msg} ${feedback}` : msg);

      // Hold the panel open long enough to read the revealed answer.
      const holdMs = isCorrect ? 900 : 1800;

      // Capture the ID of the challenge that was just answered. If a new
      // challenge arrives before the hold expires (e.g. the player lands on a
      // Challenge Card right after the Roll Challenge), the timeout must not
      // wipe the newer challenge from the screen.
      const answeredId = activeChallenge?.id;

      setTimeout(() => {
        if (visibleChallengeIdRef.current !== answeredId) return;
        visibleChallengeIdRef.current = null;
        setActiveChallenge(curr => curr?.id === answeredId ? null : curr);
        setAnswerResult(null);
        setChallengePlayerId(null);
      }, holdMs);
    },
    onDuel: (data) => {
      // Ignore re-sent resolved duels — they've already been handled by
      // onDuelResult and would re-show the card after the timeout cleared it.
      if (data.duel.resolution) return;
      setDuel(data.duel);
      setDuelChallenge(data.myChallenge);
    },
    onDuelResult: (data) => {
      setDuel(data.duel);
      setDuelChallenge(null);
      addNotification(
        data.resolution.outcome === 'DRAW_NEITHER' ? 'info' : 'reward',
        data.resolution.headline
      );
      // Hold the reveal long enough to read it, then clear for the next turn.
      setTimeout(() => setDuel(null), 5000);
    },
    onGameFinished: (data) => {
      setFinalScores(data.scores);
      setMasteryReport(data.masteryReport ?? null);
    },
    onBotAction: () => {
      // Bot actions are communicated through board animations (dice, piece movement).
      // No text banner needed.
    },
    onSeatMismatch: (data) => recoverGameSeat(data.seats),
    onError: (data) => {
      setRollRequested(false);
      if (data.code === 'GAME_NOT_FOUND') {
        setFatalGameError(data.message);
        return;
      }
      addNotification('info', data.message);
    },
  });

  // ---- Visual pacing (never blocks the server state machine) ----
  const prevPlayerIdxRef = useRef<number | null>(null);
  const acknowledgedMovementRollRef = useRef<number | null>(null);

  const handleMovementChange = useCallback((isMoving: boolean) => {
    setIsPawnMoving(isMoving);
  }, []);

  const handleMovementComplete = useCallback(() => {
    setIsPawnMoving(false);
    if (!gameState || !isMyTurn || gameState.turnPhase !== 'MOVING') return;
    if (acknowledgedMovementRollRef.current === gameState.diceRollId) return;

    acknowledgedMovementRollRef.current = gameState.diceRollId;
    emitMovementComplete(gameState.diceRollId);
  }, [emitMovementComplete, gameState, isMyTurn]);

  const handleDiceRollingChange = useCallback((rolling: boolean) => {
    setIsDiceRolling(rolling);
  }, []);

  const handleRollClick = useCallback(() => {
    if (!gameState || !isMyTurn || gameState.turnPhase !== 'ROLL_PHASE' || rollRequested) return;
    setRollRequested(true);
    emitRoll();
  }, [gameState, isMyTurn, rollRequested, emitRoll]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.turnPhase !== 'ROLL_PHASE') setRollRequested(false);
    const prevIdx = prevPlayerIdxRef.current;

    if (prevIdx !== null && prevIdx !== gameState.currentPlayerIndex) {
      setSelectedTile(gameState.players[gameState.currentPlayerIndex]?.position ?? 0);
      setIsDiceRolling(false);
      setIsPawnMoving(false);
    } else if (prevIdx === null) {
      setSelectedTile(gameState.players[gameState.currentPlayerIndex]?.position ?? 0);
    }

    prevPlayerIdxRef.current = gameState.currentPlayerIndex;
  }, [gameState]);

  useEffect(() => {
    if (!rollRequested) return;
    const recovery = setTimeout(() => setRollRequested(false), 3500);
    return () => clearTimeout(recovery);
  }, [rollRequested]);

  // WebGL can be paused by a background tab or low-power browser. A missed
  // animation callback must never hide the controls for the rest of a turn.
  useEffect(() => {
    if (!isDiceRolling && !isPawnMoving) return;
    const safety = setTimeout(() => {
      setIsDiceRolling(false);
      setIsPawnMoving(false);
    }, 6000);
    return () => clearTimeout(safety);
  }, [isDiceRolling, isPawnMoving, gameState?.diceRollId]);

  // Auto-request missing active challenge if in challenge phase
  const turnPhase = gameState?.turnPhase;
  useEffect(() => {
    if (turnPhase && isChallengePhase(turnPhase) && isMyTurn && !activeChallenge) {
      emitRequestChallenge();
    }
  }, [turnPhase, isMyTurn, activeChallenge, emitRequestChallenge]);


  // ---- Answer Handler ----
  const handleAnswer = useCallback((selectedIndex: number) => {
    switch (turnPhase) {
      case 'SMART_BUY_CHALLENGE':
        emitSmartBuyAnswer(selectedIndex);
        break;
      case 'CARD_MATH_CHALLENGE':
        emitCardAnswer(selectedIndex);
        break;
      case 'JAIL_CHALLENGE':
        emitJailAnswer(selectedIndex);
        break;
    }
  }, [turnPhase, emitSmartBuyAnswer, emitCardAnswer, emitJailAnswer]);

  /**
   * Duel answers go on their own channel: the property owner answers during
   * someone else's turn, so this must not be gated on whose turn it is.
   */
  const handleDuelAnswer = useCallback((selectedIndex: number) => {
    emitDuelAnswer(selectedIndex);
    setDuelChallenge(null);
  }, [emitDuelAnswer]);



  // ---- Render helpers ----
  function isChallengePhase(phase: string): boolean {
    return ['SMART_BUY_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE'].includes(phase);
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

  if (fatalGameError) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message seat-recovery-card">
          <AlertCircle size={30} />
          <h2>{fatalGameError}</h2>
          <button className="action-btn action-btn--primary" onClick={() => navigate('/')}>
            Return to Player Select
          </button>
        </div>
      </div>
    );
  }

  if (seatRecoveryMessage) {
    return (
      <div className="game-page game-page--center">
        <div className="game-page__message seat-recovery-card">
          {isSeatRecovering && <Loader2 size={28} className="icon-spin" />}
          <h2>{seatRecoveryMessage}</h2>
          {seatChoices.map((profile) => (
            <button
              key={profile.id}
              className="action-btn action-btn--primary"
              onClick={() => void switchToGameSeat(profile)}
            >
              Continue as {profile.displayName}
            </button>
          ))}
          {seatChoices.length === 0 && !isSeatRecovering && (
            <button className="action-btn action-btn--secondary" onClick={() => navigate('/')}>
              Return to Player Select
            </button>
          )}
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
        masteryReport={masteryReport}
        onExit={() => navigate('/')}
      />
    );
  }

  const renderPhase = gameState.turnPhase;
  const isBoardAnimating = isDiceRolling || isPawnMoving;
  const isHoldingAnswer = !!answerResult;
  const isHoldingDuelResult = !!duel?.resolution;
  const isChallenge = isChallengePhase(renderPhase) && isMyTurn && !isBoardAnimating;

  // The server deliberately keeps the committed player position unchanged
  // during MOVING. Give the board the deterministic dice destination as a
  // presentation-only target so its existing pawn animation can complete
  // before this client acknowledges the authoritative transition.
  const presentationGameState = renderPhase === 'MOVING' && isMyTurn
    ? {
        ...gameState,
        players: gameState.players.map((seat, index) => index === gameState.currentPlayerIndex
          ? {
              ...seat,
              position: (seat.position + gameState.diceValues[0] + gameState.diceValues[1])
                % gameState.tiles.length,
            }
          : seat),
      }
    : gameState;
  
  const showChallenge = ((isChallenge && !!activeChallenge) || isHoldingAnswer) && !!activeChallenge;
  const showChallengeLoading = isChallenge && !activeChallenge;
  const showCardDraw = renderPhase === 'CARD_DRAW' && isMyTurn && !isBoardAnimating;

  const forcePendingDetails = !!gameState.pendingTileEvent && [
    'BUY_DECISION',
    'SMART_BUY_CHALLENGE',
    'MATH_DUEL',
    'CARD_DRAW',
    'CARD_MATH_CHALLENGE',
  ].includes(renderPhase);
  const detailTileIndex = forcePendingDetails
    ? gameState.pendingTileEvent!.tileIndex
    : renderPhase === 'END_TURN' && isBoardAnimating
      ? currentPlayer?.position ?? selectedTile
      : selectedTile;
  const showingLandedTile = detailTileIndex === currentPlayer?.position;
  return (
    <div className={`game-page ${showChallenge || showChallengeLoading ? 'game-page--quiz-active' : ''}`}>
      <TurnIndicator
        currentPlayer={currentPlayer}
        isMyTurn={isMyTurn}
        turnPhase={gameState.turnPhase}
      />

      <a className="skip-to-actions" href="#game-actions">Skip to game actions</a>

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
          gameState={presentationGameState}
          selectedTile={detailTileIndex}
          onTileSelect={setSelectedTile}
          onDiceRollingChange={handleDiceRollingChange}
          onMovementChange={handleMovementChange}
          onMovementComplete={handleMovementComplete}
        />

        {/* Right Panel: selected Monopoly space + its available actions. */}
        <div className="game-sidebar">
          <SpaceDetailsPanel gameState={gameState} tileIndex={detailTileIndex} landed={showingLandedTile} />
          <GameActionDock
            state={gameState}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn}
            selectedTile={selectedTile}
            isBoardAnimating={isBoardAnimating}
            isHoldingDuelResult={isHoldingDuelResult}
            onRoll={handleRollClick}
            onBuyFull={emitBuyFull}
            onSmartBuy={emitSmartBuy}
            onSkipBuy={emitSkipBuy}
            onJailMath={emitJailMath}
            onJailBail={emitJailBail}
            onJailWait={emitJailWait}
            onBuild={emitBuildHouse}
            onEndTurn={emitEndTurn}
          />
        </div>
      </div>

      {/* Math Duel — shown to the whole table, not just the active player. */}
      {duel && !isBoardAnimating && (
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
        <ChallengeDialog
          title={formatContext(activeChallenge!.context)}
          feedback={answerResult?.feedback}
        >
          {renderQuestion()}
        </ChallengeDialog>
      )}

      {/* Challenge Loading / Recovery Overlay */}
      {showChallengeLoading && (
        <ChallengeDialog title="Loading challenge">
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
        </ChallengeDialog>
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
    MATH_DUEL: 'Rent Defence',
    SMART_BUY: 'Bank Offer',
    CHALLENGE_CARD: 'Challenge Card',
    JAIL_ESCAPE: 'Jail Escape',
  };
  return labels[context] || context;
}
