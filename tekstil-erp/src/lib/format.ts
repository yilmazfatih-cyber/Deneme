import type { Currency } from '../db/schema';

const DAY = 24 * 60 * 60 * 1000;

export function fmtMoney(value: number, currency: Currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(
    value || 0,
  );
}

export function fmtNum(value: number, digits = 0): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(value || 0);
}

export function fmtDate(ts?: number): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(ts);
}

export function fmtDateTime(ts?: number): string {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

export function fmtPct(v: number, digits = 0): string {
  return `%${fmtNum(v * 100, digits)}`;
}

export function daysBetween(a: number, b: number): number {
  return Math.round((b - a) / DAY);
}

export function toInputDate(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromInputDate(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).getTime();
}

export function upperTr(s: string): string {
  return s.toLocaleUpperCase('tr-TR');
}

/** Türkçe para biçimini sayıya çevirir: "1.234,56" → 1234.56, "1,234.56" → 1234.56 */
export function parseTrNumber(raw: string): number | undefined {
  const s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return undefined;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma) normalized = s.replace(/,/g, '');
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}
