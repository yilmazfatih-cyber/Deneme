import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog } from '../../components/Dialog'
import { Empty, ErrorBox, Loading, Notice, PageHeader } from '../../components/Feedback'
import { EntityFields, cleanEntityInput } from '../../components/EntityForm'
import { SelectField, TextField, fe } from '../../components/Fields'
import { StatusBadge } from '../../components/StatusBadge'
import { DOC_KIND_TEXT, ENTITY_STATUS, fmtBytes, fmtDateTime, RISK_TEXT } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { DocumentKind, Entity, EntityDocument, EntityInput } from '../../types'

const STEPS = ['Kayıt', 'Belgeler', 'Operatör incelemesi', 'Doğrulandı']

function stepIndex(e: Entity, docs: number): number {
  switch (e.status) {
    case 'verified':
      return 4
    case 'in_review':
      return 2
    case 'suspended':
      return 3
    default:
      return docs > 0 ? 1 : 0
  }
}

function StatusBanner({ entity, docCount, canWrite, onSubmit }: { entity: Entity; docCount: number; canWrite: boolean; onSubmit: () => void }) {
  const s = entity.status
  const step = stepIndex(entity, docCount)
  return (
    <section className="card status-banner" aria-labelledby="sb-h">
      <div className="card-row">
        <h2 id="sb-h">
          Başvuru durumu: <StatusBadge map={ENTITY_STATUS} value={s} />
        </h2>
        {canWrite && (s === 'pending' || s === 'rejected') ? (
          <button type="button" className="btn btn-primary" onClick={onSubmit}>
            {s === 'rejected' ? 'Yeniden incelemeye gönder' : 'İncelemeye gönder'}
          </button>
        ) : null}
      </div>
      <ol className="steps" aria-label="Başvuru adımları">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'current' : ''} aria-current={i === step ? 'step' : undefined}>
            {label}
            {i < step ? <span className="sr-only"> (tamamlandı)</span> : null}
          </li>
        ))}
      </ol>
      {s === 'pending' ? (
        <p>
          <strong>Sonraki adım:</strong> Şirket bilgilerinizi kontrol edin, en az vergi levhası ve imza sirkülerini ekleyin, sonra
          “İncelemeye gönder” düğmesine basın.{docCount === 0 ? ' Henüz belge eklemediniz.' : ''}
        </p>
      ) : null}
      {s === 'in_review' ? (
        <p>
          <strong>Sonraki adım:</strong> Başvurunuz operatör incelemesinde. Bu sırada <Link to="/kurum/numaralar">numaralarınızı</Link> ve{' '}
          <Link to="/kurum/marka">markanızı</Link> ekleyebilirsiniz. Sonuç e-posta ile bildirilir.
        </p>
      ) : null}
      {s === 'verified' ? (
        <p>
          <strong>Şirketiniz doğrulandı.</strong> Etkin numaralarınızdan yapılan aramalar onaylı markanızla “doğrulanmış arayan”
          olarak gösterilir. <Link to="/kurum/numaralar">Numaraları yönet</Link>
        </p>
      ) : null}
      {s === 'rejected' ? (
        <Notice tone="warning" title="Başvurunuz reddedildi">
          {entity.reject_reason ? <p>Gerekçe: {entity.reject_reason}</p> : null}
          <p>Bilgileri veya belgeleri düzeltip yeniden incelemeye gönderebilirsiniz.</p>
        </Notice>
      ) : null}
      {s === 'suspended' ? (
        <Notice tone="warning" title="Hesabınız askıya alındı">
          {entity.reject_reason ? <p>Gerekçe: {entity.reject_reason}</p> : null}
          <p>
            Numaralarınız şu anda doğrulanmış arayan olarak gösterilmiyor. Operatörle iletişime geçin veya{' '}
            <Link to="/kurum/itirazlar">itiraz açın</Link>.
          </p>
        </Notice>
      ) : null}
    </section>
  )
}

function toInput(e: Entity): EntityInput {
  return {
    legal_name: e.legal_name,
    trade_name: e.trade_name,
    vkn: e.vkn,
    mersis: e.mersis,
    sector: e.sector,
    website: e.website,
    city: e.city,
    contact_name: e.contact_name,
    contact_email: e.contact_email,
    contact_phone: e.contact_phone,
    iys_registered: e.iys_registered,
  }
}

