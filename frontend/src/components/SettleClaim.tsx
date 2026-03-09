import { useState } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { Network } from '@btc-vision/bitcoin';
import { CONTRACT_ADDRESS, NETWORK, REVEAL_WINDOW } from '../config';
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
  const commitExpired = hasCommit && (gameState.currentBlock - gameState.commitBlock) > BigInt(REVEAL_WINDOW);
  const canSettle = connected && blocksLeft === 0 && !gameState.settled && gameState.totalTickets > 0n;

  let countdownText = '';
  let countdownColor = 'var(--dim)';

  if (gameState.totalTickets === 0n) {
    countdownText = 'No tickets purchased yet — buy some first!';
  } else if (gameState.settled) {
    countdownText = 'Cycle settled. Next round starting...';
  } else if (hasCommit && commitExpired) {
    countdownText = 'Previous commit expired — settle now!';
    countdownColor = 'var(--green)';
  } else if (hasCommit) {
    countdownText = 'Commit received — waiting for reveal window...';
    countdownColor = 'var(--cyan)';
  } else if (blocksLeft === 0) {
    countdownText = 'Settlement available now!';
    countdownColor = 'var(--green)';
  } else {
    countdownText = `Settlement in: ${blocksLeft} block${blocksLeft === 1 ? '' : 's'}`;
  }

  function saveSecret(secret: bigint): void {
    try {
      localStorage.setItem(`kingdick_secret_${CONTRACT_ADDRESS}`, secret.toString());
    } catch { /* localStorage unavailable */ }
  }

  function loadSecret(): bigint | null {
    try {
      const stored = localStorage.getItem(`kingdick_secret_${CONTRACT_ADDRESS}`);
      if (stored) return BigInt(stored);
    } catch { /* localStorage unavailable */ }
    return null;
  }

  function clearSecret(): void {
    try {
      localStorage.removeItem(`kingdick_secret_${CONTRACT_ADDRESS}`);
    } catch { /* localStorage unavailable */ }
  }

  /** Helper: read fresh on-chain state. The opnet library throws on errors. */
  async function fetchLiveState(contract: IKingDick) {
    const result = await contract.getState();
    return result.properties;
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

      // Always fetch FRESH state — the prop gameState may be stale
      setSettleStep('Checking on-chain state...');
      const live = await fetchLiveState(contract);

      const purchaseCount = Number(live.purchaseCount);
      if (purchaseCount === 0) {
        onToast('No purchases to settle', 'error');
        setSettling(false);
        return;
      }

      if (live.settled) {
        onToast('Cycle already settled', 'error');
        setSettling(false);
        return;
      }

      const snapshotBlock = live.snapshotBlock;
      if (live.currentBlock < snapshotBlock) {
        const left = Number(snapshotBlock - live.currentBlock);
        onToast(`Cycle not closed yet — ${left} blocks remaining`, 'error');
        setSettling(false);
        return;
      }

      let secret: bigint = 0n;
      let needsCommit = true;

      const liveHasCommit = live.commitBlock > 0n;

      // Check if there's already a commit on-chain (using FRESH data)
      if (liveHasCommit) {
        const commitAge = Number(live.currentBlock - live.commitBlock);
        const isExpired = commitAge > REVEAL_WINDOW;

        if (isExpired) {
          // Expired — commitSettle will clear it inline and accept our new commit
          clearSecret();
          setSettleStep('Clearing expired commit...');
        } else {
          // Not expired — try to resume with saved secret
          const savedSecret = loadSecret();
          if (savedSecret) {
            secret = savedSecret;
            needsCommit = false;
            setSettleStep('Found saved commitment, resuming reveal...');
          } else {
            // Someone else committed — wait for it to expire
            const blocksUntilExpiry = REVEAL_WINDOW - commitAge;
            setSettleStep(`Waiting for existing commit to expire (~${blocksUntilExpiry} blocks)...`);
            onToast(`Another commit active — auto-waiting for expiry`, 'success');

            let expired = false;
            for (let attempt = 0; attempt < 180; attempt++) {
              await new Promise((r) => setTimeout(r, 10_000));
              try {
                const p = await fetchLiveState(contract);

                if (p.settled) {
                  onToast('Someone else settled this cycle!', 'success');
                  setSettling(false);
                  setTimeout(onRefresh, 2000);
                  return;
                }

                if (p.commitBlock === 0n) {
                  expired = true;
                  break;
                }

                const age = Number(p.currentBlock - p.commitBlock);
                if (age > REVEAL_WINDOW) {
                  expired = true;
                  break;
                }

                const left = REVEAL_WINDOW - age;
                setSettleStep(`Waiting for commit to expire (~${left} blocks)...`);
              } catch {
                // State fetch failed, keep polling
              }
            }

            if (!expired) {
              throw new Error('Timed out waiting for existing commit to expire');
            }

            clearSecret();
            setSettleStep('Expired! Submitting our commit...');
          }
        }
      }

      if (needsCommit) {
        // Generate secret and commit
        setSettleStep('Generating commitment...');
        const secretBytes = new Uint8Array(32);
        crypto.getRandomValues(secretBytes);
        secret = BigInt('0x' + Array.from(secretBytes).map(
          (b) => b.toString(16).padStart(2, '0')
        ).join(''));

        // Save secret to localStorage BEFORE broadcasting
        saveSecret(secret);

        // Compute sha256(secret) for the commitment
        const hashBuffer = await crypto.subtle.digest('SHA-256', secretBytes);
        const hashArray = new Uint8Array(hashBuffer);
        const commitHash = BigInt('0x' + Array.from(hashArray).map(
          (b) => b.toString(16).padStart(2, '0')
        ).join(''));

        setSettleStep('Sending commitment...');
        try {
          const commitSim = await contract.commitSettle(commitHash);
          await commitSim.sendTransaction({
            signer: null,
            mldsaSigner: null,
            refundTo: walletAddress,
            maximumAllowedSatToSpend: 100_000n,
            feeRate: 10,
            network,
          });
        } catch (commitErr: unknown) {
          const errMsg = commitErr instanceof Error ? commitErr.message : String(commitErr);
          if (errMsg.includes('Already committed')) {
            onToast('Another user just committed. Try again after it expires.', 'success');
            clearSecret();
            setSettling(false);
            return;
          }
          throw commitErr;
        }
        setSettleStep('Commitment sent! Waiting for confirmation...');
      }

      // Phase 2: Wait for commit to confirm + next block
      // Testnet blocks can take 3-10 min, so allow up to 25 min
      setSettleStep('Waiting for commit confirmation...');
      let commitConfirmed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        try {
          const p = await fetchLiveState(contract);
          if (p.commitBlock > 0n && p.currentBlock > p.commitBlock) {
            commitConfirmed = true;
            setSettleStep(`Commit confirmed at block ${p.commitBlock}!`);
            break;
          }
          if (p.commitBlock > 0n) {
            setSettleStep(`Commit at block ${p.commitBlock}, waiting for next block...`);
          } else {
            setSettleStep(`Waiting for commit tx to be mined (${Math.floor((attempt * 10) / 60)}m ${(attempt * 10) % 60}s)...`);
          }
        } catch {
          // State fetch failed, keep polling
        }
        await new Promise((r) => setTimeout(r, 10_000));
      }

      if (!commitConfirmed) {
        throw new Error('Commit timed out after 25 min — the tx may not have been mined. Click settle again to retry.');
      }

      // Phase 3: Find winning purchase index
      setSettleStep(`Finding winner among ${purchaseCount} entries...`);
      let winnerSim: RevealSettle | null = null;

      // Fresh contract instance for reveal simulation
      const contract2 = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, address
      );

      for (let i = 0; i < purchaseCount; i++) {
        setSettleStep(`Checking entry ${i + 1}/${purchaseCount}...`);
        try {
          const sim = await contract2.revealSettle(secret, BigInt(i));
          // If it didn't throw, this is the winning index
          winnerSim = sim;
          setSettleStep(`Winner found at entry ${i + 1}!`);
          break;
        } catch {
          // Wrong index — the contract reverts with "Wrong index", try next
        }
      }

      if (!winnerSim) {
        // All indices failed — likely someone else's commit is on-chain, not ours.
        // Clear our stale secret and wait for their commit to expire, then retry.
        clearSecret();
        setSettleStep('Another settler committed first — waiting for their commit to expire...');
        onToast('Another settler committed first. Auto-waiting to retry...', 'success');

        let canRetry = false;
        for (let wait = 0; wait < 180; wait++) {
          await new Promise((r) => setTimeout(r, 10_000));
          try {
            const p = await fetchLiveState(contract);
            if (p.settled) {
              onToast('Someone else settled this cycle!', 'success');
              setSettling(false);
              setTimeout(onRefresh, 2000);
              return;
            }
            if (p.commitBlock === 0n) {
              canRetry = true;
              break;
            }
            const age = Number(p.currentBlock - p.commitBlock);
            if (age > REVEAL_WINDOW) {
              canRetry = true;
              break;
            }
            setSettleStep(`Waiting for other commit to expire (~${REVEAL_WINDOW - age} blocks)...`);
          } catch {
            // State fetch failed, keep polling
          }
        }

        if (!canRetry) {
          throw new Error('Timed out waiting for other commit to expire. Try again later.');
        }

        // Retry — generate new secret and start fresh commit
        setSettleStep('Retrying with fresh commit...');
        const retryBytes = new Uint8Array(32);
        crypto.getRandomValues(retryBytes);
        secret = BigInt('0x' + Array.from(retryBytes).map(
          (b) => b.toString(16).padStart(2, '0')
        ).join(''));
        saveSecret(secret);

        const retryHashBuf = await crypto.subtle.digest('SHA-256', retryBytes);
        const retryHashArr = new Uint8Array(retryHashBuf);
        const retryCommitHash = BigInt('0x' + Array.from(retryHashArr).map(
          (b) => b.toString(16).padStart(2, '0')
        ).join(''));

        setSettleStep('Sending fresh commitment...');
        const retrySim = await contract.commitSettle(retryCommitHash);
        await retrySim.sendTransaction({
          signer: null,
          mldsaSigner: null,
          refundTo: walletAddress,
          maximumAllowedSatToSpend: 100_000n,
          feeRate: 10,
          network,
        });

        // Wait for new commit confirmation
        setSettleStep('Waiting for fresh commit confirmation...');
        let retryConfirmed = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          try {
            const p = await fetchLiveState(contract);
            if (p.commitBlock > 0n && p.currentBlock > p.commitBlock) {
              retryConfirmed = true;
              break;
            }
            if (p.commitBlock > 0n) {
              setSettleStep(`Commit at block ${p.commitBlock}, waiting for next block...`);
            } else {
              setSettleStep(`Waiting for commit tx to be mined (${Math.floor((attempt * 10) / 60)}m ${(attempt * 10) % 60}s)...`);
            }
          } catch { /* keep polling */ }
          await new Promise((r) => setTimeout(r, 10_000));
        }

        if (!retryConfirmed) {
          throw new Error('Retry commit timed out. Click settle again.');
        }

        // Find winner with new secret
        setSettleStep(`Finding winner among ${purchaseCount} entries...`);
        const contract3 = getContract<IKingDick>(
          CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, address
        );
        for (let i = 0; i < purchaseCount; i++) {
          setSettleStep(`Checking entry ${i + 1}/${purchaseCount}...`);
          try {
            const sim = await contract3.revealSettle(secret, BigInt(i));
            winnerSim = sim;
            setSettleStep(`Winner found at entry ${i + 1}!`);
            break;
          } catch { /* wrong index */ }
        }

        if (!winnerSim) {
          throw new Error('Could not find winning entry after retry. Try settling again.');
        }
      }

      setSettleStep('Revealing winner — confirm in wallet...');
      const txReceipt = await winnerSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network,
      });

      clearSecret();
      const txId = txReceipt?.transactionId ?? '';
      onToast(`Winner revealed! TX: ${shortAddr(txId)}`, 'success');
      setTimeout(onRefresh, 5000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Clean up error messages from opnet wrapping
      const cleanMsg = msg.replace('Error in calling function: ', '');
      onToast('Settle failed: ' + cleanMsg, 'error');
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
