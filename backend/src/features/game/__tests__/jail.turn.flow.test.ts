import { initializeGameState } from '../game.engine';
import { MAX_JAIL_TURNS } from '../game.constants';
import { gameService } from '../../../test/game.service';
import { registerGameHandlers } from '../../../test/socket.runtime';
import { makeServer, makeSocket } from '../../../sockets/__tests__/socket.harness';

describe('jail turn entry through the live game flow', () => {
  let gameId: string;
  let gameNumber = 0;
  const players = [
    { id: 'seat-1', playerId: 'account-1', name: 'Aina', color: '#6366f1', order: 0 },
    { id: 'seat-2', playerId: 'account-2', name: 'Ben', color: '#f59e0b', order: 1 },
    { id: 'seat-3', playerId: 'account-3', name: 'Carol', color: '#10b981', order: 2 },
    { id: 'seat-4', playerId: 'account-4', name: 'Dave', color: '#ef4444', order: 3 },
  ];

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1_700_000_000_000);
    jest.spyOn(Math, 'random').mockReturnValue(0);
    gameId = `game_jail-turn-${gameNumber++}`;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    gameService.removeGame(gameId);
  });

  function waitingForJailedPlayer(isBot = false, jailTurns = 0) {
    const state = initializeGameState(gameId, players);
    const jailIndex = state.tiles.findIndex((tile) => tile.type === 'JAIL');
    return gameService.replaceState(gameId, {
      ...state,
      currentPlayerIndex: 3,
      turnPhase: 'END_TURN',
      players: state.players.map((player, index) => index === 0
        ? { ...player, position: jailIndex, isInJail: true, isBot, jailTurns }
        : player),
    });
  }

  it('publishes jail options and accepts math escape immediately without a roll request', async () => {
    waitingForJailedPlayer();
    const jailed = makeSocket({ player: { id: 'account-1' }, gameId });
    const previous = makeSocket({ player: { id: 'account-4' }, gameId });
    const io = makeServer([jailed, previous], gameId);
    registerGameHandlers(io, jailed);
    registerGameHandlers(io, previous);

    await previous.trigger('game:end-turn', { gameId });

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('JAIL_DECISION');
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:state', {
      state: expect.objectContaining({ currentPlayerIndex: 0, turnPhase: 'JAIL_DECISION', diceRollId: 0 }),
    });

    await jailed.trigger('game:jail-math', { gameId });

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('JAIL_CHALLENGE');
    expect(jailed.emit).toHaveBeenCalledWith('game:challenge', {
      playerId: 'seat-1',
      challenge: expect.objectContaining({ context: 'JAIL_ESCAPE' }),
    });
  });

  it('lets a jailed bot choose its escape on the jail decision delay', async () => {
    waitingForJailedPlayer(true);
    const previous = makeSocket({ player: { id: 'account-4' }, gameId });
    const io = makeServer([previous], gameId);
    registerGameHandlers(io, previous);

    await previous.trigger('game:end-turn', { gameId });
    await jest.advanceTimersByTimeAsync(499);
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('JAIL_DECISION');
    await jest.advanceTimersByTimeAsync(1);

    const escaped = gameService.getGameSync(gameId)!;
    expect(escaped.turnPhase).toBe('JAIL_CHALLENGE');
    expect(escaped.diceRollId).toBe(0);
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:bot-action',
      expect.objectContaining({ action: 'jail_math_start' }));
  });

  it('keeps an incoming automatic release roll waiting for every movement acknowledgement', async () => {
    const before = waitingForJailedPlayer(false, MAX_JAIL_TURNS);
    const jailed = makeSocket({ player: { id: 'account-1' }, gameId });
    const previous = makeSocket({ player: { id: 'account-4' }, gameId });
    const io = makeServer([jailed, previous], gameId);
    registerGameHandlers(io, jailed);
    registerGameHandlers(io, previous);

    await previous.trigger('game:end-turn', { gameId });

    const moving = gameService.getGameSync(gameId)!;
    expect(moving.turnPhase).toBe('MOVING');
    expect(moving.diceRollId).toBe(before.diceRollId + 1);
    expect(moving.players[0].isInJail).toBe(false);
    expect(moving.players[0].position).toBe(before.players[0].position);

    await jailed.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');
    await previous.trigger('game:movement-complete', { gameId, diceRollId: moving.diceRollId });

    expect(gameService.getGameSync(gameId)!.players[0].position).toBe(before.players[0].position + 2);
    expect(gameService.getGameSync(gameId)!.turnPhase).not.toBe('MOVING');
  });
});
