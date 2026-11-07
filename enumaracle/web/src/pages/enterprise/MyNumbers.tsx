import { useState, type FormEvent } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { ErrorBox, ListState, Notice, PageHeader } from '../../components/Feedback'
import { SelectField, TextField, fe } from '../../components/Fields'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import { fmtNum, fmtRange, NUMBER_STATUS, runeLength, TN_KIND_TEXT, USE_CASE_TEXT } from '../../format'
import { Range } from '../../components/Range'
import { useAction, useApi } from '../../hooks'
import type { Branding, PhoneNumber, UseCase } from '../../types'

const clean = (s: string) => s.replace(/[\s()-]/g, '')
const USE_CASE_OPTIONS = Object.entries(USE_CASE_TEXT).map(([value, label]) => ({ value, label }))

function brandingOptions(brands: Branding[]) {
  return [
    { value: '', label: 'Varsayılan marka' },
    ...brands.map((b) => ({ value: b.id, label: `${b.display_name}${b.status !== 'approved' ? ' (onay bekliyor)' : ''}` })),
  ]
}

function NumberDialog({
  number,
  brands,
  onClose,
  onSaved,
}: {
  number: PhoneNumber | null
  brands: Branding[]
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'single' | 'range'>('single')
  const [tn, setTn] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [useCase, setUseCase] = useState<UseCase>(number?.use_case ?? 'customer_service')
  const [reason, setReason] = useState(number?.call_reason ?? '')
  const [brandingId, setBrandingId] = useState(number?.branding_id ?? '')
  const action = useAction()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const common = { use_case: useCase, call_reason: reason.trim(), ...(brandingId ? { branding_id: brandingId } : {}) }
    const ok = await action.run(async () => {
      if (number) await api.updateNumber(number.id, common)
      else if (mode === 'single') await api.addNumber({ tn: clean(tn), ...common })
      else await api.addNumber({ range_start: clean(start), range_end: clean(end), ...common })
      return true
    })
    if (ok) onSaved()
  }

  return (
    <Dialog title={number ? 'Numarayı düzenle' : 'Numara ekle'} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {number ? (
          <p>
            <strong className="mono">{fmtRange(number.range_start, number.range_end)}</strong>
          </p>
        ) : (
          <>
            <fieldset className="field">
              <legend>Kayıt türü</legend>
              <div className="segmented" role="radiogroup" aria-label="Kayıt türü">
                <label className={mode === 'single' ? 'active' : ''}>
                  <input type="radio" name="mode" checked={mode === 'single'} onChange={() => setMode('single')} /> Tek numara
                </label>
                <label className={mode === 'range' ? 'active' : ''}>
                  <input type="radio" name="mode" checked={mode === 'range'} onChange={() => setMode('range')} /> Numara aralığı
                </label>
              </div>
            </fieldset>
            {mode === 'single' ? (
              <TextField label="Numara" type="tel" required placeholder="+90 212 555 00 00" value={tn} onValue={setTn} error={fe(action.fields, 'tn')} />
            ) : (
              <div className="grid-2">
                <TextField label="Başlangıç" type="tel" required placeholder="+90 212 555 00 00" value={start} onValue={setStart} error={fe(action.fields, 'range_start')} />
                <TextField
                  label="Bitiş"
                  type="tel"
                  required
                  placeholder="+90 212 555 00 99"
                  value={end}
                  onValue={setEnd}
                  error={fe(action.fields, 'range_end', 'range')}
                  hint="Aynı uzunlukta, en fazla 10 000 numara"
                />
              </div>
            )}
          </>
        )}
        <SelectField label="Kullanım amacı" value={useCase} onValue={(v) => setUseCase(v as UseCase)} options={USE_CASE_OPTIONS} error={fe(action.fields, 'use_case')} />
        <TextField
          label="Arama nedeni"
          maxLength={64}
          value={reason}
          onValue={setReason}
          error={fe(action.fields, 'call_reason')}
          hint={`Abonenin ekranında gösterilebilir · ${runeLength(reason)}/64`}
        />
        <SelectField label="Marka" value={brandingId} onValue={setBrandingId} options={brandingOptions(brands)} error={fe(action.fields, 'branding_id')} />
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" disabled={action.pending}>
            {action.pending ? 'Kaydediliyor…' : number ? 'Kaydet' : 'Numarayı ekle'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function MyNumbersPage() {
  const { has } = useAuth()
  const canWrite = has('enterprise:write')
  const res = useApi(() => api.myNumbers(), 'numbers')
  const brands = useApi(() => api.myBranding(), 'brands')
  const brandList = items(brands.data)
  const [editing, setEditing] = useState<PhoneNumber | 'new' | null>(null)
  const [releasing, setReleasing] = useState<PhoneNumber | null>(null)
  const [showReleased, setShowReleased] = useState(false)
  const release = useAction()

  const onRelease = async () => {
    if (!releasing) return
    const ok = await release.run(async () => {
      await api.releaseNumber(releasing.id)
      return true
    })
    if (ok) {
      setReleasing(null)
      res.reload()
    }
  }

  const all = res.data ? items(res.data) : undefined
  const list = all?.filter((n) => showReleased || n.status !== 'released')
  const brandName = (id?: string) => (id ? brandList.find((b) => b.id === id)?.display_name ?? '—' : 'Varsayılan')

  return (
    <>
      <PageHeader
        title="Numaralarım"
        description="Arama yaptığınız numaraları kaydedin; operatör tahsisi teyit edip etkinleştirir"
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Numara ekle
            </button>
          ) : null
        }
      />
      <Notice tone="info">
        Yeni numaralar “Doğrulama bekliyor” durumunda başlar. Şirketiniz doğrulandıktan ve operatör numarayı etkinleştirdikten sonra
        aramalarınız doğrulanmış olarak gösterilir.
      </Notice>
      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={showReleased} onChange={(e) => setShowReleased(e.target.checked)} /> Bırakılan numaraları da göster
        </label>
      </div>
      <ListState loading={res.loading} error={res.error} items={list} empty="Henüz numara eklemediniz." onRetry={res.reload}>
        {(ns) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Numara / aralık</th>
                  <th scope="col">Tür</th>
                  <th scope="col" className="num">Adet</th>
                  <th scope="col">Kullanım ve neden</th>
                  <th scope="col">Marka</th>
                  <th scope="col">Durum</th>
                  {canWrite ? <th scope="col"><span className="sr-only">İşlemler</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {ns.map((n) => (
                  <tr key={n.id}>
                    <td className="mono"><Range start={n.range_start} end={n.range_end} /></td>
                    <td>{TN_KIND_TEXT[n.kind] ?? n.kind}</td>
                    <td className="num">{fmtNum(n.count)}</td>
                    <td>
                      {USE_CASE_TEXT[n.use_case] ?? n.use_case}
                      {n.call_reason ? <span className="muted small block">{n.call_reason}</span> : null}
                    </td>
                    <td>{brandName(n.branding_id)}</td>
                    <td>
                      <StatusBadge map={NUMBER_STATUS} value={n.status} />
                      {n.status === 'active' && n.carrier_confirmed ? <Badge tone="success">Tahsis teyitli</Badge> : null}
                      {n.suspend_reason ? <span className="muted small block">{n.suspend_reason}</span> : null}
                    </td>
                    {canWrite ? (
                      <td className="actions">
                        {n.status !== 'released' ? (
                          <>
                            <button type="button" className="btn btn-small" onClick={() => setEditing(n)}>
                              Düzenle
                            </button>
                            <button
                              type="button"
                              className="btn btn-small btn-danger"
                              onClick={() => {
                                release.reset()
                                setReleasing(n)
                              }}
                            >
                              Bırak
                            </button>
                          </>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      <ErrorBox message={brands.error} />
      {editing ? (
        <NumberDialog
          key={editing === 'new' ? 'new' : editing.id}
          number={editing === 'new' ? null : editing}
          brands={brandList}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            res.reload()
          }}
        />
      ) : null}
      {releasing ? (
        <ConfirmDialog
          title="Numarayı bırak"
          confirmText="Numarayı bırak"
          danger
          pending={release.pending}
          error={release.error}
          onCancel={() => setReleasing(null)}
          onConfirm={onRelease}
          message={
            <>
              <p>
                <strong className="mono">{fmtRange(releasing.range_start, releasing.range_end)}</strong> kaydınızdan çıkarılacak.
              </p>
              <p>Bu numaradan yapılan aramalar artık doğrulanmış ve markalı gösterilmez. Yeniden kullanmak için tekrar eklemeniz ve onay almanız gerekir.</p>
            </>
          }
        />
      ) : null}
    </>
  )
}
