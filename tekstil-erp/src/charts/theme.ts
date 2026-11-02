/** Grafik renkleri — sabit sıra, döndürülmez (series-1..8 CSS değişkenleri) */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
export const GRID = 'var(--grid)';
export const TEXT2 = 'var(--text-2)';

export const axisProps = {
  tick: { fill: TEXT2, fontSize: 12 },
  axisLine: false,
  tickLine: false,
} as const;

export const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    fontSize: 13,
  },
  labelStyle: { color: 'var(--text-2)' },
  cursor: { stroke: 'var(--border)' },
} as const;
