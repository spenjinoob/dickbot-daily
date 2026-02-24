export function formatMoto(raw: bigint | number | undefined | null): string {
  if (raw === undefined || raw === null) return '0';
  const n = typeof raw === 'bigint' ? raw : BigInt(raw);
  return (Number(n) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function shortAddr(addr: string | undefined | null): string {
  if (!addr) return '';
  const s = addr.toString();
  return s.slice(0, 8) + '...' + s.slice(-6);
}
