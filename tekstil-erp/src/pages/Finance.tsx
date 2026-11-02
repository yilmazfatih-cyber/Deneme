import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db, getSettings } from '../db';
import {
  FINANCE_CATEGORIES,
  INVOICE_STATUS,
  PAYMENT_METHODS,
  type Currency,
  type FinanceCategory,
  type Invoice,
  type InvoiceLine,
  type InvoiceStatus,
  type InvoiceType,
  type JournalEntry,
  type Payment,
  type PaymentMethod,
} from '../db/schema';
import { Alert, Badge, Card, Empty, Field, Modal, PageHead, Stat, Tabs, confirmDelete, type Tone } from '../components/ui';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fromInputDate, toInputDate } from '../lib/format';
import { docNo, uid } from '../lib/id';
import {
  categorize,
  detectAnomalies,
  expenseByCategory,
  forecastMonths,
  isBalanced,
  monthKey,
  monthlySeries,
  payables,
  postInvoiceJournal,
  postPaymentJournal,
  receivables,
  summarize,
  type MonthPoint,
} from '../ai/finance';
import { chat } from '../ai/llm';
import { axisProps, GRID, tooltipStyle } from '../charts/theme';

type Tab = 'ozet' | 'faturalar' | 'odemeler' | 'yevmiye' | 'ai';
const TABS: { key: Tab; label: string }[] = [
  { key: 'ozet', label: 'Özet' },
  { key: 'faturalar', label: 'Faturalar' },
  { key: 'odemeler', label: 'Ödemeler' },
  { key: 'yevmiye', label: 'Yevmiye' },
  { key: 'ai', label: 'AI analiz' },
];

const statusTone: Record<InvoiceStatus, Tone> = { taslak: 'neutral', kesildi: 'info', odendi: 'good', gecikti: 'bad', iptal: 'neutral' };
const r2 = (n: number) => Math.round(n * 100) / 100;
const nowMs = () => Date.now();
const defaultDue = () => toInputDate(Date.now() + 30 * 86_400_000);
const money = (v: unknown) => fmtMoney(Number(v));

function lineTotals(lines: InvoiceLine[]) {
  const subtotal = r2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const vatTotal = r2(lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.vatRate) / 100, 0));
  return { subtotal, vatTotal, total: r2(subtotal + vatTotal) };
}

/** Vadesi geçmiş "kesildi" faturaları "gecikti" yapar */
async function markOverdue() {
  const now = Date.now();
  const open = await db.invoices.where('status').equals('kesildi').toArray();
  const late = open.filter((i) => i.dueDate && i.dueDate < now);
  if (late.length) await db.invoices.bulkPut(late.map((i) => ({ ...i, status: 'gecikti' as const })));
}

export async function saveInvoiceWithJournal(inv: Invoice) {
  await db.transaction('rw', db.invoices, db.journal, async () => {
    await db.invoices.put(inv);
    if (inv.status !== 'taslak' && inv.status !== 'iptal') await db.journal.put(postInvoiceJournal(inv));
    else await db.journal.delete(`j_${inv.id}`);
  });
}

async function savePaymentWithJournal(p: Payment, invoice?: Invoice) {
  await db.transaction('rw', db.payments, db.journal, db.invoices, async () => {
    await db.payments.put(p);
    await db.journal.put(postPaymentJournal(p));
    if (invoice) {
      const paid = (await db.payments.where('invoiceId').equals(invoice.id).toArray()).reduce((s, x) => s + x.amount, 0);
      if (paid >= invoice.total - 0.01) await db.invoices.update(invoice.id, { status: 'odendi' });
    }
  });
}

