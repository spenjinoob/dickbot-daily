import './App.css';
import { useWallet } from './hooks/useWallet';
import { useGameState } from './hooks/useGameState';
import { useToast, Toast } from './components/Toast';
import { Header } from './components/Header';
import { WalletBar } from './components/WalletBar';
import { CycleStatus } from './components/CycleStatus';
import { CurrentKing } from './components/CurrentKing';
import { BuyTickets } from './components/BuyTickets';
import { PrizeSplit } from './components/PrizeSplit';
import { SettleClaim } from './components/SettleClaim';
import { HowItWorks } from './components/HowItWorks';
import { Footer } from './components/Footer';

function App() {
  const { wallet, walletAddress, connected, connect, disconnect } = useWallet();
  const { gameState, myTickets, refresh } = useGameState(walletAddress);
  const { toast, showToast } = useToast();

  async function handleConnect() {
    try {
      await connect();
    } catch (e: any) {
      showToast(e.message || 'Failed to connect', 'error');
    }
  }

  return (
    <>
      <div className="bg-grid" />
      <div className="mascot-watermark" />

      <div className="container">
        <Header />

        <WalletBar
          connected={connected}
          walletAddress={walletAddress}
          onConnect={handleConnect}
          onDisconnect={disconnect}
        />

        <CycleStatus gameState={gameState} />
        <CurrentKing gameState={gameState} />

        <BuyTickets
          gameState={gameState}
          myTickets={myTickets}
          wallet={wallet}
          walletAddress={walletAddress}
          connected={connected}
          onToast={showToast}
          onRefresh={refresh}
        />

        <PrizeSplit gameState={gameState} />

        <SettleClaim
          gameState={gameState}
          wallet={wallet}
          walletAddress={walletAddress}
          connected={connected}
          onToast={showToast}
          onRefresh={refresh}
        />

        <HowItWorks />
      </div>

      <Toast toast={toast} />
      <Footer />
    </>
  );
}

export default App;
