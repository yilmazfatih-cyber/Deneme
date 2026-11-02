import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { detectAnomalies, monthlySeries, summarize } from '../ai/finance';
import { GRID, axisProps, tooltipStyle } from '../charts/theme';
import { Badge, Card, PageHead, Stat } from '../components/ui';
import { db } from '../db';
import { PRODUCTION_STAGES } from '../db/schema';
import { fmtDate, fmtMoney, fmtNum } from '../lib/format';
import { lowStock, stockFromMovements } from '../lib/stock';

const DAY = 86_400_000;
const EMPTY: never[] = [];

export default function Dashboard() {
  const [now] = useState(() => Date.now());
  const products = useLiveQuery(() => db.products.toArray(), []) ?? EMPTY;
  const movements = useLiveQuery(() => db.movements.toArray(), []) ?? EMPTY;
  const orders = useLiveQuery(() => db.orders.toArray(), []) ?? EMPTY;
  const invoices = useLiveQuery(() => db.invoices.toArray(), []) ?? EMPTY;
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? EMPTY;
  const production = useLiveQuery(() => db.productionOrders.toArray(), []) ?? EMPTY;
  const customers = useLiveQuery(() => db.customers.toArray(), []) ?? EMPTY;
  const samples = useLiveQuery(() => db.visitorSamples.where('at').above(now - 7 * DAY).toArray(), [now]) ?? EMPTY;
  const [tableView, setTableView] = useState(false);

  const levels = useMemo(() => stockFromMovements(movements), [movements]);
  const stockValue = useMemo(() => products.reduce((s, p) => s + (levels.get(p.id) ?? 0) * p.cost, 0), [products, levels]);
  const low = useMemo(() => lowStock(products, levels), [products, levels]);
  const fin = useMemo(() => summarize(invoices, payments), [invoices, payments]);
  const series = useMemo(() => monthlySeries(invoices, payments, 6), [invoices, payments]);
  const anomalies = useMemo(() => detectAnomalies(invoices), [invoices]);
  const openOrders = orders.filter((o) => !['tamamlandi', 'iptal'].includes(o.status));
  const openProduction = production.filter((p) => p.status === 'devam' || p.status === 'planlandi');
  const lateProduction = openProduction.filter((p) => p.dueDate < now);
  const visitors = samples.reduce((s, v) => s + v.entries, 0);
  const customerName = (id: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? '—';

  const stageCounts = PRODUCTION_STAGES.map((s) => ({
    label: s.label,
    count: openProduction.filter((p) => p.stage === s.key).length,
  })).filter((s) => s.count > 0);

  return (
    <>
      <PageHead title="Gösterge paneli" subtitle="Üretim, stok, satış ve finansın tek bakışta özeti. Tüm veriler bu cihazda." />

      <div className="grid grid-4">
        <Stat label="Stok değeri (maliyet)" value={fmtMoney(stockValue)} delta={`${fmtNum(products.length)} ürün · ${low.length} kritik`} trend={low.length ? 'down' : 'flat'} />
        <Stat label="Açık siparişler" value={fmtNum(openOrders.length)} delta={fmtMoney(openOrders.filter((o) => o.currency === 'TRY').reduce((s, o) => s + o.total, 0)) + ' (TRY)'} />
        <Stat label="Tahsil edilecek" value={fmtMoney(fin.receivableTotal)} delta={fin.overdueReceivable > 0 ? `${fmtMoney(fin.overdueReceivable)} vadesi geçti` : 'Vadesi geçen yok'} trend={fin.overdueReceivable > 0 ? 'down' : 'up'} />
        <Stat label="Ziyaretçi (7 gün)" value={fmtNum(visitors)} delta={samples.length ? `${samples.length} dakikalık örnek` : 'Kamera analizi başlatılmadı'} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card
          title="Aylık gelir ve gider"
          subtitle="Fatura ve fatura dışı ödemeler, son 6 ay"
          actions={
            <button className="btn sm" onClick={() => setTableView((v) => !v)}>
              {tableView ? 'Grafik' : 'Tablo görünümü'}
            </button>
          }
        >
          {tableView ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ay</th>
                    <th className="num">Gelir</th>
                    <th className="num">Gider</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((m) => (
                    <tr key={m.month}>
                      <td>{m.label}</td>
                      <td className="num">{fmtMoney(m.income)}</td>
                      <td className="num">{fmtMoney(m.expense)}</td>
                      <td className="num" style={{ color: m.net < 0 ? 'var(--bad)' : undefined }}>{fmtMoney(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={series} barGap={2} barCategoryGap="25%">
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={44} />
                  <Tooltip {...tooltipStyle} formatter={(v) => fmtMoney(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
                  <Bar dataKey="income" name="Gelir" fill="var(--s1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Gider" fill="var(--s2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Üretim hattı" subtitle={`${openProduction.length} açık emir · ${lateProduction.length} gecikmiş`} actions={<Link className="btn sm" to="/uretim">Üretim takibi</Link>}>
          {stageCounts.length === 0 ? (
            <p className="muted">Açık üretim emri yok.</p>
          ) : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={stageCounts} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" {...axisProps} width={80} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" name="Emir" fill="var(--s1)" radius={[0, 4, 4, 0]} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {lateProduction.length > 0 && (
            <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {lateProduction.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <strong>{p.orderNo}</strong> · {productName(p.productId)} · termin {fmtDate(p.dueDate)} <Badge tone="bad">gecikmiş</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-3" style={{ marginTop: 16 }}>
        <Card title="Kritik stok" subtitle="Eşiğin altındaki ürünler" actions={<Link className="btn sm" to="/urunler">Ürünler</Link>}>
          {low.length === 0 ? (
            <p className="muted">Tüm ürünler eşiğin üstünde.</p>
          ) : (
            <table className="table">
              <tbody>
                {low.slice(0, 6).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/urunler/${p.id}`}>{p.name}</Link>
                      <div className="tiny">{p.sku}</div>
                    </td>
                    <td className="num">
                      {fmtNum(levels.get(p.id) ?? 0)} / {fmtNum(p.minStock)} {p.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Finans uyarıları" subtitle="AI anomali ve vade takibi" actions={<Link className="btn sm" to="/finans">Finans</Link>}>
          <dl className="kv">
            <dt>Vadesi geçen alacak</dt>
            <dd style={{ color: fin.overdueReceivable ? 'var(--bad)' : undefined }}>{fmtMoney(fin.overdueReceivable)}</dd>
            <dt>Vadesi geçen borç</dt>
            <dd style={{ color: fin.overduePayable ? 'var(--warn)' : undefined }}>{fmtMoney(fin.overduePayable)}</dd>
            <dt>Bu ay ödenecek KDV</dt>
            <dd>{fmtMoney(fin.vatPayable)}</dd>
            <dt>Brüt marj</dt>
            <dd>%{fmtNum(fin.grossMargin * 100, 1)}</dd>
            <dt>Şüpheli fatura</dt>
            <dd>{anomalies.length ? <Badge tone="warn">{anomalies.length} bulgu</Badge> : <Badge tone="good">yok</Badge>}</dd>
          </dl>
        </Card>

        <Card title="Son siparişler" actions={<Link className="btn sm" to="/siparisler">Siparişler</Link>}>
          {openOrders.length === 0 ? (
            <p className="muted">Açık sipariş yok.</p>
          ) : (
            <table className="table">
              <tbody>
                {[...openOrders].sort((a, b) => b.orderDate - a.orderDate).slice(0, 6).map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.orderNo}</strong>
                      <div className="tiny">{customerName(o.customerId)}</div>
                    </td>
                    <td className="num">{fmtMoney(o.total, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
