import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { INTENTS, TICKET_CATEGORIES, type Intent, type TicketCategory } from '../../../shared/labels.ts'
import { ActionCard, type AiAction } from '../../components/ActionCard.tsx'
import {
  Badge,
  Card,
  ChannelBadge,
  Empty,
  EngineBadge,
  Field,
  Load,
  Modal,
  PageHead,
  PriorityBadge,
  Tabs,
} from '../../components/ui.tsx'
import { useAction, useAuth } from '../../context.tsx'
import { ago, api, dateTimeTR, phoneTR, useApi } from '../../lib.ts'

type Triage = {
  intent: string
  category: string
  priority: string
  summary: string
  needs_ticket: boolean
  safety_advice: string | null
  engine: string
  model: string | null
  masked: number
  fallbackReason?: string
  unitId: number | null
}
type Msg = {
  id: number
  channel: string
  address: string | null
  subject: string | null
  body: string
  status: string
  triage: Triage | null
  ticket_id: number | null
  created_at: string
  person_name: string | null
  site_name: string | null
  unit_no: string | null
  block: string | null
  pending_actions: number
}
type Detail = {
  message: Msg & { person_id: number | null }
  thread: {
    id: number
    direction: string
    channel: string
    body: string
    status: string
    created_at: string
    kind: string | null
    error: string | null
  }[]
  actions: AiAction[]
  person: { id: number; full_name: string; phone: string | null; email: string | null } | null
  units: { id: number; no: string; block: string | null; site: string }[]
}

const STATUS_TABS: [string, string][] = [
  ['bekleyen', 'Bekleyen'],
  ['islendi', 'İşlendi'],
  ['arsiv', 'Arşiv'],
  ['tumu', 'Tümü'],
]

export function Inbox() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState('bekleyen')
  const [simulate, setSimulate] = useState(false)
  const list = useApi<Msg[]>(`/y/inbox?status=${tab}`)
  const selected = id ? Number(id) : null
  return (
    <>
      <PageHead
        title="Gelen kutusu"
        subtitle="WhatsApp, SMS, e-posta ve portal mesajları yapay zekâ ile sınıflandırılır; öneriler onayınıza düşer."
        actions={
          <button className="btn" onClick={() => setSimulate(true)}>
            Mesaj benzet (demo)
          </button>
        }
      />
      <div className="grid cols-2" style={{ gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }}>
        <Card>
          <Tabs tabs={STATUS_TABS} value={tab} onChange={setTab} />
          <Load data={list.data} error={list.error} reload={list.reload}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty>Bu görünümde mesaj yok.</Empty>
              ) : (
                <div className="list">
                  {rows.map((m) => (
                    <button
                      key={m.id}
                      className="list-item"
                      onClick={() => navigate(`/gelen-kutusu/${m.id}`)}
                      style={{
                        textAlign: 'left',
                        background: selected === m.id ? 'var(--primary-soft)' : 'transparent',
                        border: 'none',
                        borderBottom: '1px solid var(--border)',
                        cursor: 'pointer',
                        font: 'inherit',
                        color: 'inherit',
                        padding: '10px 8px',
                        borderRadius: 8,
                      }}
                    >
                      <ChannelBadge value={m.channel} />
                      <div className="grow">
                        <div className="row between">
                          <b>{m.person_name ?? phoneTR(m.address) ?? 'Kayıtsız'}</b>
                          <small className="muted">{ago(m.created_at)}</small>
                        </div>
                        <div className="clamp muted" style={{ fontSize: '0.9rem' }}>
                          {m.triage?.summary ?? m.body}
                        </div>
                        <div className="row" style={{ marginTop: 4 }}>
                          {m.triage && <PriorityBadge value={m.triage.priority} />}
                          {m.triage && <Badge>{TICKET_CATEGORIES[m.triage.category as TicketCategory]}</Badge>}
                          {m.ticket_id && <Badge tone="brand">Talep #{m.ticket_id}</Badge>}
                          {m.pending_actions > 0 && <Badge tone="warn">{m.pending_actions} öneri</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            }
          </Load>
        </Card>
        <div>
          {selected ? (
            <MessageDetail id={selected} onChange={list.reload} />
          ) : (
            <Card>
              <Empty>Ayrıntı için soldan bir mesaj seçin.</Empty>
            </Card>
          )}
        </div>
      </div>
      {simulate && (
        <SimulateModal
          onClose={() => setSimulate(false)}
          onDone={(mid) => {
            setSimulate(false)
            setTab('tumu')
            list.reload()
            navigate(`/gelen-kutusu/${mid}`)
          }}
        />
      )}
    </>
  )
}

function MessageDetail({ id, onChange }: { id: number; onChange: () => void }) {
  const { data, error, reload } = useApi<Detail>(`/y/messages/${id}`)
  const [reply, setReply] = useState('')
  const { busy, run } = useAction()
  const refresh = () => {
    reload()
    onChange()
  }
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => {
        const m = d.message
        const t = m.triage
        return (
          <div className="stack" style={{ gap: 16 }}>
            <Card
              title={<h2>{d.person?.full_name ?? 'Kayıtsız gönderen'}</h2>}
              actions={
                <>
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() =>
                      void run(() => api.post(`/y/messages/${id}/reprocess`), 'Yeniden sınıflandırıldı').then(refresh)
                    }
                  >
                    Yeniden sınıflandır
                  </button>
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() => void run(() => api.post(`/y/messages/${id}/archive`), 'Arşivlendi').then(refresh)}
                  >
                    Arşivle
                  </button>
                </>
              }
            >
              <div className="row" style={{ marginBottom: 8 }}>
                <ChannelBadge value={m.channel} />
                <small className="muted">
                  {m.channel === 'email' ? m.address : phoneTR(m.address)} · {dateTimeTR(m.created_at)}
                </small>
              </div>
              {d.units.length > 0 && (
                <p className="muted" style={{ fontSize: '0.88rem' }}>
                  {d.units.map((u) => `${u.site} — ${u.block ? `${u.block} ` : ''}No ${u.no}`).join(' · ')}
                </p>
              )}
              {m.subject && <b>{m.subject}</b>}
              <div className="pre" style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 10 }}>
                {m.body}
              </div>
              {t && (
                <div className="ai-box" style={{ marginTop: 12 }}>
                  <div className="row between">
                    <div className="ai-title">✦ Yapay zekâ sınıflandırması</div>
                    <EngineBadge engine={t.engine} model={t.model} />
                  </div>
                  <p style={{ margin: '4px 0 8px' }}>{t.summary}</p>
                  <div className="row">
                    <PriorityBadge value={t.priority} />
                    <Badge>{TICKET_CATEGORIES[t.category as TicketCategory]}</Badge>
                    <Badge>{INTENTS[t.intent as Intent]}</Badge>
                    {t.needs_ticket && <Badge tone="brand">Talep gerekir</Badge>}
                    {t.masked > 0 && <Badge tone="ok">KVKK: {t.masked} veri maskelendi</Badge>}
                    {m.ticket_id && (
                      <Link className="btn small" to={`/talepler/${m.ticket_id}`}>
                        Talep #{m.ticket_id}
                      </Link>
                    )}
                  </div>
                  {t.safety_advice && (
                    <div className="alert bad" style={{ marginTop: 8 }}>
                      Güvenlik talimatı: {t.safety_advice}
                    </div>
                  )}
                  {t.fallbackReason && (
                    <small className="muted">Claude’a ulaşılamadı, kural motoru kullanıldı: {t.fallbackReason}</small>
                  )}
                </div>
              )}
            </Card>
            {d.actions.filter((a) => a.kind !== 'triage').length > 0 && (
              <Card title="Öneriler ve yapılanlar">
                <div className="stack">
                  {d.actions
                    .filter((a) => a.kind !== 'triage')
                    .map((a) => (
                      <ActionCard key={a.id} action={a} onDone={refresh} />
                    ))}
                </div>
              </Card>
            )}
            <Card title="Yazışma">
              <div className="chat">
                {d.thread.map((x) => (
                  <div key={x.id} className={`bubble ${x.direction === 'gelen' ? 'bot' : 'me'}`}>
                    {x.body}
                    <div style={{ fontSize: '0.72rem', opacity: 0.75, marginTop: 4 }}>
                      {dateTimeTR(x.created_at)}{' '}
                      {x.direction === 'giden' && `· ${x.status === 'gonderildi' ? 'gönderildi' : x.status}`}
                      {x.error ? ` · ${x.error}` : ''}
                    </div>
                  </div>
                ))}
              </div>
              <div className="stack" style={{ marginTop: 12 }}>
                <textarea
                  placeholder="Elle yanıt yazın…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  aria-label="Yanıt"
                />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    className="btn primary"
                    disabled={busy || !reply.trim()}
                    onClick={() =>
                      void run(() => api.post(`/y/messages/${id}/reply`, { body: reply }), 'Yanıt gönderildi').then(
                        (r) => {
                          if (r) {
                            setReply('')
                            refresh()
                          }
                        },
                      )
                    }
                  >
                    Gönder
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )
      }}
    </Load>
  )
}

