import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  BUDGET_CATEGORIES,
  BUDGET_STATUSES,
  CHARGE_KINDS,
  DISTRIBUTION_METHODS,
  PAYMENT_METHODS,
  REMINDER_STAGES,
  type BudgetCategory,
  type BudgetStatus,
  type ChargeKind,
  type PaymentMethod,
  type ReminderStage,
} from '../../../shared/labels.ts'
import { Badge, Card, Empty, Field, Load, Modal, Money, PageHead, Stat, Tabs } from '../../components/ui.tsx'
import { useAction, useSite } from '../../context.tsx'
import { addMonth, api, dateTR, money, monthTR, parseTL, thisMonth, todayISO, useApi } from '../../lib.ts'
import { ExpenseModal } from './Tickets.tsx'

export type Position = {
  charged: number
  paid: number
  balance: number
  overdue: number
  credit: number
  lateFeeAccrued: number
  oldestOverdue: string | null
  maxOverdueDays: number
  aging: { d0_30: number; d31_60: number; d61_90: number; d90p: number }
  nextDue: { date: string; amount: number } | null
}
export type Standing = {
  id: number
  label: string
  block: string | null
  no: string
  payer_name: string | null
  payer_phone: string | null
  owner_name: string | null
  tenant_name: string | null
  land_share: number
  area_m2: number | null
  monthly: number | null
  position: Position
  lastReminder: { stage: string; created_at: string } | null
}
type FinanceData = {
  asOf: string
  totals: {
    receivables: number
    credits: number
    overdue: number
    lateFees: number
    debtors: number
    aging: Position['aging']
  }
  units: Standing[]
}

const TABS: [string, string][] = [
  ['durum', 'Borç durumu'],
  ['tahakkuk', 'Tahakkuk'],
  ['tahsilat', 'Tahsilatlar'],
  ['banka', 'Banka hareketleri'],
  ['butce', 'İşletme projesi'],
  ['gider', 'Giderler'],
  ['rapor', 'Rapor'],
]

export function Finance() {
  const { site, siteId } = useSite()
  const [params, setParams] = useSearchParams()
  const tab = params.get('sekme') ?? 'durum'
  if (!siteId) return <Empty>Önce bir site seçin.</Empty>
  return (
    <>
      <PageHead title="Aidat ve tahsilat" subtitle={`${site?.name} · KMK m.20’ye göre dağıtım ve gecikme tazminatı`} />
      <Tabs tabs={TABS} value={tab} onChange={(t) => setParams({ sekme: t })} />
      {tab === 'durum' && <Standings siteId={siteId} />}
      {tab === 'tahakkuk' && <Accruals siteId={siteId} />}
      {tab === 'tahsilat' && <Payments siteId={siteId} />}
      {tab === 'banka' && <BankImports siteId={siteId} />}
      {tab === 'butce' && <Budgets siteId={siteId} />}
      {tab === 'gider' && <Expenses siteId={siteId} />}
      {tab === 'rapor' && <Report siteId={siteId} />}
    </>
  )
}

