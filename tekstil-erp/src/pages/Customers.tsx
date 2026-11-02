import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { receivables } from '../ai/finance';
import { Badge, Card, Empty, Field, Modal, PageHead, Stat, confirmDelete } from '../components/ui';
import { db } from '../db';
import type { Customer, CustomerSegment } from '../db/schema';
import { CUSTOMER_SEGMENTS, ORDER_STATUS } from '../db/schema';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { uid } from '../lib/id';

const empty: Omit<Customer, 'id' | 'createdAt'> = { name: '', segment: 'toptan', country: 'Türkiye' };

export default function Customers() {
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), []) ?? [];
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<CustomerSegment | 'hepsi'>('hepsi');
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);

  const rec = useMemo(() => receivables(invoices, payments), [invoices, payments]);
  const outstandingBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rec) if (r.invoice.customerId) m.set(r.invoice.customerId, (m.get(r.invoice.customerId) ?? 0) + r.outstanding);
    return m;
  }, [rec]);
  const revenueBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of invoices) if (i.type === 'satis' && i.customerId && i.status !== 'iptal') m.set(i.customerId, (m.get(i.customerId) ?? 0) + i.total);
    return m;
  }, [invoices]);

  const list = customers.filter((c) => {
    const t = `${c.name} ${c.city ?? ''} ${c.taxNo ?? ''}`.toLocaleLowerCase('tr-TR');
    return (segment === 'hepsi' || c.segment === segment) && t.includes(q.toLocaleLowerCase('tr-TR'));
  });

  async function save() {
    if (!editing?.name?.trim()) return;
    const row: Customer = {
      ...empty,
      ...editing,
      id: editing.id ?? uid('c'),
      name: editing.name.trim(),
      createdAt: editing.createdAt ?? Date.now(),
    } as Customer;
    await db.customers.put(row);
    setEditing(null);
  }

  async function remove(c: Customer) {
    if (!confirmDelete(`${c.name} müşterisi`)) return;
    await db.customers.delete(c.id);
    setSelected(null);
  }

  const selOrders = selected ? orders.filter((o) => o.customerId === selected.id).sort((a, b) => b.orderDate - a.orderDate) : [];
  const selInvoices = selected ? invoices.filter((i) => i.customerId === selected.id).sort((a, b) => b.date - a.date) : [];

  return (
    <>
      <PageHead
        title="Müşteriler"
        subtitle="Toptan, perakende ve ihracat müşterileri; cari bakiye ve sipariş geçmişi"
        actions={
          <button className="btn primary" onClick={() => setEditing({ ...empty })}>
            + Yeni müşteri
          </button>
        }
      />
      <div className="grid grid-3">
        <Stat label="Müşteri" value={fmtNum(customers.length)} />
        <Stat label="Toplam açık alacak" value={fmtMoney([...outstandingBy.values()].reduce((s, v) => s + v, 0))} />
        <Stat label="Vadesi geçen müşteri" value={fmtNum(new Set(rec.filter((r) => r.daysOverdue > 0).map((r) => r.invoice.customerId)).size)} />
      </div>

      <Card className="" title="Liste" actions={<input className="input" placeholder="Ara: ad, şehir, VKN" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />}>
        <div className="chips" style={{ marginBottom: 12 }}>
          {(['hepsi', 'toptan', 'perakende', 'ihracat'] as const).map((s) => (
            <button key={s} className={`chip ${segment === s ? 'active' : ''}`} onClick={() => setSegment(s)}>
              {s === 'hepsi' ? 'Hepsi' : CUSTOMER_SEGMENTS[s]}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty title="Müşteri bulunamadı" hint="Arama ölçütlerini değiştirin veya yeni müşteri ekleyin." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Müşteri</th>
                  <th>Segment</th>
                  <th>Şehir</th>
                  <th className="num">Toplam satış</th>
                  <th className="num">Açık alacak</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => setSelected(c)}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="tiny">{c.taxNo ? `VKN ${c.taxNo}` : ''}</div>
                    </td>
                    <td>
                      <Badge tone={c.segment === 'ihracat' ? 'info' : 'neutral'}>{CUSTOMER_SEGMENTS[c.segment]}</Badge>
                    </td>
                    <td>{[c.city, c.country].filter(Boolean).join(', ')}</td>
                    <td className="num">{fmtMoney(revenueBy.get(c.id) ?? 0)}</td>
                    <td className="num" style={{ color: (outstandingBy.get(c.id) ?? 0) > 0 ? 'var(--warn)' : undefined }}>{fmtMoney(outstandingBy.get(c.id) ?? 0)}</td>
                    <td className="num">
                      <button className="btn sm" onClick={(e) => { e.stopPropagation(); setEditing(c); }}>
                        Düzenle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!editing} title={editing?.id ? 'Müşteriyi düzenle' : 'Yeni müşteri'} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <div className="form-grid">
              <Field label="Unvan *"><input className="input" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="Segment">
                <select className="input" value={editing.segment ?? 'toptan'} onChange={(e) => setEditing({ ...editing, segment: e.target.value as CustomerSegment })}>
                  {Object.entries(CUSTOMER_SEGMENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="VKN / TCKN"><input className="input" value={editing.taxNo ?? ''} onChange={(e) => setEditing({ ...editing, taxNo: e.target.value })} /></Field>
              <Field label="Vergi dairesi"><input className="input" value={editing.taxOffice ?? ''} onChange={(e) => setEditing({ ...editing, taxOffice: e.target.value })} /></Field>
              <Field label="Telefon"><input className="input" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></Field>
              <Field label="E-posta"><input className="input" type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></Field>
              <Field label="Şehir"><input className="input" value={editing.city ?? ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} /></Field>
              <Field label="Ülke"><input className="input" value={editing.country ?? ''} onChange={(e) => setEditing({ ...editing, country: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Adres"><textarea className="input" value={editing.address ?? ''} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="Notlar"><textarea className="input" value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field>
            </div>
            <div className="row end" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setEditing(null)}>Vazgeç</button>
              <button type="submit" className="btn primary">Kaydet</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!selected} title={selected?.name ?? ''} onClose={() => setSelected(null)} wide>
        {selected && (
          <>
            <div className="grid grid-3">
              <Stat label="Toplam satış" value={fmtMoney(revenueBy.get(selected.id) ?? 0)} />
              <Stat label="Açık alacak" value={fmtMoney(outstandingBy.get(selected.id) ?? 0)} />
              <Stat label="Sipariş" value={fmtNum(selOrders.length)} />
            </div>
            <dl className="kv" style={{ marginTop: 16 }}>
              <dt>Segment</dt><dd>{CUSTOMER_SEGMENTS[selected.segment]}</dd>
              <dt>VKN</dt><dd>{selected.taxNo ?? '—'} {selected.taxOffice ? `· ${selected.taxOffice}` : ''}</dd>
              <dt>İletişim</dt><dd>{[selected.phone, selected.email].filter(Boolean).join(' · ') || '—'}</dd>
              <dt>Adres</dt><dd>{[selected.address, selected.city, selected.country].filter(Boolean).join(', ') || '—'}</dd>
              {selected.notes && (<><dt>Notlar</dt><dd>{selected.notes}</dd></>)}
            </dl>
            <hr className="sep" />
            <h3>Siparişler</h3>
            {selOrders.length === 0 ? <p className="muted small">Sipariş yok.</p> : (
              <table className="table">
                <tbody>
                  {selOrders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.orderNo}</td>
                      <td>{fmtDate(o.orderDate)}</td>
                      <td><Badge>{ORDER_STATUS[o.status]}</Badge></td>
                      <td className="num">{fmtMoney(o.total, o.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3 style={{ marginTop: 16 }}>Faturalar</h3>
            {selInvoices.length === 0 ? <p className="muted small">Fatura yok.</p> : (
              <table className="table">
                <tbody>
                  {selInvoices.map((i) => (
                    <tr key={i.id}>
                      <td>{i.invoiceNo}</td>
                      <td>{fmtDate(i.date)}</td>
                      <td><Badge tone={i.status === 'odendi' ? 'good' : i.status === 'gecikti' ? 'bad' : 'neutral'}>{i.status}</Badge></td>
                      <td className="num">{fmtMoney(i.total, i.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="row end" style={{ marginTop: 16 }}>
              <button className="btn danger" onClick={() => void remove(selected)}>Sil</button>
              <button className="btn" onClick={() => { setEditing(selected); setSelected(null); }}>Düzenle</button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
