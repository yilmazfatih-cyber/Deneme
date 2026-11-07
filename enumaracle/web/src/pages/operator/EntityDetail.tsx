import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog } from '../../components/Dialog'
import { Empty, ErrorBox, Loading, Notice, PageHeader } from '../../components/Feedback'
import { SelectField, TextArea, fe } from '../../components/Fields'
import { PhonePreview } from '../../components/PhonePreview'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import {
  BRANDING_STATUS,
  DOC_KIND_TEXT,
  ENTITY_STATUS,
  fmtBytes,
  fmtDateTime,
  fmtNum,
  NUMBER_STATUS,
  RISK_TEXT,
  TN_KIND_TEXT,
  USE_CASE_TEXT,
} from '../../format'
import { Range } from '../../components/Range'
import { useAction, useApi } from '../../hooks'
import type { Entity, EntityStatus, RiskTier } from '../../types'

const TRANSITIONS: Record<EntityStatus, EntityStatus[]> = {
  pending: ['in_review'],
  in_review: ['verified', 'rejected'],
  verified: ['suspended'],
  suspended: ['verified'],
  rejected: ['in_review'],
}

const ACTION_TEXT: Record<EntityStatus, string> = {
  pending: 'Beklemeye al',
  in_review: 'İncelemeye al',
  verified: 'Doğrula ve onayla',
  rejected: 'Reddet',
  suspended: 'Askıya al',
}

function DecisionPanel({ entity, onDone }: { entity: Entity; onDone: () => void }) {
  const options = TRANSITIONS[entity.status] ?? []
  const [to, setTo] = useState<EntityStatus | null>(null)
  const [note, setNote] = useState('')
  const [risk, setRisk] = useState<RiskTier | ''>(entity.risk_tier || '')
  const action = useAction()

  if (options.length === 0) return null
  const needsNote = to === 'rejected' || to === 'suspended'

  const submit = async () => {
    if (!to) return
    const ok = await action.run(async () => {
      await api.decide(entity.id, { to_status: to, note: note.trim(), ...(risk ? { risk_tier: risk } : {}) })
      return true
    })
    if (ok) {
      setTo(null)
      setNote('')
      onDone()
    }
  }

  return (
    <section className="card decision-card" aria-labelledby="decision-h">
      <h2 id="decision-h">Karar ver</h2>
      <p className="muted small">
        Mevcut durum: <StatusBadge map={ENTITY_STATUS} value={entity.status} />
      </p>
      <div className="grid-2">
        <TextArea
          label="Karar notu"
          rows={3}
          value={note}
          onValue={setNote}
          hint="Şirkete e-posta ile iletilir ve denetim kaydına yazılır."
          error={fe(action.fields, 'note')}
        />
        <SelectField
          label="Risk seviyesi"
          value={risk}
          onValue={(v) => setRisk(v as RiskTier | '')}
          error={fe(action.fields, 'risk_tier')}
          options={[
            { value: '', label: 'Değiştirme' },
            { value: 'low', label: RISK_TEXT.low },
            { value: 'medium', label: RISK_TEXT.medium },
            { value: 'high', label: RISK_TEXT.high },
          ]}
        />
      </div>
      <div className="btn-row">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={o === 'rejected' || o === 'suspended' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => {
              action.reset()
              setTo(o)
            }}
          >
            {ACTION_TEXT[o]}
          </button>
        ))}
      </div>
      {to ? (
        <ConfirmDialog
          title={ACTION_TEXT[to]}
          danger={needsNote}
          confirmText={ACTION_TEXT[to]}
          pending={action.pending}
          error={action.error}
          onCancel={() => setTo(null)}
          onConfirm={submit}
          message={
            <>
              <p>
                <strong>{entity.legal_name}</strong> durumu{' '}
                <StatusBadge map={ENTITY_STATUS} value={entity.status} /> → <StatusBadge map={ENTITY_STATUS} value={to} /> olarak
                değişecek.
              </p>
              {to === 'suspended' ? <p>Şirketin tüm etkin numaraları da askıya alınır ve aramalar doğrulanmış görünmez.</p> : null}
              {to === 'verified' ? <p>Onaydan sonra numaralar etkinleştirilebilir ve onaylı marka aramalarda gösterilir.</p> : null}
              {needsNote && !note.trim() ? <Notice tone="warning">Gerekçe yazmanız önerilir; şirket bu notu görür.</Notice> : null}
            </>
          }
        />
      ) : null}
    </section>
  )
}