function Standings({ siteId }: { siteId: number }) {
  const navigate = useNavigate()
  const { data, error, reload } = useApi<FinanceData>(`/y/sites/${siteId}/finance`)
  const [payFor, setPayFor] = useState<Standing | null>(null)
  const [lateFee, setLateFee] = useState(false)
  const [onlyDebtors, setOnlyDebtors] = useState(false)
  const { busy, run } = useAction()
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => {
        const rows = onlyDebtors ? d.units.filter((u) => u.position.overdue > 0) : d.units
        return (
          <div className="stack" style={{ gap: 16 }}>
            <div className="grid cols-4">
              <Stat
                label="Toplam alacak"
                value={money(d.totals.receivables)}
                hint={`Avanslar ${money(d.totals.credits)}`}
              />
              <Stat
                label="Vadesi geçmiş"
                value={money(d.totals.overdue)}
                hint={`${d.totals.debtors} bağımsız bölüm`}
                tone={d.totals.overdue ? 'bad' : undefined}
              />
              <Stat
                label="İşleyen gecikme tazminatı"
                value={money(d.totals.lateFees)}
                hint="Aylık %5, gün esaslı (KMK m.20)"
              />
              <Stat
                label="Yaşlandırma"
                value={money(d.totals.aging.d90p)}
                hint={`90+ gün · 0–30: ${money(d.totals.aging.d0_30)} · 31–90: ${money(d.totals.aging.d31_60 + d.totals.aging.d61_90)}`}
              />
            </div>
            <Card
              title="Bağımsız bölüm bazında durum"
              actions={
                <>
                  <label className="check">
                    <input type="checkbox" checked={onlyDebtors} onChange={(e) => setOnlyDebtors(e.target.checked)} />{' '}
                    Yalnız borçlular
                  </label>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          api.post<{ proposed: number; skipped: number }>(`/y/sites/${siteId}/reminders`, {
                            mode: 'oneri',
                          }),
                        (r) =>
                          `${r.proposed} hatırlatma onay kuyruğuna eklendi${r.skipped ? `, ${r.skipped} atlandı` : ''}`,
                      ).then(reload)
                    }
                  >
                    Hatırlatma öner
                  </button>
                  <button className="btn" onClick={() => setLateFee(true)}>
                    Gecikme tazminatı
                  </button>
                </>
              }
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bölüm</th>
                      <th>Ödeyen</th>
                      <th className="right">Aylık aidat</th>
                      <th className="right">Bakiye</th>
                      <th className="right">Vadesi geçmiş</th>
                      <th className="right">Gecikme</th>
                      <th>Son hatırlatma</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => (
                      <tr key={u.id} className="clickable" onClick={() => navigate(`/daireler/${u.id}`)}>
                        <td>
                          <b>{u.label}</b>
                        </td>
                        <td>
                          {u.payer_name ?? '—'}
                          {u.tenant_name && (
                            <div className="muted" style={{ fontSize: '0.8rem' }}>
                              kiracı
                            </div>
                          )}
                        </td>
                        <td className="right">
                          <Money value={u.monthly} />
                        </td>
                        <td className="right">
                          <Money value={u.position.balance} tone />
                        </td>
                        <td className="right">
                          {u.position.overdue > 0 ? (
                            <>
                              <Money value={u.position.overdue} />
                              <div className="muted" style={{ fontSize: '0.78rem' }}>
                                {u.position.maxOverdueDays} gün
                              </div>
                            </>
                          ) : (
                            <Badge tone="ok">Güncel</Badge>
                          )}
                        </td>
                        <td className="right">
                          {u.position.lateFeeAccrued ? <Money value={u.position.lateFeeAccrued} /> : '—'}
                        </td>
                        <td>
                          {u.lastReminder ? (
                            <small>
                              {REMINDER_STAGES[u.lastReminder.stage as ReminderStage] ?? u.lastReminder.stage}
                              <br />
                              <span className="muted">{dateTR(u.lastReminder.created_at)}</span>
                            </small>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <button
                            className="btn small"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPayFor(u)
                            }}
                          >
                            Tahsilat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            {payFor && (
              <PaymentModal
                unit={payFor}
                onClose={() => setPayFor(null)}
                onSaved={() => {
                  setPayFor(null)
                  reload()
                }}
              />
            )}
            {lateFee && (
              <LateFeeModal
                siteId={siteId}
                onClose={() => setLateFee(false)}
                onSaved={() => {
                  setLateFee(false)
                  reload()
                }}
              />
            )}
          </div>
        )
      }}
    </Load>
  )
}

