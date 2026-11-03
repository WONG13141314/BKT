import { describe, expect, it } from 'vitest';
import { describeAnswer, describeStateChange } from './useTableActivity';
import type { GameState } from '../types/game.types';

const tiles = [
  { index: 0, type: 'GO', name: 'Mula' },
  { index: 1, type: 'PROPERTY', name: 'Tambah Alley' },
  { index: 2, type: 'JAIL', name: 'Penjara' },
];

function table(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game_TEST',
    tiles,
    currentPlayerIndex: 0,
    pendingTileEvent: null,
    properties: [{ tileIndex: 1, ownerId: null, isLeveledUp: false }],
    players: [
      { id: 'a', name: 'Ali', money: 700, position: 1, isInJail: false, isBankrupt: false },
      { id: 'b', name: 'Mei', money: 700, position: 0, isInJail: false, isBankrupt: false },
    ],
    ...overrides,
  } as unknown as GameState;
}

describe('describeStateChange', () => {
  it('names a purchase and its price once, without a separate payment line', () => {
    const before = table();
    const after = table({
      properties: [{ tileIndex: 1, ownerId: 'a', isLeveledUp: false }] as GameState['properties'],
      players: [{ ...before.players[0], money: 620 }, before.players[1]],
    });
    expect(describeStateChange(before, after).map((line) => line.text)).toEqual(['Ali bought Tambah Alley · RM80']);
  });

  it('reads money moving between two seats as a payment between them', () => {
    const before = table();
    const after = table({ players: [{ ...before.players[0], money: 680 }, { ...before.players[1], money: 720 }] });
    expect(describeStateChange(before, after).map((line) => line.text)).toEqual(['Ali paid RM20 to Mei']);
  });

  it('reports jail and a newly drawn card', () => {
    const before = table();
    const card = { id: 3, name: 'Oops!', description: '', isMathCard: false, effect: { type: 'NOTHING' } };
    const after = table({
      players: [{ ...before.players[0], isInJail: true, position: 2 }, before.players[1]],
      pendingTileEvent: { type: 'CHALLENGE_CARD', tileIndex: 1, tileName: 'Challenge Card', card, cardPending: true } as GameState['pendingTileEvent'],
    });
    expect(describeStateChange(before, after).map((line) => line.text)).toEqual([
      'Ali drew “Oops!”',
      'Ali was sent to Penjara',
    ]);
  });

  it('says nothing when nothing public changed', () => {
    expect(describeStateChange(table(), table())).toEqual([]);
  });
});

describe('describeAnswer', () => {
  it('names the kind of question and the outcome', () => {
    expect(describeAnswer({ name: 'Mei' }, 'SMART_BUY', { isCorrect: true }).text).toBe('Mei answered a bank offer correctly');
    expect(describeAnswer({ name: 'Mei' }, 'JAIL_ESCAPE', { isCorrect: false, timedOut: true }).text).toBe('Mei ran out of time on a jail escape');
  });
});
