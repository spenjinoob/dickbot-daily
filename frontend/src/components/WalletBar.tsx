import { shortAddr } from '../utils/format';

interface WalletBarProps {
  connected: boolean;
  walletAddress: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function WalletBar({ connected, walletAddress, onConnect, onDisconnect }: WalletBarProps) {
  return (
    <div className="wallet-bar">
      <div className="wallet-status">
        <div className={`wallet-dot${connected ? ' connected' : ''}`} />
        <span>{connected ? 'Connected' : 'Not connected'}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {connected && walletAddress && (
          <span className="wallet-addr">{shortAddr(walletAddress)}</span>
        )}
        <button
          className="btn btn-secondary"
          onClick={connected ? onDisconnect : onConnect}
        >
          {connected ? 'Disconnect' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