export function EntityDetailPage() {
  const { id = '' } = useParams()
  const { has } = useAuth()
  const res = useApi(() => api.entity(id), id)
  const d = res.data

  if (!d) {
    return (
      <>
        <PageHeader title="Şirket ayrıntısı" />
        {res.error ? <ErrorBox message={res.error} onRetry={res.reload} /> : <Loading />}
      </>
    )
  }
  const e = d.entity
  const documents = d.documents ?? []
  const decisions = d.decisions ?? []
  const numbers = d.numbers ?? []
  const branding = d.branding ?? []
  const defaultBrand = branding.find((b) => b.is_default) ?? branding[0]

  return (
    <>
      <p className="breadcrumb">
        <Link to="/operator/dogrulama">← Doğrulama kuyruğu</Link>
      </p>
      <PageHeader title={e.legal_name} description={e.trade_name} actions={<StatusBadge map={ENTITY_STATUS} value={e.status} />} />
      <ErrorBox message={res.error} onRetry={res.reload} />
      {e.reject_reason ? <Notice tone="warning" title="Son ret / askı gerekçesi">{e.reject_reason}</Notice> : null}

      {has('admin') ? <DecisionPanel key={`${e.id}-${e.status}`} entity={e} onDone={res.reload} /> : null}

      <div className="grid-2">
        <section className="card">
          <h2>Şirket bilgileri</h2>
          <dl className="kv">
            <div><dt>VKN</dt><dd className="mono">{e.vkn}</dd></div>
            <div><dt>MERSİS</dt><dd className="mono">{e.mersis || '—'}</dd></div>
            <div><dt>Sektör</dt><dd>{e.sector}</dd></div>
            <div><dt>Şehir / ülke</dt><dd>{e.city} / {e.country || 'TR'}</dd></div>
            <div><dt>Web sitesi</dt><dd>{e.website ? <a href={e.website} target="_blank" rel="noreferrer noopener">{e.website}</a> : '—'}</dd></div>
            <div><dt>İYS kaydı</dt><dd>{e.iys_registered ? 'Var (beyan)' : 'Beyan edilmedi'}</dd></div>
            <div><dt>Risk seviyesi</dt><dd>{e.risk_tier ? RISK_TEXT[e.risk_tier] : '—'}</dd></div>
          </dl>
        </section>
        <section className="card">
          <h2>Yetkili ve süreç</h2>
          <dl className="kv">
            <div><dt>Yetkili</dt><dd>{e.contact_name}</dd></div>
            <div><dt>E-posta</dt><dd><a href={`mailto:${e.contact_email}`}>{e.contact_email}</a></dd></div>
            <div><dt>Telefon</dt><dd>{e.contact_phone}</dd></div>
            <div><dt>Kayıt</dt><dd>{fmtDateTime(e.created_at)}</dd></div>
            <div><dt>Başvuru</dt><dd>{fmtDateTime(e.submitted_at)}</dd></div>
            <div><dt>Son karar</dt><dd>{fmtDateTime(e.vetted_at)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="card">
        <h2>Belgeler ({documents.length})</h2>
        {documents.length === 0 ? (
          <Empty title="Belge eklenmemiş." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Tür</th>
                  <th scope="col">Dosya</th>
                  <th scope="col">Boyut</th>
                  <th scope="col">SHA-256</th>
                  <th scope="col">Eklenme</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>{DOC_KIND_TEXT[doc.kind] ?? doc.kind}</td>
                    <td>
                      {doc.file_name}
                      <span className="muted small block">{doc.mime_type}</span>
                    </td>
                    <td>{fmtBytes(doc.size_bytes)}</td>
                    <td className="mono small truncate" title={doc.sha256}>
                      {doc.sha256}
                    </td>
                    <td>{fmtDateTime(doc.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Karar geçmişi</h2>
        {decisions.length === 0 ? (
          <Empty title="Henüz karar verilmemiş." />
        ) : (
          <ol className="timeline">
            {decisions.map((dec) => (
              <li key={dec.id}>
                <div className="timeline-head">
                  <StatusBadge map={ENTITY_STATUS} value={dec.from_status} />
                  <span aria-label="sonra">→</span>
                  <StatusBadge map={ENTITY_STATUS} value={dec.to_status} />
                  <span className="muted small">{fmtDateTime(dec.created_at)}</span>
                </div>
                {dec.note ? <p>{dec.note}</p> : <p className="muted small">Not yok</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2>Numaralar ({numbers.length})</h2>
        {numbers.length === 0 ? (
          <Empty title="Numara eklenmemiş." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Numara / aralık</th>
                  <th scope="col">Tür</th>
                  <th scope="col" className="num">Adet</th>
                  <th scope="col">Kullanım</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Tahsis</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((n) => (
                  <tr key={n.id}>
                    <td className="mono"><Range start={n.range_start} end={n.range_end} /></td>
                    <td>{TN_KIND_TEXT[n.kind] ?? n.kind}</td>
                    <td className="num">{fmtNum(n.count)}</td>
                    <td>
                      {USE_CASE_TEXT[n.use_case] ?? n.use_case}
                      {n.call_reason ? <span className="muted small block">{n.call_reason}</span> : null}
                    </td>
                    <td>
                      <StatusBadge map={NUMBER_STATUS} value={n.status} />
                    </td>
                    <td>{n.carrier_confirmed ? <Badge tone="success">Teyitli</Badge> : <Badge tone="neutral">Teyit yok</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small">
          <Link to={`/operator/numaralar?entity_id=${e.id}`}>Numara işlemlerine git</Link>
        </p>
      </section>

      <section className="card">
        <h2>Marka ({branding.length})</h2>
        {branding.length === 0 ? (
          <Empty title="Marka tanımlanmamış." />
        ) : (
          <div className="brand-grid">
            <ul className="plain-list">
              {branding.map((b) => (
                <li key={b.id} className="brand-row">
                  <strong>{b.display_name}</strong> {b.is_default ? <Badge tone="info">Varsayılan</Badge> : null}{' '}
                  <StatusBadge map={BRANDING_STATUS} value={b.status} />
                  {b.call_reason ? <span className="muted small block">{b.call_reason}</span> : null}
                </li>
              ))}
            </ul>
            {defaultBrand ? (
              <PhonePreview
                displayName={defaultBrand.display_name}
                logoUrl={defaultBrand.logo_url}
                callReason={defaultBrand.call_reason}
                tn={numbers[0]?.range_start}
                verified={e.status === 'verified'}
                caption="Varsayılan markanın abone ekranındaki görünümü"
              />
            ) : null}
          </div>
        )}
        <p className="small">
          <Link to="/operator/marka">Marka onayına git</Link>
        </p>
      </section>
    </>
  )
}
