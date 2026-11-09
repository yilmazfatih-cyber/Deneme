import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  BUDGET_CATEGORIES as BUDGET_LABELS,
  PRIORITIES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  type TicketStatus,
} from '../../../shared/labels.ts'
import {
  Badge,
  Card,
  CategoryLabel,
  ChannelBadge,
  Empty,
  Field,
  Load,
  Modal,
  Money,
  PageHead,
  PriorityBadge,
  TicketStatusBadge,
} from '../../components/ui.tsx'
import { useAction, useSite } from '../../context.tsx'
import { ago, api, dateTimeTR, money, nowISO, parseTL, phoneTR, todayISO, useApi } from '../../lib.ts'

type Ticket = {
  id: number
  title: string
  description: string
  category: string
  priority: string
  status: string
  site_name: string
  unit_no: string | null
  block: string | null
  vendor_name: string | null
  person_name: string | null
  source: string
  due_at: string | null
  created_at: string
  resolved_at: string | null
}

export function Tickets() {
  const navigate = useNavigate()
  const { sites } = useSite()
  const [status, setStatus] = useState('acik')
  const [siteFilter, setSiteFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const { data, error, reload } = useApi<Ticket[]>(
    `/y/tickets?status=${status}${siteFilter ? `&siteId=${siteFilter}` : ''}`,
  )
  return (
    <>
      <PageHead
        title="Arıza ve talepler"
        subtitle="Gelen kutusundan yapay zekânın açtığı ve personelin girdiği tüm işler; hizmet süresi önceliğe göre işler."
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            Yeni talep
          </button>
        }
      />
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 200 }} aria-label="Durum">
          <option value="acik">Açık olanlar</option>
          <option value="">Tümü</option>
          {Object.entries(TICKET_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          style={{ maxWidth: 240 }}
          aria-label="Site"
        >
          <option value="">Tüm siteler</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <Load data={data} error={error} reload={reload}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty>Kayıt yok.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>Talep</th>
                      <th>Yer</th>
                      <th>Öncelik</th>
                      <th>Durum</th>
                      <th>Usta / firma</th>
                      <th>Süre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const late = t.due_at && !t.resolved_at && t.due_at < nowISO()
                      return (
                        <tr key={t.id} className="clickable" onClick={() => navigate(`/talepler/${t.id}`)}>
                          <td className="num">#{t.id}</td>
                          <td>
                            <b>{t.title}</b>
                            <div className="muted" style={{ fontSize: '0.82rem' }}>
                              <CategoryLabel value={t.category} /> · {ago(t.created_at)} ·{' '}
                              <ChannelBadge value={t.source === 'personel' ? 'telefon' : t.source} />
                            </div>
                          </td>
                          <td>
                            {t.site_name}
                            <div className="muted" style={{ fontSize: '0.82rem' }}>
                              {t.unit_no ? `${t.block ? `${t.block} ` : ''}No ${t.unit_no}` : 'Ortak alan'}
                            </div>
                          </td>
                          <td>
                            <PriorityBadge value={t.priority} />
                          </td>
                          <td>
                            <TicketStatusBadge value={t.status} />
                          </td>
                          <td>{t.vendor_name ?? <span className="muted">—</span>}</td>
                          <td>
                            {late ? (
                              <Badge tone="bad">Süre aşıldı</Badge>
                            ) : t.resolved_at ? (
                              <Badge tone="ok">Kapandı</Badge>
                            ) : (
                              <small className="muted">{dateTimeTR(t.due_at)}</small>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </Load>
      </Card>
      {creating && (
        <NewTicket
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            navigate(`/talepler/${id}`)
          }}
        />
      )}
    </>
  )
}

function NewTicket({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const { siteId, sites } = useSite()
  const [site, setSite] = useState(siteId ?? sites[0]?.id ?? 0)
  const units = useApi<{ id: number; label: string; payer_name: string | null }[]>(
    site ? `/y/sites/${site}/units` : null,
  )
  const [unitId, setUnitId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('tesisat')
  const [priority, setPriority] = useState('normal')
  const { busy, run } = useAction()
  return (
    <Modal
      title="Yeni talep"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || title.trim().length < 3}
            onClick={() =>
              void run(
                () =>
                  api.post<{ id: number }>('/y/tickets', {
                    siteId: site,
                    unitId: unitId ? Number(unitId) : null,
                    title,
                    description,
                    category,
                    priority,
                  }),
                'Talep oluşturuldu',
              ).then((r) => r && onCreated(r.id))
            }
          >
            Oluştur
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Site">
          <select value={site} onChange={(e) => setSite(Number(e.target.value))}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bağımsız bölüm">
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Ortak alan</option>
            {(units.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.label} {u.payer_name ? `— ${u.payer_name}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Başlık" className="full">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. B Blok asansör arızası" />
        </Field>
        <Field label="Açıklama" className="full">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Kategori">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(TICKET_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Öncelik">
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITIES).map(([k, v]) => (
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

type TicketDetailData = {
  ticket: Ticket & {
    site_id: number
    vendor_id: number | null
    vendor_phone: string | null
    person_phone: string | null
    cost: number | null
    location: string | null
  }
  events: { id: number; actor: string; kind: string; body: string; public: number; created_at: string }[]
  message: { id: number; channel: string; body: string; created_at: string } | null
  suggestions: { id: number; name: string; trade: string; rating: number | null; open_jobs: number; reason: string }[]
  expenses: { id: number; spent_on: string; description: string; amount: number }[]
}

export function TicketDetail() {
  const { id } = useParams()
  const { data, error, reload } = useApi<TicketDetailData>(`/y/tickets/${id}`)
  const [note, setNote] = useState('')
  const [isPublic, setPublic] = useState(true)
  const [expense, setExpense] = useState(false)
  const { busy, run } = useAction()
  const patch = (body: Record<string, unknown>, msg: string) =>
    run(() => api.patch(`/y/tickets/${id}`, body), msg).then(reload)
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => {
        const t = d.ticket
        return (
          <>
            <PageHead
              title={`#${t.id} ${t.title}`}
              subtitle={
                <>
                  {t.site_name} ·{' '}
                  {t.unit_no ? `${t.block ? `${t.block} ` : ''}No ${t.unit_no}` : (t.location ?? 'Ortak alan')} ·{' '}
                  <CategoryLabel value={t.category} />
                </>
              }
              actions={
                <Link className="btn" to="/talepler">
                  ← Talepler
                </Link>
              }
            />
            <div className="grid sidebar-right">
              <div className="stack" style={{ gap: 16 }}>
                <Card title="Açıklama">
                  <p className="pre">{t.description || '—'}</p>
                  {d.message && (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Kaynak: <ChannelBadge value={d.message.channel} />{' '}
                      <Link to={`/gelen-kutusu/${d.message.id}`}>mesajı aç</Link>
                    </div>
                  )}
                </Card>
                <Card title="Zaman çizelgesi">
                  <div className="timeline">
                    {d.events.map((e) => (
                      <div className="ev" key={e.id}>
                        <div className="row between">
                          <b>{e.actor}</b>
                          <small className="muted">{dateTimeTR(e.created_at)}</small>
                        </div>
                        <div>{e.body}</div>
                        {!e.public && <small className="muted">İç not</small>}
                      </div>
                    ))}
                  </div>
                  <div className="stack" style={{ marginTop: 8 }}>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Not ekleyin…"
                      rows={2}
                      aria-label="Not"
                    />
                    <div className="row between">
                      <label className="check">
                        <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />{' '}
                        Sakine görünsün ve bildirilsin
                      </label>
                      <button
                        className="btn primary small"
                        disabled={busy || !note.trim()}
                        onClick={() =>
                          void run(
                            () =>
                              api.post(`/y/tickets/${id}/events`, { body: note, public: isPublic, notify: isPublic }),
                            'Not eklendi',
                          ).then(() => {
                            setNote('')
                            reload()
                          })
                        }
                      >
                        Ekle
                      </button>
                    </div>
                  </div>
                </Card>
              </div>
              <div className="stack" style={{ gap: 16 }}>
                <Card title="Durum">
                  <div className="stack">
                    <div className="row">
                      <PriorityBadge value={t.priority} />
                      <TicketStatusBadge value={t.status} />
                    </div>
                    <dl className="kv">
                      <dt>Bildiren</dt>
                      <dd>
                        {t.person_name ?? '—'}{' '}
                        {t.person_phone && <small className="muted">{phoneTR(t.person_phone)}</small>}
                      </dd>
                      <dt>Hedef süre</dt>
                      <dd>{dateTimeTR(t.due_at)}</dd>
                      <dt>Maliyet</dt>
                      <dd>
                        <Money value={t.cost} />
                      </dd>
                    </dl>
                    <Field label="Durumu değiştir">
                      <select
                        value={t.status}
                        onChange={(e) => void patch({ status: e.target.value as TicketStatus }, 'Durum güncellendi')}
                      >
                        {Object.entries(TICKET_STATUSES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Öncelik">
                      <select
                        value={t.priority}
                        onChange={(e) => void patch({ priority: e.target.value }, 'Öncelik güncellendi')}
                      >
                        {Object.entries(PRIORITIES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </Card>
                <Card title="Usta / firma">
                  {t.vendor_name ? (
                    <p>
                      <b>{t.vendor_name}</b> <small className="muted">{phoneTR(t.vendor_phone)}</small>
                    </p>
                  ) : (
                    <p className="muted">Henüz atanmadı.</p>
                  )}
                  <div className="ai-box">
                    <div className="ai-title">✦ Önerilen</div>
                    {d.suggestions.length === 0 ? (
                      <small className="muted">Bu iş türüne uygun kayıtlı tedarikçi yok.</small>
                    ) : (
                      <div className="list">
                        {d.suggestions.map((s) => (
                          <div className="list-item" key={s.id}>
                            <div className="grow">
                              <b>{s.name}</b>
                              <div className="muted" style={{ fontSize: '0.8rem' }}>
                                {s.reason}
                              </div>
                            </div>
                            <button
                              className="btn small"
                              disabled={busy || s.id === t.vendor_id}
                              onClick={() =>
                                void patch({ vendorId: s.id }, `${s.name} atandı, iş emri SMS’i gönderildi`)
                              }
                            >
                              {s.id === t.vendor_id ? 'Atandı' : 'Ata'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
                <Card
                  title="Giderler"
                  actions={
                    <button className="btn small" onClick={() => setExpense(true)}>
                      Gider ekle
                    </button>
                  }
                >
                  {d.expenses.length === 0 ? (
                    <small className="muted">Bu talebe bağlı gider yok.</small>
                  ) : (
                    d.expenses.map((e) => (
                      <div key={e.id} className="row between">
                        <span>{e.description}</span>
                        <Money value={e.amount} />
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </div>
            {expense && (
              <ExpenseModal
                siteId={t.site_id}
                ticketId={t.id}
                vendorId={t.vendor_id}
                defaultDescription={t.title}
                onClose={() => setExpense(false)}
                onSaved={() => {
                  setExpense(false)
                  reload()
                }}
              />
            )}
          </>
        )
      }}
    </Load>
  )
}

export function ExpenseModal({
  siteId,
  ticketId,
  vendorId,
  defaultDescription,
  onClose,
  onSaved,
}: {
  siteId: number
  ticketId?: number
  vendorId?: number | null
  defaultDescription?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [spentOn, setSpentOn] = useState(todayISO())
  const [category, setCategory] = useState(ticketId ? 'bakim' : 'enerji')
  const [description, setDescription] = useState(defaultDescription ?? '')
  const [amount, setAmount] = useState('')
  const [invoiceNo, setInvoiceNo] = useState('')
  const vendors = useApi<{ id: number; name: string }[]>('/y/vendors')
  const [vendor, setVendor] = useState(vendorId ? String(vendorId) : '')
  const { busy, run } = useAction()
  const kurus = parseTL(amount)
  return (
    <Modal
      title="Gider kaydı"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !kurus || description.trim().length < 2}
            onClick={() =>
              void run(
                () =>
                  api.post(`/y/sites/${siteId}/expenses`, {
                    spentOn,
                    category,
                    description,
                    amount: kurus,
                    vendorId: vendor ? Number(vendor) : null,
                    invoiceNo: invoiceNo || null,
                    ticketId: ticketId ?? null,
                  }),
                `Gider kaydedildi: ${money(kurus)}`,
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Kaydet
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tarih">
          <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Field>
        <Field label="Tutar (KDV dahil, TL)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1.250,00"
          />
        </Field>
        <Field label="Kategori">
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(BUDGET_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tedarikçi">
          <select value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">—</option>
            {(vendors.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Açıklama" className="full">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Fatura no">
          <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
