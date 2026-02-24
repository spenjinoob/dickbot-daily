import { useState } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { CONTRACT_ADDRESS, RPC_URL, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import { shortAddr } from '../utils/format';
import type { IKingDick, GameState } from '../types';
import type { ToastType } from './Toast';

interface SettleClaimProps {
  gameState: GameState;
  wallet: unknown;
  walletAddress: string | null;
  connected: boolean;
  onToast: (msg: string, type: ToastType) => void;
  onRefresh: () => void;
}

export function SettleClaim({
  gameState,
  wallet,
  walletAddress,
  connected,
  onToast,
  onRefresh,
}: SettleClaimProps) {
  const [settling, setSettling] = useState(false);

  const blocksLeft = Math.max(0, gameState.snapshotBlock - gameState.currentBlock);
  const canSettle = connected && blocksLeft === 0 && !gameState.settled;

  let countdownText = '';
  let countdownColor = 'var(--dim)';

  if (gameState.settled) {
    countdownText = 'Cycle settled. Next round starting...';
  } else if (blocksLeft === 0) {
    countdownText = '🟢 Settlement available now!';
    countdownColor = 'var(--green)';
  } else {
    countdownText = `Settlement available in: ${blocksLeft} block${blocksLeft === 1 ? '' : 's'}`;
  }

  async function handleSettle() {
    if (!wallet || !walletAddress) {
      onToast('Connect wallet first', 'error');
      return;
    }
    if (!CONTRACT_ADDRESS) {
      onToast('Contract not deployed yet', 'error');
      return;
    }

    setSettling(true);

    try {
      // Get block hash from RPC to compute winning ticket
      const hashRes = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'getBlockByNumber',
          params: [gameState.snapshotBlock],
          id: 1,
        }),
      });
      const hashData = await hashRes.json();
      const blockHash = hashData?.result?.hash;
      if (!blockHash) throw new Error('Could not fetch snapshot block hash');

      // Compute winning ticket index: hashMod(blockHash[0:8], totalTickets)
      const hexStr = blockHash.replace('0x', '');
      const bytes: number[] = [];
      for (let i = 0; i < hexStr.length && bytes.length < 8; i += 2) {
        bytes.push(parseInt(hexStr.slice(i, i + 2), 16));
      }
      let val = BigInt(0);
      for (let i = 0; i < 8; i++) {
        val = val * BigInt(256) + BigInt(bytes[i]);
      }
      const winningIndex = val % BigInt(gameState.totalTickets);

      // Settle via opnet SDK
      const provider = new JSONRpcProvider(RPC_URL, NETWORK);
      const sender = Address.fromString(walletAddress);
      const contract = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, sender
      );

      // For now, claim ourselves as winner (simplified — in prod, scan events to find actual winner)
      const settleSim = await contract.settle(sender, winningIndex);
      if ('error' in settleSim) throw new Error(String(settleSim.error));

      const tx = await (wallet as any).sendTransaction({
        ...settleSim,
        signer: null,
        mldsaSigner: null,
      });

      onToast(`🏆 Winner revealed! TX: ${shortAddr(tx.hash)}`, 'success');
      setTimeout(onRefresh, 3000);
    } catch (e: any) {
      onToast('Settle failed: ' + (e.message || e), 'error');
    } finally {
      setSettling(false);
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
            Computing winner...
          </>
        ) : (
          '⚡ REVEAL TODAY\'S MASSIVE WINNER & CLAIM YOUR FEE'
        )}
      </button>
    </div>
  );
}