export function PaymentModal({
  unit,
  onClose,
  onSaved,
}: {
  unit: { id: number; label: string; position: Position }
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(
    unit.position.overdue > 0 ? (unit.position.overdue / 100).toLocaleString('tr-TR') : '',
  )
  const [paidOn, setPaidOn] = useState(todayISO())
  const [method, setMethod] = useState<PaymentMethod>('havale')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const { busy, run } = useAction()
  const kurus = parseTL(amount)
  return (
    <Modal
      title={`Tahsilat — ${unit.label}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !kurus}
            onClick={() =>
              void run(
                () =>
                  api.post('/y/payments', {
                    unitId: unit.id,
                    amount: kurus,
                    paidOn,
                    method,
                    reference: reference || null,
                    note: note || null,
                  }),
                `${money(kurus)} tahsilat kaydedildi`,
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Kaydet
          </button>
        </>
      }
    >
      <p className="muted">
        Bakiye: <Money value={unit.position.balance} /> · vadesi geçmiş: <Money value={unit.position.overdue} />.
        Tahsilat en eski borçtan başlayarak kapatılır.
      </p>
      <div className="form-grid">
        <Field label="Tutar (TL)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.250,00"
            autoFocus
          />
        </Field>
        <Field label="Tarih">
          <input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Yöntem">
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dekont / referans no">
          <input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="Not" className="full">
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function LateFeeModal({ siteId, onClose, onSaved }: { siteId: number; onClose: () => void; onSaved: () => void }) {
  const [asOf, setAsOf] = useState(todayISO())
  const preview = useApi<{
    asOf: string
    bps: number
    rows: { unitId: number; label: string; payer: string | null; amount: number }[]
    total: number
  }>(`/y/sites/${siteId}/late-fees?asOf=${asOf}`)
  const { busy, run } = useAction()
  return (
    <Modal
      title="Gecikme tazminatı tahakkuku"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !preview.data?.total}
            onClick={() =>
              void run(
                () => api.post<{ total: number; units: number }>(`/y/sites/${siteId}/late-fees`, { asOf }),
                (r) => `${r.units} bölüme toplam ${money(r.total)} tahakkuk ettirildi`,
              ).then((r) => r && onSaved())
            }
          >
            Tahakkuk ettir
          </button>
        </>
      }
    >
      <div className="alert info" style={{ marginBottom: 12 }}>
        Kat Mülkiyeti Kanunu m.20: ortak gider payını ödemeyen kat maliki, geciktiği günler için aylık %5 hesabıyla
        gecikme tazminatı öder. Hesap ana borç üzerinden ve basit faizle yapılır; daha önce tahakkuk ettirilen dönem
        tekrar hesaplanmaz.
      </div>
      <Field label="Hangi tarihe kadar">
        <input
          type="date"
          value={asOf}
          max={todayISO()}
          onChange={(e) => setAsOf(e.target.value)}
          style={{ maxWidth: 220 }}
        />
      </Field>
      <Load data={preview.data} error={preview.error}>
        {(p) =>
          p.rows.length === 0 ? (
            <Empty>Bu tarihe kadar işlemiş yeni tazminat yok.</Empty>
          ) : (
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Bölüm</th>
                  <th>Ödeyen</th>
                  <th className="right">Tazminat</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.unitId}>
                    <td>{r.label}</td>
                    <td>{r.payer ?? '—'}</td>
                    <td className="right">
                      <Money value={r.amount} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <b>Toplam</b>
                  </td>
                  <td className="right">
                    <b>
                      <Money value={p.total} />
                    </b>
                  </td>
                </tr>
              </tbody>
            </table>
          )
        }
      </Load>
    </Modal>
  )
}

type ChargeRow = {
  id: number
  unit_id: number
  no: string
  block: string | null
  kind: string
  description: string
  amount: number
  due_date: string
  status: string
}

function Accruals({ siteId }: { siteId: number }) {
  const [month, setMonth] = useState(thisMonth())
  const { data, error, reload } = useApi<ChargeRow[]>(`/y/sites/${siteId}/charges?month=${month}`)
  const [extra, setExtra] = useState(false)
  const { busy, run } = useAction()
  const active = (data ?? []).filter((c) => c.status === 'aktif')
  return (
    <Card
      title={`${monthTR(month)} tahakkukları`}
      actions={
        <>
          <button className="btn small" onClick={() => setMonth(addMonth(month, -1))} aria-label="Önceki ay">
            ←
          </button>
          <button className="btn small" onClick={() => setMonth(addMonth(month, 1))} aria-label="Sonraki ay">
            →
          </button>
          <button className="btn" onClick={() => setExtra(true)}>
            Ek toplama
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  api.post<{ created: number; skipped: number; total: number }>(`/y/sites/${siteId}/accruals`, {
                    month,
                  }),
                (r) =>
                  r.created
                    ? `${r.created} bölüme ${money(r.total)} aidat tahakkuk ettirildi`
                    : 'Bu ayın aidatları zaten tahakkuk ettirilmiş',
              ).then(reload)
            }
          >
            {monthTR(month)} aidatlarını oluştur
          </button>
        </>
      }
    >
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Bu ay için tahakkuk yok. Onaylı işletme projesinden aidatları oluşturabilirsiniz.</Empty>
          ) : (
            <>
              <p className="muted">
                {active.length} kalem · toplam <Money value={active.reduce((s, c) => s + c.amount, 0)} />
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bölüm</th>
                      <th>Tür</th>
                      <th>Açıklama</th>
                      <th>Son ödeme</th>
                      <th className="right">Tutar</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr
                        key={c.id}
                        style={c.status === 'iptal' ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
                      >
                        <td>{c.block ? `${c.block} No ${c.no}` : `Daire ${c.no}`}</td>
                        <td>
                          <Badge tone={c.kind === 'gecikme' ? 'warn' : c.kind === 'ek' ? 'info' : 'neutral'}>
                            {CHARGE_KINDS[c.kind as ChargeKind]}
                          </Badge>
                        </td>
                        <td>{c.description}</td>
                        <td>{dateTR(c.due_date)}</td>
                        <td className="right">
                          <Money value={c.amount} />
                        </td>
                        <td>
                          {c.status === 'aktif' && (
                            <button
                              className="btn small danger"
                              disabled={busy}
                              onClick={() => {
                                if (confirm('Bu borç kaydı iptal edilsin mi? İşlem denetim günlüğüne yazılır.'))
                                  void run(() => api.del(`/y/charges/${c.id}`), 'Borç kaydı iptal edildi').then(reload)
                              }}
                            >
                              İptal
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </Load>
      {extra && (
        <ExtraChargeModal
          siteId={siteId}
          onClose={() => setExtra(false)}
          onSaved={() => {
            setExtra(false)
            reload()
          }}
        />
      )}
    </Card>
  )
}

function ExtraChargeModal({ siteId, onClose, onSaved }: { siteId: number; onClose: () => void; onSaved: () => void }) {
  const [description, setDescription] = useState('')
  const [total, setTotal] = useState('')
  const [method, setMethod] = useState('arsa_payi')
  const [dueDate, setDueDate] = useState(todayISO())
  const { busy, run } = useAction()
  const kurus = parseTL(total)
  return (
    <Modal
      title="Ek toplama (ör. çatı onarımı)"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !kurus || description.length < 3}
            onClick={() =>
              void run(
                () =>
                  api.post<{ units: number }>(`/y/sites/${siteId}/extra-charges`, {
                    description,
                    total: kurus,
                    method,
                    dueDate,
                  }),
                (r) => `${r.units} bölüme dağıtıldı`,
              ).then((r) => r && onSaved())
            }
          >
            Dağıt ve tahakkuk ettir
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Açıklama" className="full">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="B Blok çatı izolasyonu (kurul kararı 20.01.2026)"
          />
        </Field>
        <Field label="Toplam tutar (TL)">
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </Field>
        <Field label="Son ödeme tarihi">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field
          label="Dağıtım"
          className="full"
          hint="Kuruşu kuruşuna bölünür; artan kuruşlar en büyük paya sahip bölümlere eklenir."
        >
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(DISTRIBUTION_METHODS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

type PaymentRow = {
  id: number
  no: string
  block: string | null
  amount: number
  paid_on: string
  method: string
  source: string
  reference: string | null
  note: string | null
  status: string
}

function Payments({ siteId }: { siteId: number }) {
  const { data, error, reload } = useApi<PaymentRow[]>(`/y/sites/${siteId}/payments`)
  const { busy, run } = useAction()
  return (
    <Card title="Son tahsilatlar" actions={<small className="muted">Son 3 ay</small>}>
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Tahsilat yok.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Bölüm</th>
                    <th>Yöntem</th>
                    <th>Açıklama</th>
                    <th className="right">Tutar</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      style={p.status === 'iptal' ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}
                    >
                      <td className="num">{dateTR(p.paid_on)}</td>
                      <td>{p.block ? `${p.block} No ${p.no}` : `Daire ${p.no}`}</td>
                      <td>
                        {PAYMENT_METHODS[p.method as PaymentMethod]}
                        {p.source === 'banka' && <Badge tone="info">banka eşleşmesi</Badge>}
                      </td>
                      <td>
                        <small>{p.note ?? p.reference ?? ''}</small>
                      </td>
                      <td className="right">
                        <Money value={p.amount} />
                      </td>
                      <td>
                        {p.status === 'aktif' && p.source !== 'online' && (
                          <button
                            className="btn small danger"
                            disabled={busy}
                            onClick={() => {
                              if (confirm('Tahsilat iptal edilsin mi?'))
                                void run(() => api.del(`/y/payments/${p.id}`), 'Tahsilat iptal edildi').then(reload)
                            }}
                          >
                            İptal
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </Load>
    </Card>
  )
}

function BankImports({ siteId }: { siteId: number }) {
  const navigate = useNavigate()
  const { data, error, reload } = useApi<
    { id: number; filename: string | null; row_count: number; matched: number; pending: number; created_at: string }[]
  >(`/y/sites/${siteId}/bank-imports`)
  const [csv, setCsv] = useState('')
  const [filename, setFilename] = useState<string | null>(null)
  const { busy, run } = useAction()
  const onFile = async (file: File | undefined) => {
    if (!file) return
    const buf = await file.arrayBuffer()
    // Türk bankalarının bazı dökümleri Windows-1254 kodlamasıyla gelir
    let text = new TextDecoder('utf-8').decode(buf)
    if (text.includes('�')) text = new TextDecoder('windows-1254').decode(buf)
    setCsv(text)
    setFilename(file.name)
  }
  return (
    <div className="grid cols-2">
      <Card title="Hesap dökümü yükle">
        <p className="muted">
          Bankanızın internet şubesinden indirdiğiniz hesap hareketlerini CSV olarak yükleyin. Kâhya her gelen havaleyi
          açıklamadaki blok/daire numarası, gönderen adı ve tutara göre bağımsız bölümle eşler; siz yalnız onaylarsınız.
        </p>
        <div className="stack">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={(e) => void onFile(e.target.files?.[0])}
            aria-label="CSV dosyası"
          />
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              'İşlem Tarihi;Açıklama;Tutar;Dekont No\n05.11.2026;FAST AYSE KAYA A BLK D:5 KASIM AIDAT;3.900,00;D123456'
            }
            rows={6}
            className="mono"
            aria-label="CSV içeriği"
          />
          <button
            className="btn primary"
            disabled={busy || csv.trim().length < 10}
            onClick={() =>
              void run(
                () => api.post<{ id: number; rows: number }>(`/y/sites/${siteId}/bank-imports`, { csv, filename }),
                (r) => `${r.rows} hareket okundu`,
              ).then((r) => {
                if (r) navigate(`/finans/banka/${r.id}`)
              })
            }
          >
            Yükle ve eşleştir
          </button>
        </div>
      </Card>
      <Card title="Önceki yüklemeler">
        <Load data={data} error={error} reload={reload}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty>Henüz yükleme yok.</Empty>
            ) : (
              <div className="list">
                {rows.map((r) => (
                  <Link key={r.id} to={`/finans/banka/${r.id}`} className="list-item" style={{ color: 'inherit' }}>
                    <div className="grow">
                      <b>{r.filename ?? `Yükleme #${r.id}`}</b>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {dateTR(r.created_at)} · {r.row_count} hareket
                      </div>
                    </div>
                    {r.pending > 0 ? (
                      <Badge tone="warn">{r.pending} bekliyor</Badge>
                    ) : (
                      <Badge tone="ok">Tamamlandı</Badge>
                    )}
                  </Link>
                ))}
              </div>
            )
          }
        </Load>
      </Card>
    </div>
  )
}

