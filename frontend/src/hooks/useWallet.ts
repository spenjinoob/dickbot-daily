import { useState, useEffect, useCallback } from 'react';

interface OpnetWallet {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  sendTransaction(tx: unknown): Promise<{ hash: string }>;
}

declare global {
  interface Window {
    opnet?: OpnetWallet;
  }
}

export function useWallet() {
  const [wallet, setWallet] = useState<OpnetWallet | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const connect = useCallback(async () => {
    if (!window.opnet) {
      throw new Error('OP_WALLET not detected. Please install it.');
    }
    const accounts = await window.opnet.requestAccounts();
    if (!accounts || accounts.length === 0) return;
    setWalletAddress(accounts[0]);
    setWallet(window.opnet);
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setWalletAddress(null);
  }, []);

  // Auto-connect if wallet already connected
  useEffect(() => {
    if (window.opnet) {
      window.opnet.getAccounts().then((accounts) => {
        if (accounts && accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setWallet(window.opnet!);
        }
      }).catch(() => {});
    }
  }, []);

  return { wallet, walletAddress, connected: !!walletAddress, connect, disconnect };
}
