import { useState, type FormEvent } from 'react'
import { api, items, type BrandingInput } from '../../api'
import { useAuth } from '../../auth'
import { Empty, ErrorBox, Loading, Notice, PageHeader } from '../../components/Feedback'
import { CheckField, TextField, fe } from '../../components/Fields'
import { PhonePreview } from '../../components/PhonePreview'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import { BRANDING_STATUS, fmtDateTime, runeLength } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { Branding } from '../../types'

function BrandingEditor({ brand, onSaved, onCancel }: { brand: Branding | null; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(brand?.display_name ?? '')
  const [logo, setLogo] = useState(brand?.logo_url ?? '')
  const [reason, setReason] = useState(brand?.call_reason ?? '')
  const [isDefault, setIsDefault] = useState(brand?.is_default ?? true)
  const action = useAction()
  const local: Record<string, string> = {}
  if (runeLength(name) > 32) local.display_name = 'En fazla 32 karakter olabilir.'
  if (logo && !logo.startsWith('https://')) local.logo_url = 'Logo adresi https:// ile başlamalı.'
  if (runeLength(reason) > 64) local.call_reason = 'En fazla 64 karakter olabilir.'
  const fields = { ...action.fields, ...local }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (Object.keys(local).length) return
    const body: BrandingInput = { display_name: name.trim(), is_default: isDefault }
    if (logo.trim()) body.logo_url = logo.trim()
    if (reason.trim()) body.call_reason = reason.trim()
    const r = await action.run(() => (brand ? api.updateBranding(brand.id, body) : api.createBranding(body)))
    if (r) onSaved()
  }

  return (
    <section className="card" aria-labelledby="be-h">
      <h2 id="be-h">{brand ? 'Markayı düzenle' : 'Yeni marka'}</h2>
      {brand ? <Notice tone="info">Kaydettiğinizde marka yeniden operatör onayına gönderilir.</Notice> : null}
      <div className="review-grid">
        <form onSubmit={onSubmit}>
          <TextField
            label="Görünen ad"
            required
            value={name}
            onValue={setName}
            error={fe(fields, 'display_name')}
            hint={`Aboneye gösterilecek ad · ${runeLength(name)}/32`}
          />
          <TextField
            label="Logo adresi"
            type="url"
            placeholder="https://…/logo.png"
            value={logo}
            onValue={setLogo}
            error={fe(fields, 'logo_url')}
            hint="HTTPS, kare görsel önerilir. Boş bırakılırsa baş harfler gösterilir."
          />
          <TextField
            label="Varsayılan arama nedeni"
            value={reason}
            onValue={setReason}
            error={fe(fields, 'call_reason')}
            hint={`Ör. “Kargo teslimatı” · ${runeLength(reason)}/64`}
          />
          <CheckField label="Varsayılan marka olarak kullan" checked={isDefault} onChecked={setIsDefault} hint="Numaraya özel marka seçilmediğinde bu marka gösterilir." />
          <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={action.pending || !name.trim() || Object.keys(local).length > 0}>
              {action.pending ? 'Kaydediliyor…' : 'Onaya gönder'}
            </button>
            <button type="button" className="btn" onClick={onCancel}>
              Vazgeç
            </button>
          </div>
        </form>
        <PhonePreview displayName={name} logoUrl={logo} callReason={reason} tn="+902125550000" caption="Canlı önizleme: aramanız abonenin ekranında böyle görünür." />
      </div>
    </section>
  )
}

export function MyBrandingPage() {
  const { has } = useAuth()
  const canWrite = has('enterprise:write')
  const res = useApi(() => api.myBranding(), 'brands')
  const [editing, setEditing] = useState<Branding | 'new' | null>(null)
  const list = res.data ? items(res.data) : undefined

  return (
    <>
      <PageHeader
        title="Markam"
        description="Aramalarınızda gösterilecek ad, logo ve arama nedeni"
        actions={
          canWrite && !editing ? (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Yeni marka
            </button>
          ) : null
        }
      />
      {editing ? (
        <BrandingEditor
          key={editing === 'new' ? 'new' : editing.id}
          brand={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            res.reload()
          }}
        />
      ) : null}
      <ErrorBox message={res.error} onRetry={res.reload} />
      {!list ? (
        res.error ? null : <Loading />
      ) : list.length === 0 ? (
        !editing ? (
          <Empty title="Henüz marka tanımlamadınız.">
            <p>Markanız onaylandığında doğrulanmış aramalarınızda adınız ve logonuz görünür.</p>
          </Empty>
        ) : null
      ) : (
        <ul className="brand-cards">
          {list.map((b) => (
            <li key={b.id} className="card">
              <PhonePreview displayName={b.display_name} logoUrl={b.logo_url} callReason={b.call_reason} />
              <div>
                <h2>
                  {b.display_name} {b.is_default ? <Badge tone="info">Varsayılan</Badge> : null}
                </h2>
                <p>
                  <StatusBadge map={BRANDING_STATUS} value={b.status} />
                </p>
                {b.review_note ? (
                  <Notice tone={b.status === 'rejected' ? 'warning' : 'info'} title="Operatör notu">
                    {b.review_note}
                  </Notice>
                ) : null}
                <p className="muted small">Güncelleme: {fmtDateTime(b.updated_at)}</p>
                {canWrite ? (
                  <button type="button" className="btn btn-small" onClick={() => setEditing(b)}>
                    Düzenle
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
