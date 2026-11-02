/**
 * AI finans çekirdeği — tamamı cihazda, model indirmeden çalışır:
 *  - Otomatik yevmiye (Tek Düzen Hesap Planı)
 *  - Gider sınıflandırma (anahtar kelime tabanlı naive-Bayes benzeri puanlama)
 *  - Nakit akışı tahmini (Holt çift üstel düzeltme)
 *  - Anomali tespiti (sağlam z-skoru, medyan/MAD)
 *  - Vade/tahsilat risk puanı
 * Bir LLM bağlıysa (Ayarlar → Ollama / OpenAI uyumlu) doğal dil açıklamaları ayrıca üretilir (src/ai/llm.ts).
 */
import type { FinanceCategory, Invoice, InvoiceType, JournalEntry, JournalLine, Payment } from '../db/schema';
import { FINANCE_CATEGORIES } from '../db/schema';

// ---------------- Hesap planı ----------------
export const ACCOUNTS = {
  kasa: '100 Kasa',
  banka: '102 Bankalar',
  alicilar: '120 Alıcılar',
  indirilecekKdv: '191 İndirilecek KDV',
  ticariMallar: '153 Ticari Mallar',
  ilkMaddeMalzeme: '150 İlk Madde ve Malzeme',
  saticilar: '320 Satıcılar',
  hesaplananKdv: '391 Hesaplanan KDV',
  yurticiSatislar: '600 Yurtiçi Satışlar',
  yurtdisiSatislar: '601 Yurtdışı Satışlar',
  uretimGideri: '730 Genel Üretim Giderleri',
  genelYonetim: '770 Genel Yönetim Giderleri',
  pazarlama: '760 Pazarlama Satış ve Dağıtım Giderleri',
  finansman: '780 Finansman Giderleri',
} as const;

