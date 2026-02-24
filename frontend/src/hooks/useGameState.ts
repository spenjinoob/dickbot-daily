import { useState, useEffect, useCallback, useRef } from 'react';
import { getContract, JSONRpcProvider } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { CONTRACT_ADDRESS, RPC_URL, NETWORK } from '../config';
import { KingDickAbi } from '../abi/KingDickAbi';
import type { IKingDick, GameState, MyTickets } from '../types';

const ZERO_ADDR = '0x' + '0'.repeat(64);

const DEMO_STATE: GameState = {
  cycleId: 1,
  totalTickets: 50,
  totalPot: 250000000000n,
  snapshotBlock: 842235,
  currentBlock: 842100,
  kingAddress: ZERO_ADDR,
  kingStreak: 0,
  lastWinner: ZERO_ADDR,
  lastPot: 0n,
  settled: false,
};

export function useGameState(walletAddress: string | null) {
  const [gameState, setGameState] = useState<GameState>(DEMO_STATE);
  const [myTickets, setMyTickets] = useState<MyTickets>({ ticketsThisCycle: 0, rolloverTickets: 0 });
  const [loading, setLoading] = useState(false);
  const providerRef = useRef<JSONRpcProvider | null>(null);

  const getProvider = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = new JSONRpcProvider(RPC_URL, NETWORK);
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
      if ('error' in stateResult) {
        console.error('getState error:', stateResult.error);
        return;
      }

      const p = stateResult.properties;
      setGameState({
        cycleId: Number(p.cycleId),
        totalTickets: Number(p.totalTickets),
        totalPot: p.totalPot,
        snapshotBlock: Number(p.snapshotBlock),
        currentBlock: Number(p.currentBlock),
        kingAddress: p.kingAddress?.toString() ?? ZERO_ADDR,
        kingStreak: Number(p.kingStreak),
        lastWinner: p.lastWinner?.toString() ?? ZERO_ADDR,
        lastPot: p.lastPot,
        settled: p.settled,
      });

      if (walletAddress) {
        const ticketResult = await contract.getMyTickets(Address.fromString(walletAddress));
        if (!('error' in ticketResult)) {
          setMyTickets({
            ticketsThisCycle: Number(ticketResult.properties.ticketsThisCycle),
            rolloverTickets: Number(ticketResult.properties.rolloverTickets),
          });
        }
      }
    } catch (e) {
      console.error('refreshState error:', e);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, getProvider]);

  // Poll every 10 seconds when wallet is connected
  useEffect(() => {
    if (!walletAddress) return;

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [walletAddress, refresh]);

  return { gameState, myTickets, loading, refresh };
}
