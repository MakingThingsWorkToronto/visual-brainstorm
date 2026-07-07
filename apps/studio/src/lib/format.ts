/** Compact, locale-independent count: 0 → '0', 999 → '999', 12345 → '12.3k', 3_400_000 → '3.4M'. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const suffix = n < 1e6 ? 'k' : 'M';
  const scaled = n / (suffix === 'k' ? 1e3 : 1e6);
  return `${scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
}
