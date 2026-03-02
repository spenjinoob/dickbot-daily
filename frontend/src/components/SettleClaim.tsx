import { useState } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { Network } from '@btc-vision/bitcoin';
import { CONTRACT_ADDRESS, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import { shortAddr } from '../utils/format';
import type { IKingDick, GameState, RevealSettle } from '../types';
import type { ToastType } from './Toast';

interface SettleClaimProps {
  gameState: GameState;
  walletAddress: string | null;
  address: Address | null;
  network: Network | null;
  connected: boolean;
  onToast: (msg: string, type: ToastType) => void;
  onRefresh: () => void;
  getProvider: () => JSONRpcProvider;
}

export function SettleClaim({
  gameState,
  walletAddress,
  address,
  network,
  connected,
  onToast,
  onRefresh,
  getProvider,
}: SettleClaimProps) {
  const [settling, setSettling] = useState(false);
  const [settleStep, setSettleStep] = useState('');

  const blocksLeft = gameState.snapshotBlock > gameState.currentBlock
    ? Number(gameState.snapshotBlock - gameState.currentBlock)
    : 0;
  const hasCommit = gameState.commitBlock > 0n;
  const canCommit = connected && blocksLeft === 0 && !gameState.settled && gameState.totalTickets > 0n && !hasCommit;
  const canSettle = canCommit || hasCommit;

  let countdownText = '';
  let countdownColor = 'var(--dim)';

  if (gameState.totalTickets === 0n) {
    countdownText = 'No tickets purchased yet — buy some first!';
  } else if (gameState.settled) {
    countdownText = 'Cycle settled. Next round starting...';
  } else if (hasCommit) {
    countdownText = 'Commit received — waiting for reveal window...';
    countdownColor = 'var(--cyan)';
  } else if (blocksLeft === 0) {
    countdownText = 'Settlement available now!';
    countdownColor = 'var(--green)';
  } else {
    countdownText = `Settlement in: ${blocksLeft} block${blocksLeft === 1 ? '' : 's'}`;
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
      const provider = getProvider();
      const contract = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, address
      );

      const purchaseCount = Number(gameState.purchaseCount);
      if (purchaseCount === 0) {
        onToast('No purchases to settle', 'error');
        setSettling(false);
        return;
      }

      // Phase 1: Generate secret and commit
      setSettleStep('Generating commitment...');
      const secretBytes = new Uint8Array(32);
      crypto.getRandomValues(secretBytes);
      const secret = BigInt('0x' + Array.from(secretBytes).map(
        (b) => b.toString(16).padStart(2, '0')
      ).join(''));

      // Compute sha256(secret) for the commitment
      const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);
      const hashArray = new Uint8Array(hashBuffer);
      const commitHash = BigInt('0x' + Array.from(hashArray).map(
        (b) => b.toString(16).padStart(2, '0')
      ).join(''));

      setSettleStep('Sending commitment...');
      const commitSim = await contract.commitSettle(commitHash);
      if ('error' in commitSim) throw new Error(String(commitSim.error));

      await commitSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100_000n,
        network,
      });

      // Phase 2: Wait for next block then reveal
      setSettleStep('Waiting for next block...');
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const freshState = await contract.getState();
        if (!('error' in freshState) && freshState.properties.commitBlock > 0n) {
          const commitBlk = freshState.properties.commitBlock;
          const curBlk = freshState.properties.currentBlock;
          if (curBlk > commitBlk) {
            // We're in a later block — reveal now
            break;
          }
        }
        setSettleStep(`Waiting for next block (${attempt + 1})...`);
      }

      // Phase 2b: Find winning purchase index
      setSettleStep(`Searching entries (0/${purchaseCount})...`);
      let winnerSim: RevealSettle | null = null;

      for (let i = 0; i < purchaseCount; i++) {
        setSettleStep(`Searching entries (${i + 1}/${purchaseCount})...`);
        const sim = await contract.revealSettle(secret, BigInt(i));
        if (!('error' in sim)) {
          winnerSim = sim;
          break;
        }
      }

      if (!winnerSim) {
        throw new Error('Could not find winning purchase index');
      }

      setSettleStep('Revealing winner...');
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
        <span style={{ color: 'var(--gold)' }}>0.2%</span> of the pot. Uses commit-reveal
        for provably fair winner selection.
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
