import { SNAPSHOT_OFFSET } from '../config';
import { formatMoto } from '../utils/format';
import type { GameState } from '../types';

interface CycleStatusProps {
  gameState: GameState;
}

export function CycleStatus({ gameState }: CycleStatusProps) {
  const blocksLeft = gameState.snapshotBlock > gameState.currentBlock
    ? Number(gameState.snapshotBlock - gameState.currentBlock)
    : 0;
  const pct = Math.min(100, Math.round((1 - blocksLeft / SNAPSHOT_OFFSET) * 100));

  let badgeClass = 'phase-badge open';
  let phaseText = 'OPEN — TICKETS AVAILABLE';

  if (gameState.settled) {
    badgeClass = 'phase-badge settled';
    phaseText = 'SETTLED — NEXT CYCLE STARTING';
  } else if (blocksLeft === 0) {
    badgeClass = 'phase-badge settling';
    phaseText = 'READY TO SETTLE';
  }

  return (
    <div className="panel">
      <div className="panel-title">Current Cycle</div>

      <div className={badgeClass}>
        <div className="phase-dot" />
        <span>{phaseText}</span>
      </div>

      <div className="stats-grid">
        <div className="stat">
          <div className="stat-label">Cycle</div>
          <div className="stat-value pink">#{String(gameState.cycleId)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total Pot</div>
          <div className="stat-value gold">{formatMoto(gameState.totalPot)} MOTO</div>
        </div>
        <div className="stat">
          <div className="stat-label">Tickets Sold</div>
          <div className="stat-value">{String(gameState.totalTickets)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Block</div>
          <div className="stat-value">{Number(gameState.currentBlock).toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Snapshot</div>
          <div className="stat-value">{Number(gameState.snapshotBlock).toLocaleString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Blocks Left</div>
          <div className="stat-value green">{blocksLeft > 0 ? blocksLeft : 'PASSED'}</div>
        </div>
      </div>

      <div className="progress-wrap">
        <div className="progress-label">
          <span>Cycle Progress</span>
          <span>{pct}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
