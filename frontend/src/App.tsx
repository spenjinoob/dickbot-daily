import './App.css';
import { useWalletConnect } from './hooks/useWallet';
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
  const {
    walletAddress,
    address,
    network,
    openConnectModal,
    disconnect,
  } = useWalletConnect();

  const connected = !!walletAddress;
  const { gameState, myTickets, refresh, getProvider } = useGameState(walletAddress, address);
  const { toast, showToast } = useToast();

  return (
    <>
      <div className="bg-grid" />
      <div className="mascot-watermark" />

      <div className="container">
        <Header />

        <WalletBar
          connected={connected}
          walletAddress={walletAddress}
          onConnect={openConnectModal}
          onDisconnect={disconnect}
        />

        <CycleStatus gameState={gameState} />
        <CurrentKing gameState={gameState} />

        <BuyTickets
          gameState={gameState}
          myTickets={myTickets}
          walletAddress={walletAddress}
          address={address}
          network={network}
          connected={connected}
          onToast={showToast}
          onRefresh={refresh}
          getProvider={getProvider}
        />

        <PrizeSplit gameState={gameState} />

        <SettleClaim
          gameState={gameState}
          walletAddress={walletAddress}
          address={address}
          network={network}
          connected={connected}
          onToast={showToast}
          onRefresh={refresh}
          getProvider={getProvider}
        />

        <HowItWorks />
      </div>

      <Toast toast={toast} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Footer />
      </div>
    </>
  );
}

export default App;
