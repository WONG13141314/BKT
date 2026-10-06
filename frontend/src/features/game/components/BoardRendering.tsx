import { Component, type ReactNode } from 'react';
import { getGridPosition } from '../config/board.presentation';
import type { Player } from '../types/game.types';

/** Three's renderer requires WebGL2. Release the probe's context immediately. */
export function hasWebGL2(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export class BoardSceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const PIP_POSITIONS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

export function BasicDice({ values, rolling }: { values: [number, number]; rolling: boolean }) {
  const activeValues = values.filter((value) => value >= 1 && value <= 6);
  return (
    <div className={`physics-dice basic-dice${rolling ? ' basic-dice--rolling' : ''}`} aria-label={`Dice showing ${activeValues.join(' and ')}`}>
      {activeValues.map((value, index) => (
        <span key={index} className="basic-die" aria-hidden="true">
          {Array.from({ length: 9 }, (_, pip) => <i key={pip} className={PIP_POSITIONS[value].includes(pip) ? 'basic-die-pip' : ''} />)}
        </span>
      ))}
    </div>
  );
}

const TOKEN_OFFSETS = [[-65, -65], [65, -65], [-65, 65], [65, 65]];

export function BasicBoardTokens({ players }: { players: Player[] }) {
  return (
    <div className="board-piece-layer basic-token-layer" aria-label="Player tokens">
      {players.map((player, index) => {
        if (player.isBankrupt) return null;
        const { gridRow, gridColumn } = getGridPosition(player.position);
        const [across, down] = TOKEN_OFFSETS[index] ?? [0, 0];
        return <span
          key={player.id}
          className="basic-player-token"
          role="img"
          aria-label={`${player.name} on space ${player.position}`}
          title={player.name}
          style={{ gridRow, gridColumn, backgroundColor: player.color, transform: `translate(${across}%, ${down}%)` }}
        >{player.name.slice(0, 1).toUpperCase()}</span>;
      })}
    </div>
  );
}
