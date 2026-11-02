/**
 * AI asistan — işletme verisinden bağlam çıkarır, soruyu yerel kurallarla veya (ayarlıysa) LLM ile yanıtlar.
 * LLM bağlı değilken de çalışır: yanıtlar tamamen cihazdaki verilerden üretilir.
 */
import { db, getSettings } from '../db';
import type { Product, ProductionOrder, Order } from '../db/schema';
import { FINANCE_CATEGORIES, PRODUCTION_STAGES } from '../db/schema';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { stockFromMovements } from '../lib/stock';
import {
  detectAnomalies,
  expenseByCategory,
  forecastMonths,
  monthlySeries,
  payables,
  receivables,
  summarize,
  type Anomaly,
  type FinanceSummary,
  type ForecastPoint,
  type MonthPoint,
  type Receivable,
} from './finance';
import { chat, type ChatMessage } from './llm';

export interface AssistantContext {
  companyName: string;
  generatedAt: number;
  finance: FinanceSummary;
  months: MonthPoint[];
  forecast: ForecastPoint[];
  anomalies: Anomaly[];
  overdueReceivables: Receivable[];
  overduePayables: Receivable[];
  expenses: { label: string; total: number }[];
  lowStock: { product: Product; level: number }[];
  lateProduction: { order: ProductionOrder; product?: Product; daysLate: number }[];
  openOrders: { order: Order; customerName: string }[];
  visitors7d: { total: number; days: number };
  invoiceCount: number;
}

