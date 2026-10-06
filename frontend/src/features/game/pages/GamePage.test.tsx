import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePage } from './GamePage';
import type { AnswerResult, GameState, MathChallenge, Player, PublicDuelState } from '../types/game.types';

const socket = vi.hoisted(() => ({ connected: true, on: vi.fn(), off: vi.fn(), emit: vi.fn(), timeout: vi.fn() }));
vi.mock('../../../shared/contexts/SocketContext', () => ({
  useSocket: () => ({ socket, isConnected: socket.connected, connectSocket: vi.fn(), disconnectSocket: vi.fn() }),
}));
vi.mock('../../auth/PlayerContext', () => ({ usePlayer: () => ({ player: { id: 'account-one' }, setPlayer: vi.fn() }) }));
vi.mock('../hooks/useGameAudio', () => ({ useGameAudio: () => ({ play: vi.fn(), playMovementStep: vi.fn() }) }));
vi.mock('../components/Board', () => ({ Board: ({ onMovementComplete }: { onMovementComplete: () => void }) =>
  <button onClick={onMovementComplete}>Finish board movement</button> }));
vi.mock('../components/PlayerPanel', () => ({ PlayerPanel: () => null }));
vi.mock('../components/SpaceDetailsPanel', () => ({ SpaceDetailsPanel: () => null }));
vi.mock('../components/TurnIndicator', () => ({ TurnIndicator: () => null }));
vi.mock('../components/GameActionDock', () => ({ GameActionDock: () => null }));

const players = [
  { id: 'seat-one', playerId: 'account-one', name: 'Alex', position: 0, isBot: false },
  { id: 'seat-two', playerId: 'account-two', name: 'Sam', position: 0, isBot: true },
] as Player[];
const makeState = (turnPhase: GameState['turnPhase'] = 'SMART_BUY_CHALLENGE'): GameState => ({
  id: 'game_ONE', players, currentPlayerIndex: 0, phase: 'PLAYING', turnPhase,
  tiles: Array.from({ length: 20 }, (_, index) => ({ index, type: 'GO', name: 'Start' })), properties: [],
  pendingTileEvent: null, currentChallenge: null, diceRollId: 1, diceValues: [2, 3], diceCount: 2, round: 1, maxRounds: 12,
} as unknown as GameState);
const makeQuestion = (id: string, context: MathChallenge['context'] = 'SMART_BUY'): MathChallenge => ({
  id, context, options: ['4', '6', '7', '8'], timeLimit: 60, expiresAt: Date.now() + 60_000,
  questionData: { type: 'column', operation: '+', columns: ['tens', 'ones'], topCells: ['3', '?'],
    bottomCells: ['1', '6'], answerCells: ['5', '2'], hiddenRow: null },
});
const answer: AnswerResult = {
  isCorrect: true, correctAnswer: '6', reward: { type: 'DISCOUNT', value: 20, description: 'You earned a 20% discount.' },
  streakCount: 1, streakBroken: false, timedOut: false, assisted: false, feedback: 'Addition: 36 + 16 = 52.',
};
const makeDuel = (id: string): PublicDuelState => ({
  id, tileIndex: 1, tileName: 'Number Avenue', rentAmount: 40,
  challenger: { playerId: 'seat-one', hasAnswered: false, isCorrect: null },
  owner: { playerId: 'seat-two', hasAnswered: false, isCorrect: null }, resolution: null,
});
const resolution = { outcome: 'CHALLENGER_WINS' as const, rentPaid: 20, landlordBonus: 0,
  challengerCorrect: true, ownerCorrect: false, headline: 'Rent reduced to RM20.' };

function receive(event: string, data: unknown) {
  const handler = socket.on.mock.calls.find(([name]) => name === event)?.[1];
  if (!handler) throw new Error(`Missing handler: ${event}`);
  act(() => { handler(data); });
}
function mount() {
  return render(<MemoryRouter initialEntries={['/game?code=ONE']}><GamePage /></MemoryRouter>);
}