const SAMPLES = [
  'Merhaba, banyo tavanından su damlıyor, üst kattan geliyor olabilir. A blok 5',
  'Merdiven boşluğunda yoğun gaz kokusu var!',
  'Otoparkta benim yerime yine başka bir araç park etmiş, plaka 34 ABC 123',
  'Kasım aidatını dün havale ettim ama portalda borç görünüyor',
  'Havuz yarın kaçta açılıyor?',
]

function SimulateModal({ onClose, onDone }: { onClose: () => void; onDone: (messageId: number) => void }) {
  const { me } = useAuth()
  const [channel, setChannel] = useState('whatsapp')
  const [from, setFrom] = useState('0532 111 22 33')
  const [body, setBody] = useState(SAMPLES[0]!)
  const { busy, run } = useAction()
  return (
    <Modal
      title="Gelen mesaj benzet"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              void run(
                () => api.post<{ messageId: number }>('/y/inbox/simulate', { channel, from, body }),
                'Mesaj alındı ve işlendi',
              ).then((r) => r && onDone(r.messageId))
            }
          >
            Gönder
          </button>
        </>
      }
    >
      <p className="muted">
        Sakin WhatsApp’tan yazmış gibi mesajı kutuya bırakır; {me?.ai.engine === 'claude' ? 'Claude' : 'kural motoru'}{' '}
        sınıflandırır, ayarlarınıza göre talep açar ve yanıt hazırlar.
      </p>
      <div className="form-grid">
        <Field label="Kanal">
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="email">E-posta</option>
            <option value="telefon">Telefon notu</option>
          </select>
        </Field>
        <Field label={channel === 'email' ? 'Gönderen e-posta' : 'Gönderen telefon'}>
          <input value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Mesaj" className="full">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
        </Field>
        <div className="full row">
          {SAMPLES.map((s) => (
            <button key={s} type="button" className="btn small" onClick={() => setBody(s)} title={s}>
              {s.slice(0, 28)}…
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}