export async function buildContext(): Promise<AssistantContext> {
  const now = Date.now();
  const settings = await getSettings();
  const [invoices, payments, products, movements, prodOrders, orders, customers, samples] = await Promise.all([
    db.invoices.toArray(),
    db.payments.toArray(),
    db.products.toArray(),
    db.movements.toArray(),
    db.productionOrders.toArray(),
    db.orders.toArray(),
    db.customers.toArray(),
    db.visitorSamples.where('at').aboveOrEqual(now - 7 * 86_400_000).toArray(),
  ]);
  const levels = stockFromMovements(movements);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const months = monthlySeries(invoices, payments, 6, now);
  return {
    companyName: settings.companyName,
    generatedAt: now,
    finance: summarize(invoices, payments, now),
    months,
    forecast: forecastMonths(months, 3),
    anomalies: detectAnomalies(invoices).slice(0, 8),
    overdueReceivables: receivables(invoices, payments, now).filter((r) => r.daysOverdue > 0).slice(0, 5),
    overduePayables: payables(invoices, payments, now).filter((r) => r.daysOverdue > 0).slice(0, 5),
    expenses: expenseByCategory(invoices, payments).slice(0, 6).map((e) => ({ label: e.label, total: e.total })),
    lowStock: products
      .map((p) => ({ product: p, level: levels.get(p.id) ?? 0 }))
      .filter((x) => x.level <= x.product.minStock)
      .sort((a, b) => a.level / (a.product.minStock || 1) - b.level / (b.product.minStock || 1))
      .slice(0, 8),
    lateProduction: prodOrders
      .filter((o) => (o.status === 'devam' || o.status === 'planlandi') && o.dueDate < now)
      .map((order) => ({ order, product: productMap.get(order.productId), daysLate: Math.floor((now - order.dueDate) / 86_400_000) }))
      .sort((a, b) => b.daysLate - a.daysLate)
      .slice(0, 6),
    openOrders: orders
      .filter((o) => !['tamamlandi', 'iptal'].includes(o.status))
      .map((order) => ({ order, customerName: customerMap.get(order.customerId) ?? 'Bilinmeyen müşteri' }))
      .slice(0, 8),
    visitors7d: {
      total: samples.reduce((s, v) => s + v.entries, 0),
      days: new Set(samples.map((v) => new Date(v.at).toDateString())).size,
    },
    invoiceCount: invoices.length,
  };
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');
const stageLabel = (k: string) => PRODUCTION_STAGES.find((s) => s.key === k)?.label ?? k;

function list(items: string[]): string {
  return items.length ? items.map((i) => `• ${i}`).join('\n') : '• (kayıt yok)';
}

function cashText(ctx: AssistantContext): string {
  const f = ctx.finance;
  const net = f.cashIn - f.cashOut;
  const m = ctx.months[ctx.months.length - 1];
  return [
    `Nakit durumu: toplam tahsilat ${fmtMoney(f.cashIn)}, toplam ödeme ${fmtMoney(f.cashOut)}; net ${fmtMoney(net)}.`,
    m ? `Bu ay (${m.label}) gelir ${fmtMoney(m.income)}, gider ${fmtMoney(m.expense)}, net ${fmtMoney(m.net)}.` : '',
    `Tahsil edilecek ${fmtMoney(f.receivableTotal)} (vadesi geçen ${fmtMoney(f.overdueReceivable)}); ödenecek ${fmtMoney(f.payableTotal)} (vadesi geçen ${fmtMoney(f.overduePayable)}).`,
  ]
    .filter(Boolean)
    .join('\n');
}

function receivablesText(ctx: AssistantContext): string {
  const f = ctx.finance;
  return `Toplam alacak ${fmtMoney(f.receivableTotal)}, vadesi geçen ${fmtMoney(f.overdueReceivable)}.\nVadesi geçen alacaklar:\n${list(
    ctx.overdueReceivables.map(
      (r) => `${r.invoice.counterpartyName}: ${fmtMoney(r.outstanding, r.invoice.currency)} — ${r.daysOverdue} gün gecikmiş (${r.invoice.invoiceNo}), risk ${r.risk === 'yuksek' ? 'yüksek' : r.risk === 'orta' ? 'orta' : 'düşük'}`,
    ),
  )}`;
}

function payablesText(ctx: AssistantContext): string {
  const f = ctx.finance;
  return `Toplam borç ${fmtMoney(f.payableTotal)}, vadesi geçen ${fmtMoney(f.overduePayable)}.\nVadesi geçen ödemeler:\n${list(
    ctx.overduePayables.map((r) => `${r.invoice.counterpartyName}: ${fmtMoney(r.outstanding, r.invoice.currency)} — ${r.daysOverdue} gün gecikmiş (vade ${fmtDate(r.invoice.dueDate)})`),
  )}`;
}

function forecastText(ctx: AssistantContext): string {
  const net = ctx.forecast.reduce((s, p) => s + p.net, 0);
  return `Önümüzdeki 3 ayda net nakit tahmini ${fmtMoney(net)} (Holt üstel düzeltme, son 6 ay verisiyle).\n${list(
    ctx.forecast.map((p) => `${p.label}: gelir ${fmtMoney(p.income)}, gider ${fmtMoney(p.expense)}, net ${fmtMoney(p.net)}`),
  )}\nTahmin geçmiş eğilime dayanır; büyük tek seferlik sipariş veya ödemeleri hesaba katmaz.`;
}

function anomaliesText(ctx: AssistantContext): string {
  if (!ctx.anomalies.length) return 'Faturalarda şüpheli bir durum tespit edilmedi (mükerrer, KDV uyuşmazlığı veya olağandışı tutar yok).';
  return `${ctx.anomalies.length} şüpheli kayıt bulundu:\n${list(ctx.anomalies.map((a) => `${a.severity === 'bad' ? '⚠ ' : ''}${a.title}: ${a.detail}`))}`;
}

function expensesText(ctx: AssistantContext): string {
  const total = ctx.expenses.reduce((s, e) => s + e.total, 0);
  return `Gider dağılımı (toplam ${fmtMoney(total)}):\n${list(ctx.expenses.map((e) => `${e.label}: ${fmtMoney(e.total)} (%${total ? Math.round((e.total / total) * 100) : 0})`))}`;
}

function stockText(ctx: AssistantContext): string {
  if (!ctx.lowStock.length) return 'Kritik seviyenin altında ürün yok.';
  return `${ctx.lowStock.length} ürün kritik stok seviyesinde:\n${list(
    ctx.lowStock.map((x) => `${x.product.name} (${x.product.sku}): ${fmtNum(x.level)} ${x.product.unit} — eşik ${fmtNum(x.product.minStock)} ${x.product.unit}`),
  )}`;
}

function productionText(ctx: AssistantContext): string {
  if (!ctx.lateProduction.length) return 'Termini geçmiş üretim emri yok.';
  return `${ctx.lateProduction.length} üretim emri termini geçti:\n${list(
    ctx.lateProduction.map((x) => `${x.order.orderNo} — ${x.product?.name ?? 'ürün'} ${fmtNum(x.order.quantity)} ${x.product?.unit ?? ''}, aşama ${stageLabel(x.order.stage)}, ${x.daysLate} gün gecikme`),
  )}`;
}

function ordersText(ctx: AssistantContext): string {
  return `${ctx.openOrders.length} açık sipariş:\n${list(
    ctx.openOrders.map((x) => `${x.order.orderNo} — ${x.customerName}, ${fmtMoney(x.order.total, x.order.currency)}, termin ${fmtDate(x.order.dueDate)}`),
  )}`;
}

function visitorsText(ctx: AssistantContext): string {
  const v = ctx.visitors7d;
  if (!v.total) return 'Son 7 günde kamera analizi verisi yok. Kamera analizi sayfasından bir oturum başlatın.';
  return `Son 7 günde (${v.days} gün kayıt) tahmini ${fmtNum(v.total)} ziyaretçi girişi sayıldı; günlük ortalama ${fmtNum(v.total / Math.max(1, v.days))}.`;
}

function marginText(ctx: AssistantContext): string {
  return `Brüt marj (satış − hammadde/iplik/boya maliyeti) yaklaşık %${Math.round(ctx.finance.grossMargin * 100)}. Bu ay ödenecek KDV farkı ${fmtMoney(ctx.finance.vatPayable)}.`;
}

function overviewText(ctx: AssistantContext): string {
  return [
    `${ctx.companyName} — genel görünüm (${fmtDate(ctx.generatedAt)}):`,
    cashText(ctx),
    `Şüpheli fatura: ${ctx.anomalies.length} · Kritik stok: ${ctx.lowStock.length} ürün · Geciken üretim: ${ctx.lateProduction.length} emir · Açık sipariş: ${ctx.openOrders.length}.`,
    forecastText(ctx).split('\n')[0],
  ].join('\n');
}

const RULES: { keys: string[]; fn: (ctx: AssistantContext) => string }[] = [
  { keys: ['alacak', 'tahsilat', 'tahsil', 'müşteri bor', 'kim borçlu'], fn: receivablesText },
  { keys: ['borç', 'borc', 'ödenecek', 'odenecek', 'tedarikçi'], fn: payablesText },
  { keys: ['tahmin', 'önümüzdeki', 'gelecek', 'projeksiyon', 'forecast'], fn: forecastText },
  { keys: ['anomali', 'şüpheli', 'supheli', 'mükerrer', 'hata', 'tutarsız'], fn: anomaliesText },
  { keys: ['gider', 'masraf', 'harcama', 'kategori'], fn: expensesText },
  { keys: ['stok', 'kritik', 'envanter', 'depo'], fn: stockText },
  { keys: ['üretim', 'uretim', 'termin', 'gecik', 'emir'], fn: productionText },
  { keys: ['sipariş', 'siparis', 'açık sipariş'], fn: ordersText },
  { keys: ['ziyaretçi', 'ziyaretci', 'kamera', 'müşteri trafiği', 'mağaza'], fn: visitorsText },
  { keys: ['kâr', 'kar ', 'marj', 'kdv', 'vergi'], fn: marginText },
  { keys: ['nakit', 'kasa', 'banka', 'para', 'durum', 'gelir'], fn: cashText },
];

export function answerLocally(question: string, ctx: AssistantContext): string {
  const q = trLower(question);
  const hits = RULES.filter((r) => r.keys.some((k) => q.includes(k)));
  if (!hits.length) return overviewText(ctx);
  const seen = new Set<string>();
  return hits
    .map((h) => h.fn(ctx))
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)))
    .join('\n\n');
}

