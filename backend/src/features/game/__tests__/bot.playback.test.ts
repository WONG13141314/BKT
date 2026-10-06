import { initializeGameState } from '../game.engine';
import { gameService } from '../game.service';
import { publishGameStartTransition, registerGameHandlers } from '../../../sockets/game.handlers';
import { makeServer, makeSocket } from '../../../sockets/__tests__/socket.harness';
import { PHASE_TIMEOUTS } from '../../../sockets/phase.deadlines';
import { toPublicDuelState } from '../../../sockets/game.publisher';

describe('live bot phases and presentation barriers', () => {
  const gameId = 'game_bot-playback';
  const NOW = 1_700_000_000_000;
  const players = [
    { id: 'bot-1', playerId: 'bot-account-1', name: 'Bot One', color: '#6366f1', order: 0, isBot: true },
    { id: 'bot-2', playerId: 'bot-account-2', name: 'Bot Two', color: '#10b981', order: 1, isBot: true },
    { id: 'human-1', playerId: 'human-account-1', name: 'Human One', color: '#f59e0b', order: 2 },
  ];

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    jest.spyOn(Math, 'random').mockReturnValue(0);
    gameService.replaceState(gameId, initializeGameState(gameId, players));
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    gameService.removeGame(gameId);
  });

  function browser() {
    const socket = makeSocket({ player: { id: 'human-account-1' }, gameId });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);
    return { socket, io };
  }

  function ownedLanding() {
    const state = gameService.getGameSync(gameId)!;
    return gameService.replaceState(gameId, {
      ...state,
      players: state.players.map((player) => player.id === 'human-1' ? { ...player, properties: [2] } : player),
      properties: state.properties.map((property) => property.tileIndex === 2 ? { ...property, ownerId: 'human-1' } : property),
    });
  }

  it('computes only the current phase and never plans a future question', () => {
    const step = gameService.executeBotStep(gameId)!;
    expect(step.action).toBe('roll');
    expect(step.state.turnPhase).toBe('MOVING');
    expect(step.state.players[0].position).toBe(0);
    expect(step.state.duelState).toBeNull();
    expect(gameService.executeBotStep(gameId)).toBeNull();
  });

  it('starts one roll after its delay and holds movement until a viewer finishes', async () => {
    const { socket, io } = browser();
    const state = gameService.getGameSync(gameId)!;
    publishGameStartTransition(io, state);
    publishGameStartTransition(io, state);
    await jest.advanceTimersByTimeAsync(799);
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('ROLL_PHASE');
    await jest.advanceTimersByTimeAsync(1);
    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');
    expect(moving.diceRollId).toBe(1);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(gameService.getGameSync(gameId)!.players[0].position).toBe(0);
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');
    await socket.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
    expect(gameService.getGameSync(gameId)!.players[0].position).toBe(2);
    expect(gameService.getGameSync(gameId)!.turnPhase).not.toBe('MOVING');
    const rolls = io.roomEmitter.emit.mock.calls.filter(([event, data]) => event === 'game:bot-action' && data.action === 'roll');
    expect(rolls).toHaveLength(1);
  });

  it('creates every repeated defence question at actual landing with a fresh full window', async () => {
    const { socket, io } = browser();
    publishGameStartTransition(io, ownedLanding());
    await jest.advanceTimersByTimeAsync(800 + 8_000);
    const firstRoll = gameService.getGameSync(gameId)!.diceRollId;
    await socket.trigger('game:movement-complete', { gameId, diceRollId: firstRoll });
    const first = gameService.getGameSync(gameId)!.duelState!;
    expect(first.owner.challenge.startedAt).toBe(Date.now());
    expect(first.owner.challenge.startedAt + first.owner.challenge.timeLimit * 1_000 - Date.now()).toBe(30_000);

    // Answering early does not immediately submit or overwrite the bot side.
    await socket.trigger('game:duel-answer', { gameId, selectedIndex: first.owner.challenge.correctIndex });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MATH_DUEL');
    expect(gameService.getGameSync(gameId)!.duelState!.owner.selectedIndex).toBe(first.owner.challenge.correctIndex);
    await jest.advanceTimersByTimeAsync(2_200);
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('END_TURN');
    expect(gameService.getGameSync(gameId)!.players[2].totalQuestions).toBe(1);
    await jest.advanceTimersByTimeAsync(5_999);
    expect(gameService.getGameSync(gameId)!.currentPlayerIndex).toBe(0);
    await jest.advanceTimersByTimeAsync(1 + 800 + 7_000);
    const secondMoving = gameService.getGameSync(gameId)!;
    expect(secondMoving.currentPlayerIndex).toBe(1);
    expect(secondMoving.turnPhase).toBe('MOVING');
    await socket.trigger('game:movement-complete', { gameId, diceRollId: firstRoll });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');
    await socket.trigger('game:movement-complete', { gameId, diceRollId: secondMoving.diceRollId });
    const second = gameService.getGameSync(gameId)!.duelState!;
    expect(second.owner.challenge.id).not.toBe(first.owner.challenge.id);
    expect(toPublicDuelState(second).id).not.toBe(toPublicDuelState(first).id);
    expect(second.owner.challenge.startedAt).toBe(Date.now());
    expect(second.owner.challenge.startedAt + second.owner.challenge.timeLimit * 1_000 - Date.now()).toBe(30_000);
    expect(gameService.getGameSync(gameId)!.players[2].totalQuestions).toBe(1);
  });

  it('recovers a missing presentation acknowledgement without issuing an aged duel', async () => {
    const { io } = browser();
    publishGameStartTransition(io, ownedLanding());
    await jest.advanceTimersByTimeAsync(800 + PHASE_TIMEOUTS.movementFallback);
    const live = gameService.getGameSync(gameId)!;
    expect(live.players[0].position).toBe(2);
    expect(live.turnPhase).toBe('MATH_DUEL');
    expect(live.duelState!.owner.challenge.startedAt).toBe(Date.now());
  });

  it('waits for all connected seated viewers, then ignores duplicate acknowledgements', async () => {
    const state = gameService.getGameSync(gameId)!;
    state.players[1] = { ...state.players[1], isBot: false };
    gameService.replaceState(gameId, state);
    const first = makeSocket({ player: { id: 'human-account-1' }, gameId });
    const second = makeSocket({ player: { id: 'bot-account-2' }, gameId });
    const io = makeServer([first, second], gameId);
    registerGameHandlers(io, first);
    registerGameHandlers(io, second);
    publishGameStartTransition(io, state);
    await jest.advanceTimersByTimeAsync(800);
    const rollId = gameService.getGameSync(gameId)!.diceRollId;
    await first.trigger('game:movement-complete', { gameId, diceRollId: rollId });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');
    await second.trigger('game:movement-complete', { gameId, diceRollId: rollId });
    const landed = gameService.getGameSync(gameId)!;
    expect(landed.players[0].position).toBe(2);
    await first.trigger('game:movement-complete', { gameId, diceRollId: rollId });
    expect(gameService.getGameSync(gameId)).toBe(landed);
  });

  it('releases a completed movement when its remaining viewer disconnects', async () => {
    const state = gameService.getGameSync(gameId)!;
    state.players[1] = { ...state.players[1], isBot: false };
    gameService.replaceState(gameId, state);
    const first = makeSocket({ player: { id: 'human-account-1' }, gameId });
    const second = makeSocket({ player: { id: 'bot-account-2' }, gameId });
    const io = makeServer([first, second], gameId);
    registerGameHandlers(io, first);
    registerGameHandlers(io, second);
    publishGameStartTransition(io, state);
    await jest.advanceTimersByTimeAsync(800);
    await first.trigger('game:movement-complete', { gameId, diceRollId: 1 });
    io.sockets.adapter.rooms.get('room:bot-playback')!.delete(second.id);
    await second.trigger('disconnect');
    expect(gameService.getGameSync(gameId)!.players[0].position).toBe(2);
    expect(gameService.getGameSync(gameId)!.turnPhase).not.toBe('MOVING');
  });

  it('publishes scores and cleans up when bot error recovery finishes the match', async () => {
    const { socket, io } = browser();
    const state = gameService.getGameSync(gameId)!;
    const finalTurn = gameService.replaceState(gameId, {
      ...state,
      turnPhase: 'END_TURN',
      round: state.maxRounds + 1,
    });
    const failure = new Error('Injected final bot action failure');
    const step = jest.spyOn(gameService, 'executeBotStep').mockImplementationOnce(() => {
      throw failure;
    });
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    publishGameStartTransition(io, finalTurn);
    await jest.advanceTimersByTimeAsync(800);

    expect(errorLog).toHaveBeenCalledWith('[BotTurn] Could not advance bot phase:', failure);
    expect(gameService.getGameSync(gameId)!.phase).toBe('FINISHED');
    expect(socket.emit).toHaveBeenCalledWith('game:finished', {
      scores: gameService.getScores(gameId),
      masteryReport: expect.objectContaining({ playerId: 'human-1' }),
    });
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:finished')).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(5 * 60_000 - 1);
    expect(gameService.getGameSync(gameId)).not.toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(gameService.getGameSync(gameId)).toBeNull();
    expect(step).toHaveBeenCalledTimes(1);
  });
});
