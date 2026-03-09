export function Header() {
  return (
    <div className="header" style={{ padding: '12px 0', maxWidth: 480, margin: '0 auto' }}>
      <img
        src="./banner.jpg"
        alt="DickBot Daily Lottery — Win Big Every Day!"
        style={{
          width: '100%',
          height: 'auto',
          objectFit: 'contain',
          opacity: 0.8,
        }}
      />
    </div>
  );
}
