import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Badge,
  Card,
  CategoryLabel,
  Empty,
  Field,
  Load,
  Money,
  PriorityBadge,
  TicketStatusBadge,
} from '../../components/ui.tsx'
import { useAction, useAuth } from '../../context.tsx'
import { ago, api, dateTimeTR, dateTR, download, money, parseTL, tlInput, useApi } from '../../lib.ts'
import type { Position } from '../staff/Finance.tsx'

type Home = {
  person: { full_name: string } | null
  units: { id: number; label: string; site: string; role: string; position: Position }[]
  announcements: { id: number; title: string; body: string; created_at: string; site_name: string }[]
  tickets: { id: number; title: string; status: string; priority: string; created_at: string }[]
  meetings: { id: number; title: string; first_at: string; location: string }[]
  messages: { id: number; channel: string; body: string; created_at: string; kind: string | null }[]
  payments: { enabled: boolean; provider: string }
}

export function PortalHome() {
  const { data, error, reload } = useApi<Home>('/portal/home')
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => (
        <div className="stack" style={{ gap: 16 }}>
          <h1>Merhaba {d.person?.full_name.split(' ')[0]}</h1>
          {d.units.map((u) => (
            <div key={u.id} className="card balance">
              <div className="row between">
                <span style={{ opacity: 0.85 }}>
                  {u.site} · {u.label}
                </span>
                <Badge>{u.role === 'malik' ? 'Kat maliki' : 'Kiracı'}</Badge>
              </div>
              <div style={{ margin: '10px 0 4px', opacity: 0.85 }}>
                {u.position.balance > 0
                  ? 'Güncel borcunuz'
                  : u.position.balance < 0
                    ? 'Avans bakiyeniz'
                    : 'Borcunuz yok'}
              </div>
              <div className="value">{money(Math.abs(u.position.balance))}</div>
              <div style={{ opacity: 0.85, fontSize: '0.9rem' }}>
                {u.position.overdue > 0
                  ? `Vadesi geçmiş: ${money(u.position.overdue)}${u.position.lateFeeAccrued ? ` · işleyen gecikme tazminatı ${money(u.position.lateFeeAccrued)}` : ''}`
                  : u.position.nextDue
                    ? `Sonraki ödeme ${dateTR(u.position.nextDue.date)}: ${money(u.position.nextDue.amount)}`
                    : 'Teşekkür ederiz.'}
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                {d.payments.enabled && u.position.balance > 0 && (
                  <Link className="btn accent" to={`/portal/odeme/${u.id}`}>
                    Kartla öde
                  </Link>
                )}
                <Link
                  className="btn"
                  to={`/portal/hesap/${u.id}`}
                  style={{ background: 'transparent', color: '#fff', borderColor: 'rgb(255 255 255 / 40%)' }}
                >
                  Hesap ekstresi
                </Link>
              </div>
            </div>
          ))}
          <div className="grid cols-2">
            <Link to="/portal/talepler?yeni=1" className="card" style={{ color: 'inherit' }}>
              <b>🛠 Arıza / talep bildir</b>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                Yazın, kategoriyi biz belirleyelim
              </p>
            </Link>
            <Link to="/portal/asistan" className="card" style={{ color: 'inherit' }}>
              <b>💬 Asistana sor</b>
              <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
                Kurallar, saatler, aidat
              </p>
            </Link>
          </div>
          {d.meetings.length > 0 && (
            <Card title="Yaklaşan genel kurul">
              {d.meetings.map((m) => (
                <div key={m.id}>
                  <b>{m.title}</b>
                  <div className="muted">
                    {dateTimeTR(m.first_at)} · {m.location}
                  </div>
                  <Link to="/portal/toplantilar">Gündemi gör</Link>
                </div>
              ))}
            </Card>
          )}
          <Card title="Duyurular" actions={<Link to="/portal/duyurular">Tümü</Link>}>
            {d.announcements.length === 0 ? (
              <Empty>Duyuru yok.</Empty>
            ) : (
              <div className="list">
                {d.announcements.slice(0, 3).map((a) => (
                  <div key={a.id} className="list-item">
                    <div className="grow">
                      <div className="row between">
                        <b>{a.title}</b>
                        <small className="muted">{dateTR(a.created_at)}</small>
                      </div>
                      <div className="clamp muted pre">{a.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {d.tickets.length > 0 && (
            <Card title="Taleplerim" actions={<Link to="/portal/talepler">Tümü</Link>}>
              {d.tickets.map((t) => (
                <Link
                  key={t.id}
                  to={`/portal/talepler/${t.id}`}
                  className="row between"
                  style={{ color: 'inherit', padding: '6px 0' }}
                >
                  <span>
                    #{t.id} {t.title}
                  </span>
                  <TicketStatusBadge value={t.status} />
                </Link>
              ))}
            </Card>
          )}
          {d.messages.length > 0 && (
            <Card title="Yönetimden mesajlar">
              <div className="list">
                {d.messages.map((m) => (
                  <div key={m.id} className="list-item">
                    <div className="grow">
                      <div className="pre" style={{ fontSize: '0.92rem' }}>
                        {m.body}
                      </div>
                      <small className="muted">{ago(m.created_at)}</small>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </Load>
  )
}

type StatementData = {
  unit: { id: number; label: string; site: string }
  lines: {
    date: string
    type: 'borc' | 'odeme'
    id: number
    description: string
    debit: number
    credit: number
    balance: number
  }[]
  position: Position
}

export function PortalStatement() {
  const { unitId } = useParams()
  const { data, error, reload } = useApi<StatementData>(`/portal/units/${unitId}/statement`)
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row between">
            <h1>Hesap ekstresi</h1>
            <button
              className="btn small"
              onClick={() =>
                download(
                  `ekstre-${d.unit.label.replace(/\s+/g, '-')}.csv`,
                  [
                    'Tarih;Açıklama;Borç;Ödeme;Bakiye',
                    ...d.lines.map(
                      (l) =>
                        `${l.date};${l.description};${(l.debit / 100).toFixed(2)};${(l.credit / 100).toFixed(2)};${(l.balance / 100).toFixed(2)}`,
                    ),
                  ].join('\n'),
                  'text/csv;charset=utf-8',
                )
              }
            >
              İndir
            </button>
          </div>
          <p className="muted">
            {d.unit.site} · {d.unit.label}
          </p>
          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Açıklama</th>
                    <th className="right">Tutar</th>
                    <th className="right">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {[...d.lines].reverse().map((l) => (
                    <tr key={`${l.type}${l.id}`}>
                      <td className="num">{dateTR(l.date)}</td>
                      <td>{l.description}</td>
                      <td className="right" style={{ color: l.type === 'odeme' ? 'var(--success)' : undefined }}>
                        {l.type === 'odeme' ? '−' : ''}
                        {money(l.debit || l.credit)}
                      </td>
                      <td className="right">
                        <Money value={l.balance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </Load>
  )
}

export function PortalPay() {
  const { unitId } = useParams()
  const home = useApi<Home>('/portal/home')
  const unit = home.data?.units.find((u) => u.id === Number(unitId))
  return (
    <Load data={home.data}>
      {() => (unit ? <PayForm key={unit.id} unit={unit} /> : <Empty>Bağımsız bölüm bulunamadı.</Empty>)}
    </Load>
  )
}

function PayForm({ unit }: { unit: Home['units'][number] }) {
  const navigate = useNavigate()
  const suggested = unit.position.overdue > 0 ? unit.position.overdue : Math.max(0, unit.position.balance)
  const [amount, setAmount] = useState(suggested ? tlInput(suggested) : '')
  const [iframe, setIframe] = useState<string | null>(null)
  const { busy, run } = useAction()
  const kurus = parseTL(amount)
  if (iframe) {
    return (
      <Card title="Güvenli ödeme">
        <iframe src={iframe} title="PayTR güvenli ödeme" style={{ width: '100%', minHeight: 640, border: 0 }} />
      </Card>
    )
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Aidat ödemesi</h1>
      <Card>
        <p className="muted">
          {unit.site} · {unit.label}
        </p>
        <div className="row" style={{ marginBottom: 12 }}>
          {unit.position.overdue > 0 && (
            <button className="btn small" onClick={() => setAmount(tlInput(unit.position.overdue))}>
              Vadesi geçen: {money(unit.position.overdue)}
            </button>
          )}
          {unit.position.balance > 0 && (
            <button className="btn small" onClick={() => setAmount(tlInput(unit.position.balance))}>
              Tüm borç: {money(unit.position.balance)}
            </button>
          )}
        </div>
        <Field label="Ödenecek tutar (TL)">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ fontSize: '1.3rem' }}
          />
        </Field>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 8 }}>
          Ödemeniz en eski borcunuzdan başlayarak kapatılır. Kart bilgileriniz ödeme kuruluşunda işlenir; Kâhya kart
          bilgisi saklamaz.
        </p>
        <button
          className="btn primary block"
          disabled={busy || !kurus}
          onClick={() =>
            void run(() =>
              api.post<{ oid: string; mode: 'iframe' | 'redirect'; url: string }>('/portal/pay', {
                unitId: unit.id,
                amount: kurus,
              }),
            ).then((r) => {
              if (!r) return
              if (r.mode === 'iframe') setIframe(r.url)
              else navigate(r.url)
            })
          }
        >
          {kurus ? `${money(kurus)} öde` : 'Tutar girin'}
        </button>
      </Card>
    </div>
  )
}

export function TestPayment() {
  const { oid } = useParams()
  const navigate = useNavigate()
  const { data, error, reload } = useApi<{
    oid: string
    amount: number
    status: string
    unit: string
    site: string
    testMode: boolean
  }>(`/portal/payments/${oid}`)
  const { busy, run } = useAction()
  const finish = (success: boolean) =>
    run(() => api.post(`/portal/payments/${oid}/test`, { success })).then(() => navigate(`/odeme/sonuc/${oid}`))
  return (
    <div className="portal">
      <Load data={data} error={error} reload={reload}>
        {(d) => (
          <Card title="Test ödeme sayfası">
            <div className="alert warn" style={{ marginBottom: 12 }}>
              Demo modu: gerçek para hareketi yoktur. Canlı ortamda bu adımda PayTR güvenli ödeme sayfası açılır.
            </div>
            <dl className="kv">
              <dt>Bağımsız bölüm</dt>
              <dd>
                {d.site} · {d.unit}
              </dd>
              <dt>Tutar</dt>
              <dd>
                <b>{money(d.amount)}</b>
              </dd>
              <dt>Sipariş no</dt>
              <dd className="mono">{d.oid}</dd>
            </dl>
            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn primary"
                disabled={busy || d.status !== 'bekliyor'}
                onClick={() => void finish(true)}
              >
                Ödemeyi onayla
              </button>
              <button
                className="btn danger"
                disabled={busy || d.status !== 'bekliyor'}
                onClick={() => void finish(false)}
              >
                Kart reddedildi
              </button>
            </div>
          </Card>
        )}
      </Load>
    </div>
  )
}

export function PaymentResult() {
  const { oid } = useParams()
  const { data, error, reload } = useApi<{ amount: number; status: string; failure: string | null; unit: string }>(
    `/portal/payments/${oid}`,
  )
  return (
    <div className="portal">
      <Load data={data} error={error} reload={reload}>
        {(d) => (
          <Card>
            {d.status === 'basarili' ? (
              <div className="alert ok">
                <b>Ödemeniz alındı.</b> {money(d.amount)} {d.unit} hesabınıza işlendi. Teşekkür ederiz.
              </div>
            ) : d.status === 'basarisiz' ? (
              <div className="alert bad">
                Ödeme tamamlanamadı: {d.failure ?? 'bilinmeyen hata'}. Tekrar deneyebilirsiniz.
              </div>
            ) : (
              <div className="alert info">
                Ödemeniz işleniyor. Birkaç saniye sonra{' '}
                <button className="btn small" onClick={reload}>
                  yenileyin
                </button>
              </div>
            )}
            <Link className="btn" to="/portal" style={{ marginTop: 12 }}>
              Ana sayfaya dön
            </Link>
          </Card>
        )}
      </Load>
    </div>
  )
}

type TicketRow = {
  id: number
  title: string
  status: string
  priority: string
  category: string
  created_at: string
  updated_at: string
}

export function PortalRequests() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const { data, error, reload } = useApi<TicketRow[]>('/portal/tickets')
  const [unitId, setUnitId] = useState(me?.units[0]?.id ?? 0)
  const [description, setDescription] = useState('')
  const [commonArea, setCommonArea] = useState(false)
  const [result, setResult] = useState<{
    id: number
    category: string
    priority: string
    safetyAdvice: string | null
  } | null>(null)
  const { busy, run } = useAction()
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Arıza ve talepler</h1>
      <Card title="Yeni bildirim">
        <div className="stack">
          {(me?.units.length ?? 0) > 1 && (
            <Field label="Bağımsız bölüm">
              <select value={unitId} onChange={(e) => setUnitId(Number(e.target.value))}>
                {me?.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.site_name} · {u.block ? `${u.block} ` : ''}No {u.no}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Sorunu kendi cümlelerinizle yazın">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Örn. mutfaktaki lavabo gideri tıkandı, su akmıyor"
            />
          </Field>
          <label className="check">
            <input type="checkbox" checked={commonArea} onChange={(e) => setCommonArea(e.target.checked)} /> Sorun ortak
            alanda (merdiven, otopark, bahçe…)
          </label>
          <button
            className="btn primary"
            disabled={busy || description.trim().length < 5}
            onClick={() =>
              void run(
                () => api.post<NonNullable<typeof result>>('/portal/tickets', { unitId, description, commonArea }),
                'Talebiniz alındı',
              ).then((r) => {
                if (r) {
                  setResult(r)
                  setDescription('')
                  reload()
                }
              })
            }
          >
            Gönder
          </button>
          {result && (
            <div className={`alert ${result.safetyAdvice ? 'bad' : 'ok'}`}>
              {result.safetyAdvice && (
                <p>
                  <b>Önemli:</b> {result.safetyAdvice}
                </p>
              )}
              Talep no <b>#{result.id}</b> · <CategoryLabel value={result.category} /> · öncelik{' '}
              <PriorityBadge value={result.priority} />
              <div>
                <Link to={`/portal/talepler/${result.id}`}>Takip et</Link>
              </div>
            </div>
          )}
        </div>
      </Card>
      <Card title="Taleplerim">
        <Load data={data} error={error} reload={reload}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty>Henüz talep yok.</Empty>
            ) : (
              <div className="list">
                {rows.map((t) => (
                  <button
                    key={t.id}
                    className="list-item"
                    onClick={() => navigate(`/portal/talepler/${t.id}`)}
                    style={{
                      background: 'none',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="grow">
                      <b>
                        #{t.id} {t.title}
                      </b>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        <CategoryLabel value={t.category} /> · {ago(t.created_at)}
                      </div>
                    </div>
                    <TicketStatusBadge value={t.status} />
                  </button>
                ))}
              </div>
            )
          }
        </Load>
      </Card>
    </div>
  )
}

export function PortalRequest() {
  const { id } = useParams()
  const { data, error, reload } = useApi<{
    ticket: TicketRow & { description: string; resolved_at: string | null }
    events: { kind: string; body: string; created_at: string }[]
  }>(`/portal/tickets/${id}`)
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => (
        <div className="stack" style={{ gap: 16 }}>
          <Link to="/portal/talepler">← Taleplerim</Link>
          <h1>
            #{d.ticket.id} {d.ticket.title}
          </h1>
          <div className="row">
            <TicketStatusBadge value={d.ticket.status} />
            <PriorityBadge value={d.ticket.priority} />
          </div>
          <Card title="Açıklama">
            <p className="pre">{d.ticket.description}</p>
          </Card>
          <Card title="Gelişmeler">
            <div className="timeline">
              {d.events.map((e, i) => (
                <div key={i} className="ev">
                  <small className="muted">{dateTimeTR(e.created_at)}</small>
                  <div>{e.body}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </Load>
  )
}

export function PortalAssistant() {
  const [question, setQuestion] = useState('')
  const [chat, setChat] = useState<
    { q: string; a: string; sources: { title: string; heading: string | null }[]; forwarded: boolean }[]
  >([])
  const { busy, run } = useAction()
  const ask = (q: string) =>
    run(() =>
      api.post<{ answer: string; sources: { title: string; heading: string | null }[]; forwarded: boolean }>(
        '/portal/ask',
        { question: q },
      ),
    ).then((r) => {
      if (r) {
        setChat((c) => [...c, { q, a: r.answer, sources: r.sources, forwarded: r.forwarded }])
        setQuestion('')
      }
    })
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Asistan</h1>
      <p className="muted">
        Site kuralları, saatler, aidat ve ödeme bilgileri. Yanıt bulamazsam sorunuzu yönetime iletirim.
      </p>
      <div className="chat">
        {chat.length === 0 && (
          <div className="row">
            {[
              'Borcum ne kadar?',
              'Havuz kaçta kapanıyor?',
              'Tadilat hangi saatlerde yapılabilir?',
              'Aidatı nasıl öderim?',
            ].map((s) => (
              <button key={s} className="btn small" onClick={() => void ask(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.map((c, i) => (
          <div key={i} className="stack" style={{ gap: 6 }}>
            <div className="bubble me">{c.q}</div>
            <div className="bubble bot">
              {c.a}
              {c.sources.length > 0 && (
                <div className="muted" style={{ fontSize: '0.78rem', marginTop: 6 }}>
                  Kaynak: {c.sources.map((s) => `${s.title}${s.heading ? ` › ${s.heading}` : ''}`).join(' · ')}
                </div>
              )}
              {c.forwarded && (
                <div className="muted" style={{ fontSize: '0.78rem', marginTop: 6 }}>
                  Sorunuz yönetime iletildi.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="row"
        style={{ flexWrap: 'nowrap' }}
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Sorunuzu yazın…"
          aria-label="Soru"
        />
        <button className="btn primary" disabled={busy || question.trim().length < 3}>
          Sor
        </button>
      </form>
    </div>
  )
}

export function PortalAnnouncements() {
  const { data, error, reload } =
    useApi<{ id: number; title: string; body: string; created_at: string; site_name: string }[]>(
      '/portal/announcements',
    )
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Duyurular</h1>
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Duyuru yok.</Empty>
          ) : (
            <>
              {rows.map((a) => (
                <Card key={a.id} title={a.title} actions={<small className="muted">{dateTR(a.created_at)}</small>}>
                  <p className="pre">{a.body}</p>
                </Card>
              ))}
            </>
          )
        }
      </Load>
    </div>
  )
}

export function PortalMeetings() {
  const { data, error, reload } = useApi<
    {
      id: number
      title: string
      first_at: string
      second_at: string | null
      location: string
      status: string
      site_name: string
      agenda: { seq: number; title: string; details: string | null; result: string | null }[]
    }[]
  >('/portal/meetings')
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Kat malikleri kurulu</h1>
      <Load data={data} error={error} reload={reload}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty>Toplantı yok.</Empty>
          ) : (
            <>
              {rows.map((m) => (
                <Card
                  key={m.id}
                  title={m.title}
                  actions={
                    <Badge tone={m.status === 'tamamlandi' ? 'ok' : 'info'}>
                      {m.status === 'tamamlandi' ? 'Tamamlandı' : 'Planlandı'}
                    </Badge>
                  }
                >
                  <p className="muted">
                    {dateTimeTR(m.first_at)} · {m.location}
                    {m.second_at && ` · ikinci toplantı ${dateTimeTR(m.second_at)}`}
                  </p>
                  <ol style={{ paddingLeft: 20 }}>
                    {m.agenda.map((a) => (
                      <li key={a.seq} style={{ marginBottom: 4 }}>
                        {a.title}{' '}
                        {a.result && (
                          <Badge tone={a.result === 'kabul' ? 'ok' : 'bad'}>
                            {a.result === 'kabul' ? 'Kabul edildi' : 'Reddedildi'}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ol>
                </Card>
              ))}
            </>
          )
        }
      </Load>
    </div>
  )
}

export function PortalPrivacy() {
  const { me } = useAuth()
  const { data, error, reload } = useApi<{
    full_name: string
    phone: string | null
    email: string | null
    consent_sms: number
    consent_whatsapp: number
    consent_email: number
    kvkk_notice_at: string | null
  }>('/portal/privacy')
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => (
        <PrivacyForm key={JSON.stringify(d)} data={d} orgName={me?.org.name ?? 'Yönetim şirketi'} onSaved={reload} />
      )}
    </Load>
  )
}

function PrivacyForm({
  data,
  orgName,
  onSaved,
}: {
  data: {
    full_name: string
    phone: string | null
    email: string | null
    consent_sms: number
    consent_whatsapp: number
    consent_email: number
    kvkk_notice_at: string | null
  }
  orgName: string
  onSaved: () => void
}) {
  const [sms, setSms] = useState(Boolean(data.consent_sms))
  const [wa, setWa] = useState(Boolean(data.consent_whatsapp))
  const [email, setEmail] = useState(Boolean(data.consent_email))
  const { busy, run } = useAction()
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Hesabım ve gizlilik</h1>
      <Card title="Bilgilerim">
        <dl className="kv">
          <dt>Ad soyad</dt>
          <dd>{data.full_name}</dd>
          <dt>Telefon</dt>
          <dd>{data.phone ?? '—'}</dd>
          <dt>E-posta</dt>
          <dd>{data.email ?? '—'}</dd>
        </dl>
      </Card>
      <Card title="Bilgilendirme kanalları">
        <div className="stack">
          <label className="check">
            <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} /> WhatsApp
          </label>
          <label className="check">
            <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} /> SMS
          </label>
          <label className="check">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> E-posta
          </label>
          <small className="muted">
            Duyuru ve hatırlatmalar seçtiğiniz kanallardan gelir. Talebinize verilen yanıtlar yazdığınız kanaldan
            iletilir.
          </small>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  api.put('/portal/privacy', {
                    consentSms: sms,
                    consentWhatsapp: wa,
                    consentEmail: email,
                    acknowledge: true,
                  }),
                'Tercihleriniz kaydedildi',
              ).then(onSaved)
            }
            style={{ alignSelf: 'flex-start' }}
          >
            Kaydet
          </button>
        </div>
      </Card>
      <Card title="Kişisel verileriniz (KVKK)">
        <p style={{ fontSize: '0.92rem' }}>
          Veri sorumlusu {orgName}, ad-soyad, iletişim bilgileriniz, bağımsız bölüm ve aidat kayıtlarınızı 6698 sayılı
          KVKK kapsamında site yönetimi hizmetinin yürütülmesi, Kat Mülkiyeti Kanunu’ndan doğan yükümlülükler ve meşru
          menfaat hukuki sebepleriyle işler. Mesajlarınız yapay zekâ ile sınıflandırılırken ad, telefon, T.C. kimlik no,
          IBAN ve e-posta gibi kişisel veriler maskelenir. KVKK m.11 kapsamındaki haklarınızı yönetime başvurarak
          kullanabilirsiniz.
        </p>
        <button
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(() => api.get<unknown>('/portal/privacy/export'), 'Verileriniz indirildi').then(
              (r) => r && download('kisisel-verilerim.json', JSON.stringify(r, null, 2)),
            )
          }
        >
          Verilerimi indir
        </button>
        {data.kvkk_notice_at && (
          <p className="muted" style={{ fontSize: '0.82rem', marginTop: 8 }}>
            Aydınlatma metni okundu: {dateTR(data.kvkk_notice_at)}
          </p>
        )}
      </Card>
    </div>
  )
}