export interface AssistantAnswer {
  text: string;
  source: 'llm' | 'local';
  model?: string;
  error?: string;
}

function systemPrompt(ctx: AssistantContext): string {
  const compact = {
    sirket: ctx.companyName,
    tarih: fmtDate(ctx.generatedAt),
    finans: ctx.finance,
    aylik: ctx.months,
    tahmin: ctx.forecast,
    anomaliler: ctx.anomalies.map((a) => ({ baslik: a.title, detay: a.detail, onem: a.severity })),
    vadesiGecenAlacaklar: ctx.overdueReceivables.map((r) => ({ kim: r.invoice.counterpartyName, tutar: r.outstanding, gun: r.daysOverdue })),
    vadesiGecenBorclar: ctx.overduePayables.map((r) => ({ kim: r.invoice.counterpartyName, tutar: r.outstanding, gun: r.daysOverdue })),
    giderler: ctx.expenses,
    kritikStok: ctx.lowStock.map((x) => ({ urun: x.product.name, seviye: x.level, esik: x.product.minStock, birim: x.product.unit })),
    gecikenUretim: ctx.lateProduction.map((x) => ({ emir: x.order.orderNo, urun: x.product?.name, asama: stageLabel(x.order.stage), gun: x.daysLate })),
    acikSiparisler: ctx.openOrders.map((x) => ({ no: x.order.orderNo, musteri: x.customerName, tutar: x.order.total, paraBirimi: x.order.currency })),
    ziyaretci7gun: ctx.visitors7d,
    kategoriler: Object.values(FINANCE_CATEGORIES),
  };
  return [
    'Sen bir tekstil şirketinin ERP sistemine gömülü Türkçe finans ve operasyon asistanısın.',
    'Yalnızca aşağıdaki JSON bağlamındaki verilere dayanarak yanıt ver; bilmediğin bir şeyi uydurma, "verilerde yok" de.',
    'Kısa, net, sayısal ve Türkçe yaz; tutarları ₺ ile ve binlik ayraçla ver. Gerekirse madde işaretleri kullan.',
    'Önemli: Bu yanıtlar mali müşavirin veya yetkili muhasebecinin yerini almaz; vergi beyanı veya resmi mali karar niteliğinde değildir — bunu ancak kullanıcı resmi/yasal bir işlem sorarsa tek cümleyle hatırlat.',
    `BAĞLAM: ${JSON.stringify(compact)}`,
  ].join('\n');
}

export async function ask(question: string, history: ChatMessage[] = [], ctx?: AssistantContext): Promise<AssistantAnswer> {
  const context = ctx ?? (await buildContext());
  const settings = await getSettings();
  if (settings.llm.provider === 'none') return { text: answerLocally(question, context), source: 'local' };
  try {
    const text = await chat(
      [{ role: 'system', content: systemPrompt(context) }, ...history.slice(-8), { role: 'user', content: question }],
      settings.llm,
    );
    if (text) return { text, source: 'llm', model: settings.llm.model };
    return { text: answerLocally(question, context), source: 'local' };
  } catch (e) {
    return {
      text: answerLocally(question, context),
      source: 'local',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