const EXPENSE_ACCOUNT: Record<FinanceCategory, string> = {
  hammadde: ACCOUNTS.ilkMaddeMalzeme,
  'iplik-kumas': ACCOUNTS.ilkMaddeMalzeme,
  'boya-kimyasal': ACCOUNTS.ilkMaddeMalzeme,
  enerji: ACCOUNTS.uretimGideri,
  personel: ACCOUNTS.uretimGideri,
  kira: ACCOUNTS.genelYonetim,
  nakliye: ACCOUNTS.pazarlama,
  'makine-bakim': ACCOUNTS.uretimGideri,
  'vergi-sgk': ACCOUNTS.genelYonetim,
  'banka-finansman': ACCOUNTS.finansman,
  pazarlama: ACCOUNTS.pazarlama,
  'ofis-genel': ACCOUNTS.genelYonetim,
  'satis-geliri': ACCOUNTS.yurticiSatislar,
  diger: ACCOUNTS.genelYonetim,
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Faturadan otomatik yevmiye kaydı üretir (borç = alacak garanti) */
export function postInvoiceJournal(inv: Invoice): JournalEntry {
  const lines: JournalLine[] = [];
  if (inv.type === 'satis') {
    const revenue = inv.currency === 'TRY' ? ACCOUNTS.yurticiSatislar : ACCOUNTS.yurtdisiSatislar;
    lines.push({ account: ACCOUNTS.alicilar, debit: r2(inv.total), credit: 0 });
    lines.push({ account: revenue, debit: 0, credit: r2(inv.subtotal) });
    if (inv.vatTotal > 0) lines.push({ account: ACCOUNTS.hesaplananKdv, debit: 0, credit: r2(inv.vatTotal) });
  } else {
    lines.push({ account: EXPENSE_ACCOUNT[inv.category] ?? ACCOUNTS.genelYonetim, debit: r2(inv.subtotal), credit: 0 });
    if (inv.vatTotal > 0) lines.push({ account: ACCOUNTS.indirilecekKdv, debit: r2(inv.vatTotal), credit: 0 });
    lines.push({ account: ACCOUNTS.saticilar, debit: 0, credit: r2(inv.total) });
  }
  return {
    id: `j_${inv.id}`,
    date: inv.date,
    description: `${inv.type === 'satis' ? 'Satış' : 'Alış'} faturası ${inv.invoiceNo} — ${inv.counterpartyName}`,
    lines,
    refType: 'fatura',
    refId: inv.id,
    auto: true,
    createdAt: Date.now(),
  };
}

export function postPaymentJournal(p: Payment): JournalEntry {
  const cash = p.method === 'nakit' ? ACCOUNTS.kasa : ACCOUNTS.banka;
  const lines: JournalLine[] =
    p.direction === 'tahsilat'
      ? [
          { account: cash, debit: r2(p.amount), credit: 0 },
          { account: ACCOUNTS.alicilar, debit: 0, credit: r2(p.amount) },
        ]
      : [
          { account: p.invoiceId ? ACCOUNTS.saticilar : ACCOUNTS.genelYonetim, debit: r2(p.amount), credit: 0 },
          { account: cash, debit: 0, credit: r2(p.amount) },
        ];
  return {
    id: `j_${p.id}`,
    date: p.date,
    description: `${p.direction === 'tahsilat' ? 'Tahsilat' : 'Ödeme'} — ${p.counterparty ?? ''} ${p.note ?? ''}`.trim(),
    lines,
    refType: 'odeme',
    refId: p.id,
    auto: true,
    createdAt: Date.now(),
  };
}

export function isBalanced(e: JournalEntry): boolean {
  const d = e.lines.reduce((s, l) => s + l.debit, 0);
  const c = e.lines.reduce((s, l) => s + l.credit, 0);
  return Math.abs(d - c) < 0.01;
}

// ---------------- Sınıflandırma ----------------
const KEYWORDS: Record<FinanceCategory, string[]> = {
  hammadde: ['hammadde', 'fermuar', 'düğme', 'dugme', 'etiket', 'tela', 'lastik', 'kopça', 'çıtçıt', 'aksesuar', 'ykk'],
  'iplik-kumas': ['iplik', 'kumaş', 'kumas', 'pamuk', 'polyester', 'viskon', 'denim', 'süprem', 'interlok', 'gabardin', 'ne 30', 'denye', 'elyaf', 'yarn', 'fabric'],
  'boya-kimyasal': ['boya', 'kimyasal', 'reaktif', 'dispers', 'pigment', 'apre', 'yumuşatıcı', 'enzim', 'kostik', 'hidrojen', 'tuz', 'dyestar', 'dye', 'chemical'],
  enerji: ['elektrik', 'doğalgaz', 'dogalgaz', 'su faturası', 'enerji', 'kwh', 'm3', 'edaş', 'edas', 'dağıtım', 'buhar', 'kömür'],
  personel: ['maaş', 'maas', 'bordro', 'personel', 'ücret', 'ikramiye', 'mesai', 'kıdem', 'ihbar', 'yemek kartı'],
  kira: ['kira', 'kirası', 'fabrika kirası', 'depo kirası', 'aidat', 'gayrimenkul', 'osb'],
  nakliye: ['nakliye', 'lojistik', 'kargo', 'sevkiyat', 'palet', 'navlun', 'gümrük', 'konteyner', 'aras', 'yurtiçi kargo', 'mng', 'ups', 'dhl', 'tır'],
  'makine-bakim': ['bakım', 'bakim', 'servis', 'yedek parça', 'makine', 'makina', 'iğne', 'igne', 'platin', 'kalibrasyon', 'onarım', 'tamir', 'mayer', 'karl mayer', 'picanol'],
  'vergi-sgk': ['sgk', 'vergi', 'kdv', 'stopaj', 'muhtasar', 'geçici vergi', 'damga', 'harç', 'ceza', 'prim'],
  'banka-finansman': ['faiz', 'komisyon', 'kredi', 'banka masrafı', 'bsmv', 'kkdf', 'leasing', 'faktoring', 'teminat', 'swap'],
  pazarlama: ['fuar', 'reklam', 'katalog', 'numune', 'pazarlama', 'stant', 'premiere vision', 'texworld', 'sponsorluk', 'web sitesi', 'sosyal medya'],
  'ofis-genel': ['kırtasiye', 'ofis', 'telefon', 'internet', 'yazılım', 'lisans', 'temizlik', 'güvenlik', 'danışmanlık', 'muhasebe', 'avukat', 'noter', 'sigorta'],
  'satis-geliri': ['satış', 'satis', 'sipariş', 'ihracat', 'müşteri'],
  diger: [],
};

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

export interface CategoryGuess {
  category: FinanceCategory;
  confidence: number; // 0..1
  matched: string[];
}

export function categorize(text: string, type: InvoiceType = 'alis'): CategoryGuess {
  const t = trLower(text);
  if (type === 'satis') return { category: 'satis-geliri', confidence: 0.95, matched: ['satış faturası'] };
  const scores = new Map<FinanceCategory, { score: number; matched: string[] }>();
  for (const [cat, words] of Object.entries(KEYWORDS) as [FinanceCategory, string[]][]) {
    if (cat === 'satis-geliri') continue;
    let score = 0;
    const matched: string[] = [];
    for (const w of words) {
      if (t.includes(w)) {
        score += 1 + Math.min(w.length, 12) / 12; // uzun eşleşme daha güvenilir
        matched.push(w);
      }
    }
    if (score > 0) scores.set(cat, { score, matched });
  }
  if (scores.size === 0) return { category: 'diger', confidence: 0.3, matched: [] };
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  const [best, second] = ranked;
  const total = ranked.reduce((s, [, v]) => s + v.score, 0);
  const margin = second ? (best[1].score - second[1].score) / best[1].score : 1;
  const confidence = Math.min(0.98, 0.45 + 0.35 * (best[1].score / total) + 0.2 * margin);
  return { category: best[0], confidence: r2(confidence), matched: best[1].matched };
}

export function categoryLabel(c: FinanceCategory): string {
  return FINANCE_CATEGORIES[c];
}

// ---------------- Zaman serileri ----------------
export interface MonthPoint {
  month: string; // "2025-10"
  label: string; // "Eki 25"
  income: number;
  expense: number;
  net: number;
}

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function monthKey(ts: number): string {
  const dt = new Date(ts);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_TR[(m || 1) - 1]} ${String(y).slice(2)}`;
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  return monthKey(dt.getTime());
}

/** Faturaları ve fatura dışı ödemeleri aylık gelir/gider serisine çevirir */
export function monthlySeries(invoices: Invoice[], payments: Payment[], monthsBack = 6, now = Date.now()): MonthPoint[] {
  const end = monthKey(now);
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) keys.push(addMonths(end, -i));
  const map = new Map(keys.map((k) => [k, { income: 0, expense: 0 }]));
  for (const inv of invoices) {
    if (inv.status === 'iptal' || inv.status === 'taslak') continue;
    const b = map.get(monthKey(inv.date));
    if (!b) continue;
    if (inv.type === 'satis') b.income += inv.total;
    else b.expense += inv.total;
  }
  for (const p of payments) {
    if (p.invoiceId) continue; // faturalı ödemeler zaten faturadan sayıldı
    const b = map.get(monthKey(p.date));
    if (!b) continue;
    if (p.direction === 'tahsilat') b.income += p.amount;
    else b.expense += p.amount;
  }
  return keys.map((k) => {
    const v = map.get(k)!;
    return { month: k, label: monthLabel(k), income: r2(v.income), expense: r2(v.expense), net: r2(v.income - v.expense) };
  });
}

/** Holt çift üstel düzeltme ile ileriye dönük tahmin */
export function holtForecast(series: number[], horizon: number, alpha = 0.5, beta = 0.3): number[] {
  const clean = series.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return Array(horizon).fill(0);
  if (clean.length === 1) return Array(horizon).fill(clean[0]);
  let level = clean[0];
  let trend = clean[1] - clean[0];
  for (let i = 1; i < clean.length; i++) {
    const prevLevel = level;
    level = alpha * clean[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  // trendi hafiflet — kısa serilerde patlamayı önler
  const damp = 0.85;
  const out: number[] = [];
  let acc = 0;
  for (let h = 1; h <= horizon; h++) {
    acc += Math.pow(damp, h);
    out.push(r2(Math.max(0, level + trend * acc)));
  }
  return out;
}

export interface ForecastPoint {
  label: string;
  income: number;
  expense: number;
  net: number;
  forecast: true;
}

export function forecastMonths(history: MonthPoint[], horizon = 3): ForecastPoint[] {
  const inc = holtForecast(history.map((h) => h.income), horizon);
  const exp = holtForecast(history.map((h) => h.expense), horizon);
  const last = history[history.length - 1]?.month ?? monthKey(Date.now());
  return inc.map((v, i) => ({
    label: monthLabel(addMonths(last, i + 1)),
    income: v,
    expense: exp[i],
    net: r2(v - exp[i]),
    forecast: true,
  }));
}

// ---------------- Anomali ----------------
export interface Anomaly {
  invoiceId: string;
  title: string;
  detail: string;
  severity: 'warn' | 'bad';
  score: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Aynı karşı taraf / kategori içinde sağlam z-skoru (MAD) ile sapma; ayrıca KDV tutarsızlığı ve mükerrer fatura */
export function detectAnomalies(invoices: Invoice[]): Anomaly[] {
  const out: Anomaly[] = [];
  const active = invoices.filter((i) => i.status !== 'iptal');

  // 1) Mükerrer fatura numarası / aynı tutar aynı gün
  const seen = new Map<string, Invoice>();
  for (const inv of active) {
    const key = `${inv.counterpartyName}|${inv.invoiceNo}`;
    const prev = seen.get(key);
    if (prev && prev.id !== inv.id) {
      out.push({ invoiceId: inv.id, title: 'Mükerrer fatura', detail: `${inv.invoiceNo} numaralı fatura ${inv.counterpartyName} için iki kez kayıtlı.`, severity: 'bad', score: 1 });
    }
    seen.set(key, inv);
  }

  // 2) KDV tutarlılığı
  for (const inv of active) {
    const expectedVat = inv.lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.vatRate) / 100, 0);
    if (inv.lines.length && Math.abs(expectedVat - inv.vatTotal) > Math.max(1, inv.vatTotal * 0.02)) {
      out.push({ invoiceId: inv.id, title: 'KDV uyuşmazlığı', detail: `Satırlardan hesaplanan KDV ${expectedVat.toFixed(2)}, faturadaki ${inv.vatTotal.toFixed(2)}.`, severity: 'warn', score: 0.7 });
    }
  }

  // 3) Grup içi sapma (karşı taraf + kategori)
  const groups = new Map<string, Invoice[]>();
  for (const inv of active) {
    const key = `${inv.type}|${inv.category}|${inv.counterpartyName}`;
    groups.set(key, [...(groups.get(key) ?? []), inv]);
  }
  for (const list of groups.values()) {
    if (list.length < 3) continue;
    const totals = list.map((i) => i.total);
    const med = median(totals);
    const mad = median(totals.map((t) => Math.abs(t - med))) || med * 0.1 || 1;
    for (const inv of list) {
      const z = (0.6745 * (inv.total - med)) / mad;
      if (z > 3) {
        out.push({
          invoiceId: inv.id,
          title: 'Olağandışı yüksek tutar',
          detail: `${inv.counterpartyName} için tipik tutar ~${Math.round(med).toLocaleString('tr-TR')} ₺; bu fatura ${Math.round(inv.total).toLocaleString('tr-TR')} ₺ (%${Math.round(((inv.total - med) / med) * 100)} üstünde).`,
          severity: z > 6 ? 'bad' : 'warn',
          score: Math.min(1, z / 10),
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------------- Vade ve risk ----------------
export interface Receivable {
  invoice: Invoice;
  outstanding: number;
  daysOverdue: number; // negatif = vadesi gelmemiş
  risk: 'dusuk' | 'orta' | 'yuksek';
}

export function receivables(invoices: Invoice[], payments: Payment[], now = Date.now()): Receivable[] {
  const paid = new Map<string, number>();
  for (const p of payments) if (p.invoiceId) paid.set(p.invoiceId, (paid.get(p.invoiceId) ?? 0) + p.amount);
  return invoices
    .filter((i) => i.type === 'satis' && !['iptal', 'taslak', 'odendi'].includes(i.status))
    .map((invoice) => {
      const outstanding = r2(invoice.total - (paid.get(invoice.id) ?? 0));
      const daysOverdue = Math.floor((now - (invoice.dueDate ?? invoice.date)) / 86_400_000);
      const risk = daysOverdue > 30 ? 'yuksek' : daysOverdue > 0 ? 'orta' : 'dusuk';
      return { invoice, outstanding, daysOverdue, risk } as Receivable;
    })
    .filter((r) => r.outstanding > 0.01)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function payables(invoices: Invoice[], payments: Payment[], now = Date.now()): Receivable[] {
  const paid = new Map<string, number>();
  for (const p of payments) if (p.invoiceId) paid.set(p.invoiceId, (paid.get(p.invoiceId) ?? 0) + p.amount);
  return invoices
    .filter((i) => i.type === 'alis' && !['iptal', 'taslak', 'odendi'].includes(i.status))
    .map((invoice) => {
      const outstanding = r2(invoice.total - (paid.get(invoice.id) ?? 0));
      const daysOverdue = Math.floor((now - (invoice.dueDate ?? invoice.date)) / 86_400_000);
      const risk = daysOverdue > 15 ? 'yuksek' : daysOverdue > 0 ? 'orta' : 'dusuk';
      return { invoice, outstanding, daysOverdue, risk } as Receivable;
    })
    .filter((r) => r.outstanding > 0.01)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export interface FinanceSummary {
  cashIn: number;
  cashOut: number;
  receivableTotal: number;
  overdueReceivable: number;
  payableTotal: number;
  overduePayable: number;
  vatPayable: number; // hesaplanan - indirilecek (dönem)
  grossMargin: number; // satış - alış maliyeti (yaklaşık)
}

export function summarize(invoices: Invoice[], payments: Payment[], now = Date.now()): FinanceSummary {
  const rec = receivables(invoices, payments, now);
  const pay = payables(invoices, payments, now);
  const month = monthKey(now);
  const thisMonth = invoices.filter((i) => monthKey(i.date) === month && i.status !== 'iptal' && i.status !== 'taslak');
  const vatOut = thisMonth.filter((i) => i.type === 'satis').reduce((s, i) => s + i.vatTotal, 0);
  const vatIn = thisMonth.filter((i) => i.type === 'alis').reduce((s, i) => s + i.vatTotal, 0);
  const sales = invoices.filter((i) => i.type === 'satis' && i.status !== 'iptal').reduce((s, i) => s + i.subtotal, 0);
  const cogs = invoices
    .filter((i) => i.type === 'alis' && ['hammadde', 'iplik-kumas', 'boya-kimyasal'].includes(i.category))
    .reduce((s, i) => s + i.subtotal, 0);
  return {
    cashIn: r2(payments.filter((p) => p.direction === 'tahsilat').reduce((s, p) => s + p.amount, 0)),
    cashOut: r2(payments.filter((p) => p.direction === 'odeme').reduce((s, p) => s + p.amount, 0)),
    receivableTotal: r2(rec.reduce((s, r) => s + r.outstanding, 0)),
    overdueReceivable: r2(rec.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.outstanding, 0)),
    payableTotal: r2(pay.reduce((s, r) => s + r.outstanding, 0)),
    overduePayable: r2(pay.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.outstanding, 0)),
    vatPayable: r2(vatOut - vatIn),
    grossMargin: sales > 0 ? r2((sales - cogs) / sales) : 0,
  };
}

/** Kategori bazlı gider dağılımı */
export function expenseByCategory(invoices: Invoice[], payments: Payment[]): { category: FinanceCategory; label: string; total: number }[] {
  const map = new Map<FinanceCategory, number>();
  for (const i of invoices) if (i.type === 'alis' && i.status !== 'iptal') map.set(i.category, (map.get(i.category) ?? 0) + i.total);
  for (const p of payments) {
    if (p.invoiceId || p.direction !== 'odeme') continue;
    const cat = categorize(`${p.counterparty ?? ''} ${p.note ?? ''}`).category;
    map.set(cat, (map.get(cat) ?? 0) + p.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, label: FINANCE_CATEGORIES[category], total: r2(total) }))
    .sort((a, b) => b.total - a.total);
}
