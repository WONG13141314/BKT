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
import {
  ChallengeLoading,
  FatalGameScreen,
  LoadingGameScreen,
  MissingRoomScreen,
  OpeningBanner,
  ReconnectNotice,
  SeatRecoveryScreen,
} from '../components/GameStatusScreens';
import { boardPresentationState } from '../utils/boardPresentation';
import { usePlayer } from '../../auth/PlayerContext';
import { useSocket } from '../../../shared/contexts/SocketContext';
import { useGameState } from '../hooks/useGameState';
import { useGameSocket } from '../hooks/useGameSocket';
import { useQuestionCards } from '../hooks/useQuestionCards';
import { useGameSeatRecovery } from '../hooks/useGameSeatRecovery';
import { useConnectionNotice } from '../hooks/useConnectionNotice';
import { useGameAudio } from '../hooks/useGameAudio';
import type { MathChallenge, MasteryReport } from '../types/game.types';
import './GamePage.css';

export function GamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const roomCode = searchParams.get('code');
  const gameId = roomCode ? `game_${roomCode}` : null;

  const { player, setPlayer } = usePlayer();
  const { socket, isConnected, connectSocket, disconnectSocket } = useSocket();
  const myPlayerId = player?.id ?? '';
  const connectionNotice = useConnectionNotice(isConnected);

  // A browser refresh can enter /game directly without passing through the
  // lobby. Restore the authenticated socket here as well so reconnect never
  // leaves the board permanently on "Loading Game".
  useEffect(() => {
    if (player && !socket) connectSocket(roomCode);
  }, [player, socket, connectSocket, roomCode]);

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

  const [masteryReport, setMasteryReport] = useState<MasteryReport | null>(null);
  const [selectedTile, setSelectedTile] = useState(0);
  const [rollRequested, setRollRequested] = useState(false);
  const [fatalGameError, setFatalGameError] = useState<string | null>(null);
  const {
    activeChallenge,
    duel,
    duelChallenge,
    duelAnswerResult,
    questionRecoveryRevision,
    dismissAnswerResult,
    dismissDuelResult,
    ...cards
  } = useQuestionCards({ setAnswerResult, playSound });
  const clearGame = useCallback(() => setGameState(null), [setGameState]);
  const {
    seatRecoveryMessage,
    seatChoices,
    isSeatRecovering,
    switchToGameSeat,
    recoverGameSeat,
    clearSeatRecovery,
  } = useGameSeatRecovery({ roomCode, playerName: player?.displayName, setPlayer, disconnectSocket, clearGame });

  // Visual motion may delay a modal briefly, but it must never become the
  // authority for the turn. The server phase always controls legal actions.
  const [isDiceRolling, setIsDiceRolling] = useState(false);
  const [isPawnMoving, setIsPawnMoving] = useState(false);
  const diceWasRollingRef = useRef(false);
  // The dice last shown on the board, so a roll that arrives while the learner
  // is still reading an answer card can wait until they continue.
  const [shownDice, setShownDice] = useState<{ rollId: number; values: [number, number] } | null>(null);
  // A correct Math Escape (or a final-turn release) rolls on the server at once.
  // Present that roll only after the answer card is dismissed.
  const holdRollForAnswer = gameState?.turnPhase === 'MOVING' && !!answerResult;
  // The table stays hidden until the 3D dice and tokens have drawn, so it opens complete.
  const [boardReady, setBoardReady] = useState(false);
  const handleScenesReady = useCallback(() => setBoardReady(true), []);

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
    emitBoardReady,
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
      clearSeatRecovery();
      setGameState(state);
      if (state.turnPhase !== 'ROLL_PHASE' && state.turnPhase !== 'MOVING') {
        setSelectedTile(state.players[state.currentPlayerIndex]?.position ?? 0);
      }
      cards.syncWithState(state, gameState);
    },
    onChallenge: cards.onChallenge,
    onChallengeStarted: () => {
      // The turn banner already shows "<name>'s Turn — Answering".
    },
    onAnswerResult: (data) => {
      const answeringSeat = gameState?.players.find((seat) => seat.id === data.playerId);
      // Other players receive an outcome-only event for table synchronisation.
      // It must not open our private question card (which we never received)
      // or spam us with every bot's learning feedback.
      if (answeringSeat && (answeringSeat.playerId === myPlayerId || answeringSeat.id === myPlayerId)) {
        cards.onMyAnswerResult(data);
      }
    },
    onDuel: cards.onDuel,
    onDuelResult: cards.onDuelResult,
    onDuelDismissed: cards.onDuelDismissed,
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
    onConnectionRestored: cards.resetAfterReconnect,
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
    if (!gameState || gameState.turnPhase !== 'MOVING' || holdRollForAnswer) return;
    if (acknowledgedMovementRollRef.current === gameState.diceRollId) return;

    acknowledgedMovementRollRef.current = gameState.diceRollId;
    emitMovementComplete(gameState.diceRollId);
  }, [emitMovementComplete, gameState, holdRollForAnswer]);

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
    if (!gameState || holdRollForAnswer) return;
    setShownDice((shown) => shown?.rollId === gameState.diceRollId
      ? shown
      : { rollId: gameState.diceRollId, values: gameState.diceValues });
  }, [gameState, holdRollForAnswer]);

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

  // The first turn waits for every learner's board. Repeat after a reconnect;
  // the server ignores a board it already counted.
  const waitingForBoards = gameState?.opening?.ready === false;
  useEffect(() => {
    if (boardReady && waitingForBoards && isConnected) emitBoardReady();
  }, [boardReady, waitingForBoards, isConnected, emitBoardReady]);

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
    cards.markDuelAnswerSent();
    return true;
  }, [emitDuelAnswer, cards]);

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
      hintsRemaining: challenge.hintsRemaining,
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
  if (!roomCode) return <MissingRoomScreen onBack={() => navigate('/')} />;
  if (fatalGameError) return <FatalGameScreen message={fatalGameError} onExit={() => navigate('/')} />;
  if (seatRecoveryMessage) {
    return (
      <SeatRecoveryScreen
        message={seatRecoveryMessage}
        choices={seatChoices}
        recovering={isSeatRecovering}
        onChoose={(profile) => void switchToGameSeat(profile)}
        onExit={() => navigate('/')}
      />
    );
  }
  if (!gameState) return <LoadingGameScreen />;

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

  const presentationGameState = boardPresentationState(gameState, holdRollForAnswer, shownDice);

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
    <div className={`game-page${showChallenge || showChallengeLoading ? ' game-page--quiz-active' : ''}${boardReady ? '' : ' game-page--revealing'}`}>
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
          isFinalRound={gameState.isFinalRound}
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
          onScenesReady={handleScenesReady}
        />

        {/* Right Panel: selected Monopoly space + its available actions. */}
        <div className="game-sidebar">
          <SpaceDetailsPanel gameState={gameState} tileIndex={detailTileIndex} landed={showingLandedTile} />
          <GameActionDock
            state={gameState}
            currentPlayer={currentPlayer}
            isMyTurn={isMyTurn}
            selectedTile={selectedTile}
            isBoardAnimating={isBoardAnimating || !!gameState.opening}
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
          <ChallengeLoading onFetch={emitRequestChallenge} />
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

      {/* Opening: who goes first, while the table gets ready. */}
      {boardReady && gameState.opening && currentPlayer && (
        <OpeningBanner firstPlayer={currentPlayer} isMe={isMyTurn} waiting={!gameState.opening.ready} />
      )}

      {/* Notifications */}
      <GameNotifications
        notifications={notifications}
        onDismiss={dismissNotification}
      />
      <ReconnectNotice notice={connectionNotice} />
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
