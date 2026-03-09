import { useState, useEffect, useCallback, useRef } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import type { Address } from '@btc-vision/transaction';
import { CONTRACT_ADDRESS, RPC_URL, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import type { IKingDick, GameState, MyTickets } from '../types';

const ZERO_ADDR = '0x' + '0'.repeat(64);

const DEMO_STATE: GameState = {
  cycleId: 0n,
  totalTickets: 0n,
  totalPot: 0n,
  snapshotBlock: 0n,
  currentBlock: 0n,
  kingAddress: ZERO_ADDR,
  kingStreak: 0n,
  lastWinner: ZERO_ADDR,
  lastPot: 0n,
  settled: false,
  purchaseCount: 0n,
  commitBlock: 0n,
};

export function useGameState(walletAddress: string | null, address: Address | null) {
  const [gameState, setGameState] = useState<GameState>(DEMO_STATE);
  const [myTickets, setMyTickets] = useState<MyTickets>({ ticketsThisCycle: 0n });
  const [loading, setLoading] = useState(false);
  const providerRef = useRef<JSONRpcProvider | null>(null);

  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    }
    return providerRef.current;
  }, []);

  const refresh = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;

    setLoading(true);
    try {
      const provider = getProvider();
      const contract = getContract<IKingDick>(CONTRACT_ADDRESS, KingDickAbi, provider, NETWORK);

      const stateResult = await contract.getState();
      const p = stateResult.properties;
      setGameState({
        cycleId: p.cycleId,
        totalTickets: p.totalTickets,
        totalPot: p.totalPot,
        snapshotBlock: p.snapshotBlock,
        currentBlock: p.currentBlock,
        kingAddress: p.kingAddress?.toString() ?? ZERO_ADDR,
        kingStreak: p.kingStreak,
        lastWinner: p.lastWinner?.toString() ?? ZERO_ADDR,
        lastPot: p.lastPot,
        settled: p.settled,
        purchaseCount: p.purchaseCount,
        commitBlock: p.commitBlock,
      });

      if (address) {
        try {
          const ticketResult = await contract.getMyTickets(address);
          setMyTickets({
            ticketsThisCycle: ticketResult.properties.ticketsThisCycle,
          });
        } catch {
          // getMyTickets may fail if user has no tickets in this cycle
        }
      }
    } catch (e) {
      console.error('refreshState error:', e);
    } finally {
      setLoading(false);
    }
  }, [address, getProvider]);

  // Poll every 10 seconds when wallet is connected
  useEffect(() => {
    if (!walletAddress) return;

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [walletAddress, refresh]);

  return { gameState, myTickets, loading, refresh, getProvider };
}
