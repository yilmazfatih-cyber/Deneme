import { describe, expect, it } from 'vitest';
import {
  categorize,
  detectAnomalies,
  forecastMonths,
  holtForecast,
  isBalanced,
  monthlySeries,
  postInvoiceJournal,
  postPaymentJournal,
  receivables,
} from '../src/ai/finance';
import type { Invoice, Payment } from '../src/db/schema';

const DAY = 86_400_000;
function mkInv(p: Partial<Invoice> & { total: number; subtotal: number; vatTotal: number }): Invoice {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    invoiceNo: p.invoiceNo ?? 'X1',
    type: p.type ?? 'alis',
    counterpartyName: p.counterpartyName ?? 'Tedarikçi',
    date: p.date ?? Date.now() - 5 * DAY,
    dueDate: p.dueDate,
    lines: p.lines ?? [{ description: 'Kalem', quantity: 1, unitPrice: p.subtotal, vatRate: Math.round((p.vatTotal / p.subtotal) * 100) }],
    subtotal: p.subtotal,
    vatTotal: p.vatTotal,
    total: p.total,
    currency: p.currency ?? 'TRY',
    status: p.status ?? 'kesildi',
    category: p.category ?? 'enerji',
    source: 'manuel',
    createdAt: Date.now(),
  };
}

describe('yevmiye', () => {
  it('satış faturası dengeli kayıt üretir', () => {
    const e = postInvoiceJournal(mkInv({ type: 'satis', subtotal: 1000, vatTotal: 100, total: 1100, category: 'satis-geliri' }));
    expect(isBalanced(e)).toBe(true);
    expect(e.lines.find((l) => l.account.startsWith('120'))?.debit).toBe(1100);
    expect(e.lines.find((l) => l.account.startsWith('391'))?.credit).toBe(100);
  });
  it('alış faturası ve ödeme dengeli', () => {
    const e = postInvoiceJournal(mkInv({ type: 'alis', subtotal: 500, vatTotal: 100, total: 600 }));
    expect(isBalanced(e)).toBe(true);
    const p: Payment = { id: 'p', direction: 'odeme', amount: 600, date: Date.now(), method: 'havale', invoiceId: 'x' };
    expect(isBalanced(postPaymentJournal(p))).toBe(true);
  });
});

describe('categorize', () => {
  it('elektrik faturasını enerji olarak sınıflar', () => {
    const g = categorize('Bursa Elektrik Dağıtım elektrik tüketimi Ekim');
    expect(g.category).toBe('enerji');
    expect(g.confidence).toBeGreaterThan(0.5);
  });
  it('bilinmeyen metinde diğer döner', () => {
    expect(categorize('xyz qqq').category).toBe('diger');
  });
  it('satış faturasını satış geliri sayar', () => {
    expect(categorize('herhangi', 'satis').category).toBe('satis-geliri');
  });
});

describe('tahmin', () => {
  it('holt istenen uzunlukta ve negatif olmayan değer döner', () => {
    const f = holtForecast([100, 120, 90, 130, 140, 150], 3);
    expect(f).toHaveLength(3);
    f.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
  it('forecastMonths etiket ve 3 ay üretir', () => {
    const now = Date.now();
    const invs = [0, 1, 2, 3, 4, 5].map((i) =>
      mkInv({ type: 'satis', subtotal: 1000 + i * 100, vatTotal: 100, total: 1100 + i * 100, date: now - i * 30 * DAY, category: 'satis-geliri' }),
    );
    const hist = monthlySeries(invs, [], 6, now);
    expect(hist).toHaveLength(6);
    const f = forecastMonths(hist, 3);
    expect(f).toHaveLength(3);
    expect(f[0].label).toMatch(/\d{2}$/);
    expect(f.every((p) => p.income >= 0 && p.expense >= 0)).toBe(true);
  });
});

describe('anomali', () => {
  it('mükerrer faturayı ve sapmayı yakalar', () => {
    const base = [120_000, 118_000, 121_000, 119_500].map((t, i) =>
      mkInv({ id: `a${i}`, invoiceNo: `E${i}`, counterpartyName: 'EDAŞ', subtotal: t / 1.2, vatTotal: t - t / 1.2, total: t }),
    );
    const spike = mkInv({ id: 'spike', invoiceNo: 'E9', counterpartyName: 'EDAŞ', subtotal: 500_000 / 1.2, vatTotal: 500_000 - 500_000 / 1.2, total: 500_000 });
    const dup = { ...base[0], id: 'dup' };
    const res = detectAnomalies([...base, spike, dup]);
    expect(res.some((a) => a.title === 'Mükerrer fatura' && a.invoiceId === 'dup')).toBe(true);
    expect(res.some((a) => a.title.includes('yüksek') && a.invoiceId === 'spike')).toBe(true);
  });
  it('KDV uyuşmazlığını bulur', () => {
    const bad = mkInv({ subtotal: 1000, vatTotal: 500, total: 1500, lines: [{ description: 'x', quantity: 1, unitPrice: 1000, vatRate: 20 }] });
    expect(detectAnomalies([bad]).some((a) => a.title === 'KDV uyuşmazlığı')).toBe(true);
  });
});

describe('alacaklar', () => {
  it('kısmi ödemeyi düşer ve gecikmeyi hesaplar', () => {
    const now = Date.now();
    const inv = mkInv({ id: 'r1', type: 'satis', subtotal: 1000, vatTotal: 100, total: 1100, dueDate: now - 40 * DAY, category: 'satis-geliri' });
    const pay: Payment = { id: 'p1', invoiceId: 'r1', direction: 'tahsilat', amount: 300, date: now, method: 'havale' };
    const [r] = receivables([inv], [pay], now);
    expect(r.outstanding).toBe(800);
    expect(r.daysOverdue).toBe(40);
    expect(r.risk).toBe('yuksek');
  });
});
