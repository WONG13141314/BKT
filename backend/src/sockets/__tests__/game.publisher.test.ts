import { toPublicGameState } from '../../features/game/game.public';
import {
  findMasteryReportForSocket,
  publishFinishedToSocket,
  publishGameState,
} from '../game.publisher';
import { makeFinishedFixture, makeGameState, makePrivateChallenge } from '../../test/game.fixtures';
import { makeServer, makeSocket } from './socket.harness';

describe('game publisher', () => {
  it('projects only public player and game fields', () => {
    const state = makeGameState();
    state.players[0].masteryStates = { Addition: 0.91 };
    state.players[0].skillAttempts = { Addition: 8 };
    state.players[0].consecutiveFailures = { Addition: 2 };
    state.currentChallenge = makePrivateChallenge({ correctIndex: 2 });

    const publicState = toPublicGameState(state);

    expect(publicState.players[0]).not.toHaveProperty('masteryStates');
    expect(publicState.players[0]).not.toHaveProperty('skillAttempts');
    expect(publicState.players[0]).not.toHaveProperty('consecutiveFailures');
    expect(publicState).not.toHaveProperty('currentChallenge');
    expect(JSON.stringify(publicState)).not.toContain('correctIndex');
  });

  it('sends only the requesting learner report in a finished payload', () => {
    const socket = makeSocket({ player: { id: 'db-player-1' } });
    const { state, scores, report } = makeFinishedFixture();

    publishFinishedToSocket(socket, state, scores, report);

    expect(socket.emit).toHaveBeenCalledWith('game:finished', {
      scores,
      masteryReport: report,
    });
  });

  it('gives the active learner a redacted challenge and observers no answer data', () => {
    const state = makeGameState({ currentChallenge: makePrivateChallenge({ correctIndex: 2 }) });
    state.players[0].masteryStates = { Addition: 0.91 };
    const activeSocket = makeSocket({ player: { id: 'db-player-1' } });
    const observerSocket = makeSocket({ player: { id: 'db-player-2' } });
    const io = makeServer([activeSocket, observerSocket]);

    publishGameState(io, state);

    const statePayload = io.roomEmitter.emit.mock.calls.find(([event]) => event === 'game:state')?.[1];
    expect(JSON.stringify(statePayload)).not.toContain('correctIndex');
    expect(JSON.stringify(statePayload)).not.toContain('masteryStates');
    expect(activeSocket.emit).toHaveBeenCalledWith('game:challenge', expect.objectContaining({
      playerId: 'seat-1',
      challenge: expect.not.objectContaining({ correctIndex: expect.anything() }),
    }));
    expect(observerSocket.emit).toHaveBeenCalledWith('game:challenge-started', {
      playerId: 'seat-1',
      context: 'CHALLENGE_CARD',
    });
    expect(observerSocket.emit).not.toHaveBeenCalledWith('game:challenge', expect.anything());
  });

  it('gives each duellist only their own redacted challenge and gives observers none', () => {
    const state = makeGameState();
    const challengerChallenge = makePrivateChallenge({
      id: 'challenger', correctIndex: 1, difficulty: 1, timeLimit: 25, startedAt: 1_000,
    });
    const ownerChallenge = makePrivateChallenge({
      id: 'owner', correctIndex: 3, difficulty: 3, timeLimit: 15, startedAt: 1_000,
    });
    state.duelState = {
      tileIndex: 1,
      tileName: 'Tambah Town',
      rentAmount: 50,
      challenger: {
        playerId: state.players[0].id,
        challenge: challengerChallenge,
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      owner: {
        playerId: state.players[1].id,
        challenge: ownerChallenge,
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      startedAt: 1_000,
      resolution: null,
    };
    const challengerSocket = makeSocket({ player: { id: 'db-player-1' } });
    const ownerSocket = makeSocket({ player: { id: 'db-player-2' } });
    const observerSocket = makeSocket({ player: { id: 'db-observer' } });
    const io = makeServer([challengerSocket, ownerSocket, observerSocket]);

    publishGameState(io, state);

    const challengerPayload = challengerSocket.emit.mock.calls.find(([event]) => event === 'game:duel')?.[1];
    const ownerPayload = ownerSocket.emit.mock.calls.find(([event]) => event === 'game:duel')?.[1];
    const observerPayload = observerSocket.emit.mock.calls.find(([event]) => event === 'game:duel')?.[1];
    expect(challengerPayload.myChallenge.id).toBe('challenger');
    expect(ownerPayload.myChallenge.id).toBe('owner');
    expect(challengerPayload.myChallenge.expiresAt).toBe(26_000);
    expect(ownerPayload.myChallenge.expiresAt).toBe(16_000);
    expect(challengerPayload.duel.expiresAt).toBeUndefined();
    expect(challengerPayload.duel.timeLimit).toBeUndefined();
    expect(observerPayload.myChallenge).toBeNull();
    expect(JSON.stringify([challengerPayload, ownerPayload, observerPayload])).not.toContain('correctIndex');
  });

  it('looks up only the report belonging to the finished-payload recipient', () => {
    const socket = makeSocket({ player: { id: 'db-player-2' } });
    const { state, report } = makeFinishedFixture();
    const otherReport = { ...report, playerId: 'db-player-2', playerName: 'Ben' };

    expect(findMasteryReportForSocket(socket, [report, otherReport], state)).toBe(otherReport);
  });

  it('does not treat a game seat id as an authenticated account id', () => {
    const state = makeGameState({ currentChallenge: makePrivateChallenge() });
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    const aliceSocket = makeSocket({ player: { id: 'alice' } });
    const io = makeServer([aliceSocket]);
    const { report } = makeFinishedFixture();
    const bobsReport = { ...report, playerId: 'alice' };

    publishGameState(io, state);

    expect(aliceSocket.emit).not.toHaveBeenCalledWith('game:challenge', expect.anything());
    expect(findMasteryReportForSocket(aliceSocket, [bobsReport], state)).toBeNull();
  });

  it('does not give a matching seat id another account’s duel question', () => {
    const state = makeGameState();
    state.players[0] = { ...state.players[0], id: 'alice', playerId: 'bob' };
    state.duelState = {
      tileIndex: 1,
      tileName: 'Tambah Town',
      rentAmount: 50,
      challenger: {
        playerId: 'alice',
        challenge: makePrivateChallenge({ id: 'bobs-duel-question' }),
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      owner: {
        playerId: state.players[1].id,
        challenge: makePrivateChallenge({ id: 'owners-duel-question' }),
        selectedIndex: null,
        isCorrect: null,
        timeMs: null,
        previousMastery: null,
        newMastery: null,
      },
      startedAt: 1_000,
      resolution: null,
    };
    const aliceSocket = makeSocket({ player: { id: 'alice' } });
    const io = makeServer([aliceSocket]);

    publishGameState(io, state);

    const duelPayload = aliceSocket.emit.mock.calls.find(([event]) => event === 'game:duel')?.[1];
    expect(duelPayload.myChallenge).toBeNull();
  });
});
