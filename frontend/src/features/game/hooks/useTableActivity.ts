import { useCallback, useEffect, useRef, useState } from 'react';
import { formatRM, type GameState, type Player } from '../types/game.types';

export interface ActivityEntry {
  id: number;
  /** The player the line is about, for their colour and token. */
  playerId: string | null;
  text: string;
  tone: 'neutral' | 'good' | 'bad';
}

/** Lines kept; older ones scroll away. */
export const ACTIVITY_LIMIT = 5;

const CONTEXT_LABELS: Record<string, string> = {
  SMART_BUY: 'bank offer',
  CHALLENGE_CARD: 'Challenge Card',
  JAIL_ESCAPE: 'jail escape',
  MATH_DUEL: 'Rent Defence',
};

type Draft = Omit<ActivityEntry, 'id'>;

/**
 * What changed at the table between two public snapshots, in plain words.
 *
 * The server sends whole states, not a log, so the feed is read off the
 * differences: new owners, houses, jail, cards and money moving between seats.
 * Only public fields are compared, so onlookers learn nothing a player at the
 * table could not already see.
 */
export function describeStateChange(previous: GameState, next: GameState): Draft[] {
  const lines: Draft[] = [];
  const before = new Map(previous.players.map((player) => [player.id, player]));
  const nameOf = (id: string | null | undefined) => next.players.find((player) => player.id === id)?.name ?? 'Someone';
  const tileName = (index: number) => next.tiles[index]?.name ?? 'a space';
  const explained = new Set<string>();

  for (const property of next.properties) {
    const old = previous.properties.find((item) => item.tileIndex === property.tileIndex);
    if (property.ownerId && property.ownerId !== old?.ownerId) {
      const buyer = next.players.find((player) => player.id === property.ownerId);
      const paid = buyer ? (before.get(buyer.id)?.money ?? buyer.money) - buyer.money : 0;
      lines.push({
        playerId: property.ownerId,
        text: `${nameOf(property.ownerId)} bought ${tileName(property.tileIndex)}${paid > 0 ? ` · ${formatRM(paid)}` : ''}`,
        tone: 'neutral',
      });
      explained.add(property.ownerId);
    }
    if (property.isLeveledUp && old && !old.isLeveledUp && property.ownerId) {
      lines.push({ playerId: property.ownerId, text: `${nameOf(property.ownerId)} built a house on ${tileName(property.tileIndex)}`, tone: 'good' });
      explained.add(property.ownerId);
    }
  }

  const card = next.pendingTileEvent?.card;
  if (card && next.pendingTileEvent?.cardPending && previous.pendingTileEvent?.card?.id !== card.id) {
    const drawer = next.players[next.currentPlayerIndex];
    if (drawer) lines.push({ playerId: drawer.id, text: `${drawer.name} drew “${card.name}”`, tone: 'neutral' });
  }

  for (const player of next.players) {
    const old = before.get(player.id);
    if (!old) continue;
    if (player.isInJail && !old.isInJail) lines.push({ playerId: player.id, text: `${player.name} was sent to ${tileName(player.position)}`, tone: 'bad' });
    if (!player.isInJail && old.isInJail) lines.push({ playerId: player.id, text: `${player.name} is out of jail`, tone: 'good' });
    if (player.isBankrupt && !old.isBankrupt) lines.push({ playerId: player.id, text: `${player.name} is bankrupt`, tone: 'bad' });
  }

  // Money that moved between exactly two seats is a payment between them.
  const changes = next.players
    .map((player) => ({ player, delta: player.money - (before.get(player.id)?.money ?? player.money) }))
    .filter(({ player, delta }) => delta !== 0 && !explained.has(player.id));
  const payers = changes.filter(({ delta }) => delta < 0);
  const payees = changes.filter(({ delta }) => delta > 0);
  if (payers.length === 1 && payees.length === 1 && payers[0].delta === -payees[0].delta) {
    lines.push({
      playerId: payers[0].player.id,
      text: `${payers[0].player.name} paid ${formatRM(payees[0].delta)} to ${payees[0].player.name}`,
      tone: 'neutral',
    });
  } else {
    for (const { player, delta } of changes) {
      lines.push({
        playerId: player.id,
        text: delta > 0 ? `${player.name} received ${formatRM(delta)}` : `${player.name} paid ${formatRM(-delta)}`,
        tone: delta > 0 ? 'good' : 'bad',
      });
    }
  }

  return lines;
}

export function describeAnswer(player: Pick<Player, 'name'>, context: string | null, result: { isCorrect: boolean; timedOut?: boolean }): Omit<Draft, 'playerId'> {
  const label = context ? CONTEXT_LABELS[context] ?? 'question' : 'question';
  if (result.timedOut) return { text: `${player.name} ran out of time on a ${label}`, tone: 'bad' };
  return result.isCorrect
    ? { text: `${player.name} answered a ${label} correctly`, tone: 'good' }
    : { text: `${player.name} missed a ${label}`, tone: 'bad' };
}

/** A short, newest-first log of what happened at the table, for everyone watching. */
export function useTableActivity(gameState: GameState | null) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const previous = useRef<GameState | null>(null);
  const nextId = useRef(1);

  const push = useCallback((drafts: Draft[]) => {
    if (drafts.length === 0) return;
    setEntries((current) => [
      ...drafts.reverse().map((draft) => ({ ...draft, id: nextId.current++ })),
      ...current,
    ].slice(0, ACTIVITY_LIMIT));
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const last = previous.current;
    previous.current = gameState;
    // A different game, or the first snapshot after loading: nothing to compare.
    if (!last || last.id !== gameState.id) return;
    push(describeStateChange(last, gameState));
  }, [gameState, push]);

  const recordAnswer = useCallback((player: Player | undefined, context: string | null, result: { isCorrect: boolean; timedOut?: boolean }) => {
    if (!player) return;
    push([{ playerId: player.id, ...describeAnswer(player, context, result) }]);
  }, [push]);

  return { entries, recordAnswer };
}
