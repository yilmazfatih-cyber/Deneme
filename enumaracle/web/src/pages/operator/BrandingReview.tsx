import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog } from '../../components/Dialog'
import { Empty, ErrorBox, Loading, PageHeader } from '../../components/Feedback'
import { SelectField, TextArea, fe } from '../../components/Fields'
import { PhonePreview } from '../../components/PhonePreview'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import { BRANDING_STATUS, fmtDateTime, runeLength } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { Branding, BrandingStatus } from '../../types'
import { useEntityNames } from './useEntityNames'

function ReviewPanel({ brand, entityName, onDone }: { brand: Branding; entityName: string; onDone: () => void }) {
  const { has } = useAuth()
  const [note, setNote] = useState(brand.review_note ?? '')
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null)
  const action = useAction()

  const submit = async () => {
    if (!decision) return
    const ok = await action.run(async () => {
      await api.reviewBranding(brand.id, { status: decision, note: note.trim() })
      return true
    })
    if (ok) {
      setDecision(null)
      onDone()
    }
  }

  const checks = [
    { ok: runeLength(brand.display_name) <= 32 && brand.display_name.trim().length > 0, text: 'Görünen ad 1–32 karakter' },
    { ok: !brand.logo_url || brand.logo_url.startsWith('https://'), text: 'Logo adresi HTTPS' },
    { ok: runeLength(brand.call_reason ?? '') <= 64, text: 'Arama nedeni en fazla 64 karakter' },
  ]

  return (
    <section className="card review-panel" aria-labelledby="review-h">
      <div className="review-grid">
        <PhonePreview
          displayName={brand.display_name}
          logoUrl={brand.logo_url}
          callReason={brand.call_reason}
          tn="+902125550000"
          caption="Abonenin göreceği görünüm (örnek numara)"
        />
        <div>
          <h2 id="review-h">{brand.display_name}</h2>
          <p>
            <Link to={`/operator/dogrulama/${brand.entity_id}`}>{entityName}</Link>{' '}
            {brand.is_default ? <Badge tone="info">Varsayılan marka</Badge> : null} <StatusBadge map={BRANDING_STATUS} value={brand.status} />
          </p>
          <dl className="kv">
            <div><dt>Arama nedeni</dt><dd>{brand.call_reason || '—'}</dd></div>
            <div><dt>Logo</dt><dd className="truncate">{brand.logo_url ? <a href={brand.logo_url} target="_blank" rel="noreferrer noopener">{brand.logo_url}</a> : 'Yok (baş harfler gösterilir)'}</dd></div>
            <div><dt>Güncelleme</dt><dd>{fmtDateTime(brand.updated_at)}</dd></div>
            {brand.reviewed_at ? <div><dt>Son inceleme</dt><dd>{fmtDateTime(brand.reviewed_at)}</dd></div> : null}
          </dl>
          <ul className="checklist" aria-label="Biçim denetimi">
            {checks.map((c) => (
              <li key={c.text}>
                <Badge tone={c.ok ? 'success' : 'danger'}>{c.ok ? 'Uygun' : 'Uygun değil'}</Badge> {c.text}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Ad, logo ve neden şirketin tescilli markası ve gerçek arama amacıyla uyumlu olmalı; yanıltıcı ifadeler (ör. “Polis”,
            “Banka” taklidi) reddedilmelidir.
          </p>
          {has('admin') ? (
            <>
              <TextArea label="İnceleme notu" rows={3} value={note} onValue={setNote} error={fe(action.fields, 'note')} />
              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={() => setDecision('approved')}>
                  Onayla
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setDecision('rejected')}>
                  Reddet
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {decision ? (
        <ConfirmDialog
          title={decision === 'approved' ? 'Markayı onayla' : 'Markayı reddet'}
          confirmText={decision === 'approved' ? 'Onayla' : 'Reddet'}
          danger={decision === 'rejected'}
          pending={action.pending}
          error={action.error}
          onCancel={() => setDecision(null)}
          onConfirm={submit}
          message={
            decision === 'approved' ? (
              <p>“{brand.display_name}” doğrulanmış aramalarda abonelere gösterilecek.</p>
            ) : (
              <p>“{brand.display_name}” reddedilecek. {note.trim() ? 'Notunuz şirkete iletilir.' : 'Bir gerekçe yazmanız önerilir.'}</p>
            )
          }
        />
      ) : null}
    </section>
  )
}

export function BrandingReviewPage() {
  const [status, setStatus] = useState<BrandingStatus | ''>('pending_review')
  const [selected, setSelected] = useState<string | null>(null)
  const names = useEntityNames()
  const res = useApi(() => api.adminBranding(status), status)
  const list = res.data ? items(res.data) : undefined
  const current = list?.find((b) => b.id === selected) ?? list?.[0]

  return (
    <>
      <PageHeader title="Marka onayı" description="Aramalarda gösterilecek ad, logo ve arama nedenini inceleyin" />
      <div className="toolbar filters">
        <SelectField
          label="Durum"
          value={status}
          onValue={(v) => {
            setStatus(v as BrandingStatus | '')
            setSelected(null)
          }}
          options={[{ value: '', label: 'Tümü' }, ...Object.entries(BRANDING_STATUS).map(([value, i]) => ({ value, label: i.text }))]}
        />
      </div>
      <ErrorBox message={res.error} onRetry={res.reload} />
      {!list ? (
        res.error ? null : <Loading />
      ) : list.length === 0 ? (
        <Empty title="İncelenecek marka yok." />
      ) : (
        <div className="master-detail">
          <ul className="select-list" aria-label="Markalar">
            {list.map((b) => (
              <li key={b.id}>
                <button type="button" aria-current={current?.id === b.id ? 'true' : undefined} onClick={() => setSelected(b.id)}>
                  <strong>{b.display_name}</strong>
                  <span className="muted small block">{names[b.entity_id] ?? 'Şirket'}</span>
                  <StatusBadge map={BRANDING_STATUS} value={b.status} />
                </button>
              </li>
            ))}
          </ul>
          {current ? (
            <ReviewPanel key={current.id + current.status} brand={current} entityName={names[current.entity_id] ?? 'Şirket'} onDone={res.reload} />
          ) : null}
        </div>
      )}
    </>
  )
}
