import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { postInvoiceJournal } from '../ai/finance';
import { Badge, Card, Empty, Field, Modal, PageHead, Stat, confirmDelete } from '../components/ui';
import { db } from '../db';
import type { Currency, Invoice, Order, OrderLine, OrderStatus, ProductionOrder } from '../db/schema';
import { ORDER_STATUS } from '../db/schema';
import { fmtDate, fmtMoney, fmtNum, fromInputDate, toInputDate } from '../lib/format';
import { docNo, uid } from '../lib/id';

const DAY = 86_400_000;
const EMPTY: never[] = [];
const statusTone: Record<OrderStatus, 'good' | 'warn' | 'bad' | 'info' | 'neutral'> = {
  teklif: 'neutral',
  onaylandi: 'info',
  uretimde: 'warn',
  sevk: 'info',
  tamamlandi: 'good',
  iptal: 'bad',
};
const FLOW: OrderStatus[] = ['teklif', 'onaylandi', 'uretimde', 'sevk', 'tamamlandi'];

type Draft = Omit<Order, 'id' | 'total'> & { id?: string };

export default function Orders() {
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? EMPTY;
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? EMPTY;
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), []) ?? EMPTY;
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? EMPTY;
  const [filter, setFilter] = useState<OrderStatus | 'acik' | 'hepsi'>('acik');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [now] = useState(() => Date.now());

  const cName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const pName = (id: string) => products.find((p) => p.id === id)?.name ?? '—';
  const pUnit = (id: string) => products.find((p) => p.id === id)?.unit ?? '';

  const list = useMemo(
    () =>
      orders
        .filter((o) => (filter === 'hepsi' ? true : filter === 'acik' ? !['tamamlandi', 'iptal'].includes(o.status) : o.status === filter))
        .sort((a, b) => b.orderDate - a.orderDate),
    [orders, filter],
  );
  const open = orders.filter((o) => !['tamamlandi', 'iptal'].includes(o.status));
  const late = open.filter((o) => o.dueDate < now);
  const invoiced = new Set(invoices.filter((i) => i.source === 'siparis').map((i) => i.sourceDocumentId));

  function newDraft(): Draft {
    return {
      orderNo: docNo('SIP', orders.length + 1),
      customerId: customers[0]?.id ?? '',
      lines: [{ productId: products[0]?.id ?? '', quantity: 1, unitPrice: products[0]?.price ?? 0 }],
      status: 'teklif',
      orderDate: Date.now(),
      dueDate: Date.now() + 21 * DAY,
      currency: 'TRY',
    };
  }

  const total = (lines: OrderLine[]) => lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  async function save() {
    if (!draft || !draft.customerId || draft.lines.length === 0) return;
    const row: Order = { ...draft, id: draft.id ?? uid('o'), total: total(draft.lines) };
    await db.orders.put(row);
    setDraft(null);
  }

  async function setStatus(o: Order, status: OrderStatus) {
    await db.orders.update(o.id, { status });
    setSelected({ ...o, status });
  }

  async function createProduction(o: Order) {
    const rows: ProductionOrder[] = o.lines.map((l, i) => ({
      id: uid('po'),
      orderNo: `UR-${o.orderNo.replace('SIP-', '')}-${i + 1}`,
      productId: l.productId,
      quantity: l.quantity,
      stage: 'kesim',
      stageHistory: [],
      dueDate: o.dueDate - 2 * DAY,
      customerOrderId: o.id,
      status: 'planlandi',
      createdAt: Date.now(),
    }));
    await db.productionOrders.bulkAdd(rows);
    await setStatus(o, 'uretimde');
  }

  async function createInvoice(o: Order) {
    const customer = customers.find((c) => c.id === o.customerId);
    const vat = o.currency === 'TRY' ? 10 : 0; // tekstil ürünleri KDV %10; ihracat istisna
    const lines = o.lines.map((l) => ({ description: pName(l.productId), quantity: l.quantity, unitPrice: l.unitPrice, vatRate: vat }));
    const subtotal = total(o.lines);
    const vatTotal = lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.vatRate) / 100, 0);
    const inv: Invoice = {
      id: uid('f'),
      invoiceNo: `TKS${new Date().getFullYear()}${String(invoices.length + 1).padStart(9, '0')}`,
      type: 'satis',
      counterpartyName: customer?.name ?? cName(o.customerId),
      counterpartyTaxNo: customer?.taxNo,
      customerId: o.customerId,
      date: Date.now(),
      dueDate: Date.now() + 30 * DAY,
      lines,
      subtotal,
      vatTotal,
      total: subtotal + vatTotal,
      currency: o.currency,
      status: 'kesildi',
      category: 'satis-geliri',
      source: 'siparis',
      sourceDocumentId: o.id,
      createdAt: Date.now(),
    };
    await db.transaction('rw', db.invoices, db.journal, async () => {
      await db.invoices.add(inv);
      await db.journal.put(postInvoiceJournal(inv));
    });
    if (o.status === 'sevk') await setStatus(o, 'tamamlandi');
  }

  async function remove(o: Order) {
    if (!confirmDelete(`${o.orderNo} siparişi`)) return;
    await db.orders.delete(o.id);
    setSelected(null);
  }

  return (
    <>
      <PageHead
        title="Siparişler"
        subtitle="Teklif → onay → üretim → sevk → fatura akışı"
        actions={
          <button className="btn primary" disabled={!customers.length || !products.length} onClick={() => setDraft(newDraft())}>
            + Yeni sipariş
          </button>
        }
      />
      <div className="grid grid-4">
        <Stat label="Açık sipariş" value={fmtNum(open.length)} />
        <Stat label="Açık tutar (TRY)" value={fmtMoney(open.filter((o) => o.currency === 'TRY').reduce((s, o) => s + o.total, 0))} />
        <Stat label="Termini geçen" value={fmtNum(late.length)} trend={late.length ? 'down' : 'flat'} />
        <Stat label="Bu ay tamamlanan" value={fmtNum(orders.filter((o) => o.status === 'tamamlandi' && o.dueDate > now - 30 * DAY).length)} />
      </div>

      <Card title="Sipariş listesi">
        <div className="chips" style={{ marginBottom: 12 }}>
          {(['acik', 'hepsi', ...FLOW, 'iptal'] as const).map((s) => (
            <button key={s} className={`chip ${filter === s ? 'active' : ''}`} onClick={() => setFilter(s)}>
              {s === 'acik' ? 'Açık' : s === 'hepsi' ? 'Hepsi' : ORDER_STATUS[s]}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty title="Sipariş yok" hint="Yeni sipariş oluşturun." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Sipariş</th>
                  <th>Müşteri</th>
                  <th>Tarih</th>
                  <th>Termin</th>
                  <th>Durum</th>
                  <th className="num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => setSelected(o)}>
                    <td>
                      <strong>{o.orderNo}</strong>
                      <div className="tiny">{o.lines.length} kalem</div>
                    </td>
                    <td>{cName(o.customerId)}</td>
                    <td>{fmtDate(o.orderDate)}</td>
                    <td>
                      {fmtDate(o.dueDate)} {o.dueDate < now && !['tamamlandi', 'iptal'].includes(o.status) && <Badge tone="bad">geçti</Badge>}
                    </td>
                    <td>
                      <Badge tone={statusTone[o.status]}>{ORDER_STATUS[o.status]}</Badge>
                    </td>
                    <td className="num">{fmtMoney(o.total, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!draft} title={draft?.id ? 'Siparişi düzenle' : 'Yeni sipariş'} onClose={() => setDraft(null)} wide>
        {draft && (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="form-grid">
              <Field label="Sipariş no"><input className="input" value={draft.orderNo} onChange={(e) => setDraft({ ...draft, orderNo: e.target.value })} /></Field>
              <Field label="Müşteri">
                <select className="input" value={draft.customerId} onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Sipariş tarihi"><input className="input" type="date" value={toInputDate(draft.orderDate)} onChange={(e) => setDraft({ ...draft, orderDate: fromInputDate(e.target.value) })} /></Field>
              <Field label="Termin"><input className="input" type="date" value={toInputDate(draft.dueDate)} onChange={(e) => setDraft({ ...draft, dueDate: fromInputDate(e.target.value) })} /></Field>
              <Field label="Para birimi">
                <select className="input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as Currency })}>
                  <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label="Durum">
                <select className="input" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as OrderStatus })}>
                  {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <h3 style={{ margin: '16px 0 8px' }}>Kalemler</h3>
            <table className="table">
              <thead>
                <tr><th>Ürün</th><th style={{ width: 120 }}>Miktar</th><th style={{ width: 140 }}>Birim fiyat</th><th className="num">Tutar</th><th></th></tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select className="input" value={l.productId} onChange={(e) => {
                        const p = products.find((x) => x.id === e.target.value);
                        const lines = [...draft.lines];
                        lines[i] = { ...l, productId: e.target.value, unitPrice: p?.price ?? l.unitPrice };
                        setDraft({ ...draft, lines });
                      }}>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                      </select>
                    </td>
                    <td><input className="input" type="number" min={0} step="any" value={l.quantity} onChange={(e) => { const lines = [...draft.lines]; lines[i] = { ...l, quantity: Number(e.target.value) }; setDraft({ ...draft, lines }); }} /></td>
                    <td><input className="input" type="number" min={0} step="any" value={l.unitPrice} onChange={(e) => { const lines = [...draft.lines]; lines[i] = { ...l, unitPrice: Number(e.target.value) }; setDraft({ ...draft, lines }); }} /></td>
                    <td className="num">{fmtMoney(l.quantity * l.unitPrice, draft.currency)}</td>
                    <td><button type="button" className="btn sm ghost" aria-label="Kalemi sil" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row between" style={{ marginTop: 10 }}>
              <button type="button" className="btn sm" onClick={() => setDraft({ ...draft, lines: [...draft.lines, { productId: products[0]?.id ?? '', quantity: 1, unitPrice: products[0]?.price ?? 0 }] })}>+ Kalem ekle</button>
              <strong>Toplam: {fmtMoney(total(draft.lines), draft.currency)}</strong>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Not"><textarea className="input" value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
            </div>
            <div className="row end" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setDraft(null)}>Vazgeç</button>
              <button type="submit" className="btn primary">Kaydet</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!selected} title={selected ? `${selected.orderNo} · ${cName(selected.customerId)}` : ''} onClose={() => setSelected(null)} wide>
        {selected && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <Badge tone={statusTone[selected.status]}>{ORDER_STATUS[selected.status]}</Badge>
              <span className="muted small">Sipariş {fmtDate(selected.orderDate)} · Termin {fmtDate(selected.dueDate)}</span>
            </div>
            <table className="table">
              <thead><tr><th>Ürün</th><th className="num">Miktar</th><th className="num">Birim fiyat</th><th className="num">Tutar</th></tr></thead>
              <tbody>
                {selected.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{pName(l.productId)}</td>
                    <td className="num">{fmtNum(l.quantity, 2)} {pUnit(l.productId)}</td>
                    <td className="num">{fmtMoney(l.unitPrice, selected.currency)}</td>
                    <td className="num">{fmtMoney(l.quantity * l.unitPrice, selected.currency)}</td>
                  </tr>
                ))}
                <tr><td colSpan={3} className="num"><strong>Toplam</strong></td><td className="num"><strong>{fmtMoney(selected.total, selected.currency)}</strong></td></tr>
              </tbody>
            </table>
            {selected.note && <p className="muted small" style={{ marginTop: 8 }}>{selected.note}</p>}
            <hr className="sep" />
            <div className="row between">
              <div className="row">
                {FLOW.indexOf(selected.status) >= 0 && FLOW.indexOf(selected.status) < FLOW.length - 1 && (
                  <button className="btn primary" onClick={() => void setStatus(selected, FLOW[FLOW.indexOf(selected.status) + 1])}>
                    İleri: {ORDER_STATUS[FLOW[FLOW.indexOf(selected.status) + 1]]} ►
                  </button>
                )}
                {['onaylandi', 'teklif'].includes(selected.status) && (
                  <button className="btn" onClick={() => void createProduction(selected)}>Üretim emri oluştur</button>
                )}
                {!invoiced.has(selected.id) && !['teklif', 'iptal'].includes(selected.status) && (
                  <button className="btn" onClick={() => void createInvoice(selected)}>Satış faturası kes</button>
                )}
                {invoiced.has(selected.id) && <Badge tone="good">Faturalandı</Badge>}
              </div>
              <div className="row">
                {selected.status !== 'iptal' && <button className="btn" onClick={() => void setStatus(selected, 'iptal')}>İptal et</button>}
                <button className="btn" onClick={() => { setDraft({ ...selected }); setSelected(null); }}>Düzenle</button>
                <button className="btn danger" onClick={() => void remove(selected)}>Sil</button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
