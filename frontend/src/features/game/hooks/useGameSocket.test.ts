import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSocket } from './useGameSocket';
import type { MathChallenge } from '../types/game.types';

const socket = vi.hoisted(() => ({
  connected: true,
  on: vi.fn(), off: vi.fn(), emit: vi.fn(), timeout: vi.fn(),
}));
vi.mock('../../../shared/contexts/SocketContext', () => ({ useSocket: () => ({ socket }) }));

const events = () => ({
  onStateUpdate: vi.fn(), onChallenge: vi.fn(), onChallengeStarted: vi.fn(), onAnswerResult: vi.fn(),
  onDuel: vi.fn(), onDuelResult: vi.fn(), onDuelDismissed: vi.fn(), onGameFinished: vi.fn(), onBotAction: vi.fn(),
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

  it('forwards a shared duel dismissal and removes its listener when unmounted', () => {
    const handlers = events();
    const { unmount } = renderHook(() => useGameSocket('game_one', handlers));
    const receiveDismissal = socket.on.mock.calls.find(([event]) => event === 'game:duel-dismissed')![1];
    act(() => { receiveDismissal({ duelId: 'duel_one' }); });
    expect(handlers.onDuelDismissed).toHaveBeenCalledWith({ duelId: 'duel_one' });
    unmount();
    expect(socket.off).toHaveBeenCalledWith('game:duel-dismissed', receiveDismissal);
  });

  it('does not buffer duel Continue while disconnected', () => {
    socket.connected = false;
    const { result } = renderHook(() => useGameSocket('game_one', events()));
    expect(result.current.emitDuelContinue('duel_one')).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

describe('gameplay commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    socket.connected = true;
  });
  afterEach(() => vi.useRealTimers());

  it('sends a double-clicked command once, but allows a deliberate repeat later', () => {
    const { result } = renderHook(() => useGameSocket('game_one', events()));
    act(() => { result.current.emitBuyFull(); result.current.emitBuyFull(); });
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:buy-full')).toHaveLength(1);

    act(() => { vi.advanceTimersByTime(600); result.current.emitBuyFull(); });
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:buy-full')).toHaveLength(2);
  });

  it('does not treat a different answer as a duplicate', () => {
    const { result } = renderHook(() => useGameSocket('game_one', events()));
    act(() => { result.current.emitCardAnswer(1); result.current.emitCardAnswer(2); });
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:card-answer')).toHaveLength(2);
  });

  it('converts a question expiry from server time to this device clock', () => {
    vi.setSystemTime(1_000_000);
    const handlers = events();
    renderHook(() => useGameSocket('game_one', handlers));
    // The server clock is five minutes ahead of this device.
    const challenge = { id: 'q1', context: 'CHALLENGE_CARD', expiresAt: 1_330_000, serverNow: 1_300_000 } as unknown as MathChallenge;
    const receive = socket.on.mock.calls.find(([event]) => event === 'game:challenge')![1];
    act(() => { receive({ challenge, playerId: 'seat_one' }); });
    expect(handlers.onChallenge.mock.calls[0][0].challenge.expiresAt).toBe(1_030_000);
  });
});
