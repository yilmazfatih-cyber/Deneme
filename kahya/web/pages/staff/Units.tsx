import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CHARGE_KINDS, PAYMENT_METHODS, type ChargeKind, type PaymentMethod } from '../../../shared/labels.ts'
import {
  Badge,
  Card,
  Empty,
  Field,
  Load,
  Modal,
  Money,
  PageHead,
  Stat,
  TicketStatusBadge,
} from '../../components/ui.tsx'
import { useAction, useSite } from '../../context.tsx'
import { api, dateTR, download, money, parseTL, phoneTR, todayISO, useApi } from '../../lib.ts'
import { PaymentModal, type Position, type Standing } from './Finance.tsx'

export function Units() {
  const navigate = useNavigate()
  const { site, siteId } = useSite()
  const { data, error, reload } = useApi<Standing[]>(siteId ? `/y/sites/${siteId}/units` : null)
  const detail = useApi<{ blocks: { id: number; name: string }[]; land_share_total: number | null }>(
    siteId ? `/y/sites/${siteId}` : null,
  )
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const needle = q.toLocaleLowerCase('tr-TR')
  return (
    <>
      <PageHead
        title="Bağımsız bölümler"
        subtitle={site?.name}
        actions={
          <>
            <Link className="btn" to="/ice-aktar">
              CSV ile içe aktar
            </Link>
            <button className="btn primary" onClick={() => setAdding(true)}>
              Bölüm ekle
            </button>
          </>
        }
      />
      <Card>
        <input
          placeholder="Ara: blok, daire, kişi…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320, marginBottom: 12 }}
          aria-label="Ara"
        />
        <Load data={data} error={error} reload={reload}>
          {(rows) => {
            const filtered = rows.filter(
              (u) =>
                !needle ||
                `${u.label} ${u.owner_name ?? ''} ${u.tenant_name ?? ''}`.toLocaleLowerCase('tr-TR').includes(needle),
            )
            const totalShare = rows.reduce((s, u) => s + u.land_share, 0)
            return (
              <>
                <p className="muted">
                  {rows.length} bölüm · arsa payları toplamı {totalShare}
                  {detail.data?.land_share_total && detail.data.land_share_total !== totalShare ? (
                    <Badge tone="warn">Tapudaki payda {detail.data.land_share_total} — kontrol edin</Badge>
                  ) : null}
                </p>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Bölüm</th>
                        <th>Malik</th>
                        <th>Kiracı</th>
                        <th className="right">Arsa payı</th>
                        <th className="right">m²</th>
                        <th className="right">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <tr key={u.id} className="clickable" onClick={() => navigate(`/daireler/${u.id}`)}>
                          <td>
                            <b>{u.label}</b>
                          </td>
                          <td>{u.owner_name ?? <span className="muted">—</span>}</td>
                          <td>{u.tenant_name ?? <span className="muted">—</span>}</td>
                          <td className="right num">{u.land_share}</td>
                          <td className="right num">{u.area_m2 ?? '—'}</td>
                          <td className="right">
                            <Money value={u.position.balance} tone />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )
          }}
        </Load>
      </Card>
      {adding && siteId && (
        <AddUnit
          siteId={siteId}
          blocks={detail.data?.blocks ?? []}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            reload()
            detail.reload()
          }}
        />
      )}
    </>
  )
}

