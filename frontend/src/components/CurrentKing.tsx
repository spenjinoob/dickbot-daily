import { shortAddr, formatMoto } from '../utils/format';
import type { GameState } from '../types';

const ZERO_ADDR = '0x' + '0'.repeat(64);

interface CurrentKingProps {
  gameState: GameState;
}

export function CurrentKing({ gameState }: CurrentKingProps) {
  const hasKing = gameState.kingAddress && gameState.kingAddress !== ZERO_ADDR;
  const hasLastWinner = gameState.lastWinner && gameState.lastWinner !== ZERO_ADDR;

  return (
    <div className="panel">
      <div className="panel-title">Current King</div>
      <div className="king-row">
        <div className="king-crown">👑</div>
        <div className="king-info">
          <div className="king-name">
            {hasKing ? 'REIGNING KING' : 'NO KING YET'}
          </div>
          <div className="king-addr">
            {hasKing ? shortAddr(gameState.kingAddress) : 'Be the first to win!'}
          </div>
        </div>
        {hasKing && (
          <div className="king-streak">🔥 {gameState.kingStreak}x</div>
        )}
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="stat" style={{ flex: 1 }}>
          <div className="stat-label">Last Winner</div>
          <div className="stat-value" style={{ fontSize: 9, color: 'var(--dim)' }}>
            {hasLastWinner ? shortAddr(gameState.lastWinner) : '—'}
          </div>
        </div>
        <div className="stat" style={{ flex: 1 }}>
          <div className="stat-label">Last Pot</div>
          <div className="stat-value gold">
            {hasLastWinner ? `${formatMoto(gameState.lastPot)} MOTO` : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}
