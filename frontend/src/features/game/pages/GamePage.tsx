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
import { ChallengeCardModal } from '../components/ChallengeCardModal';
import { MathDuel } from '../components/MathDuel';
import { GameActionDock } from '../components/GameActionDock';
import { ChallengeDialog } from '../components/ChallengeDialog';
import { AnswerFeedback } from '../components/AnswerFeedback';
import { usePlayer } from '../../auth/PlayerContext';
import { authService } from '../../auth/services/auth.service';
import { StoredProfile } from '../../auth/types/auth.types';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import { useAnswerResultHold } from '../hooks/useAnswerResultHold';
import { useGameAudio } from '../hooks/useGameAudio';
import {
  MathChallenge,
  MasteryReport,
  PublicDuelState,
  AnswerResult,
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
  const { socket, isConnected, connectSocket, disconnectSocket } = useSocket();
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
  const { play: playSound, playMovementStep } = useGameAudio(gameState);

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
  const [duelAnswerResult, setDuelAnswerResult] = useState<AnswerResult | null>(null);
  const activeChallengeIdRef = useRef<string | null>(null);
  const duelChallengeIdRef = useRef<string | null>(null);
  const duelIdRef = useRef<string | null>(null);
  const duelAnswerResultRef = useRef<AnswerResult | null>(null);
  const pendingDuelChallengeIdRef = useRef<string | null>(null);
  const [questionRecoveryRevision, setQuestionRecoveryRevision] = useState(0);
  const completedChallengeIdsRef = useRef(new Set<string>());
  const { markChallengeVisible, holdThenClear, clearVisible } = useAnswerResultHold();
  const {
    markChallengeVisible: markDuelVisible,
    holdThenClear: holdDuelThenClear,
    clearVisible: clearDuelVisible,
  } = useAnswerResultHold();

  const dismissAnswerResult = useCallback(() => {
    clearVisible();
    activeChallengeIdRef.current = null;
    setActiveChallenge(null);
    setAnswerResult(null);
    setChallengePlayerId(null);
  }, [clearVisible, setAnswerResult]);

  const dismissDuelResult = useCallback(() => {
    clearDuelVisible();
    duelIdRef.current = null;
    duelChallengeIdRef.current = null;
    duelAnswerResultRef.current = null;
    pendingDuelChallengeIdRef.current = null;
    setDuel(null);
    setDuelChallenge(null);
    setDuelAnswerResult(null);
  }, [clearDuelVisible]);

  const rememberCompletedChallenge = useCallback((challengeId: string) => {
    const completed = completedChallengeIdsRef.current;
    completed.add(challengeId);
    if (completed.size > 64) completed.delete(completed.values().next().value!);
  }, []);

  // Visual motion may delay a modal briefly, but it must never become the
  // authority for the turn. The server phase always controls legal actions.
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [isPawnMoving, setIsPawnMoving] = useState(false);
  const diceWasRollingRef = useRef(false);

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
    emitDuelContinue,
    emitCardAck,
    emitCardAnswer,
    emitJailMath,
    emitJailAnswer,
    emitJailBail,
    emitJailWait,
    emitEndTurn,
    emitBuildHouse,
    emitRequestChallenge,
    emitRequestHint,
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
        if (!completedChallengeIdsRef.current.has(state.currentChallenge.id)) {
          if (activeChallengeIdRef.current !== state.currentChallenge.id) setAnswerResult(null);
          activeChallengeIdRef.current = state.currentChallenge.id;
          markChallengeVisible(state.currentChallenge.id);
          setActiveChallenge(state.currentChallenge);
        }
      } else if (!isChallengePhase(state.turnPhase)) {
        setChallengePlayerId(null);
      }
      // The server has moved past the duel — clear it if it's still unresolved,
      // but let it linger if we are showing the resolution result.
      if (state.turnPhase !== 'MATH_DUEL') {
        setDuel(prev => prev?.resolution ? prev : null);
        setDuelChallenge(null);
      }
      if (state.players[state.currentPlayerIndex]?.id !== gameState?.players[gameState.currentPlayerIndex]?.id
        || state.turnPhase === 'ROLL_PHASE' || state.turnPhase === 'MOVING') {
        dismissDuelResult();
      }
    },
    onChallenge: (data) => {
      if (completedChallengeIdsRef.current.has(data.challenge.id)) return;
      // Help refreshes only the requesting player's existing question. A duel
      // stays open and the other side never receives this private cue.
      if (data.challenge.context === 'MATH_DUEL') {
        if (pendingDuelChallengeIdRef.current === data.challenge.id) return;
        duelChallengeIdRef.current = data.challenge.id;
        setDuelChallenge(data.challenge);
        return;
      }
      setChallengePlayerId(data.playerId);
      if (activeChallengeIdRef.current !== data.challenge.id) {
        markChallengeVisible(data.challenge.id);
        setAnswerResult(null);
      }
      activeChallengeIdRef.current = data.challenge.id;
      setActiveChallenge(data.challenge);
      // The duel reveal lingers deliberately so the table can read it, but the
      // server has already advanced the turn. Drop it the moment the next
      // question arrives, or it would cover the new player's challenge.
      dismissDuelResult();
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
      // Each result belongs to an issued question, including an owner's duel
      // answer on another player's turn. Late results cannot replace a new one.
      if (data.challengeId === duelChallengeIdRef.current) {
        pendingDuelChallengeIdRef.current = null;
        rememberCompletedChallenge(data.challengeId);
        duelAnswerResultRef.current = data.result;
        setDuelAnswerResult(data.result);
        return;
      }
      if (data.challengeId !== activeChallengeIdRef.current) return;
      rememberCompletedChallenge(data.challengeId);
      setAnswerResult(data.result);
      playSound(data.result.isCorrect ? 'correct' : 'incorrect');
      // One primary card gives time to read, with an earlier Continue action.
      holdThenClear(data.challengeId, 6000, (answeredId) => {
        if (activeChallengeIdRef.current === answeredId) dismissAnswerResult();
      });
    },
    onDuel: (data) => {
      // Ignore re-sent resolved duels — they've already been handled by
      // onDuelResult and would re-show the card after the timeout cleared it.
      if (data.duel.resolution) return;
      if (duelIdRef.current !== data.duel.id) {
        dismissAnswerResult();
        markDuelVisible(data.duel.id);
        duelIdRef.current = data.duel.id;
        duelAnswerResultRef.current = null;
        setDuelAnswerResult(null);
        duelChallengeIdRef.current = data.myChallenge?.id ?? null;
        pendingDuelChallengeIdRef.current = null;
      }
      if (data.myChallenge) duelChallengeIdRef.current = data.myChallenge.id;
      setDuel(data.duel);
      setDuelChallenge(data.myChallenge && !completedChallengeIdsRef.current.has(data.myChallenge.id)
        && pendingDuelChallengeIdRef.current !== data.myChallenge.id
        ? data.myChallenge : null);
    },
    onDuelResult: (data) => {
      if (duelIdRef.current !== data.duel.id) return;
      setDuel(data.duel);
      setDuelChallenge(null);
      playSound(duelAnswerResultRef.current?.isCorrect === false ? 'incorrect' : 'correct');
      holdDuelThenClear(data.duel.id, 6000, (answeredDuelId) => {
        if (duelIdRef.current === answeredDuelId) dismissDuelResult();
      });
    },
    onDuelDismissed: (data) => {
      if (data.duelId === duelIdRef.current) dismissDuelResult();
    },
    onGameFinished: (data) => {
      playSound('gameOver');
      setFinalScores(data.scores);
      setMasteryReport(data.masteryReport ?? null);
      dismissAnswerResult();
      dismissDuelResult();
    },
    onBotAction: () => {
      // Bot actions are communicated through board animations (dice, piece movement).
      // No text banner needed.
    },
    onSeatMismatch: (data) => recoverGameSeat(data.seats),
    onConnectionRestored: () => {
      // A click can leave the browser without ever reaching the server. The
      // recovery snapshot decides whether it was accepted; remount unanswered
      // controls so a local pending selection cannot lock the restored question.
      pendingDuelChallengeIdRef.current = null;
      activeChallengeIdRef.current = null;
      setActiveChallenge(null);
      setAnswerResult(null);
      setDuelChallenge(null);
      setQuestionRecoveryRevision(revision => revision + 1);
    },
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
    if (!gameState || gameState.turnPhase !== 'MOVING') return;
    if (acknowledgedMovementRollRef.current === gameState.diceRollId) return;

    acknowledgedMovementRollRef.current = gameState.diceRollId;
    emitMovementComplete(gameState.diceRollId);
  }, [emitMovementComplete, gameState]);

  const handleDiceRollingChange = useCallback((rolling: boolean) => {
    if (!rolling && diceWasRollingRef.current) playSound('diceLand');
    diceWasRollingRef.current = rolling;
    setIsDiceRolling(rolling);
  }, [playSound]);

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
        return emitSmartBuyAnswer(selectedIndex);
      case 'CARD_MATH_CHALLENGE':
        return emitCardAnswer(selectedIndex);
      case 'JAIL_CHALLENGE':
        return emitJailAnswer(selectedIndex);
      default:
        return false;
    }
  }, [turnPhase, emitSmartBuyAnswer, emitCardAnswer, emitJailAnswer]);

  /**
   * Duel answers go on their own channel: the property owner answers during
   * someone else's turn, so this must not be gated on whose turn it is.
   */
  const handleDuelAnswer = useCallback((selectedIndex: number) => {
    if (!emitDuelAnswer(selectedIndex)) return false;
    pendingDuelChallengeIdRef.current = duelChallengeIdRef.current;
    setDuelChallenge(null);
    return true;
  }, [emitDuelAnswer]);

  const handleDuelContinue = useCallback(() => {
    if (!isMyTurn || !duel?.resolution) return;
    if (emitDuelContinue(duel.id)) dismissDuelResult();
  }, [isMyTurn, duel, emitDuelContinue, dismissDuelResult]);



  // ---- Render helpers ----
  function isChallengePhase(phase: string): boolean {
    return ['SMART_BUY_CHALLENGE', 'CARD_MATH_CHALLENGE', 'JAIL_CHALLENGE'].includes(phase);
  }

  /** Render a question body. Shared by solo challenges and duels. */
  function renderChallengeBody(
    challenge: MathChallenge,
    onAnswer: (index: number) => boolean | void,
    revealedAnswer: string | null,
    disabled: boolean
  ) {
    const shared = {
      options: challenge.options,
      onAnswer,
      disabled: disabled || !isConnected,
      expiresAt: challenge.expiresAt,
      timeLimit: challenge.timeLimit,
      hint: challenge.hint,
      onRequestHint: () => emitRequestHint(challenge.id),
    };
    const questionData = challenge.questionData;

    if (questionData.type === 'column') {
      return <ColumnQuestion key={`${challenge.id}:${questionRecoveryRevision}`} {...shared} question={questionData} revealedAnswer={revealedAnswer} />;
    }
    return (
      <LongDivisionQuestion key={`${challenge.id}:${questionRecoveryRevision}`} {...shared} question={questionData} revealedAnswer={revealedAnswer} />
    );
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
  const presentationGameState = renderPhase === 'MOVING'
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
          onMovementStep={playMovementStep}
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
          answerResult={duelAnswerResult}
          onContinue={isMyTurn && isConnected ? handleDuelContinue : undefined}
        />
      )}

      {/* Math Challenge Panel */}
      {showChallenge && (
        <ChallengeDialog
          title={formatContext(activeChallenge!.context)}
        >
          {answerResult
            ? <AnswerFeedback result={answerResult} onContinue={dismissAnswerResult} />
            : renderQuestion()}
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
      {!isConnected && (
        <div className="game-reconnecting-overlay" role="status" aria-live="polite">
          <div className="game-reconnecting-card">
            <Loader2 size={26} className="icon-spin" aria-hidden="true" />
            <h2>Reconnecting…</h2>
            <p>Your game will refresh when the connection returns.</p>
          </div>
        </div>
      )}
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