function EntityEditor({ entity, editable, onSaved }: { entity: Entity; editable: boolean; onSaved: (e: Entity) => void }) {
  const [form, setForm] = useState<EntityInput>(() => toInput(entity))
  const [saved, setSaved] = useState(false)
  const action = useAction()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const r = await action.run(() => api.updateMyEntity(cleanEntityInput(form)))
    if (r) {
      setSaved(true)
      onSaved(r)
    }
  }

  return (
    <section className="card" aria-labelledby="ent-h">
      <h2 id="ent-h">Şirket bilgileri</h2>
      {!editable ? (
        <p className="muted small">Bilgiler yalnızca “Başvuru bekliyor” veya “Reddedildi” durumunda düzenlenebilir.</p>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <EntityFields value={form} onChange={setForm} fields={action.fields} disabled={!editable} />
        {editable ? (
          <>
            <ErrorBox message={Object.keys(action.fields).length ? 'İşaretli alanları düzeltin.' : action.error} />
            {saved ? <Notice tone="success">Bilgiler kaydedildi.</Notice> : null}
            <button type="submit" className="btn btn-primary" disabled={action.pending}>
              {action.pending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </>
        ) : null}
      </form>
      {entity.risk_tier ? <p className="muted small">Operatör risk seviyesi: {RISK_TEXT[entity.risk_tier]}</p> : null}
    </section>
  )
}

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function DocumentForm({ onAdded }: { onAdded: (d: EntityDocument) => void }) {
  const [kind, setKind] = useState<DocumentKind>('tax_certificate')
  const [fileName, setFileName] = useState('')
  const [mime, setMime] = useState('application/pdf')
  const [sha, setSha] = useState('')
  const [size, setSize] = useState('')
  const [hashing, setHashing] = useState(false)
  const action = useAction()

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    setMime(f.type || 'application/octet-stream')
    setSize(String(f.size))
    setHashing(true)
    try {
      setSha(await sha256Hex(f))
    } catch {
      setSha('')
    } finally {
      setHashing(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const d = await action.run(() =>
      api.addDocument({ kind, file_name: fileName.trim(), mime_type: mime.trim(), sha256: sha.trim().toLowerCase(), size_bytes: Number(size) || 0 }),
    )
    if (d) {
      onAdded(d)
      setFileName('')
      setSha('')
      setSize('')
    }
  }

  return (
    <form onSubmit={onSubmit} className="doc-form">
      <h3>Belge ekle</h3>
      <p className="muted small">
        Dosya sunucuya yüklenmez; dosyanın adı, türü, boyutu ve SHA-256 özeti kaydedilir. Asıl belgeyi operatör ayrıca ister.
      </p>
      <div className="grid-2">
        <SelectField
          label="Belge türü"
          value={kind}
          onValue={(v) => setKind(v as DocumentKind)}
          error={fe(action.fields, 'kind')}
          options={Object.entries(DOC_KIND_TEXT).map(([value, label]) => ({ value, label }))}
        />
        <div className="field">
          <label htmlFor="doc-file">Dosya seç (özet otomatik hesaplanır)</label>
          <input id="doc-file" type="file" onChange={onFile} />
          {hashing ? <span className="hint">Özet hesaplanıyor…</span> : null}
        </div>
        <TextField label="Dosya adı" required value={fileName} onValue={setFileName} error={fe(action.fields, 'file_name')} />
        <TextField label="MIME türü" required value={mime} onValue={setMime} error={fe(action.fields, 'mime_type')} />
        <TextField
          label="SHA-256 özeti"
          required
          className="mono"
          maxLength={64}
          value={sha}
          onValue={setSha}
          error={fe(action.fields, 'sha256')}
          hint="64 onaltılık karakter"
        />
        <TextField label="Boyut (bayt)" type="number" min={1} required value={size} onValue={setSize} error={fe(action.fields, 'size_bytes')} />
      </div>
      <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
      <button type="submit" className="btn btn-primary" disabled={action.pending || hashing || !fileName || !sha || !size}>
        {action.pending ? 'Ekleniyor…' : 'Belgeyi ekle'}
      </button>
    </form>
  )
}

export function CompanyPage() {
  const { has } = useAuth()
  const canWrite = has('enterprise:write')
  const ent = useApi(() => api.myEntity(), 'entity')
  const docs = useApi(() => api.myDocuments(), 'docs')
  const [confirm, setConfirm] = useState(false)
  const submit = useAction()

  const onSubmitReview = async () => {
    const e = await submit.run(() => api.submitMyEntity())
    if (e) {
      ent.setData(e)
      setConfirm(false)
    }
  }

  const e = ent.data
  const docList = items(docs.data)
  const editable = canWrite && !!e && (e.status === 'pending' || e.status === 'rejected')

  return (
    <>
      <PageHeader title="Şirketim" description={e ? e.legal_name : undefined} />
      {!e ? (
        ent.error ? (
          <ErrorBox message={ent.error} onRetry={ent.reload} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <StatusBanner
            entity={e}
            docCount={docList.length}
            canWrite={canWrite}
            onSubmit={() => {
              submit.reset()
              setConfirm(true)
            }}
          />
          <div className="grid-2 wide-left">
            <EntityEditor key={e.updated_at} entity={e} editable={editable} onSaved={ent.setData} />
            <section className="card" aria-labelledby="docs-h">
              <h2 id="docs-h">Belgeler</h2>
              <ErrorBox message={docs.error} onRetry={docs.reload} />
              {!docs.data && !docs.error ? <Loading /> : null}
              {docs.data && docList.length === 0 ? <Empty title="Henüz belge eklenmedi." /> : null}
              {docList.length > 0 ? (
                <ul className="doc-list">
                  {docList.map((d) => (
                    <li key={d.id}>
                      <strong>{DOC_KIND_TEXT[d.kind] ?? d.kind}</strong>
                      <span className="block">{d.file_name}</span>
                      <span className="muted small block">
                        {fmtBytes(d.size_bytes)} · {fmtDateTime(d.created_at)}
                      </span>
                      <span className="muted small block mono truncate" title={d.sha256}>
                        SHA-256: {d.sha256}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {canWrite && e.status !== 'verified' && e.status !== 'suspended' ? (
                <DocumentForm onAdded={(d) => docs.setData({ items: [...docList, d] })} />
              ) : null}
            </section>
          </div>
        </>
      )}
      {confirm && e ? (
        <ConfirmDialog
          title="İncelemeye gönder"
          confirmText="Gönder"
          pending={submit.pending}
          error={submit.error}
          onCancel={() => setConfirm(false)}
          onConfirm={onSubmitReview}
          message={
            <>
              <p>Başvurunuz operatör incelemesine gönderilecek. İnceleme sırasında şirket bilgileri düzenlenemez.</p>
              {docList.length === 0 ? <Notice tone="warning">Henüz belge eklemediniz; başvurunuz eksik kabul edilebilir.</Notice> : null}
            </>
          }
        />
      ) : null}
    </>
  )
}
