export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return prefix ? `${prefix}_${rnd}` : rnd;
}

/** Sıralı belge numarası: ÖNEK-YYYY-0001 */
export function docNo(prefix: string, seq: number, date = new Date()): string {
  return `${prefix}-${date.getFullYear()}-${String(seq).padStart(4, '0')}`;
}
