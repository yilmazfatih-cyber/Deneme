import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Empty, Field, Modal, PageHead, Stat, Tabs, confirmDelete } from '../components/ui';
import { db } from '../db';
import {
  PRODUCTION_STAGES,
  PRODUCTION_STATUS,
  UNITS,
  type Customer,
  type Order,
  type Product,
  type ProductionOrder,
  type ProductionStage,
  type ProductionStatus,
} from '../db/schema';
import { fmtDate, fmtNum, fromInputDate, toInputDate } from '../lib/format';
import { uid } from '../lib/id';
import { addMovement } from '../lib/stock';

const DAY = 86_400_000;
const NO_PO: ProductionOrder[] = [];
const NO_PRODUCTS: Product[] = [];
const NO_ORDERS: Order[] = [];
const NO_CUSTOMERS: Customer[] = [];
const stageIndex = (s: ProductionStage) => PRODUCTION_STAGES.findIndex((x) => x.key === s);
const stageLabel = (s: ProductionStage) => PRODUCTION_STAGES.find((x) => x.key === s)?.label ?? s;
const statusTone = (s: ProductionStatus) => (s === 'tamamlandi' ? 'good' : s === 'devam' ? 'info' : s === 'iptal' ? 'bad' : 'neutral');

type Draft = { productId: string; quantity: number; dueDate: string; stage: ProductionStage; customerOrderId: string };