function AddUnit({
  siteId,
  blocks,
  onClose,
  onSaved,
}: {
  siteId: number
  blocks: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const [blockId, setBlockId] = useState(blocks[0] ? String(blocks[0].id) : '')
  const [newBlock, setNewBlock] = useState('')
  const [no, setNo] = useState('')
  const [floor, setFloor] = useState('')
  const [kind, setKind] = useState('daire')
  const [area, setArea] = useState('')
  const [share, setShare] = useState('')
  const { busy, run } = useAction()
  const save = async () => {
    let bid: number | null = blockId ? Number(blockId) : null
    if (newBlock.trim())
      bid = (await api.post<{ id: number }>(`/y/sites/${siteId}/blocks`, { name: newBlock.trim() })).id
    return api.post(`/y/sites/${siteId}/units`, {
      blockId: bid,
      no,
      floor: floor ? Number(floor) : null,
      kind,
      areaM2: area ? Number(area.replace(',', '.')) : null,
      landShare: Number(share),
    })
  }
  return (
    <Modal
      title="Bağımsız bölüm ekle"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !no || !(Number(share) > 0)}
            onClick={() => void run(save, 'Bölüm eklendi').then((r) => r !== undefined && onSaved())}
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Blok">
          <select value={blockId} onChange={(e) => setBlockId(e.target.value)}>
            <option value="">Blok yok</option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ya da yeni blok">
          <input value={newBlock} onChange={(e) => setNewBlock(e.target.value)} placeholder="C Blok" />
        </Field>
        <Field label="Kapı / daire no">
          <input value={no} onChange={(e) => setNo(e.target.value)} />
        </Field>
        <Field label="Kat">
          <input inputMode="numeric" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </Field>
        <Field label="Tür">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="daire">Daire</option>
            <option value="dukkan">Dükkân</option>
            <option value="ofis">Ofis</option>
            <option value="depo">Depo</option>
            <option value="diger">Diğer</option>
          </select>
        </Field>
        <Field label="Brüt alan (m²)">
          <input inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <Field label="Arsa payı (pay)" hint="Tapudaki arsa payının payı, ör. 24/1200 için 24">
          <input inputMode="numeric" value={share} onChange={(e) => setShare(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

type UnitDetailData = {
  unit: {
    id: number
    site_id: number
    no: string
    block: string | null
    floor: number | null
    kind: string
    area_m2: number | null
    land_share: number
    site_name: string
  }
  occupants: {
    id: number
    role: string
    is_payer: number
    start_date: string | null
    end_date: string | null
    person_id: number
    full_name: string
    phone: string | null
    email: string | null
  }[]
  position: Position
  statement: {
    date: string
    type: 'borc' | 'odeme'
    id: number
    kind: string
    description: string
    debit: number
    credit: number
    balance: number
  }[]
  tickets: { id: number; title: string; status: string; priority: string; created_at: string }[]
  reminders: { stage: string; amount: number; created_at: string }[]
}

export function UnitDetail() {
  const { id } = useParams()
  const { data, error, reload } = useApi<UnitDetailData>(`/y/units/${id}`)
  const [modal, setModal] = useState<'odeme' | 'borc' | 'kisi' | null>(null)
  const { busy, run } = useAction()
  return (
    <Load data={data} error={error} reload={reload}>
      {(d) => {
        const label = d.unit.block ? `${d.unit.block} No ${d.unit.no}` : `Daire ${d.unit.no}`
        const active = d.occupants.filter((o) => !o.end_date)
        return (
          <>
            <PageHead
              title={label}
              subtitle={`${d.unit.site_name} · ${d.unit.kind} · arsa payı ${d.unit.land_share}${d.unit.area_m2 ? ` · ${d.unit.area_m2} m²` : ''}`}
              actions={
                <>
                  <Link className="btn" to="/daireler">
                    ← Bölümler
                  </Link>
                  <button className="btn" onClick={() => setModal('borc')}>
                    Borç ekle
                  </button>
                  <button className="btn primary" onClick={() => setModal('odeme')}>
                    Tahsilat gir
                  </button>
                </>
              }
            />
            <div className="grid cols-4" style={{ marginBottom: 16 }}>
              <Stat
                label="Bakiye"
                value={money(d.position.balance)}
                tone={d.position.balance > 0 ? 'bad' : 'ok'}
                hint={d.position.balance < 0 ? 'avans' : undefined}
              />
              <Stat
                label="Vadesi geçmiş"
                value={money(d.position.overdue)}
                hint={d.position.oldestOverdue ? `en eski vade ${dateTR(d.position.oldestOverdue)}` : 'yok'}
              />
              <Stat label="İşleyen gecikme tazminatı" value={money(d.position.lateFeeAccrued)} />
              <Stat
                label="Sonraki ödeme"
                value={d.position.nextDue ? money(d.position.nextDue.amount) : '—'}
                hint={d.position.nextDue ? dateTR(d.position.nextDue.date) : undefined}
              />
            </div>
            <div className="grid sidebar-right">
              <Card
                title="Hesap ekstresi"
                actions={
                  <button
                    className="btn small"
                    onClick={() =>
                      download(
                        `ekstre-${label.replace(/\s+/g, '-')}.csv`,
                        [
                          'Tarih;Açıklama;Borç;Alacak;Bakiye',
                          ...d.statement.map(
                            (l) =>
                              `${l.date};${l.description};${(l.debit / 100).toFixed(2)};${(l.credit / 100).toFixed(2)};${(l.balance / 100).toFixed(2)}`,
                          ),
                        ].join('\n'),
                        'text/csv;charset=utf-8',
                      )
                    }
                  >
                    CSV indir
                  </button>
                }
              >
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>Açıklama</th>
                        <th className="right">Borç</th>
                        <th className="right">Alacak</th>
                        <th className="right">Bakiye</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...d.statement].reverse().map((l) => (
                        <tr key={`${l.type}${l.id}`}>
                          <td className="num">{dateTR(l.date)}</td>
                          <td>
                            {l.description}
                            {l.type === 'borc' && l.kind !== 'aidat' && (
                              <Badge tone={l.kind === 'gecikme' ? 'warn' : 'info'}>
                                {CHARGE_KINDS[l.kind as ChargeKind] ?? l.kind}
                              </Badge>
                            )}
                            {l.type === 'odeme' && (
                              <span className="muted"> · {PAYMENT_METHODS[l.kind as PaymentMethod] ?? l.kind}</span>
                            )}
                          </td>
                          <td className="right">{l.debit ? <Money value={l.debit} /> : ''}</td>
                          <td className="right">{l.credit ? <Money value={l.credit} /> : ''}</td>
                          <td className="right">
                            <Money value={l.balance} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <div className="stack" style={{ gap: 16 }}>
                <Card
                  title="Malik ve oturanlar"
                  actions={
                    <button className="btn small" onClick={() => setModal('kisi')}>
                      Ekle
                    </button>
                  }
                >
                  {active.length === 0 ? (
                    <Empty>Kayıtlı kişi yok.</Empty>
                  ) : (
                    <div className="list">
                      {active.map((o) => (
                        <div className="list-item" key={o.id}>
                          <div className="grow">
                            <b>{o.full_name}</b>{' '}
                            <Badge tone={o.role === 'malik' ? 'brand' : 'info'}>
                              {o.role === 'malik' ? 'Malik' : 'Kiracı'}
                            </Badge>
                            {o.is_payer ? <Badge tone="ok">Aidatı öder</Badge> : null}
                            <div className="muted" style={{ fontSize: '0.85rem' }}>
                              {phoneTR(o.phone)} {o.email ? `· ${o.email}` : ''}
                            </div>
                          </div>
                          <button
                            className="btn small"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`${o.full_name} bu bölümden ayrıldı olarak işaretlensin mi?`))
                                void run(
                                  () => api.post(`/y/occupancies/${o.id}/end`, { endDate: todayISO() }),
                                  'Kayıt güncellendi',
                                ).then(reload)
                            }}
                          >
                            Ayrıldı
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Talepler">
                  {d.tickets.length === 0 ? (
                    <small className="muted">Talep yok.</small>
                  ) : (
                    d.tickets.map((t) => (
                      <div key={t.id} className="row between" style={{ marginBottom: 6 }}>
                        <Link to={`/talepler/${t.id}`}>
                          #{t.id} {t.title}
                        </Link>
                        <TicketStatusBadge value={t.status} />
                      </div>
                    ))
                  )}
                </Card>
                <Card title="Hatırlatmalar">
                  {d.reminders.length === 0 ? (
                    <small className="muted">Gönderilmiş hatırlatma yok.</small>
                  ) : (
                    d.reminders.map((r, i) => (
                      <div key={i}>
                        {dateTR(r.created_at)} — {r.stage}
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </div>
            {modal === 'odeme' && (
              <PaymentModal
                unit={{ id: d.unit.id, label, position: d.position }}
                onClose={() => setModal(null)}
                onSaved={() => {
                  setModal(null)
                  reload()
                }}
              />
            )}
            {modal === 'borc' && (
              <ChargeModal
                unitId={d.unit.id}
                onClose={() => setModal(null)}
                onSaved={() => {
                  setModal(null)
                  reload()
                }}
              />
            )}
            {modal === 'kisi' && (
              <OccupantModal
                unitId={d.unit.id}
                onClose={() => setModal(null)}
                onSaved={() => {
                  setModal(null)
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

function ChargeModal({ unitId, onClose, onSaved }: { unitId: number; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<ChargeKind>('diger')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(todayISO())
  const [lateFee, setLateFee] = useState(true)
  const { busy, run } = useAction()
  const kurus = parseTL(amount)
  return (
    <Modal
      title="Borç ekle"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || !kurus || description.length < 2}
            onClick={() =>
              void run(
                () => api.post(`/y/units/${unitId}/charges`, { kind, description, amount: kurus, dueDate, lateFee }),
                'Borç eklendi',
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Tür">
          <select value={kind} onChange={(e) => setKind(e.target.value as ChargeKind)}>
            {Object.entries(CHARGE_KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tutar (TL)">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Açıklama" className="full">
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Son ödeme tarihi">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={lateFee} onChange={(e) => setLateFee(e.target.checked)} /> Gecikme tazminatı
          işlesin
        </label>
      </div>
    </Modal>
  )
}

function OccupantModal({ unitId, onClose, onSaved }: { unitId: number; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'malik' | 'kiraci'>('kiraci')
  const [isPayer, setIsPayer] = useState(true)
  const { busy, run } = useAction()
  return (
    <Modal
      title="Malik / kiracı ekle"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn primary"
            disabled={busy || fullName.trim().length < 2}
            onClick={() =>
              void run(
                () =>
                  api.post(`/y/units/${unitId}/occupants`, {
                    role,
                    isPayer,
                    person: { fullName, phone: phone || null, email: email || null },
                  }),
                'Kişi eklendi',
              ).then((r) => r !== undefined && onSaved())
            }
          >
            Ekle
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Ad soyad" className="full">
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Cep telefonu" hint="Sakin portalına bu numarayla giriş yapar">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05XX XXX XX XX" />
        </Field>
        <Field label="E-posta">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as 'malik' | 'kiraci')}>
            <option value="malik">Kat maliki</option>
            <option value="kiraci">Kiracı</option>
          </select>
        </Field>
        <label className="check" style={{ alignSelf: 'end' }}>
          <input type="checkbox" checked={isPayer} onChange={(e) => setIsPayer(e.target.checked)} /> Aidatı bu kişi öder
        </label>
      </div>
    </Modal>
  )
}

type Person = {
  id: number
  full_name: string
  phone: string | null
  email: string | null
  units: string | null
  consent_sms: number
  consent_whatsapp: number
  consent_email: number
  kvkk_notice_at: string | null
}

export function People() {
  const [q, setQ] = useState('')
  const { data, error, reload } = useApi<Person[]>(`/y/people${q.length >= 2 ? `?q=${encodeURIComponent(q)}` : ''}`)
  const { busy, run } = useAction()
  return (
    <>
      <PageHead title="Sakinler" subtitle="Kat malikleri ve kiracılar; iletişim izinleri ve KVKK işlemleri" />
      <Card>
        <input
          placeholder="Ad, telefon, e-posta ya da daire ile ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 12 }}
          aria-label="Ara"
        />
        <Load data={data} error={error} reload={reload}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ad soyad</th>
                    <th>İletişim</th>
                    <th>Bağımsız bölüm</th>
                    <th>İzinler</th>
                    <th>KVKK</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.full_name}</b>
                      </td>
                      <td>
                        {phoneTR(p.phone)}
                        {p.email && (
                          <div className="muted" style={{ fontSize: '0.82rem' }}>
                            {p.email}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: 280 }}>
                        <small>{p.units ?? '—'}</small>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <Badge tone={p.consent_whatsapp ? 'ok' : 'neutral'}>WA</Badge>
                          <Badge tone={p.consent_sms ? 'ok' : 'neutral'}>SMS</Badge>
                          <Badge tone={p.consent_email ? 'ok' : 'neutral'}>E-posta</Badge>
                        </div>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          {p.kvkk_notice_at ? (
                            <Badge tone="ok">Aydınlatıldı</Badge>
                          ) : (
                            <Badge tone="warn">Aydınlatma yok</Badge>
                          )}
                          <button
                            className="btn small"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => api.get<unknown>(`/y/people/${p.id}/export`),
                                'Veri dökümü indirildi',
                              ).then((r) => r && download(`kvkk-${p.id}.json`, JSON.stringify(r, null, 2)))
                            }
                          >
                            Döküm
                          </button>
                          <button
                            className="btn small danger"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `${p.full_name} kişisinin verileri anonimleştirilsin mi? Mali kayıtlar daireye bağlı kalır. Bu işlem geri alınamaz.`,
                                )
                              )
                                void run(() => api.post(`/y/people/${p.id}/anonymize`), 'Kişisel veriler silindi').then(
                                  reload,
                                )
                            }}
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Load>
      </Card>
    </>
  )
}