export default function Finance() {
  const [tab, setTab] = useState<Tab>('ozet');
  useEffect(() => {
    void markOverdue();
  }, []);
  const invoices = useLiveQuery(() => db.invoices.orderBy('date').reverse().toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.orderBy('date').reverse().toArray(), []) ?? [];
  const journal = useLiveQuery(() => db.journal.orderBy('date').reverse().toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? [];

  const [newInvoice, setNewInvoice] = useState(false);
  const [newPayment, setNewPayment] = useState<Invoice | null | 'free'>(null);
  const [detail, setDetail] = useState<Invoice | null>(null);

  return (
    <>
      <PageHead
        title="Finans"
        subtitle="Faturalar, tahsilat ve ödemeler; yevmiye kayıtları ve nakit tahmini yapay zekâ ile otomatik üretilir."
        actions={
          <>
            <Link className="btn" to="/belgeler">
              Belgeden oluştur (OCR)
            </Link>
            <button className="btn" onClick={() => setNewPayment('free')}>
              + Ödeme / tahsilat
            </button>
            <button className="btn primary" onClick={() => setNewInvoice(true)}>
              + Yeni fatura
            </button>
          </>
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'ozet' && <OverviewTab invoices={invoices} payments={payments} />}
      {tab === 'faturalar' && <InvoicesTab invoices={invoices} onOpen={setDetail} onPay={(i) => setNewPayment(i)} />}
      {tab === 'odemeler' && <PaymentsTab payments={payments} invoices={invoices} onNew={() => setNewPayment('free')} />}
      {tab === 'yevmiye' && <JournalTab journal={journal} />}
      {tab === 'ai' && <AiTab invoices={invoices} payments={payments} />}

      <InvoiceModal open={newInvoice} onClose={() => setNewInvoice(false)} customers={customers} />
      <PaymentModal
        key={newPayment === null ? 'closed' : newPayment === 'free' ? 'free' : newPayment.id}
        open={newPayment !== null}
        invoice={newPayment && newPayment !== 'free' ? newPayment : undefined}
        invoices={invoices}
        payments={payments}
        onClose={() => setNewPayment(null)}
      />
      <InvoiceDetailModal invoice={detail} payments={payments} onClose={() => setDetail(null)} onPay={(i) => { setDetail(null); setNewPayment(i); }} />
    </>
  );
}

// ---------------- Özet ----------------
function OverviewTab({ invoices, payments }: { invoices: Invoice[]; payments: Payment[] }) {
  const [table, setTable] = useState(false);
  const summary = useMemo(() => summarize(invoices, payments), [invoices, payments]);
  const months = useMemo(() => monthlySeries(invoices, payments, 6), [invoices, payments]);
  const forecast = useMemo(() => forecastMonths(months, 3), [months]);
  const expenses = useMemo(() => expenseByCategory(invoices, payments).slice(0, 8), [invoices, payments]);
  const data = [...months.map((m) => ({ ...m, forecast: false })), ...forecast];
  const net = summary.cashIn - summary.cashOut;

  return (
    <>
      <div className="grid grid-3">
        <Stat label="Kasa + banka (net)" value={fmtMoney(net)} delta={`Tahsilat ${fmtMoney(summary.cashIn)} · Ödeme ${fmtMoney(summary.cashOut)}`} trend={net >= 0 ? 'up' : 'down'} />
        <Stat label="Tahsil edilecek" value={fmtMoney(summary.receivableTotal)} delta={`Vadesi geçen ${fmtMoney(summary.overdueReceivable)}`} trend={summary.overdueReceivable > 0 ? 'down' : 'flat'} />
        <Stat label="Ödenecek" value={fmtMoney(summary.payableTotal)} delta={`Vadesi geçen ${fmtMoney(summary.overduePayable)}`} trend={summary.overduePayable > 0 ? 'down' : 'flat'} />
        <Stat label="Bu ay KDV farkı" value={fmtMoney(summary.vatPayable)} delta="Hesaplanan − indirilecek KDV" />
        <Stat label="Brüt marj" value={fmtPct(summary.grossMargin)} delta="Satış − hammadde/iplik/boya" trend={summary.grossMargin > 0.25 ? 'up' : 'flat'} />
        <Stat label="3 aylık net nakit tahmini" value={fmtMoney(forecast.reduce((s, f) => s + f.net, 0))} delta="Holt üstel düzeltme (AI)" />
      </div>

      <Card
        className="card"
        title="Aylık gelir ve gider"
        subtitle="Son 6 ay gerçekleşen; soluk sütunlar önümüzdeki 3 ay için tahmin"
        actions={
          <button className="btn sm" onClick={() => setTable((t) => !t)}>
            {table ? 'Grafik görünümü' : 'Tablo görünümü'}
          </button>
        }
      >
        {table ? (
          <MonthTable rows={data} />
        ) : (
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <BarChart data={data} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v) => fmtNum(Number(v) / 1000) + 'k'} width={56} />
                <Tooltip {...tooltipStyle} formatter={money} />
                <Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="income" name="Gelir" fill="var(--s1)" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fillOpacity={d.forecast ? 0.4 : 1} stroke={d.forecast ? 'var(--s1)' : undefined} strokeDasharray={d.forecast ? '4 3' : undefined} />
                  ))}
                </Bar>
                <Bar dataKey="expense" name="Gider" fill="var(--s2)" radius={[4, 4, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fillOpacity={d.forecast ? 0.4 : 1} stroke={d.forecast ? 'var(--s2)' : undefined} strokeDasharray={d.forecast ? '4 3' : undefined} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card title="Gider dağılımı" subtitle="Kategoriye göre toplam (AI sınıflandırması)">
          {expenses.length === 0 ? (
            <Empty title="Gider kaydı yok" />
          ) : table ? (
            <table className="table">
              <thead><tr><th>Kategori</th><th className="num">Tutar</th></tr></thead>
              <tbody>{expenses.map((e) => <tr key={e.category}><td>{e.label}</td><td className="num">{fmtMoney(e.total)}</td></tr>)}</tbody>
            </table>
          ) : (
            <div style={{ width: '100%', height: 36 * expenses.length + 20 }}>
              <ResponsiveContainer>
                <BarChart data={expenses} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => fmtNum(Number(v) / 1000) + 'k'} />
                  <YAxis type="category" dataKey="label" width={150} {...axisProps} />
                  <Tooltip {...tooltipStyle} formatter={money} />
                  <Bar dataKey="total" name="Gider" fill="var(--s1)" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card title="Son faturalar">
          {invoices.length === 0 ? (
            <Empty title="Henüz fatura yok" hint="Yeni fatura ekleyin veya Belgeler sayfasından OCR ile okutun." />
          ) : (
            <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fatura</th><th>Karşı taraf</th><th className="num">Tutar</th><th>Durum</th></tr></thead>
              <tbody>
                {invoices.slice(0, 6).map((i) => (
                  <tr key={i.id}>
                    <td className="mono">{i.invoiceNo}</td>
                    <td>{i.counterpartyName}</td>
                    <td className="num">{i.type === 'alis' ? '−' : ''}{fmtMoney(i.total, i.currency)}</td>
                    <td><Badge tone={statusTone[i.status]}>{INVOICE_STATUS[i.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function MonthTable({ rows }: { rows: (MonthPoint & { forecast: boolean })[] | { label: string; income: number; expense: number; net: number; forecast: boolean }[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Ay</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Net</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              <td className="num">{fmtMoney(r.income)}</td>
              <td className="num">{fmtMoney(r.expense)}</td>
              <td className="num" style={{ color: r.net < 0 ? 'var(--bad)' : undefined }}>{fmtMoney(r.net)}</td>
              <td>{r.forecast && <Badge tone="info">tahmin</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Faturalar ----------------
function InvoicesTab({ invoices, onOpen, onPay }: { invoices: Invoice[]; onOpen: (i: Invoice) => void; onPay: (i: Invoice) => void }) {
  const [type, setType] = useState<'' | InvoiceType>('');
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const [q, setQ] = useState('');
  const rows = invoices.filter((i) => {
    if (type && i.type !== type) return false;
    if (status && i.status !== status) return false;
    if (q) {
      const t = q.toLocaleLowerCase('tr-TR');
      return `${i.invoiceNo} ${i.counterpartyName} ${FINANCE_CATEGORIES[i.category]}`.toLocaleLowerCase('tr-TR').includes(t);
    }
    return true;
  });
  const sum = rows.reduce((s, i) => s + (i.type === 'satis' ? i.total : -i.total), 0);
  return (
    <Card
      title={`Faturalar (${rows.length})`}
      subtitle={`Listelenen net: ${fmtMoney(sum)}`}
      actions={
        <>
          <input className="input" style={{ width: 200 }} placeholder="Ara: no, unvan, kategori" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Fatura ara" />
          <select className="input" style={{ width: 130 }} value={type} onChange={(e) => setType(e.target.value as '' | InvoiceType)} aria-label="Tür">
            <option value="">Tüm türler</option>
            <option value="satis">Satış</option>
            <option value="alis">Alış</option>
          </select>
          <select className="input" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value as '' | InvoiceStatus)} aria-label="Durum">
            <option value="">Tüm durumlar</option>
            {Object.entries(INVOICE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </>
      }
    >
      {rows.length === 0 ? (
        <Empty title="Fatura bulunamadı" hint="Filtreleri değiştirin veya yeni fatura ekleyin." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Tür</th><th>Fatura no</th><th>Karşı taraf</th><th>Tarih</th><th>Vade</th><th>Kategori</th><th className="num">Tutar</th><th>Durum</th><th>Kaynak</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => onOpen(i)}>
                  <td><Badge tone={i.type === 'satis' ? 'good' : 'neutral'}>{i.type === 'satis' ? 'Satış' : 'Alış'}</Badge></td>
                  <td className="mono">{i.invoiceNo}</td>
                  <td>{i.counterpartyName}</td>
                  <td>{fmtDate(i.date)}</td>
                  <td>{fmtDate(i.dueDate)}</td>
                  <td className="small muted">{FINANCE_CATEGORIES[i.category]}</td>
                  <td className="num">{fmtMoney(i.total, i.currency)}</td>
                  <td><Badge tone={statusTone[i.status]}>{INVOICE_STATUS[i.status]}</Badge></td>
                  <td>
                    {i.source === 'ocr' || i.source === 'pdf' ? (
                      <Badge tone="info">{i.source.toUpperCase()}{i.aiConfidence !== undefined ? ` ${Math.round(i.aiConfidence * 100)}%` : ''}</Badge>
                    ) : (
                      <span className="tiny">{i.source === 'siparis' ? 'Sipariş' : 'Elle'}</span>
                    )}
                  </td>
                  <td>
                    {['kesildi', 'gecikti'].includes(i.status) && (
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); onPay(i); }}>
                        Ödendi işaretle
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function InvoiceDetailModal({ invoice, payments, onClose, onPay }: { invoice: Invoice | null; payments: Payment[]; onClose: () => void; onPay: (i: Invoice) => void }) {
  if (!invoice) return null;
  const paid = payments.filter((p) => p.invoiceId === invoice.id);
  const paidSum = paid.reduce((s, p) => s + p.amount, 0);
  const anomalies = detectAnomalies([invoice]);
  const remove = async () => {
    if (!confirmDelete(`${invoice.invoiceNo} numaralı fatura`)) return;
    await db.transaction('rw', db.invoices, db.journal, async () => {
      await db.invoices.delete(invoice.id);
      await db.journal.delete(`j_${invoice.id}`);
    });
    onClose();
  };
  const cancel = async () => {
    await saveInvoiceWithJournal({ ...invoice, status: 'iptal' });
    onClose();
  };
  return (
    <Modal open title={`Fatura ${invoice.invoiceNo}`} onClose={onClose} wide>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row">
          <Badge tone={invoice.type === 'satis' ? 'good' : 'neutral'}>{invoice.type === 'satis' ? 'Satış faturası' : 'Alış faturası'}</Badge>
          <Badge tone={statusTone[invoice.status]}>{INVOICE_STATUS[invoice.status]}</Badge>
          {invoice.aiConfidence !== undefined && <Badge tone={invoice.aiConfidence >= 0.75 ? 'good' : invoice.aiConfidence >= 0.5 ? 'warn' : 'bad'}>AI güveni {Math.round(invoice.aiConfidence * 100)}%</Badge>}
        </div>
        <div className="row">
          {['kesildi', 'gecikti'].includes(invoice.status) && <button className="btn primary sm" onClick={() => onPay(invoice)}>Ödendi işaretle</button>}
          {invoice.status !== 'iptal' && <button className="btn sm" onClick={cancel}>İptal et</button>}
          <button className="btn danger sm" onClick={remove}>Sil</button>
        </div>
      </div>
      <dl className="kv">
        <dt>Karşı taraf</dt><dd>{invoice.counterpartyName}{invoice.counterpartyTaxNo ? ` · VKN ${invoice.counterpartyTaxNo}` : ''}</dd>
        <dt>Tarih / vade</dt><dd>{fmtDate(invoice.date)} / {fmtDate(invoice.dueDate)}</dd>
        <dt>Kategori</dt><dd>{FINANCE_CATEGORIES[invoice.category]}</dd>
        <dt>Kaynak</dt><dd>{invoice.source === 'manuel' ? 'Elle girildi' : invoice.source === 'siparis' ? 'Siparişten' : `${invoice.source.toUpperCase()} ile okundu`}</dd>
      </dl>
      <hr className="sep" />
      <table className="table">
        <thead><tr><th>Açıklama</th><th className="num">Miktar</th><th className="num">Birim fiyat</th><th className="num">KDV</th><th className="num">Tutar</th></tr></thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={i}><td>{l.description}</td><td className="num">{fmtNum(l.quantity, 2)}</td><td className="num">{fmtMoney(l.unitPrice, invoice.currency)}</td><td className="num">%{l.vatRate}</td><td className="num">{fmtMoney(l.quantity * l.unitPrice, invoice.currency)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4} className="num muted">Ara toplam</td><td className="num">{fmtMoney(invoice.subtotal, invoice.currency)}</td></tr>
          <tr><td colSpan={4} className="num muted">KDV</td><td className="num">{fmtMoney(invoice.vatTotal, invoice.currency)}</td></tr>
          <tr><td colSpan={4} className="num"><strong>Genel toplam</strong></td><td className="num"><strong>{fmtMoney(invoice.total, invoice.currency)}</strong></td></tr>
          {paid.length > 0 && <tr><td colSpan={4} className="num muted">Ödenen ({paid.length} işlem)</td><td className="num">{fmtMoney(paidSum, invoice.currency)}</td></tr>}
        </tfoot>
      </table>
      {(invoice.aiNotes?.length || anomalies.length) ? (
        <div style={{ marginTop: 12 }}>
          {invoice.aiNotes?.map((n, i) => <Alert key={`n${i}`} tone="warn">{n}</Alert>)}
          {anomalies.map((a) => <div key={a.title} style={{ marginTop: 6 }}><Alert tone={a.severity}>{a.title}: {a.detail}</Alert></div>)}
        </div>
      ) : null}
    </Modal>
  );
}

function InvoiceModal({ open, onClose, customers }: { open: boolean; onClose: () => void; customers: { id: string; name: string; taxNo?: string }[] }) {
  const blank = (): InvoiceLine => ({ description: '', quantity: 1, unitPrice: 0, vatRate: 20 });
  const [type, setType] = useState<InvoiceType>('satis');
  const [counterpartyName, setCounterparty] = useState('');
  const [taxNo, setTaxNo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(toInputDate());
  const [dueDate, setDueDate] = useState(defaultDue);
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [status, setStatus] = useState<InvoiceStatus>('kesildi');
  const [lines, setLines] = useState<InvoiceLine[]>([blank()]);
  const [category, setCategory] = useState<FinanceCategory | ''>('');
  const [saving, setSaving] = useState(false);

  const guess = useMemo(() => categorize(`${counterpartyName} ${lines.map((l) => l.description).join(' ')}`, type), [counterpartyName, lines, type]);
  const effCategory: FinanceCategory = category || guess.category;
  const totals = lineTotals(lines);

  const reset = () => {
    setType('satis'); setCounterparty(''); setTaxNo(''); setCustomerId(''); setInvoiceNo(''); setDate(toInputDate());
    setDueDate(defaultDue()); setCurrency('TRY'); setStatus('kesildi'); setLines([blank()]); setCategory('');
  };
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) { setCounterparty(c.name); setTaxNo(c.taxNo ?? ''); }
  };
  const updLine = (i: number, patch: Partial<InvoiceLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    if (!counterpartyName.trim() || totals.total <= 0) return;
    setSaving(true);
    const count = await db.invoices.count();
    const inv: Invoice = {
      id: uid('inv'),
      invoiceNo: invoiceNo.trim() || docNo(type === 'satis' ? 'SF' : 'AF', count + 1),
      type,
      counterpartyName: counterpartyName.trim(),
      counterpartyTaxNo: taxNo.trim() || undefined,
      customerId: customerId || undefined,
      date: fromInputDate(date),
      dueDate: dueDate ? fromInputDate(dueDate) : undefined,
      lines: lines.filter((l) => l.description.trim()),
      ...totals,
      currency,
      status,
      category: effCategory,
      source: 'manuel',
      createdAt: nowMs(),
    };
    await saveInvoiceWithJournal(inv);
    setSaving(false);
    reset();
    onClose();
  };

  return (
    <Modal open={open} title="Yeni fatura" onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Tür">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as InvoiceType)}>
            <option value="satis">Satış faturası (müşteriye)</option>
            <option value="alis">Alış / gider faturası (tedarikçiden)</option>
          </select>
        </Field>
        {type === 'satis' && (
          <Field label="Müşteri (kayıtlı)">
            <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">— seçin —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Karşı taraf unvanı"><input className="input" value={counterpartyName} onChange={(e) => setCounterparty(e.target.value)} placeholder="Örn. Marmara Tekstil A.Ş." /></Field>
        <Field label="VKN / TCKN"><input className="input" value={taxNo} onChange={(e) => setTaxNo(e.target.value)} inputMode="numeric" /></Field>
        <Field label="Fatura no" hint="Boş bırakılırsa otomatik üretilir"><input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></Field>
        <Field label="Tarih"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Vade"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        <Field label="Para birimi">
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option>TRY</option><option>USD</option><option>EUR</option>
          </select>
        </Field>
        <Field label="Durum">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
            <option value="kesildi">Kesildi (açık)</option><option value="odendi">Ödendi</option><option value="taslak">Taslak</option>
          </select>
        </Field>
        <Field label="Kategori" hint={category ? 'Elle seçildi' : `AI önerisi · güven %${Math.round(guess.confidence * 100)}${guess.matched.length ? ` (${guess.matched.slice(0, 3).join(', ')})` : ''}`}>
          <select className="input" value={effCategory} onChange={(e) => setCategory(e.target.value as FinanceCategory)}>
            {Object.entries(FINANCE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <hr className="sep" />
      <h3 style={{ marginBottom: 8 }}>Kalemler</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th style={{ minWidth: 220 }}>Açıklama</th><th>Miktar</th><th>Birim fiyat</th><th>KDV %</th><th className="num">Tutar</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td><input className="input" value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} placeholder="Örn. Süprem kumaş 180 g" /></td>
                <td><input className="input" type="number" min={0} step="any" value={l.quantity} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} style={{ width: 90 }} /></td>
                <td><input className="input" type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => updLine(i, { unitPrice: Number(e.target.value) })} style={{ width: 120 }} /></td>
                <td>
                  <select className="input" value={l.vatRate} onChange={(e) => updLine(i, { vatRate: Number(e.target.value) })} style={{ width: 80 }}>
                    {[0, 1, 10, 20].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </td>
                <td className="num">{fmtMoney(l.quantity * l.unitPrice, currency)}</td>
                <td><button className="btn ghost sm" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Satırı sil" disabled={lines.length === 1}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={6}><button className="btn sm" onClick={() => setLines((ls) => [...ls, blank()])}>+ Satır ekle</button></td></tr>
            <tr><td colSpan={4} className="num muted">Ara toplam</td><td className="num">{fmtMoney(totals.subtotal, currency)}</td><td /></tr>
            <tr><td colSpan={4} className="num muted">KDV</td><td className="num">{fmtMoney(totals.vatTotal, currency)}</td><td /></tr>
            <tr><td colSpan={4} className="num"><strong>Genel toplam</strong></td><td className="num"><strong>{fmtMoney(totals.total, currency)}</strong></td><td /></tr>
          </tfoot>
        </table>
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>Kaydedilince Tek Düzen Hesap Planı'na göre yevmiye kaydı otomatik oluşturulur ({type === 'satis' ? '120 Alıcılar / 600 Satışlar / 391 KDV' : 'gider hesabı / 191 KDV / 320 Satıcılar'}).</p>
      <div className="row end" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Vazgeç</button>
        <button className="btn primary" onClick={save} disabled={saving || !counterpartyName.trim() || totals.total <= 0}>Kaydet</button>
      </div>
    </Modal>
  );
}

// ---------------- Ödemeler ----------------
function PaymentsTab({ payments, invoices, onNew }: { payments: Payment[]; invoices: Invoice[]; onNew: () => void }) {
  const invMap = new Map(invoices.map((i) => [i.id, i]));
  const inSum = payments.filter((p) => p.direction === 'tahsilat').reduce((s, p) => s + p.amount, 0);
  const outSum = payments.filter((p) => p.direction === 'odeme').reduce((s, p) => s + p.amount, 0);
  const remove = async (p: Payment) => {
    if (!confirmDelete('Bu ödeme kaydı')) return;
    await db.transaction('rw', db.payments, db.journal, async () => {
      await db.payments.delete(p.id);
      await db.journal.delete(`j_${p.id}`);
    });
  };
  return (
    <Card title="Ödemeler ve tahsilatlar" subtitle={`Tahsilat ${fmtMoney(inSum)} · Ödeme ${fmtMoney(outSum)} · Net ${fmtMoney(inSum - outSum)}`} actions={<button className="btn primary sm" onClick={onNew}>+ Yeni</button>}>
      {payments.length === 0 ? (
        <Empty title="Ödeme kaydı yok" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Tarih</th><th>Yön</th><th>Karşı taraf</th><th>Fatura</th><th>Yöntem</th><th className="num">Tutar</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const inv = p.invoiceId ? invMap.get(p.invoiceId) : undefined;
                return (
                  <tr key={p.id}>
                    <td>{fmtDate(p.date)}</td>
                    <td><Badge tone={p.direction === 'tahsilat' ? 'good' : 'neutral'}>{p.direction === 'tahsilat' ? 'Tahsilat' : 'Ödeme'}</Badge></td>
                    <td>{p.counterparty ?? inv?.counterpartyName ?? '—'}{p.note ? <span className="tiny"> · {p.note}</span> : null}</td>
                    <td className="mono">{inv?.invoiceNo ?? '—'}</td>
                    <td>{PAYMENT_METHODS[p.method]}</td>
                    <td className="num" style={{ color: p.direction === 'odeme' ? 'var(--bad)' : 'var(--good)' }}>{p.direction === 'odeme' ? '−' : '+'}{fmtMoney(p.amount, inv?.currency)}</td>
                    <td><button className="btn ghost sm" onClick={() => remove(p)} aria-label="Sil">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PaymentModal({ open, invoice, invoices, payments, onClose }: { open: boolean; invoice?: Invoice; invoices: Invoice[]; payments: Payment[]; onClose: () => void }) {
  const paidOf = (inv: Invoice) => payments.filter((p) => p.invoiceId === inv.id).reduce((s, p) => s + p.amount, 0);
  const [invoiceId, setInvoiceId] = useState(invoice?.id ?? '');
  const [direction, setDirection] = useState<Payment['direction']>(invoice ? (invoice.type === 'satis' ? 'tahsilat' : 'odeme') : 'tahsilat');
  const [amount, setAmount] = useState(invoice ? r2(invoice.total - paidOf(invoice)) : 0);
  const [date, setDate] = useState(() => toInputDate());
  const [method, setMethod] = useState<PaymentMethod>('havale');
  const [counterparty, setCounterparty] = useState(invoice?.counterpartyName ?? '');
  const [note, setNote] = useState('');

  const openInvoices = invoices.filter((i) => ['kesildi', 'gecikti'].includes(i.status));
  const selected = invoice ?? invoices.find((i) => i.id === invoiceId);
  const remaining = selected ? r2(selected.total - paidOf(selected)) : 0;

  const pickInvoice = (id: string) => {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    if (inv) {
      setDirection(inv.type === 'satis' ? 'tahsilat' : 'odeme');
      setCounterparty(inv.counterpartyName);
      setAmount(r2(inv.total - paidOf(inv)));
    }
  };

  const save = async () => {
    if (amount <= 0) return;
    const p: Payment = {
      id: uid('pay'),
      invoiceId: selected?.id,
      direction,
      amount: r2(amount),
      date: fromInputDate(date),
      method,
      counterparty: counterparty.trim() || undefined,
      note: note.trim() || undefined,
    };
    await savePaymentWithJournal(p, selected);
    onClose();
  };

  return (
    <Modal open={open} title={invoice ? `Ödeme kaydı — ${invoice.invoiceNo}` : 'Yeni ödeme / tahsilat'} onClose={onClose}>
      <div className="form-grid">
        {!invoice && (
          <Field label="Fatura (isteğe bağlı)">
            <select className="input" value={invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
              <option value="">— faturasız (maaş, SGK, vb.) —</option>
              {openInvoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNo} · {i.counterpartyName} · {fmtMoney(i.total, i.currency)}</option>)}
            </select>
          </Field>
        )}
        <Field label="Yön">
          <select className="input" value={direction} onChange={(e) => setDirection(e.target.value as Payment['direction'])} disabled={!!selected}>
            <option value="tahsilat">Tahsilat (para girişi)</option>
            <option value="odeme">Ödeme (para çıkışı)</option>
          </select>
        </Field>
        <Field label="Tutar" hint={selected ? `Kalan: ${fmtMoney(remaining, selected.currency)}` : undefined}>
          <input className="input" type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <Field label="Tarih"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Yöntem">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Karşı taraf"><input className="input" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} /></Field>
        <Field label="Not"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Ekim bordrosu" /></Field>
      </div>
      <p className="tiny" style={{ marginTop: 8 }}>Yevmiye otomatik: {direction === 'tahsilat' ? '100/102 Kasa-Banka borç, 120 Alıcılar alacak' : `${selected ? '320 Satıcılar' : '770 Genel Yönetim'} borç, 100/102 Kasa-Banka alacak`}.{selected && amount >= remaining - 0.01 ? ' Fatura "ödendi" olarak işaretlenir.' : ''}</p>
      <div className="row end" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onClose}>Vazgeç</button>
        <button className="btn primary" onClick={save} disabled={amount <= 0}>Kaydet</button>
      </div>
    </Modal>
  );
}

// ---------------- Yevmiye ----------------
function JournalTab({ journal }: { journal: JournalEntry[] }) {
  const totalDebit = journal.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.debit, 0), 0);
  const totalCredit = journal.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.credit, 0), 0);
  const unbalanced = journal.filter((e) => !isBalanced(e));
  return (
    <Card title={`Yevmiye defteri (${journal.length} kayıt)`} subtitle={`Toplam borç ${fmtMoney(totalDebit)} · toplam alacak ${fmtMoney(totalCredit)}`}>
      {unbalanced.length > 0 && <Alert tone="bad">{unbalanced.length} kayıt dengesiz (borç ≠ alacak). Lütfen kontrol edin.</Alert>}
      {Math.abs(totalDebit - totalCredit) < 0.01 && journal.length > 0 && <Alert tone="good">Defter dengede: toplam borç = toplam alacak.</Alert>}
      {journal.length === 0 ? (
        <Empty title="Yevmiye kaydı yok" hint="Fatura veya ödeme eklendiğinde kayıtlar otomatik oluşur." />
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead><tr><th>Tarih</th><th>Açıklama</th><th>Hesap</th><th className="num">Borç</th><th className="num">Alacak</th></tr></thead>
            <tbody>
              {journal.map((e) =>
                e.lines.map((l, i) => (
                  <tr key={`${e.id}-${i}`} style={i === 0 ? { borderTop: '2px solid var(--border)' } : undefined}>
                    <td>{i === 0 ? fmtDate(e.date) : ''}</td>
                    <td>{i === 0 ? <>{e.description} {e.auto && <Badge tone="info">otomatik</Badge>}{!isBalanced(e) && <Badge tone="bad">dengesiz</Badge>}</> : ''}</td>
                    <td className={l.credit > 0 ? 'muted' : ''} style={l.credit > 0 ? { paddingLeft: 32 } : undefined}>{l.account}</td>
                    <td className="num">{l.debit ? fmtMoney(l.debit) : ''}</td>
                    <td className="num">{l.credit ? fmtMoney(l.credit) : ''}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------- AI analiz ----------------
function currentAndPrevMonth(): [string, string] {
  const d = new Date();
  return [monthKey(d.getTime()), monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime())];
}

function AiTab({ invoices, payments }: { invoices: Invoice[]; payments: Payment[] }) {
  const anomalies = useMemo(() => detectAnomalies(invoices), [invoices]);
  const rec = useMemo(() => receivables(invoices, payments), [invoices, payments]);
  const pay = useMemo(() => payables(invoices, payments), [invoices, payments]);
  const months = useMemo(() => monthlySeries(invoices, payments, 6), [invoices, payments]);
  const forecast = useMemo(() => forecastMonths(months, 3), [months]);
  const invMap = new Map(invoices.map((i) => [i.id, i]));
  const [llmText, setLlmText] = useState<string | null>(null);
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmErr, setLlmErr] = useState<string | null>(null);

  const changes = useMemo(() => {
    const [thisM, prevM] = currentAndPrevMonth();
    const sum = (m: string) => {
      const map = new Map<FinanceCategory, number>();
      for (const i of invoices) if (i.type === 'alis' && i.status !== 'iptal' && monthKey(i.date) === m) map.set(i.category, (map.get(i.category) ?? 0) + i.total);
      return map;
    };
    const a = sum(thisM);
    const b = sum(prevM);
    const cats = new Set<FinanceCategory>([...a.keys(), ...b.keys()]);
    return [...cats]
      .map((c) => ({ c, now: a.get(c) ?? 0, prev: b.get(c) ?? 0 }))
      .map((x) => ({ ...x, pct: x.prev > 0 ? (x.now - x.prev) / x.prev : x.now > 0 ? 1 : 0 }))
      .sort((x, y) => y.pct - x.pct)
      .slice(0, 3);
  }, [invoices]);

  const netForecast = forecast.reduce((s, f) => s + f.net, 0);
  const riskTone = (r: string): Tone => (r === 'yuksek' ? 'bad' : r === 'orta' ? 'warn' : 'good');
  const riskLabel = (r: string) => (r === 'yuksek' ? 'Yüksek' : r === 'orta' ? 'Orta' : 'Düşük');

  const askLlm = async () => {
    setLlmBusy(true); setLlmErr(null);
    try {
      const s = await getSettings();
      if (s.llm.provider === 'none') {
        setLlmText(null);
        setLlmErr('LLM bağlı değil. Ayarlar sayfasından Ollama veya OpenAI uyumlu bir uç nokta tanımlayın; yerel analiz yine de yukarıda çalışıyor.');
        return;
      }
      const payload = {
        ozet: summarize(invoices, payments),
        aylik: months,
        tahmin: forecast,
        anomaliler: anomalies.slice(0, 6).map((a) => a.detail),
        vadesiGecenAlacak: rec.filter((r) => r.daysOverdue > 0).slice(0, 5).map((r) => ({ kim: r.invoice.counterpartyName, tutar: r.outstanding, gun: r.daysOverdue })),
        kategoriDegisim: changes.map((c) => ({ kategori: FINANCE_CATEGORIES[c.c], buAy: c.now, oncekiAy: c.prev })),
      };
      const text = await chat(
        [
          { role: 'system', content: 'Sen bir tekstil şirketinin finans asistanısın. Verilen JSON\'a dayanarak Türkçe, tam 5 maddelik, somut ve sayısal bir yönetim yorumu yaz. Uydurma; veri yoksa söyle. Sonuna tek cümle "Bu yorum mali müşavirin yerini almaz." ekle.' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        s.llm,
      );
      setLlmText(text ?? '');
    } catch (e) {
      setLlmErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLlmBusy(false);
    }
  };

  return (
    <>
      <div className="grid grid-2">
        <Card title={`Şüpheli kayıtlar (${anomalies.length})`} subtitle="Mükerrer fatura, KDV uyuşmazlığı ve karşı tarafa göre olağandışı tutarlar (sağlam z-skoru)">
          {anomalies.length === 0 ? (
            <Alert tone="good">Faturalarda şüpheli bir durum tespit edilmedi.</Alert>
          ) : (
            <table className="table">
              <thead><tr><th>Önem</th><th>Bulgu</th><th>Fatura</th></tr></thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i}>
                    <td><Badge tone={a.severity}>{a.severity === 'bad' ? 'Kritik' : 'Dikkat'}</Badge></td>
                    <td><strong>{a.title}</strong><div className="small muted">{a.detail}</div></td>
                    <td className="mono">{invMap.get(a.invoiceId)?.invoiceNo ?? a.invoiceId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Nakit akışı tahmini (3 ay)" subtitle="Son 6 ayın Holt çift üstel düzeltmesi; tek seferlik büyük kalemleri bilmez">
          <p style={{ marginBottom: 10 }}>
            Önümüzdeki 3 ayda net nakit tahmini <strong style={{ color: netForecast < 0 ? 'var(--bad)' : 'var(--good)' }}>{fmtMoney(netForecast)}</strong>.{' '}
            {netForecast < 0 ? 'Giderler geliri aşıyor; tahsilatları hızlandırmak veya ödemeleri yaymak gerekebilir.' : 'Gelir giderleri karşılıyor görünüyor.'}
          </p>
          <table className="table">
            <thead><tr><th>Ay</th><th className="num">Gelir</th><th className="num">Gider</th><th className="num">Net</th></tr></thead>
            <tbody>
              {forecast.map((f) => (
                <tr key={f.label}><td>{f.label}</td><td className="num">{fmtMoney(f.income)}</td><td className="num">{fmtMoney(f.expense)}</td><td className="num" style={{ color: f.net < 0 ? 'var(--bad)' : undefined }}>{fmtMoney(f.net)}</td></tr>
              ))}
            </tbody>
          </table>
          {changes.length > 0 && (
            <>
              <h3 style={{ margin: '14px 0 6px' }}>Bu ay en çok artan gider kategorileri</h3>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {changes.map((c) => (
                  <li key={c.c}>{FINANCE_CATEGORIES[c.c]}: {fmtMoney(c.prev)} → {fmtMoney(c.now)} ({c.pct >= 0 ? '+' : ''}{Math.round(c.pct * 100)}%)</li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card title={`Alacak riski (${rec.length})`} subtitle="Vadeye göre: 30+ gün yüksek, 1-30 gün orta">
          {rec.length === 0 ? <Empty title="Açık alacak yok" /> : (
            <table className="table">
              <thead><tr><th>Müşteri</th><th className="num">Kalan</th><th>Vade</th><th>Risk</th></tr></thead>
              <tbody>
                {rec.map((r) => (
                  <tr key={r.invoice.id}>
                    <td>{r.invoice.counterpartyName}<div className="tiny mono">{r.invoice.invoiceNo}</div></td>
                    <td className="num">{fmtMoney(r.outstanding, r.invoice.currency)}</td>
                    <td>{r.daysOverdue > 0 ? <span style={{ color: 'var(--bad)' }}>{r.daysOverdue} gün geçti</span> : <span className="muted">{-r.daysOverdue} gün kaldı</span>}</td>
                    <td><Badge tone={riskTone(r.risk)}>{riskLabel(r.risk)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title={`Ödeme takvimi (${pay.length})`} subtitle="Açık tedarikçi faturaları">
          {pay.length === 0 ? <Empty title="Açık borç yok" /> : (
            <table className="table">
              <thead><tr><th>Tedarikçi</th><th className="num">Kalan</th><th>Vade</th><th>Risk</th></tr></thead>
              <tbody>
                {pay.map((r) => (
                  <tr key={r.invoice.id}>
                    <td>{r.invoice.counterpartyName}<div className="tiny mono">{r.invoice.invoiceNo}</div></td>
                    <td className="num">{fmtMoney(r.outstanding, r.invoice.currency)}</td>
                    <td>{r.daysOverdue > 0 ? <span style={{ color: 'var(--bad)' }}>{r.daysOverdue} gün geçti</span> : <span className="muted">{fmtDate(r.invoice.dueDate)}</span>}</td>
                    <td><Badge tone={riskTone(r.risk)}>{riskLabel(r.risk)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="card" title="Yönetim yorumu (LLM)" subtitle="Ayarlar'da bağlı modele özet veriyi gönderir; 5 maddelik Türkçe yorum döner" actions={<button className="btn primary sm" onClick={askLlm} disabled={llmBusy}>{llmBusy ? 'Yorum alınıyor…' : 'LLM yorumu al'}</button>}>
        {llmErr && <Alert tone="warn">{llmErr} <Link to="/ayarlar">Ayarlar →</Link></Alert>}
        {llmText && <div className="msg ai" style={{ maxWidth: '100%', marginTop: 8 }}>{llmText}</div>}
        {!llmText && !llmErr && <p className="muted small">Henüz yorum alınmadı. LLM bağlı değilse yukarıdaki yerel analizler yine de çalışır.</p>}
        <p className="tiny" style={{ marginTop: 12 }}>Bu analizler karar desteği amaçlıdır; mali müşavirin veya yetkili muhasebecinin yerini almaz.</p>
      </Card>
    </>
  );
}
