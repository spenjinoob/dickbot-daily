import { formatMoto } from '../utils/format';
import type { GameState } from '../types';

interface PrizeSplitProps {
  gameState: GameState;
}

export function PrizeSplit({ gameState }: PrizeSplitProps) {
  const pot = gameState.totalPot;
  const settlerAmt = pot * 2n / 1000n;
  const remainder = pot - settlerAmt;
  const winnerAmt = remainder * 850n / 1000n;
  const stakingAmt = remainder * 100n / 1000n;

  return (
    <div className="panel">
      <div className="panel-title">Prize Split</div>
      <div className="prize-rows">
        <div className="prize-row">
          <span className="prize-label">🏆 Winner</span>
          <div className="prize-bar-wrap">
            <div
              className="prize-bar"
              style={{ width: '85%', background: 'linear-gradient(90deg,var(--gold),#cc88ff)' }}
            />
          </div>
          <span className="prize-pct">{formatMoto(winnerAmt)} MOTO</span>
        </div>
        <div className="prize-row">
          <span className="prize-label">🔒 Staking</span>
          <div className="prize-bar-wrap">
            <div className="prize-bar" style={{ width: '10%', background: 'var(--purple)' }} />
          </div>
          <span className="prize-pct">{formatMoto(stakingAmt)} MOTO</span>
        </div>
        <div className="prize-row">
          <span className="prize-label">⚡ Settler</span>
          <div className="prize-bar-wrap">
            <div className="prize-bar" style={{ width: '2%', background: 'var(--cyan)' }} />
          </div>
          <span className="prize-pct">{formatMoto(settlerAmt)} MOTO</span>
        </div>
      </div>
    </div>
  );
}
