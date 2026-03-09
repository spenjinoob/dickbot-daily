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
          ⛓ <span style={{ color: 'var(--text)' }}>100% on-chain and provably fair.</span> Winner
          selection uses commit-reveal: the settler commits a secret hash, then reveals it after
          a block is mined. The winner is derived from sha256(secret + block hash) — neither the
          settler nor the miner can control the outcome. No admin, no oracle, no trust required.
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
