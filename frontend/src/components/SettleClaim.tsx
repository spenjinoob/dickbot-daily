import { useState } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { Network } from '@btc-vision/bitcoin';
import { CONTRACT_ADDRESS, RPC_URL, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import { shortAddr } from '../utils/format';
import type { IKingDick, GameState, Settle } from '../types';
import type { ToastType } from './Toast';

interface SettleClaimProps {
  gameState: GameState;
  walletAddress: string | null;
  address: Address | null;
  network: Network | null;
  connected: boolean;
  onToast: (msg: string, type: ToastType) => void;
  onRefresh: () => void;
}

export function SettleClaim({
  gameState,
  walletAddress,
  address,
  network,
  connected,
  onToast,
  onRefresh,
}: SettleClaimProps) {
  const [settling, setSettling] = useState(false);
  const [settleStep, setSettleStep] = useState('');

  const blocksLeft = Math.max(0, gameState.snapshotBlock - gameState.currentBlock);
  const canSettle = connected && blocksLeft === 0 && !gameState.settled && gameState.totalTickets > 0;

  let countdownText = '';
  let countdownColor = 'var(--dim)';

  if (gameState.totalTickets === 0) {
    countdownText = 'No tickets purchased yet — buy some first!';
  } else if (gameState.settled) {
    countdownText = 'Cycle settled. Next round starting...';
  } else if (blocksLeft === 0) {
    countdownText = 'Settlement available now!';
    countdownColor = 'var(--green)';
  } else {
    countdownText = `Settlement available in: ${blocksLeft} block${blocksLeft === 1 ? '' : 's'}`;
  }

  async function handleSettle() {
    if (!walletAddress || !address || !network) {
      onToast('Connect wallet first', 'error');
      return;
    }
    if (!CONTRACT_ADDRESS) {
      onToast('Contract not deployed yet', 'error');
      return;
    }

    setSettling(true);

    try {
      const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
      const contract = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, address
      );

      const purchaseCount = gameState.purchaseCount;
      if (purchaseCount === 0) {
        onToast('No purchases to settle', 'error');
        setSettling(false);
        return;
      }

      // Find the correct purchase index by simulating each one.
      // The contract verifies the winning ticket falls within the purchase range.
      setSettleStep(`Searching entries (0/${purchaseCount})...`);
      let winnerSim: Settle | null = null;

      for (let i = 0; i < purchaseCount; i++) {
        setSettleStep(`Searching entries (${i + 1}/${purchaseCount})...`);
        const sim = await contract.settle(BigInt(i));
        if (!('error' in sim)) {
          winnerSim = sim;
          break;
        }
      }

      if (!winnerSim) {
        throw new Error('Could not find winning purchase index');
      }

      // Send the valid settlement transaction
      setSettleStep('Sending transaction...');
      const txReceipt = await winnerSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100_000n,
        network,
      });

      const txId = txReceipt?.transactionId ?? '';
      onToast(`Winner revealed! TX: ${shortAddr(txId)}`, 'success');
      setTimeout(onRefresh, 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast('Settle failed: ' + msg, 'error');
    } finally {
      setSettling(false);
      setSettleStep('');
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Settle &amp; Claim</div>
      <p style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 14, lineHeight: 1.6 }}>
        Anyone can settle a completed cycle and earn{' '}
        <span style={{ color: 'var(--gold)' }}>0.2%</span> of the pot. No admin required — fully
        trustless.
      </p>
      <div
        style={{
          textAlign: 'center',
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9,
          color: countdownColor,
          marginBottom: 12,
          minHeight: 18,
        }}
      >
        {countdownText}
      </div>
      <button
        className="btn btn-settle"
        onClick={handleSettle}
        disabled={!canSettle || settling}
        style={{
          width: '100%',
          opacity: canSettle && !settling ? 1 : 0.4,
          cursor: canSettle && !settling ? 'pointer' : 'not-allowed',
        }}
      >
        {settling ? (
          <>
            <span className="spinner" />
            {settleStep || 'Computing winner...'}
          </>
        ) : (
          "REVEAL TODAY'S MASSIVE WINNER & CLAIM YOUR FEE"
        )}
      </button>
    </div>
  );
}
