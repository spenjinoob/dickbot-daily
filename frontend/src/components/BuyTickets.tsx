import { useState, useMemo } from 'react';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import type { Network } from '@btc-vision/bitcoin';
import { CONTRACT_ADDRESS, MOTO_ADDRESS, TICKET_PRICE_MOTO, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import { shortAddr } from '../utils/format';
import type { IKingDick, GameState, MyTickets } from '../types';
import type { ToastType } from './Toast';

interface BuyTicketsProps {
  gameState: GameState;
  myTickets: MyTickets;
  walletAddress: string | null;
  address: Address | null;
  network: Network | null;
  connected: boolean;
  onToast: (msg: string, type: ToastType) => void;
  onRefresh: () => void;
  getProvider: () => JSONRpcProvider;
}

export function BuyTickets({
  gameState,
  myTickets,
  walletAddress,
  address,
  network,
  connected,
  onToast,
  onRefresh,
  getProvider,
}: BuyTicketsProps) {
  const [count, setCount] = useState(1);
  const [buying, setBuying] = useState(false);
  const [buyStep, setBuyStep] = useState('');

  const cost = count * TICKET_PRICE_MOTO;

  const odds = useMemo(() => {
    const total = Number(gameState.totalTickets);
    const combined = Number(myTickets.ticketsThisCycle) + count;
    if (total <= 0) return '—';
    const pct = (combined / (total + count)) * 100;
    return pct < 1 ? pct.toFixed(2) + '%' : pct.toFixed(1) + '%';
  }, [gameState.totalTickets, myTickets.ticketsThisCycle, count]);

  async function handleBuy() {
    if (!walletAddress || !address || !network) {
      onToast('Connect wallet first', 'error');
      return;
    }
    if (!CONTRACT_ADDRESS) {
      onToast('Contract not deployed yet', 'error');
      return;
    }
    if (count < 1) {
      onToast('Enter at least 1 ticket', 'error');
      return;
    }

    setBuying(true);
    setBuyStep('Approving...');

    try {
      const provider = getProvider();
      const totalCost = BigInt(count) * 50000000000000000000n;

      // 1. Approve MOTO spend
      const motoContract = getContract<IOP20Contract>(
        MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, address
      );
      const spender = await provider.getPublicKeyInfo(CONTRACT_ADDRESS, true);
      const approveSim = await motoContract.increaseAllowance(spender, totalCost);
      if ('error' in approveSim) throw new Error(String(approveSim.error));

      await approveSim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100_000n,
        network,
      });

      // Wait for approval to confirm on-chain (Signet blocks can take 3-10 min)
      setBuyStep('Waiting for approval to confirm...');
      const contract = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, address
      );
      let buySim = null;
      for (let attempt = 0; attempt < 120; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const sim = await contract.buyTickets(BigInt(count));
          if (!('error' in sim)) {
            buySim = sim;
            break;
          }
        } catch (_) {
          // Allowance not yet confirmed — keep polling
        }
        const mins = Math.floor(((attempt + 1) * 5) / 60);
        const secs = ((attempt + 1) * 5) % 60;
        setBuyStep(`Waiting for approval (${mins}:${String(secs).padStart(2, '0')})...`);
      }

      if (!buySim) {
        throw new Error('Approval not confirmed after 10 min — try buying again (approval may still be pending)');
      }

      // 2. Buy tickets — approval confirmed
      setBuyStep('Buying tickets...');
      const txReceipt2 = await buySim.sendTransaction({
        signer: null,
        mldsaSigner: null,
        refundTo: walletAddress,
        maximumAllowedSatToSpend: 100_000n,
        network,
      });
      const txId = txReceipt2?.transactionId ?? '';
      onToast(`Tickets purchased! TX: ${shortAddr(txId)}`, 'success');
      setTimeout(onRefresh, 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      onToast('Transaction failed: ' + msg, 'error');
    } finally {
      setBuying(false);
      setBuyStep('');
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">Buy Tickets</div>
      <div className="input-row">
        <div className="input-group">
          <label className="input-label" htmlFor="ticketCount">
            Number of tickets
          </label>
          <input
            className="input-field"
            id="ticketCount"
            type="number"
            min="1"
            value={count}
            onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <div className="cost-preview">
            Cost: <span>{cost.toLocaleString()} MOTO</span>
          </div>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleBuy}
          disabled={!connected || buying}
        >
          {buying ? (
            <>
              <span className="spinner" />
              {buyStep}
            </>
          ) : (
            'Buy Tickets'
          )}
        </button>
      </div>

      <hr className="divider" />

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="ticket-display" style={{ flex: 1, minWidth: 120 }}>
          <div className="ticket-number">{Number(myTickets.ticketsThisCycle)}</div>
          <div className="ticket-sub">my tickets this cycle</div>
        </div>
        <div className="ticket-display" style={{ flex: 1, minWidth: 120 }}>
          <div className="ticket-number" style={{ color: 'var(--gold)' }}>{odds}</div>
          <div className="ticket-sub">your odds</div>
        </div>
      </div>
    </div>
  );
}
