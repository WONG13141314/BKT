import type { PlayerToken } from '../types/game.types';
import { TOKEN_NAMES } from '../config/tokens';
import './TokenIcon.css';

/**
 * A rendered picture of the pewter piece (frontend/public/tokens), made from
 * the same 3D models as the board by `npm run icons --workspace=frontend`.
 */
export function TokenIcon({ token, size = 40, label = false }: { token: PlayerToken; size?: number; label?: boolean }) {
  return (
    <img
      className="token-icon"
      src={`/tokens/${token}.png`}
      width={size}
      height={size}
      alt={label ? TOKEN_NAMES[token] : ''}
      draggable={false}
    />
  );
}