export default function Production() {
  const orders = useLiveQuery(() => db.productionOrders.toArray(), []) ?? NO_PO;
  const products = useLiveQuery(() => db.products.toArray(), []) ?? NO_PRODUCTS;
  const customerOrders = useLiveQuery(() => db.orders.toArray(), []) ?? NO_ORDERS;
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? NO_CUSTOMERS;
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const customerName = (orderId?: string) => {
    const o = customerOrders.find((x) => x.id === orderId);
    return o ? `${o.orderNo} · ${customers.find((c) => c.id === o.customerId)?.name ?? ''}` : '';
  };

  const [view, setView] = useState<'kanban' | 'liste'>('kanban');
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | 'acik' | 'tumu'>('acik');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    const list = orders.filter((o) => (statusFilter === 'tumu' ? true : statusFilter === 'acik' ? o.status === 'planlandi' || o.status === 'devam' : o.status === statusFilter));
    return list.sort((a, b) => a.dueDate - b.dueDate);
  }, [orders, statusFilter]);

  const stats = useMemo(() => {
    const open = orders.filter((o) => o.status === 'planlandi' || o.status === 'devam');
    return {
      open: open.length,
      late: open.filter((o) => o.dueDate < now).length,
      thisWeek: open.filter((o) => o.dueDate >= now && o.dueDate <= now + 7 * DAY).length,
      done30: orders.filter((o) => o.status === 'tamamlandi' && (o.stageHistory.at(-1)?.at ?? 0) >= now - 30 * DAY).length,
    };
  }, [orders, now]);

  const moveStage = async (o: ProductionOrder, dir: 1 | -1) => {
    const idx = stageIndex(o.stage);
    const next = PRODUCTION_STAGES[idx + dir];
    if (!next) return;
    const patch: Partial<ProductionOrder> = {
      stage: next.key,
      stageHistory: [...o.stageHistory, { stage: next.key, at: Date.now(), note: dir === -1 ? 'Geri alındı' : undefined }],
    };
    if (o.status === 'planlandi' && dir === 1) patch.status = 'devam';
    if (next.key === 'sevkiyat' && o.status !== 'tamamlandi') {
      patch.status = 'tamamlandi';
      const already = await db.movements.where('productId').equals(o.productId).filter((m) => m.refType === 'uretim' && m.refId === o.id).first();
      if (!already) {
        await addMovement({ productId: o.productId, type: 'giris', quantity: o.quantity, toLocation: 'Sevkiyat deposu', refType: 'uretim', refId: o.id, note: `Üretim emri ${o.orderNo} tamamlandı` });
      }
    }
    if (dir === -1 && o.status === 'tamamlandi') patch.status = 'devam';
    await db.productionOrders.update(o.id, patch);
  };

  const setStatus = (o: ProductionOrder, status: ProductionStatus) => db.productionOrders.update(o.id, { status });
  const remove = async (o: ProductionOrder) => {
    if (!confirmDelete(`${o.orderNo} üretim emri`)) return;
    await db.productionOrders.delete(o.id);
  };

  const openNew = () => {
    setDraft({ productId: products[0]?.id ?? '', quantity: 0, dueDate: toInputDate(now + 14 * DAY), stage: 'kesim', customerOrderId: '' });
    setError('');
  };
  const save = async () => {
    if (!draft) return;
    if (!draft.productId) return setError('Ürün seçin.');
    if (draft.quantity <= 0) return setError('Miktar sıfırdan büyük olmalı.');
    const seq = orders.length + 1;
    await db.productionOrders.add({
      id: uid('po'),
      orderNo: `UR-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`,
      productId: draft.productId,
      quantity: draft.quantity,
      stage: draft.stage,
      stageHistory: [{ stage: draft.stage, at: Date.now(), note: 'Emir açıldı' }],
      dueDate: fromInputDate(draft.dueDate),
      customerOrderId: draft.customerOrderId || undefined,
      status: 'planlandi',
      createdAt: Date.now(),
    });
    setDraft(null);
  };

  const OrderCard = ({ o }: { o: ProductionOrder }) => {
    const p = productMap.get(o.productId);
    const late = o.status !== 'tamamlandi' && o.status !== 'iptal' && o.dueDate < now;
    const idx = stageIndex(o.stage);
    return (
      <div className="kanban-card">
        <div className="row between" style={{ marginBottom: 4 }}>
          <strong className="mono">{o.orderNo}</strong>
          {late ? <Badge tone="bad">Gecikti</Badge> : <Badge tone={statusTone(o.status)}>{PRODUCTION_STATUS[o.status]}</Badge>}
        </div>
        <div>{p ? <Link to={`/urunler/${p.id}`}>{p.name}</Link> : <span className="muted">Ürün silinmiş</span>}</div>
        <div className="tiny" style={{ margin: '4px 0' }}>
          {fmtNum(o.quantity, 1)} {p ? UNITS[p.unit] : ''} · Termin {fmtDate(o.dueDate)}
          {o.customerOrderId && <div>{customerName(o.customerOrderId)}</div>}
        </div>
        {o.status !== 'iptal' && (
          <div className="row between" style={{ marginTop: 8 }}>
            <button className="btn sm" disabled={idx <= 0} onClick={() => moveStage(o, -1)} aria-label="Önceki aşama">
              ◄ Geri
            </button>
            <button className="btn sm primary" disabled={idx >= PRODUCTION_STAGES.length - 1} onClick={() => moveStage(o, 1)} aria-label="Sonraki aşama">
              İleri ►
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <PageHead
        title="Üretim takibi"
        subtitle="İplikten sevkiyata her emir aşama aşama izlenir; sevkiyata ulaşan emir stoğa otomatik girer."
        actions={
          <button className="btn primary" onClick={openNew} disabled={products.length === 0}>
            + Üretim emri
          </button>
        }
      />

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Açık emir" value={fmtNum(stats.open)} />
        <Stat label="Geciken" value={fmtNum(stats.late)} delta={stats.late ? 'Termini geçmiş emir var' : 'Gecikme yok'} trend={stats.late ? 'down' : 'up'} />
        <Stat label="Bu hafta termin" value={fmtNum(stats.thisWeek)} />
        <Stat label="Tamamlanan (30 gün)" value={fmtNum(stats.done30)} />
      </div>

      <Card>
        <div className="row between" style={{ marginBottom: 8 }}>
          <Tabs tabs={[{ key: 'kanban', label: 'Aşama panosu' }, { key: 'liste', label: 'Liste' }]} value={view} onChange={setView} />
          <div className="chips">
            {(
              [
                ['acik', 'Açık'],
                ['tumu', 'Tümü'],
                ['planlandi', PRODUCTION_STATUS.planlandi],
                ['devam', PRODUCTION_STATUS.devam],
                ['tamamlandi', PRODUCTION_STATUS.tamamlandi],
                ['iptal', PRODUCTION_STATUS.iptal],
              ] as [typeof statusFilter, string][]
            ).map(([k, label]) => (
              <button key={k} className={`chip ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <Empty title="Gösterilecek üretim emri yok" hint="Filtreyi değiştirin veya yeni emir açın." />
        ) : view === 'kanban' ? (
          <div className="pipeline">
            {PRODUCTION_STAGES.map((s) => {
              const items = visible.filter((o) => o.stage === s.key);
              return (
                <div className="col" key={s.key}>
                  <h3>
                    <span>{s.label}</span>
                    <span>{items.length}</span>
                  </h3>
                  {items.map((o) => (
                    <OrderCard key={o.id} o={o} />
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Emir no</th>
                  <th>Ürün</th>
                  <th className="num">Miktar</th>
                  <th>Aşama</th>
                  <th>İlerleme</th>
                  <th>Termin</th>
                  <th>Durum</th>
                  <th>Müşteri siparişi</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => {
                  const p = productMap.get(o.productId);
                  const late = o.status !== 'tamamlandi' && o.status !== 'iptal' && o.dueDate < now;
                  const idx = stageIndex(o.stage);
                  const pct = Math.round(((idx + 1) / PRODUCTION_STAGES.length) * 100);
                  return (
                    <tr key={o.id}>
                      <td className="mono">{o.orderNo}</td>
                      <td>{p ? <Link to={`/urunler/${p.id}`}>{p.name}</Link> : '—'}</td>
                      <td className="num">
                        {fmtNum(o.quantity, 1)} {p ? UNITS[p.unit] : ''}
                      </td>
                      <td>{stageLabel(o.stage)}</td>
                      <td style={{ minWidth: 120 }}>
                        <div className="progress" title={`%${pct}`}>
                          <span style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td style={{ color: late ? 'var(--bad)' : undefined }}>{fmtDate(o.dueDate)}</td>
                      <td>
                        <select className="input" style={{ minHeight: 32, padding: '2px 8px', fontSize: 13, width: 'auto' }} value={o.status} onChange={(e) => setStatus(o, e.target.value as ProductionStatus)} aria-label="Durum">
                          {(Object.keys(PRODUCTION_STATUS) as ProductionStatus[]).map((k) => (
                            <option key={k} value={k}>
                              {PRODUCTION_STATUS[k]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="small muted">{customerName(o.customerOrderId) || '—'}</td>
                      <td>
                        <div className="row end">
                          <button className="btn sm" disabled={idx <= 0 || o.status === 'iptal'} onClick={() => moveStage(o, -1)}>
                            ◄
                          </button>
                          <button className="btn sm" disabled={idx >= PRODUCTION_STAGES.length - 1 || o.status === 'iptal'} onClick={() => moveStage(o, 1)}>
                            ►
                          </button>
                          <button className="btn sm danger" onClick={() => remove(o)}>
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!draft} title="Yeni üretim emri" onClose={() => setDraft(null)}>
        {draft && (
          <div className="grid" style={{ gap: 14 }}>
            <div className="form-grid">
              <Field label="Ürün *">
                <select className="input" value={draft.productId} onChange={(e) => setDraft({ ...draft, productId: e.target.value })}>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Miktar${draft.productId ? ` (${UNITS[productMap.get(draft.productId)?.unit ?? 'adet']})` : ''} *`}>
                <input className="input" type="number" min={0} step="0.1" value={draft.quantity || ''} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} />
              </Field>
              <Field label="Termin tarihi">
                <input className="input" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
              </Field>
              <Field label="Başlangıç aşaması">
                <select className="input" value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value as ProductionStage })}>
                  {PRODUCTION_STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Müşteri siparişi (isteğe bağlı)">
                <select className="input" value={draft.customerOrderId} onChange={(e) => setDraft({ ...draft, customerOrderId: e.target.value })}>
                  <option value="">Bağlı sipariş yok</option>
                  {customerOrders
                    .filter((o) => o.status !== 'iptal' && o.status !== 'tamamlandi')
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.orderNo} — {customers.find((c) => c.id === o.customerId)?.name ?? ''}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            {error && <div className="alert bad">{error}</div>}
            <div className="row end">
              <button className="btn" onClick={() => setDraft(null)}>
                Vazgeç
              </button>
              <button className="btn primary" onClick={save}>
                Emri aç
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
