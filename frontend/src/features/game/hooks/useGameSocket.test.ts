import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSocket } from './useGameSocket';
import type { MathChallenge } from '../types/game.types';

const socket = vi.hoisted(() => ({
  connected: true,
  on: vi.fn(), off: vi.fn(), emit: vi.fn(), timeout: vi.fn(),
}));
vi.mock('../../../shared/contexts/SocketContext', () => ({ useSocket: () => ({ socket }) }));

const events = () => ({
  onStateUpdate: vi.fn(), onChallenge: vi.fn(), onChallengeStarted: vi.fn(), onAnswerResult: vi.fn(),
  onDuel: vi.fn(), onDuelResult: vi.fn(), onGameFinished: vi.fn(), onBotAction: vi.fn(),
  onSeatMismatch: vi.fn(), onError: vi.fn(),
});

describe('private hint requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.connected = true;
    socket.timeout.mockReturnValue(socket);
  });

  it('uses a bounded acknowledgement and forwards the refreshed private question', async () => {
    const handlers = events();
    const { result } = renderHook(() => useGameSocket('game_one', handlers));
    let request!: Promise<void>;
    act(() => { request = result.current.emitRequestHint('question_one'); });
    expect(socket.timeout).toHaveBeenCalledWith(5000);
    const [, payload, acknowledge] = socket.emit.mock.calls.find(([event]) => event === 'game:request-hint')!;
    expect(payload).toEqual({ gameId: 'game_one', challengeId: 'question_one' });

    const challenge = { id: 'question_one', context: 'MATH_DUEL', hint: { content: 'Start here.', highlights: [] } } as unknown as MathChallenge;
    const receiveChallenge = socket.on.mock.calls.find(([event]) => event === 'game:challenge')![1];
    act(() => { receiveChallenge({ challenge, playerId: 'seat_one' }); });
    expect(handlers.onChallenge).toHaveBeenCalledWith({ challenge, playerId: 'seat_one' });
    await act(async () => { acknowledge(null, { success: true }); await request; });
  });

  it('rejects a failed acknowledgement and an unresponsive connection', async () => {
    const { result } = renderHook(() => useGameSocket('game_one', events()));
    const rejected = result.current.emitRequestHint('question_one');
    socket.emit.mock.calls.find(([event]) => event === 'game:request-hint')![2](null, { success: false, error: 'This question has ended.' });
    await expect(rejected).rejects.toThrow('This question has ended.');

    socket.emit.mockClear();
    const timedOut = result.current.emitRequestHint('question_one');
    socket.emit.mock.calls.find(([event]) => event === 'game:request-hint')![2](new Error('timeout'));
    await expect(timedOut).rejects.toThrow('Could not load help. Try again.');
  });

  it('does not buffer a help request while disconnected', async () => {
    socket.connected = false;
    const { result } = renderHook(() => useGameSocket('game_one', events()));
    await expect(result.current.emitRequestHint('question_one')).rejects.toThrow('Reconnect to get help.');
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
