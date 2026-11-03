import type { Player } from '../types/game.types';
import type { ActivityEntry } from '../hooks/useTableActivity';
import { TokenIcon } from './TokenIcon';
import './TableFeed.css';

interface Props {
  entries: ActivityEntry[];
  players: Player[];
}

/** The last few things that happened at the table, newest first. */
export function TableFeed({ entries, players }: Props) {
  return (
    <section className="table-feed" aria-label="What just happened">
      <h2 className="table-feed__title">At the table</h2>
      {entries.length === 0 ? (
        <p className="table-feed__empty">Moves will appear here.</p>
      ) : (
        <ol className="table-feed__list" aria-live="polite">
          {entries.map((entry) => {
            const player = players.find((candidate) => candidate.id === entry.playerId);
            return (
              <li
                key={entry.id}
                className={`table-feed__item table-feed__item--${entry.tone}`}
                style={{ '--player-color': player?.color ?? '#999' } as React.CSSProperties}
              >
                <span className="table-feed__token" aria-hidden="true">
                  {player && <TokenIcon token={player.tokenType} size={18} />}
                </span>
                <span className="table-feed__text">{entry.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
