export function Footer() {
  return (
    <>
      <div style={{
        textAlign: 'center',
        padding: '24px 0 16px',
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <SocialLink href="https://t.me/DickBotDaily" icon={<TelegramIcon />} label="TELEGRAM" />
      </div>
      <div style={{
        textAlign: 'center',
        padding: '8px 0 32px',
        fontSize: 9,
        color: 'var(--dim)',
        fontFamily: "'Press Start 2P', monospace",
        letterSpacing: 2,
      }}>
        POWERED BY OP_NET
      </div>
    </>
  );
}

function SocialLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        background: 'rgba(10,5,20,0.6)',
        border: '1px solid #7a3d8a',
        borderRadius: 3,
        color: '#d966ff',
        fontFamily: "'Press Start 2P', monospace",
        fontSize: 8,
        textDecoration: 'none',
        letterSpacing: 1,
      }}
    >
      {icon}
      {label}
    </a>
  );
}

function TelegramIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.018 9.51c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.51 14.617l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.306.969z" />
    </svg>
  );
}
