import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  COMPLIANCE_KINDS,
  ELEVATOR_LABELS,
  MEETING_RULES,
  type ComplianceKind,
  type MeetingRule,
} from '../../../shared/labels.ts'
import { Badge, Card, Empty, EngineBadge, Field, Load, Modal, PageHead, Tabs } from '../../components/ui.tsx'
import { useAction, useAuth, useSite } from '../../context.tsx'
import { api, dateTimeTR, dateTR, todayISO, useApi } from '../../lib.ts'

// --- Duyurular ---
type Announcement = {
  id: number
  title: string
  body: string
  site_name: string
  channels: string[]
  sent_count: number
  ai: number
  author: string | null
  created_at: string
}

export function Announcements() {
  const { siteId, site } = useSite()
  const { data, error, reload } = useApi<Announcement[]>(siteId ? `/y/announcements?siteId=${siteId}` : null)
  const [brief, setBrief] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [channels, setChannels] = useState<string[]>(['whatsapp'])
  const [ai, setAi] = useState<{ engine: string; model: string | null } | null>(null)
  const { busy, run } = useAction()
  const toggle = (c: string) => setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))
  return (
    <>
      <PageHead
        title="Duyurular"
        subtitle={`${site?.name ?? ''} sakinlerine portal, WhatsApp, SMS ve e-posta ile duyuru`}
      />
      <div className="grid cols-2">
        <Card title="Yeni duyuru">
          <div className="stack">
            <div className="ai-box stack" style={{ gap: 8 }}>
              <div className="ai-title">✦ Kısa notunuzu yazın, yapay zekâ duyuruya çevirsin</div>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Örn. perşembe 10-14 arası su kesintisi, İSKİ çalışması, depo suyu sadece ortak alanlara"
                aria-label="Kısa not"
              />
              <div className="row between">
                {ai ? <EngineBadge engine={ai.engine} model={ai.model} /> : <span />}
                <button
                  className="btn small accent"
                  disabled={busy || brief.trim().length < 5 || !siteId}
                  onClick={() =>
                    void run(() =>
                      api.post<{ title: string; body: string; engine: string; model: string | null }>(
                        '/y/announcements/draft',
                        { siteId, brief },
                      ),
                    ).then((r) => {
                      if (r) {
                        setTitle(r.title)
                        setBody(r.body)
                        setAi({ engine: r.engine, model: r.model })
                      }
                    })
                  }
                >
                  Taslak oluştur
                </button>
              </div>
            </div>
            <Field label="Başlık">
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Metin">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} />
            </Field>
            <div className="row">
              <span className="muted">Gönderim:</span>
              {[
                ['whatsapp', 'WhatsApp'],
                ['sms', 'SMS'],
                ['email', 'E-posta'],
              ].map(([k, v]) => (
                <label key={k} className="check">
                  <input type="checkbox" checked={channels.includes(k!)} onChange={() => toggle(k!)} /> {v}
                </label>
              ))}
            </div>
            <small className="muted">
              Duyurular portalda her zaman görünür. Kişi bazındaki iletişim izinleri dikkate alınır. Borçlu listesi gibi
              kişisel veriler duyuruda paylaşılmaz (KVKK).
            </small>
            <button
              className="btn primary"
              disabled={busy || title.trim().length < 3 || body.trim().length < 5}
              onClick={() =>
                void run(
                  () =>
                    api.post<{ sent: number }>('/y/announcements', { siteId, title, body, channels, ai: Boolean(ai) }),
                  (r) => `Duyuru yayımlandı, ${r.sent} kişiye gönderildi`,
                ).then((r) => {
                  if (r) {
                    setTitle('')
                    setBody('')
                    setBrief('')
                    setAi(null)
                    reload()
                  }
                })
              }
            >
              Yayımla ve gönder
            </button>
          </div>
        </Card>
        <Card title="Yayımlananlar">
          <Load data={data} error={error} reload={reload}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty>Duyuru yok.</Empty>
              ) : (
                <div className="list">
                  {rows.map((a) => (
                    <div key={a.id} className="list-item">
                      <div className="grow">
                        <div className="row between">
                          <b>{a.title}</b>
                          <small className="muted">{dateTR(a.created_at)}</small>
                        </div>
                        <div className="pre clamp muted">{a.body}</div>
                        <div className="row" style={{ marginTop: 4 }}>
                          {a.ai ? <Badge tone="ai">✦ yapay zekâ taslağı</Badge> : null}
                          {a.channels.length > 0 && <Badge>{a.sent_count} kişiye gönderildi</Badge>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            }
          </Load>
        </Card>
      </div>
    </>
  )
}

// --- Genel kurul ---
type Meeting = {
  id: number
  title: string
  kind: string
  first_at: string
  second_at: string | null
  location: string
  status: string
  site_name: string
  agenda_count: number
}
const MEETING_STATUS: Record<string, [string, 'ok' | 'warn' | 'neutral' | 'info']> = {
  planlandi: ['Planlandı', 'info'],
  cagri: ['Çağrı yapıldı', 'warn'],
  tamamlandi: ['Tamamlandı', 'ok'],
  iptal: ['İptal', 'neutral'],
}

export function Meetings() {
  const navigate = useNavigate()
  const { siteId } = useSite()
  const { data, error, reload } = useApi<Meeting[]>(siteId ? `/y/meetings?siteId=${siteId}` : null)
  const [creating, setCreating] = useState(false)
  return (
    <>
      <PageHead
        title="Kat malikleri kurulu"
        subtitle="Çağrı süreleri, toplantı ve karar yeter sayıları KMK m.29–31’e göre denetlenir; tutanak taslağı otomatik hazırlanır."
        actions={
          <button className="btn primary" onClick={() => setCreating(true)}>
            Toplantı planla
          </button>
        }
      />
      <Card>
        <Load data={data} error={error} reload={reload}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty>Toplantı yok.</Empty>
            ) : (
              <div className="list">
                {rows.map((m) => (
                  <Link key={m.id} to={`/genel-kurul/${m.id}`} className="list-item" style={{ color: 'inherit' }}>
                    <div className="grow">
                      <b>{m.title}</b>
                      <div className="muted" style={{ fontSize: '0.88rem' }}>
                        {dateTimeTR(m.first_at)} · {m.location} · {m.agenda_count} gündem maddesi
                      </div>
                    </div>
                    <Badge tone={MEETING_STATUS[m.status]?.[1] ?? 'neutral'}>
                      {MEETING_STATUS[m.status]?.[0] ?? m.status}
                    </Badge>
                  </Link>
                ))}
              </div>
            )
          }
        </Load>
      </Card>
      {creating && siteId && (
        <NewMeeting
          siteId={siteId}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(`/genel-kurul/${id}`)}
        />
      )}
    </>
  )
}