describe('live game question feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    socket.connected = true;
    socket.timeout.mockReturnValue(socket);
  });
  afterEach(() => vi.useRealTimers());

  it('shows one primary result with reward and worked maths, with no correctness toast', () => {
    const { container } = mount();
    receive('game:state', { state: makeState() });
    receive('game:challenge', { playerId: 'seat-one', challenge: makeQuestion('question-1') });
    receive('game:answer-result', { playerId: 'seat-one', challengeId: 'question-1', result: answer });
    receive('game:state', { state: makeState('END_TURN') });
    expect(screen.getByRole('heading', { name: 'Correct' })).toBeVisible();
    expect(screen.getAllByText(answer.reward.description)).toHaveLength(1);
    expect(screen.getAllByText(answer.feedback)).toHaveLength(1);
    expect(container.querySelector('.notification-toast')).toBeNull();
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('heading', { name: 'Correct' })).not.toBeInTheDocument();
  });

  it('keeps private duel maths hidden until resolution and never lets an older result close the next duel', () => {
    const { container } = mount();
    receive('game:state', { state: makeState('MATH_DUEL') });
    const first = makeDuel('duel-1');
    receive('game:duel', { duel: first, myChallenge: makeQuestion('duel-question-1', 'MATH_DUEL') });
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    receive('game:challenge', { playerId: 'seat-one', challenge: { ...makeQuestion('duel-question-1', 'MATH_DUEL'),
      hint: { content: 'Start here.', highlights: [] } } });
    expect(screen.queryByRole('button', { name: '6' })).not.toBeInTheDocument();
    expect(screen.getByText(/Answer locked in/)).toBeVisible();
    receive('game:answer-result', { playerId: 'seat-one', challengeId: 'duel-question-1', result: answer });
    expect(screen.queryByText(answer.feedback)).not.toBeInTheDocument();
    receive('game:duel-result', { duel: { ...first, resolution }, resolution });
    expect(screen.getByText(answer.feedback)).toBeVisible();
    expect(container.querySelector('.notification-toast')).toBeNull();

    act(() => vi.advanceTimersByTime(2000));
    const second = makeDuel('duel-2');
    receive('game:duel', { duel: second, myChallenge: makeQuestion('duel-question-2', 'MATH_DUEL') });
    expect(screen.getByRole('timer')).toHaveTextContent('60 seconds');
    act(() => vi.advanceTimersByTime(4500));
    expect(screen.getByRole('timer')).toHaveTextContent('56 seconds');
    receive('game:duel-result', { duel: { ...first, resolution }, resolution });
    expect(screen.getByRole('button', { name: 'Help me start' })).toBeVisible();
    expect(screen.queryByText(answer.feedback)).not.toBeInTheDocument();
  });

  it('preserves a same-question hint deadline and starts the next question with its fresh deadline', () => {
    mount();
    receive('game:state', { state: makeState() });
    const first = makeQuestion('question-1');
    receive('game:challenge', { playerId: 'seat-one', challenge: first });
    act(() => vi.advanceTimersByTime(5000));
    receive('game:challenge', { playerId: 'seat-one', challenge: { ...first, hint: { content: 'Start with the ones.', highlights: [] } } });
    expect(screen.getByRole('timer')).toHaveTextContent('55 seconds');
    receive('game:challenge', { playerId: 'seat-one', challenge: makeQuestion('question-2') });
    expect(screen.getByRole('timer')).toHaveTextContent('60 seconds');
    receive('game:answer-result', { playerId: 'seat-one', challengeId: 'question-1', result: answer });
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Correct' })).not.toBeInTheDocument();
  });

  it('acknowledges a bot turn movement from a seated viewer once per roll', () => {
    mount();
    receive('game:state', { state: { ...makeState('MOVING'), currentPlayerIndex: 1 } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish board movement' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish board movement' }));
    const acknowledgements = socket.emit.mock.calls.filter(([event]) => event === 'game:movement-complete');
    expect(acknowledgements).toHaveLength(1);
    expect(acknowledgements[0][1]).toEqual({ gameId: 'game_ONE', diceRollId: 1 });
  });

  it('lets a newly issued duel replace an earlier answer card without either hold closing it', () => {
    mount();
    receive('game:state', { state: makeState() });
    receive('game:challenge', { playerId: 'seat-one', challenge: makeQuestion('question-1') });
    receive('game:answer-result', { playerId: 'seat-one', challengeId: 'question-1', result: answer });
    expect(screen.getByRole('heading', { name: 'Correct' })).toBeVisible();
    act(() => vi.advanceTimersByTime(1000));
    receive('game:state', { state: makeState('MATH_DUEL') });
    receive('game:duel', { duel: makeDuel('duel-1'), myChallenge: makeQuestion('duel-question-1', 'MATH_DUEL') });
    expect(screen.queryByRole('heading', { name: 'Correct' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6' })).toBeVisible();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('button', { name: 'Help me start' })).toBeVisible();
  });

  it('clears stale feedback when recovery provides the next question before its private event', () => {
    mount();
    receive('game:state', { state: makeState() });
    receive('game:challenge', { playerId: 'seat-one', challenge: makeQuestion('question-1') });
    receive('game:answer-result', { playerId: 'seat-one', challengeId: 'question-1', result: answer });
    const next = makeQuestion('question-2');
    receive('game:state', { state: { ...makeState(), currentChallenge: next } });
    receive('game:challenge', { playerId: 'seat-one', challenge: next });
    expect(screen.queryByRole('heading', { name: 'Correct' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('button', { name: 'Help me start' })).toBeVisible();
  });

  it('does not queue or lock an answer when disconnection races the click, then recovers the question', () => {
    mount();
    receive('game:state', { state: makeState() });
    const question = makeQuestion('question-1');
    receive('game:challenge', { playerId: 'seat-one', challenge: question });
    socket.connected = false;
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:smart-buy-answer')).toHaveLength(0);
    receive('game:state', { state: makeState() });
    expect(screen.getByText('Reconnecting…')).toBeVisible();
    expect(screen.getByRole('button', { name: '6' })).toBeDisabled();
    socket.connected = true;
    receive('game:state', { state: makeState() });
    receive('game:challenge', { playerId: 'seat-one', challenge: question });
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(socket.emit.mock.calls.filter(([event]) => event === 'game:smart-buy-answer')).toHaveLength(1);
  });

  it('restores an unanswered duel after a locally submitted packet is lost during disconnection', () => {
    mount();
    receive('game:state', { state: makeState('MATH_DUEL') });
    const duel = makeDuel('duel-1');
    const question = makeQuestion('duel-question-1', 'MATH_DUEL');
    receive('game:duel', { duel, myChallenge: question });
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(screen.getByText(/Answer locked in/)).toBeVisible();
    socket.connected = false;
    receive('game:state', { state: makeState('MATH_DUEL') });
    socket.connected = true;
    receive('connect', undefined);
    receive('game:state', { state: makeState('MATH_DUEL') });
    receive('game:duel', { duel, myChallenge: question });
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    expect(screen.getByRole('timer')).toHaveTextContent('60 seconds');
  });

  it('resets an unanswered normal question after recovery without resetting its deadline', () => {
    mount();
    receive('game:state', { state: makeState() });
    const question = makeQuestion('question-1');
    receive('game:challenge', { playerId: 'seat-one', challenge: question });
    fireEvent.click(screen.getByRole('button', { name: '6' }));
    expect(screen.getByRole('button', { name: '6' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(5000));
    receive('connect', undefined);
    receive('game:state', { state: makeState() });
    receive('game:challenge', { playerId: 'seat-one', challenge: question });
    expect(screen.getByRole('button', { name: '6' })).toBeEnabled();
    expect(screen.getByRole('timer')).toHaveTextContent('55 seconds');
  });
});
