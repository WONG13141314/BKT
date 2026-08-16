import { initializeGameState } from '../game.engine';
import { gameService } from '../game.service';
import { registerGameHandlers } from '../../../sockets/game.handlers';
import { makeServer, makeSocket } from '../../../sockets/__tests__/socket.harness';

describe('ordered bot playback', () => {
  const gameId = 'game_bot-playback';

  beforeEach(() => {
    gameService.replaceState(gameId, initializeGameState(gameId, [
      {
        id: 'bot-1',
        playerId: 'bot-account-1',
        name: 'Bot One',
        color: '#6366f1',
        order: 0,
        isBot: true,
        botDifficulty: 'medium',
      },
      {
        id: 'human-1',
        playerId: 'human-account-1',
        name: 'Human One',
        color: '#f59e0b',
        order: 1,
      },
    ]));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    gameService.removeGame(gameId);
  });

  it('does not expose the final bot state before intermediate steps are presented', () => {
    const before = gameService.getGameSync(gameId)!;
    const steps = gameService.planBotTurn(gameId)!;

    expect(steps.length).toBeGreaterThan(1);
    expect(gameService.getGameSync(gameId)).toBe(before);

    for (const step of steps) {
      gameService.commitBotStep(gameId, step.state);
      expect(gameService.getGameSync(gameId)).toBe(step.state);
    }
  });

  it('commits each bot state only after that step presentation delay', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const state = gameService.getGameSync(gameId)!;
    gameService.replaceState(gameId, {
      ...state,
      currentPlayerIndex: 1,
      turnPhase: 'END_TURN',
    });

    const socket = makeSocket({ player: { id: 'human-account-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:end-turn', { gameId });
    await Promise.resolve();

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('ROLL_PHASE');

    await jest.advanceTimersByTimeAsync(800);

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('MOVING');
    expect(io.roomEmitter.emit).toHaveBeenCalledWith('game:bot-action', expect.objectContaining({
      action: 'roll',
    }));
  });

  it('does not overwrite a human duel answer with a stale planned bot step', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const state = gameService.getGameSync(gameId)!;
    gameService.replaceState(gameId, {
      ...state,
      currentPlayerIndex: 1,
      turnPhase: 'END_TURN',
      players: state.players.map((player) => player.id === 'human-1'
        ? { ...player, properties: [2] }
        : player),
      properties: state.properties.map((property) => property.tileIndex === 2
        ? { ...property, ownerId: 'human-1' }
        : property),
    });

    const socket = makeSocket({ player: { id: 'human-account-1' } });
    const io = makeServer([socket], gameId);
    registerGameHandlers(io, socket);

    await socket.trigger('game:end-turn', { gameId });
    await jest.advanceTimersByTimeAsync(2_300);

    const duel = gameService.getGameSync(gameId)!.duelState!;
    await socket.trigger('game:duel-answer', {
      gameId,
      selectedIndex: duel.owner.challenge.correctIndex,
      timeMs: 500,
    });
    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('ROLL_PHASE');

    await jest.advanceTimersByTimeAsync(1_200);

    expect(gameService.getGameSync(gameId)!.turnPhase).toBe('ROLL_PHASE');
  });
});
