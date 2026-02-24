export function HowItWorks() {
  return (
    <div className="panel">
      <div className="panel-title">How It Works</div>
      <div style={{ fontSize: 11, lineHeight: 1.9, color: 'var(--dim)' }}>
        <div style={{ marginBottom: 12 }}>
          🎟 <span style={{ color: 'var(--text)' }}>Buy tickets with MOTO.</span> Each ticket
          costs 50 MOTO. The more tickets you hold, the better your odds. Simple.
        </div>
        <div style={{ marginBottom: 12 }}>
          ⛓ <span style={{ color: 'var(--text)' }}>100% on-chain and provably fair.</span> The
          winner is determined by the hash of a specific Bitcoin block — a number nobody can
          predict or manipulate. No admin, no randomness oracle, no trust required.
        </div>
        <div style={{ marginBottom: 12 }}>
          ⚡ <span style={{ color: 'var(--text)' }}>What is a Settler?</span> Anyone can settle
          a completed cycle and earn 0.2% of the pot for doing so. This keeps the lottery
          self-running — no team required to trigger payouts.
        </div>
        <div>
          🔒 <span style={{ color: 'var(--text)' }}>10% Feeds the MOTO Staking Vault.</span>{' '}
          Every cycle part of the pot is permanently staked. Staking rewards will be used as
          prizes for the most active players — highest number of entries, most wins and longest
          streaks.
        </div>
      </div>
    </div>
  );
}