type BudgetRow = {
  id: number
  name: string
  start_month: string
  months: number
  status: BudgetStatus
  total: number
  approved_at: string | null
}

function Budgets({ siteId }: { siteId: number }) {
  const navigate = useNavigate()
  const { data, error, reload } = useApi<BudgetRow[]>(`/y/sites/${siteId}/budgets`)
  const { busy, run } = useAction()
  const newFrom = async (from: BudgetRow | undefined) => {
    const base = from
      ? await api.get<{ lines: { category: string; name: string; annual_amount: number; method: string }[] }>(
          `/y/budgets/${from.id}`,
        )
      : null
    const year = Number((from?.start_month ?? thisMonth()).slice(0, 4)) + (from ? 1 : 0)
    return api.post<{ id: number }>(`/y/sites/${siteId}/budgets`, {
      name: `${year} İşletme Projesi`,
      startMonth: `${year}-01`,
      months: 12,
      roundTo: 100,
      lines: base?.lines.map((l) => ({
        category: l.category,
        name: l.name,
        annualAmount: l.annual_amount,
        method: l.method,
      })) ?? [{ category: 'personel', name: 'Kapıcı ücreti', annualAmount: 0, method: 'esit' }],
    })
  }
  return (
    <Card
      title="İşletme projeleri"
      actions={
        <button
          className="btn primary"
          disabled={busy}
          onClick={() =>
            void run(() => newFrom(data?.[0]), 'Taslak oluşturuldu').then((r) => r && navigate(`/finans/butce/${r.id}`))
          }
        >
          {data?.length ? 'Son projeden yeni taslak' : 'Yeni proje'}
        </button>
      }
    >
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Henüz işletme projesi yok.</Empty>
          ) : (
            <div className="list">
              {rows.map((b) => (
                <Link key={b.id} to={`/finans/butce/${b.id}`} className="list-item" style={{ color: 'inherit' }}>
                  <div className="grow">
                    <b>{b.name}</b>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {monthTR(b.start_month)} başlangıçlı, {b.months} ay · yıllık <Money value={b.total} />
                    </div>
                  </div>
                  <Badge tone={b.status === 'onaylandi' ? 'ok' : b.status === 'gecici' ? 'warn' : 'neutral'}>
                    {BUDGET_STATUSES[b.status]}
                  </Badge>
                </Link>
              ))}
            </div>
          )
        }
      </Load>
    </Card>
  )
}