function NewMeeting({
  siteId,
  onClose,
  onCreated,
}: {
  siteId: number
  onClose: () => void
  onCreated: (id: number) => void
}) {
  const today = todayISO()
  const plus = (days: number) => {
    const d = new Date(`${today}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  }
  const [kind, setKind] = useState('olagan')
  const [title, setTitle] = useState(`${today.slice(0, 4)} Olağan Kat Malikleri Kurulu`)
  const [firstAt, setFirstAt] = useState(`${plus(20)}T19:30`)
  const [secondAt, setSecondAt] = useState(`${plus(27)}T19:30`)
  const [location, setLocation] = useState('Sosyal tesis toplantı salonu')
  const [agenda, setAgenda] = useState<{ title: string; rule: MeetingRule }[]>([
    { title: 'Açılış ve toplantı başkanlık divanının seçilmesi', rule: 'cogunluk' },
    { title: 'Yönetim ve denetim raporlarının görüşülmesi', rule: 'cogunluk' },
    { title: 'Yöneticinin ibrası', rule: 'cogunluk' },
    { title: 'İşletme projesinin görüşülmesi ve onaylanması', rule: 'cogunluk' },
    { title: 'Yönetici ve denetçi seçimi', rule: 'sayi_arsa' },
    { title: 'Dilek ve temenniler', rule: 'cogunluk' },
  ])
  const { busy, run } = useAction()
  return (
    <Modal
      title="Toplantı planla"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || agenda.length === 0}
            onClick={() =>
              void run(
                () =>
                  api.post<{ id: number }>('/y/meetings', {
                    siteId,
                    kind,
                    title,
                    firstAt,
                    secondAt,
                    location,
                    agenda: agenda.filter((a) => a.title.trim()),
                  }),
                'Toplantı oluşturuldu',
              ).then((r) => r && onCreated(r.id))
            }
          >
            Oluştur
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tür">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="olagan">Olağan</option>
            <option value="olaganustu">Olağanüstü</option>
          </select>
        </Field>
        <Field label="Başlık">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="İlk toplantı" hint="Çağrı en az 15 gün önce yapılmalı (KMK m.29)">
          <input type="datetime-local" value={firstAt} onChange={(e) => setFirstAt(e.target.value)} />
        </Field>
        <Field label="İkinci toplantı" hint="İlkinden en az 7, en geç 15 gün sonra">
          <input type="datetime-local" value={secondAt} onChange={(e) => setSecondAt(e.target.value)} />
        </Field>
        <Field label="Yer" className="full">
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      </div>
      <h3 style={{ marginTop: 16 }}>Gündem</h3>
      <div className="stack">
        {agenda.map((a, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="muted">{i + 1}.</span>
            <input
              value={a.title}
              onChange={(e) => setAgenda((xs) => xs.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))}
              aria-label="Gündem maddesi"
            />
            <select
              value={a.rule}
              onChange={(e) =>
                setAgenda((xs) => xs.map((x, k) => (k === i ? { ...x, rule: e.target.value as MeetingRule } : x)))
              }
              style={{ maxWidth: 260 }}
              aria-label="Karar yeter sayısı"
            >
              {Object.entries(MEETING_RULES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              className="btn small ghost"
              onClick={() => setAgenda((xs) => xs.filter((_, k) => k !== i))}
              aria-label="Sil"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="btn small"
          onClick={() => setAgenda((xs) => [...xs, { title: '', rule: 'cogunluk' }])}
          style={{ alignSelf: 'flex-start' }}
        >
          Madde ekle
        </button>
      </div>
    </Modal>
  )
}

type Tally = {
  passed: boolean
  yes: number
  no: number
  abstain: number
  notVoted: number
  yesShare: number
  explanation: string
}
type MeetingDetailData = {
  meeting: Meeting & { held_round: string | null; invited_at: string | null; minutes: string | null }
  site: { name: string }
  round: 'ilk' | 'ikinci'
  quorum: {
    ok: boolean
    presentCount: number
    totalCount: number
    presentShare: number
    totalShare: number
    explanation: string
  }
  warnings: string[]
  agenda: {
    id: number
    seq: number
    title: string
    details: string | null
    rule: MeetingRule
    ruleLabel: string
    votes: Record<string, string>
    tally: Tally
  }[]
  units: {
    id: number
    label: string
    landShare: number
    owners: string | null
    present: boolean
    proxy: string | null
  }[]
  invitation: string
}

export function MeetingDetail() {
  const { id } = useParams()
  const { data, error, reload } = useApi<MeetingDetailData>(`/y/meetings/${id}`)
  const [tab, setTab] = useState<'katilim' | 'oylama' | 'cagri' | 'tutanak'>('katilim')
  // İyimser güncelleme: işaret hemen değişir, sunucu yanıtı gelince tazelenir
  const [presence, setPresence] = useState<Record<number, boolean>>({})
  const [ballots, setBallots] = useState<Record<string, string | null>>({})
  const { busy, run } = useAction()
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => {
        const m = d.meeting
        const setAttendance = (unitId: number, present: boolean, proxy: string | null) => {
          setPresence((p) => ({ ...p, [unitId]: present }))
          return run(() => api.put(`/y/meetings/${m.id}/attendance`, { items: [{ unitId, present, proxy }] })).then(
            reload,
          )
        }
        const vote = (itemId: number, unitId: number, v: string | null) => {
          setBallots((b) => ({ ...b, [`${itemId}:${unitId}`]: v }))
          return run(() => api.put(`/y/agenda/${itemId}/votes`, { votes: [{ unitId, vote: v }] })).then(reload)
        }
        const allYes = (itemId: number) =>
          run(
            () =>
              api.put(`/y/agenda/${itemId}/votes`, {
                votes: d.units.filter((u) => u.present).map((u) => ({ unitId: u.id, vote: 'evet' })),
              }),
            'Katılanların tümü “evet” olarak işaretlendi',
          ).then(reload)
        return (
          <>
            <PageHead
              title={m.title}
              subtitle={`${d.site.name} · ${dateTimeTR(m.first_at)} · ${m.location}`}
              actions={
                <>
                  <Badge tone={MEETING_STATUS[m.status]?.[1] ?? 'neutral'}>
                    {MEETING_STATUS[m.status]?.[0] ?? m.status}
                  </Badge>
                  <Link className="btn" to="/genel-kurul">
                    ← Toplantılar
                  </Link>
                </>
              }
            />
            {d.warnings.length > 0 && (
              <div className="alert warn" style={{ marginBottom: 12 }}>
                {d.warnings.map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}
            <div className="grid cols-3" style={{ marginBottom: 16 }}>
              <div className="card stat">
                <span className="label">
                  Toplantı yeter sayısı ({d.round === 'ilk' ? 'ilk toplantı' : 'ikinci toplantı'})
                </span>
                <span className="value" style={{ color: d.quorum.ok ? 'var(--success)' : 'var(--danger)' }}>
                  {d.quorum.ok ? 'Sağlandı' : 'Sağlanmadı'}
                </span>
                <span className="hint">{d.quorum.explanation}</span>
              </div>
              <div className="card stat">
                <span className="label">Katılım</span>
                <span className="value">
                  {d.quorum.presentCount}/{d.quorum.totalCount}
                </span>
                <span className="hint">
                  arsa payı {d.quorum.presentShare}/{d.quorum.totalShare}
                </span>
              </div>
              <div className="card stack">
                <Field label="Toplantı aşaması">
                  <select
                    value={m.held_round ?? 'ilk'}
                    onChange={(e) =>
                      void run(() => api.patch(`/y/meetings/${m.id}`, { heldRound: e.target.value })).then(reload)
                    }
                  >
                    <option value="ilk">İlk toplantı</option>
                    <option value="ikinci">İkinci toplantı (yeter sayı aranmaz)</option>
                  </select>
                </Field>
                {m.status !== 'tamamlandi' && (
                  <button
                    className="btn primary small"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => api.patch(`/y/meetings/${m.id}`, { status: 'tamamlandi' }),
                        'Toplantı tamamlandı, kararlar işlendi',
                      ).then(reload)
                    }
                  >
                    Toplantıyı tamamla
                  </button>
                )}
              </div>
            </div>
            <Tabs
              tabs={[
                ['katilim', 'Katılım'],
                ['oylama', 'Gündem ve oylama'],
                ['cagri', 'Çağrı'],
                ['tutanak', 'Tutanak'],
              ]}
              value={tab}
              onChange={setTab}
            />
            {tab === 'katilim' && (
              <Card>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bölüm</th>
                        <th>Malik</th>
                        <th className="right">Arsa payı</th>
                        <th>Hazır</th>
                        <th>Vekil (varsa)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.units.map((u) => (
                        <tr key={u.id}>
                          <td>{u.label}</td>
                          <td>{u.owners ?? '—'}</td>
                          <td className="right num">{u.landShare}</td>
                          <td>
                            <input
                              type="checkbox"
                              checked={presence[u.id] ?? u.present}
                              onChange={(e) => void setAttendance(u.id, e.target.checked, u.proxy)}
                              aria-label={`${u.label} hazır`}
                            />
                          </td>
                          <td>
                            <input
                              defaultValue={u.proxy ?? ''}
                              placeholder="Vekil adı"
                              onBlur={(e) => {
                                if ((e.target.value || null) !== u.proxy)
                                  void setAttendance(u.id, u.present || Boolean(e.target.value), e.target.value || null)
                              }}
                              aria-label={`${u.label} vekili`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {tab === 'oylama' && (
              <div className="stack" style={{ gap: 16 }}>
                {d.agenda.map((a) => (
                  <Card
                    key={a.id}
                    title={
                      <div>
                        <h3 style={{ margin: 0 }}>
                          {a.seq}. {a.title}
                        </h3>
                        <small className="muted">{a.ruleLabel}</small>
                      </div>
                    }
                    actions={
                      <>
                        <Badge tone={a.tally.passed ? 'ok' : 'bad'}>
                          {a.tally.passed ? 'Kabul' : 'Kabul edilmedi'}
                        </Badge>
                        <button className="btn small" disabled={busy} onClick={() => void allYes(a.id)}>
                          Hepsi evet
                        </button>
                      </>
                    }
                  >
                    {a.details && <p className="muted">{a.details}</p>}
                    <p style={{ fontSize: '0.9rem' }}>
                      Evet {a.tally.yes} · Hayır {a.tally.no} · Çekimser {a.tally.abstain} · Oy kullanmayan{' '}
                      {a.tally.notVoted} — {a.tally.explanation}
                    </p>
                    <div className="row">
                      {d.units
                        .filter((u) => u.present)
                        .map((u) => {
                          const key = `${a.id}:${u.id}`
                          const v = key in ballots ? (ballots[key] ?? null) : (a.votes[String(u.id)] ?? null)
                          return (
                            <select
                              key={u.id}
                              value={v ?? ''}
                              onChange={(e) => void vote(a.id, u.id, e.target.value || null)}
                              style={{
                                width: 170,
                                borderColor:
                                  v === 'evet' ? 'var(--success)' : v === 'hayir' ? 'var(--danger)' : undefined,
                              }}
                              aria-label={`${u.label} oyu`}
                            >
                              <option value="">{u.label}: —</option>
                              <option value="evet">{u.label}: Evet</option>
                              <option value="hayir">{u.label}: Hayır</option>
                              <option value="cekimser">{u.label}: Çekimser</option>
                            </select>
                          )
                        })}
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {tab === 'cagri' && (
              <Invitation meetingId={m.id} text={d.invitation} invitedAt={m.invited_at} onSent={reload} />
            )}
            {tab === 'tutanak' && (
              <Card
                title="Tutanak taslağı"
                actions={
                  <>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        void run(() => api.post(`/y/meetings/${m.id}/minutes`), 'Tutanak oluşturuldu').then(reload)
                      }
                    >
                      Katılım ve oylardan oluştur
                    </button>
                    <button className="btn" onClick={() => window.print()}>
                      Yazdır
                    </button>
                  </>
                }
              >
                {m.minutes ? (
                  <pre className="pre" style={{ fontFamily: 'inherit' }}>
                    {m.minutes}
                  </pre>
                ) : (
                  <Empty>Henüz tutanak yok.</Empty>
                )}
                <div className="alert info" style={{ marginTop: 12 }}>
                  Kararlar noter onaylı karar defterine yazılır ve toplantıda hazır bulunan kat maliklerince imzalanır
                  (KMK m.32). Çevrim içi oylamanın kanuni dayanağı yoktur; oylar fiziki toplantıda alınır.
                </div>
              </Card>
            )}
          </>
        )
      }}
    </Load>
  )
}

function Invitation({
  meetingId,
  text,
  invitedAt,
  onSent,
}: {
  meetingId: number
  text: string
  invitedAt: string | null
  onSent: () => void
}) {
  const [value, setValue] = useState(text)
  const [channels, setChannels] = useState<string[]>(['whatsapp', 'email'])
  const { busy, run } = useAction()
  return (
    <Card
      title="Toplantı çağrısı"
      actions={invitedAt ? <Badge tone="ok">Gönderildi: {dateTimeTR(invitedAt)}</Badge> : null}
    >
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={16} aria-label="Çağrı metni" />
      <div className="row between" style={{ marginTop: 12 }}>
        <div className="row">
          {[
            ['whatsapp', 'WhatsApp'],
            ['sms', 'SMS'],
            ['email', 'E-posta'],
          ].map(([k, v]) => (
            <label key={k} className="check">
              <input
                type="checkbox"
                checked={channels.includes(k!)}
                onChange={() => setChannels((cs) => (cs.includes(k!) ? cs.filter((x) => x !== k) : [...cs, k!]))}
              />{' '}
              {v}
            </label>
          ))}
        </div>
        <button
          className="btn primary"
          disabled={busy || channels.length === 0}
          onClick={() =>
            void run(
              () =>
                api.post<{ sent: number; note: string }>(`/y/meetings/${meetingId}/invite`, { channels, text: value }),
              (r) => `${r.sent} kat malikine gönderildi`,
            ).then(onSent)
          }
        >
          Kat maliklerine gönder
        </button>
      </div>
      <small className="muted">
        KMK m.29: çağrı imza karşılığı tebliğ ya da taahhütlü mektupla da yapılmalıdır; elektronik bildirim bunu
        tamamlar.
      </small>
    </Card>
  )
}

// --- Periyodik kontroller ---
type ComplianceItem = {
  id: number
  site_name: string
  kind: string
  title: string
  interval_months: number
  last_done: string | null
  next_due: string | null
  vendor_name: string | null
  result: string | null
  notes: string | null
  state: string
}

export function Compliance() {
  const { siteId } = useSite()
  const { data, error, reload } = useApi<ComplianceItem[]>(siteId ? `/y/compliance?siteId=${siteId}` : null)
  const [done, setDone] = useState<ComplianceItem | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <PageHead
        title="Periyodik kontroller"
        subtitle="Asansör, yangın, doğalgaz, su deposu, sigorta… Süresi yaklaşanlar panoda uyarı olarak görünür."
        actions={
          <button className="btn primary" onClick={() => setAdding(true)}>
            Kontrol ekle
          </button>
        }
      />
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
                      <th>Kontrol</th>
                      <th>Periyot</th>
                      <th>Son yapılan</th>
                      <th>Sonraki</th>
                      <th>Sonuç</th>
                      <th>Firma</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <b>{c.title}</b>
                        </td>
                        <td>{c.interval_months === 1 ? 'Aylık' : `${c.interval_months} ay`}</td>
                        <td>{dateTR(c.last_done)}</td>
                        <td>
                          {dateTR(c.next_due)}{' '}
                          <Badge
                            tone={
                              c.state === 'gecikti'
                                ? 'bad'
                                : c.state === 'yaklasiyor'
                                  ? 'warn'
                                  : c.state === 'tamam'
                                    ? 'ok'
                                    : 'neutral'
                            }
                          >
                            {c.state === 'gecikti'
                              ? 'Gecikti'
                              : c.state === 'yaklasiyor'
                                ? 'Yaklaşıyor'
                                : c.state === 'tamam'
                                  ? 'Zamanında'
                                  : 'Tarih yok'}
                          </Badge>
                        </td>
                        <td>
                          {c.result ? (
                            <Badge
                              tone={
                                c.result === 'kirmizi'
                                  ? 'bad'
                                  : c.result === 'sari'
                                    ? 'warn'
                                    : c.result === 'mavi'
                                      ? 'info'
                                      : 'ok'
                              }
                            >
                              {ELEVATOR_LABELS[c.result as keyof typeof ELEVATOR_LABELS] ?? c.result}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>{c.vendor_name ?? '—'}</td>
                        <td>
                          <button className="btn small" onClick={() => setDone(c)}>
                            Yapıldı
                          </button>
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
      {done && (
        <DoneModal
          item={done}
          onClose={() => setDone(null)}
          onSaved={() => {
            setDone(null)
            reload()
          }}
        />
      )}
      {adding && siteId && (
        <AddCompliance
          siteId={siteId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </>
  )
}

function DoneModal({ item, onClose, onSaved }: { item: ComplianceItem; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(todayISO())
  const [result, setResult] = useState(item.kind === 'asansor_periyodik' ? 'yesil' : '')
  const [notes, setNotes] = useState('')
  const { busy, run } = useAction()
  return (
    <Modal
      title={item.title}
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
                () =>
                  api.post<{ nextDue: string }>(`/y/compliance/${item.id}/done`, {
                    date,
                    result: result || null,
                    notes: notes || null,
                  }),
                (r) => `Kaydedildi, sonraki: ${dateTR(r.nextDue)}`,
              ).then((r) => r && onSaved())
            }
          >
            Kaydet
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Yapıldığı tarih">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {item.kind === 'asansor_periyodik' ? (
          <Field label="Etiket">
            <select value={result} onChange={(e) => setResult(e.target.value)}>
              {Object.entries(ELEVATOR_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Sonuç">
            <input value={result} onChange={(e) => setResult(e.target.value)} placeholder="Uygun" />
          </Field>
        )}
        <Field label="Not" className="full">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function AddCompliance({ siteId, onClose, onSaved }: { siteId: number; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<ComplianceKind>('asansor_periyodik')
  const [lastDone, setLastDone] = useState('')
  const [months, setMonths] = useState<number>(COMPLIANCE_KINDS.asansor_periyodik.months)
  const { busy, run } = useAction()
  return (
    <Modal
      title="Periyodik kontrol ekle"
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
                () => api.post('/y/compliance', { siteId, kind, intervalMonths: months, lastDone: lastDone || null }),
                'Eklendi',
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Kontrol türü" className="full">
          <select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as ComplianceKind
              setKind(k)
              setMonths(COMPLIANCE_KINDS[k].months)
            }}
          >
            {Object.entries(COMPLIANCE_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Periyot (ay)" hint="Önerilen değer; mevzuat ve üretici talimatına göre değiştirin">
          <input type="number" min={1} max={120} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
        </Field>
        <Field label="Son yapıldığı tarih">
          <input type="date" value={lastDone} onChange={(e) => setLastDone(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

// --- Belgeler ve asistan ---
type Doc = {
  id: number
  site_id: number | null
  title: string
  kind: string
  visibility: string
  created_at: string
  length: number
  site_name: string | null
  chunks: number
}
const DOC_KINDS: Record<string, string> = {
  yonetim_plani: 'Yönetim planı',
  ic_yonetmelik: 'İç yönetmelik',
  karar: 'Kurul kararı',
  sozlesme: 'Sözleşme',
  sss: 'SSS',
  diger: 'Diğer',
}

export function Documents() {
  const { me } = useAuth()
  const { siteId } = useSite()
  const { data, error, reload } = useApi<Doc[]>(siteId ? `/y/documents?siteId=${siteId}` : null)
  const [tab, setTab] = useState<'belgeler' | 'asistan'>('belgeler')
  const [adding, setAdding] = useState(false)
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<
    {
      q: string
      a: string
      sources: { title: string; heading: string | null }[]
      engine: string
      model: string | null
    }[]
  >([])
  const { busy, run } = useAction()
  return (
    <>
      <PageHead
        title="Belgeler ve asistan"
        subtitle="Yönetim planı, iç yönetmelik ve kurul kararları sakin asistanının bilgi kaynağıdır. Yanıtlar kaynak gösterilerek verilir."
        actions={
          <button className="btn primary" onClick={() => setAdding(true)}>
            Belge ekle
          </button>
        }
      />
      <Tabs
        tabs={[
          ['belgeler', 'Belgeler'],
          ['asistan', 'Asistanı dene'],
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'belgeler' ? (
        <Card>
          <Load data={data} error={error} reload={reload}>
            {(rows) => (
              <div className="list">
                {rows.map((d) => (
                  <div key={d.id} className="list-item">
                    <div className="grow">
                      <b>{d.title}</b>
                      <div className="muted" style={{ fontSize: '0.85rem' }}>
                        {DOC_KINDS[d.kind] ?? d.kind} · {d.site_name ?? 'Tüm siteler'} · {d.chunks} bölüm ·{' '}
                        {d.visibility === 'sakin' ? 'sakinlere açık' : 'yalnız personel'}
                      </div>
                    </div>
                    <button
                      className="btn small danger"
                      disabled={busy}
                      onClick={() => {
                        if (confirm('Belge silinsin mi?'))
                          void run(() => api.del(`/y/documents/${d.id}`), 'Belge silindi').then(reload)
                      }}
                    >
                      Sil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Load>
        </Card>
      ) : (
        <Card
          title={
            <div className="row">
              <h2 style={{ margin: 0 }}>Asistan</h2>
              <EngineBadge engine={me?.ai.engine ?? 'kural'} model={me?.ai.model} />
            </div>
          }
        >
          <div className="chat" style={{ marginBottom: 12 }}>
            {answers.length === 0 && (
              <Empty>Örnek: “Tadilat hangi saatlerde yapılabilir?”, “Havuza misafir getirebilir miyim?”</Empty>
            )}
            {answers.map((x, i) => (
              <div key={i} className="stack" style={{ gap: 6 }}>
                <div className="bubble me">{x.q}</div>
                <div className="bubble bot">
                  {x.a}
                  {x.sources.length > 0 && (
                    <div className="muted" style={{ fontSize: '0.78rem', marginTop: 6 }}>
                      Kaynak: {x.sources.map((s) => `${s.title}${s.heading ? ` › ${s.heading}` : ''}`).join(' · ')}
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
              const q = question
              void run(() =>
                api.post<{
                  answer: string
                  sources: { title: string; heading: string | null }[]
                  engine: string
                  model: string | null
                }>('/y/assistant/ask', { siteId, question: q }),
              ).then((r) => {
                if (r) {
                  setAnswers((xs) => [...xs, { q, a: r.answer, sources: r.sources, engine: r.engine, model: r.model }])
                  setQuestion('')
                }
              })
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Bir soru yazın…"
              aria-label="Soru"
            />
            <button className="btn primary" disabled={busy || question.trim().length < 3}>
              Sor
            </button>
          </form>
        </Card>
      )}
      {adding && (
        <AddDocument
          siteId={siteId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </>
  )
}

function AddDocument({
  siteId,
  onClose,
  onSaved,
}: {
  siteId: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('ic_yonetmelik')
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('sakin')
  const { busy, run } = useAction()
  return (
    <Modal
      title="Belge ekle"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || title.length < 3 || body.length < 20}
            onClick={() =>
              void run(
                () => api.post('/y/documents', { siteId, title, kind, body, visibility }),
                'Belge eklendi ve dizinlendi',
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Kaydet
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Başlık">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Tür">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(DOC_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Metin"
          className="full"
          hint="Başlıkları “# Başlık” ile yazarsanız asistan kaynağı daha doğru gösterir. PDF’ten kopyalayıp yapıştırabilirsiniz."
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} />
        </Field>
        <Field label="Görünürlük">
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="sakin">Sakinlere açık</option>
            <option value="personel">Yalnız personel</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}
