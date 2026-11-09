import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  DEFAULT_METHOD,
  DISTRIBUTION_METHODS,
  type BudgetCategory,
  type BudgetStatus,
} from '../../../shared/labels.ts'
import { Badge, Card, Field, Load, Money, PageHead } from '../../components/ui.tsx'
import { useAction } from '../../context.tsx'
import { api, money, monthTR, parseTL, tlInput, useApi } from '../../lib.ts'

type Preview = {
  budget: {
    id: number
    site_id: number
    name: string
    start_month: string
    months: number
    round_to: number
    status: BudgetStatus
    approved_note: string | null
  }
  lines: { id: number; category: string; name: string; annual_amount: number; method: string }[]
  units: {
    id: number
    label: string
    payer_name: string | null
    land_share: number
    area_m2: number | null
    monthly: number
    annual: number
  }[]
  totals: { budgetTotal: number; collectedTotal: number; roundingDiff: number } | null
}

type Line = { category: string; name: string; amount: string; method: string }

export function BudgetEditor() {
  const { id } = useParams()
  const { data, error, reload } = useApi<Preview>(`/y/budgets/${id}`)
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => <Editor key={JSON.stringify(d.lines) + d.budget.status} data={d} reload={reload} />}
    </Load>
  )
}

function Editor({ data, reload }: { data: Preview; reload: () => void }) {
  const b = data.budget
  const editable = b.status !== 'onaylandi'
  const [name, setName] = useState(b.name)
  const [startMonth, setStartMonth] = useState(b.start_month)
  const [months, setMonths] = useState(b.months)
  const [roundTo, setRoundTo] = useState(b.round_to)
  const [lines, setLines] = useState<Line[]>(
    data.lines.map((l) => ({ category: l.category, name: l.name, amount: tlInput(l.annual_amount), method: l.method })),
  )
  const [inflation, setInflation] = useState('30')
  const { busy, run } = useAction()
  const total = lines.reduce((s, l) => s + (parseTL(l.amount) ?? 0), 0)
  const set = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))
  const save = () =>
    run(
      () =>
        api.put(`/y/budgets/${b.id}`, {
          name,
          startMonth,
          months,
          roundTo,
          lines: lines.map((l) => ({
            category: l.category,
            name: l.name,
            annualAmount: parseTL(l.amount) ?? 0,
            method: l.method,
          })),
        }),
      'Kaydedildi, önizleme güncellendi',
    ).then(reload)
  const setStatus = (status: BudgetStatus, note: string) =>
    run(() => api.post(`/y/budgets/${b.id}/status`, { status, note }), 'Durum güncellendi').then(reload)
  const monthlyTotal = data.units.reduce((s, u) => s + u.monthly, 0)
  return (
    <>
      <PageHead
        title={b.name}
        subtitle={`${monthTR(b.start_month)} başlangıçlı ${b.months} aylık işletme projesi`}
        actions={
          <>
            <Badge tone={b.status === 'onaylandi' ? 'ok' : b.status === 'gecici' ? 'warn' : 'neutral'}>
              {BUDGET_STATUSES[b.status]}
            </Badge>
            <Link className="btn" to="/finans?sekme=butce">
              ← Projeler
            </Link>
          </>
        }
      />
      <div className="grid sidebar-right">
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Gider kalemleri">
            {editable && (
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <Field label="Proje adı">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Başlangıç ayı">
                  <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
                </Field>
                <Field label="Süre (ay)">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={months}
                    onChange={(e) => setMonths(Number(e.target.value))}
                  />
                </Field>
                <Field label="Aidat yuvarlama">
                  <select value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
                    <option value={1}>Kuruşa kadar</option>
                    <option value={100}>Tam lira</option>
                    <option value={1000}>10 lira</option>
                  </select>
                </Field>
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kategori</th>
                    <th>Kalem</th>
                    <th className="right">Yıllık tutar (TL)</th>
                    <th>Dağıtım</th>
                    {editable && <th />}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td style={{ minWidth: 170 }}>
                        {editable ? (
                          <select
                            value={l.category}
                            onChange={(e) =>
                              set(i, {
                                category: e.target.value,
                                method: DEFAULT_METHOD[e.target.value as BudgetCategory],
                              })
                            }
                            aria-label="Kategori"
                          >
                            {Object.entries(BUDGET_CATEGORIES).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          BUDGET_CATEGORIES[l.category as BudgetCategory]
                        )}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {editable ? (
                          <input
                            value={l.name}
                            onChange={(e) => set(i, { name: e.target.value })}
                            aria-label="Kalem adı"
                          />
                        ) : (
                          l.name
                        )}
                      </td>
                      <td className="right" style={{ minWidth: 140 }}>
                        {editable ? (
                          <input
                            className="right"
                            inputMode="decimal"
                            value={l.amount}
                            onChange={(e) => set(i, { amount: e.target.value })}
                            aria-label="Yıllık tutar"
                          />
                        ) : (
                          <Money value={parseTL(l.amount)} />
                        )}
                      </td>
                      <td style={{ minWidth: 170 }}>
                        {editable ? (
                          <select
                            value={l.method}
                            onChange={(e) => set(i, { method: e.target.value })}
                            aria-label="Dağıtım"
                          >
                            {Object.entries(DISTRIBUTION_METHODS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          DISTRIBUTION_METHODS[l.method as keyof typeof DISTRIBUTION_METHODS]
                        )}
                      </td>
                      {editable && (
                        <td>
                          <button
                            className="btn small ghost"
                            onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                            aria-label="Kalemi sil"
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}>
                      <b>Yıllık toplam</b>
                    </td>
                    <td className="right">
                      <b>{money(total)}</b>
                    </td>
                    <td colSpan={editable ? 2 : 1} className="muted">
                      aylık ≈ {money(Math.round(total / months))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {editable && (
              <div className="row between" style={{ marginTop: 12 }}>
                <div className="row">
                  <button
                    className="btn"
                    onClick={() =>
                      setLines((ls) => [...ls, { category: 'diger', name: '', amount: '0', method: 'arsa_payi' }])
                    }
                  >
                    Kalem ekle
                  </button>
                  <input
                    style={{ width: 70 }}
                    value={inflation}
                    onChange={(e) => setInflation(e.target.value)}
                    aria-label="Artış yüzdesi"
                  />
                  <button
                    className="btn"
                    onClick={() => {
                      const f = 1 + (Number(inflation.replace(',', '.')) || 0) / 100
                      setLines((ls) =>
                        ls.map((l) => ({
                          ...l,
                          amount: tlInput(Math.round(((parseTL(l.amount) ?? 0) * f) / 10000) * 10000),
                        })),
                      )
                    }}
                  >
                    %{inflation} artır
                  </button>
                </div>
                <button className="btn primary" disabled={busy} onClick={() => void save()}>
                  Kaydet ve önizle
                </button>
              </div>
            )}
          </Card>
          <Card
            title="Bağımsız bölüm başına aylık aidat"
            actions={
              data.totals && <small className="muted">Yuvarlama farkı: {money(data.totals.roundingDiff)} / dönem</small>
            }
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Bölüm</th>
                    <th>Ödeyen</th>
                    <th className="right">Arsa payı</th>
                    <th className="right">m²</th>
                    <th className="right">Aylık aidat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((u) => (
                    <tr key={u.id}>
                      <td>{u.label}</td>
                      <td>{u.payer_name ?? '—'}</td>
                      <td className="right num">{u.land_share}</td>
                      <td className="right num">{u.area_m2 ?? '—'}</td>
                      <td className="right">
                        <b>
                          <Money value={u.monthly} />
                        </b>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={4}>
                      <b>Aylık toplam</b>
                    </td>
                    <td className="right">
                      <b>
                        <Money value={monthlyTotal} />
                      </b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Yürürlük">
            <div className="stack">
              <p className="muted" style={{ fontSize: '0.9rem' }}>
                Aidat tahakkuku yalnız kurulca onaylanmış ya da geçici olarak yürürlüğe alınmış projeden yapılır.
              </p>
              {b.status !== 'onaylandi' && (
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void setStatus('onaylandi', 'Kat malikleri kurulunda kabul edildi')}
                >
                  Kurulca onaylandı olarak işaretle
                </button>
              )}
              {b.status === 'taslak' && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void setStatus('gecici', 'Kurul kararına kadar geçici proje')}
                >
                  Geçici proje olarak yürürlüğe al
                </button>
              )}
              {b.approved_note && <small className="muted">{b.approved_note}</small>}
            </div>
          </Card>
          <Card title="Hukuki not">
            <ul style={{ paddingLeft: 18, margin: 0, fontSize: '0.88rem' }} className="muted">
              <li>
                KMK m.20: kapıcı, kaloriferci, bahçıvan ve bekçi giderleri eşit; sigorta, bakım-onarım, yönetici ücreti
                ve diğer ortak giderler arsa payı oranında paylaşılır (aksine anlaşma yoksa).
              </li>
              <li>
                İşletme projesi kat malikleri kurulunda görüşülüp kabul edilir. 7579 sayılı Kanunla (RG 22.05.2026) KMK
                m.37’de geçici işletme projesine ilişkin değişiklikler yapılmıştır; uygulamadan önce güncel metni hukuk
                danışmanınızla doğrulayın.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