type Expense = {
  id: number
  spent_on: string
  category: string
  description: string
  amount: number
  vendor_name: string | null
  invoice_no: string | null
}

function Expenses({ siteId }: { siteId: number }) {
  const { data, error, reload } = useApi<Expense[]>(`/y/sites/${siteId}/expenses`)
  const [adding, setAdding] = useState(false)
  const { busy, run } = useAction()
  return (
    <Card
      title="Giderler (son 6 ay)"
      actions={
        <button className="btn primary" onClick={() => setAdding(true)}>
          Gider ekle
        </button>
      }
    >
      <Load data={data} error={error} reload={reload}>
        {(rows) => (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kategori</th>
                  <th>Açıklama</th>
                  <th>Tedarikçi</th>
                  <th className="right">Tutar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{dateTR(e.spent_on)}</td>
                    <td>{BUDGET_CATEGORIES[e.category as BudgetCategory] ?? e.category}</td>
                    <td>
                      {e.description}
                      {e.invoice_no && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Fatura {e.invoice_no}
                        </div>
                      )}
                    </td>
                    <td>{e.vendor_name ?? '—'}</td>
                    <td className="right">
                      <Money value={e.amount} />
                    </td>
                    <td>
                      <button
                        className="btn small danger"
                        disabled={busy}
                        onClick={() => {
                          if (confirm('Gider silinsin mi?'))
                            void run(() => api.del(`/y/expenses/${e.id}`), 'Gider silindi').then(reload)
                        }}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Load>
      {adding && (
        <ExpenseModal
          siteId={siteId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </Card>
  )
}

type ReportData = {
  from: string
  to: string
  income: { m: string; total: number }[]
  expenses: { category: string; total: number; count: number }[]
  accrued: number
  totalIncome: number
  totalExpense: number
  net: number
  collectionRate: number | null
  budget: { id: number; name: string } | null
  budgetVsActual: { category: string; planned: number; actual: number }[]
}

function Report({ siteId }: { siteId: number }) {
  const [from, setFrom] = useState(`${thisMonth().slice(0, 4)}-01-01`)
  const [to, setTo] = useState(todayISO())
  const { data, error, reload } = useApi<ReportData>(`/y/sites/${siteId}/report?from=${from}&to=${to}`)
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <Field label="Başlangıç">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Bitiş">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <button className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => window.print()}>
          Yazdır / PDF
        </button>
      </div>
      <Load data={data} error={error} reload={reload}>
        {(r) => (
          <>
            <div className="grid cols-4">
              <Stat label="Tahakkuk" value={money(r.accrued)} />
              <Stat
                label="Tahsilat (gelir)"
                value={money(r.totalIncome)}
                hint={r.collectionRate !== null ? `Tahsilat oranı %${r.collectionRate}` : undefined}
              />
              <Stat label="Gider" value={money(r.totalExpense)} />
              <Stat label="Net" value={money(r.net)} tone={r.net < 0 ? 'bad' : 'ok'} />
            </div>
            <div className="grid cols-2">
              <Card title={`Bütçe – gerçekleşen${r.budget ? ` (${r.budget.name})` : ''}`}>
                {r.budgetVsActual.length === 0 ? (
                  <Empty>Onaylı işletme projesi yok.</Empty>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Kalem</th>
                        <th className="right">Planlanan</th>
                        <th className="right">Gerçekleşen</th>
                        <th className="right">Sapma</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.budgetVsActual.map((b) => {
                        const diff = b.planned ? Math.round(((b.actual - b.planned) / b.planned) * 100) : null
                        return (
                          <tr key={b.category}>
                            <td>{BUDGET_CATEGORIES[b.category as BudgetCategory] ?? b.category}</td>
                            <td className="right">
                              <Money value={b.planned} />
                            </td>
                            <td className="right">
                              <Money value={b.actual} />
                            </td>
                            <td className="right">
                              {diff === null ? (
                                '—'
                              ) : (
                                <Badge tone={diff > 10 ? 'bad' : diff < -10 ? 'ok' : 'neutral'}>
                                  {diff > 0 ? '+' : ''}%{diff}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </Card>
              <Card title="Aylık tahsilat">
                <table className="table">
                  <tbody>
                    {r.income.map((i) => (
                      <tr key={i.m}>
                        <td>{monthTR(i.m)}</td>
                        <td className="right">
                          <Money value={i.total} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </>
        )}
      </Load>
    </div>
  )
}
