import { useState, useMemo } from 'react';
import { getContract, JSONRpcProvider, OP_20_ABI } from 'opnet';
import type { IOP20Contract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { CONTRACT_ADDRESS, MOTO_ADDRESS, TICKET_PRICE_MOTO, RPC_URL, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import { shortAddr } from '../utils/format';
import type { IKingDick, GameState, MyTickets } from '../types';
import type { ToastType } from './Toast';

interface BuyTicketsProps {
  gameState: GameState;
  myTickets: MyTickets;
  wallet: unknown;
  walletAddress: string | null;
  connected: boolean;
  onToast: (msg: string, type: ToastType) => void;
  onRefresh: () => void;
}

export function BuyTickets({
  gameState,
  myTickets,
  wallet,
  walletAddress,
  connected,
  onToast,
  onRefresh,
}: BuyTicketsProps) {
  const [count, setCount] = useState(1);
  const [buying, setBuying] = useState(false);
  const [buyStep, setBuyStep] = useState('');

  const cost = count * TICKET_PRICE_MOTO;

  const odds = useMemo(() => {
    const total = gameState.totalTickets;
    const combined = myTickets.ticketsThisCycle + count;
    if (total <= 0) return '—';
    const pct = (combined / (total + count)) * 100;
    return pct < 1 ? pct.toFixed(2) + '%' : pct.toFixed(1) + '%';
  }, [gameState.totalTickets, myTickets.ticketsThisCycle, count]);

  async function handleBuy() {
    if (!wallet || !walletAddress) {
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
      const provider = new JSONRpcProvider(RPC_URL, NETWORK);
      const totalCost = BigInt(count) * BigInt(5000000000);

      // 1. Approve MOTO spend
      const sender = Address.fromString(walletAddress);
      const motoContract = getContract<IOP20Contract>(
        MOTO_ADDRESS, OP_20_ABI, provider, NETWORK, sender
      );
      const spender = Address.fromString(CONTRACT_ADDRESS);
      const approveSim = await motoContract.increaseAllowance(spender, totalCost);
      if ('error' in approveSim) throw new Error(String(approveSim.error));

      await (wallet as any).sendTransaction({
        ...approveSim,
        signer: null,
        mldsaSigner: null,
      });

      // 2. Buy tickets
      setBuyStep('Buying...');
      const contract = getContract<IKingDick>(
        CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK, sender
      );
      const buySim = await contract.buyTickets(BigInt(count));
      if ('error' in buySim) throw new Error(String(buySim.error));

      const tx = await (wallet as any).sendTransaction({
        ...buySim,
        signer: null,
        mldsaSigner: null,
      });

      onToast(`🎟 Tickets purchased! TX: ${shortAddr(tx.hash)}`, 'success');
      setTimeout(onRefresh, 3000);
    } catch (e: any) {
      onToast('Transaction failed: ' + (e.message || e), 'error');
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
          <div className="ticket-number">{myTickets.ticketsThisCycle}</div>
          <div className="ticket-sub">my tickets this cycle</div>
        </div>
        <div className="ticket-display" style={{ flex: 1, minWidth: 120 }}>
          <div className="ticket-number" style={{ color: 'var(--purple)' }}>
            {myTickets.rolloverTickets}
          </div>
          <div className="ticket-sub">rollover tickets</div>
        </div>
        <div className="ticket-display" style={{ flex: 1, minWidth: 120 }}>
          <div className="ticket-number" style={{ color: 'var(--gold)' }}>{odds}</div>
          <div className="ticket-sub">your odds</div>
        </div>
      </div>
    </div>
  );
}
