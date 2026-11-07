import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { Dialog } from '../../components/Dialog'
import { ErrorBox, ListState, PageHeader } from '../../components/Feedback'
import { SelectField, TextArea, TextField, fe } from '../../components/Fields'
import { StatusBadge } from '../../components/StatusBadge'
import { DISPUTE_KIND_TEXT, DISPUTE_STATUS, fmtDateTime, fmtTN } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { DisputeStatus } from '../../types'
import { useEntityNames } from '../operator/useEntityNames'

function NewDisputeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const numbers = useApi(() => api.myNumbers(), 'numbers')
  const [tn, setTn] = useState('')
  const [kind, setKind] = useState('label')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const action = useAction()
  const singles = items(numbers.data).filter((n) => n.status !== 'released')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const d = await action.run(() =>
      api.createDispute({ tn: tn.replace(/[\s()-]/g, ''), kind, title: title.trim(), description: description.trim() }),
    )
    if (d) onCreated(d.id)
  }

  return (
    <Dialog title="Yeni itiraz" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <TextField
          label="Numara"
          type="tel"
          required
          list="my-tns"
          placeholder="+90…"
          value={tn}
          onValue={setTn}
          error={fe(action.fields, 'tn')}
          hint="Şirketinize kayıtlı bir numara (aralıktaki tek bir numara da olabilir)"
        />
        <datalist id="my-tns">
          {singles.map((n) => (
            <option key={n.id} value={n.range_start}>
              {fmtTN(n.range_start)}
            </option>
          ))}
        </datalist>
        <SelectField
          label="İtiraz türü"
          value={kind}
          onValue={setKind}
          error={fe(action.fields, 'kind')}
          options={Object.entries(DISPUTE_KIND_TEXT).map(([value, label]) => ({ value, label }))}
        />
        <TextField label="Başlık" required maxLength={120} value={title} onValue={setTitle} error={fe(action.fields, 'title')} />
        <TextArea
          label="Açıklama"
          required
          rows={5}
          value={description}
          onValue={setDescription}
          error={fe(action.fields, 'description')}
          hint="Ne zaman, hangi operatörde, nasıl bir etiket gördüğünüzü ve aramanın amacını yazın."
        />
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" disabled={action.pending || !tn || !title.trim() || !description.trim()}>
            {action.pending ? 'Gönderiliyor…' : 'İtirazı gönder'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function DisputesPage({ mode }: { mode: 'admin' | 'enterprise' }) {
  const { has } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<DisputeStatus | ''>(mode === 'admin' ? 'open' : '')
  const [creating, setCreating] = useState(false)
  const names = useEntityNames(mode === 'admin')
  const res = useApi(() => (mode === 'admin' ? api.adminDisputes(status) : api.myDisputes()), `${mode}|${status}`)
  const base = mode === 'admin' ? '/operator/itirazlar' : '/kurum/itirazlar'
  let list = res.data ? items(res.data) : undefined
  if (list && mode === 'enterprise' && status) list = list.filter((d) => d.status === status)

  return (
    <>
      <PageHeader
        title={mode === 'admin' ? 'İtirazlar' : 'İtirazlarım'}
        description={
          mode === 'admin'
            ? 'Şirketlerin etiket, askı ve marka itirazlarını sonuçlandırın'
            : 'Numaranız yanlış etiketlendiyse veya askıya alındıysa itiraz edin'
        }
        actions={
          mode === 'enterprise' && has('enterprise:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Yeni itiraz
            </button>
          ) : null
        }
      />
      <div className="toolbar filters">
        <SelectField
          label="Durum"
          value={status}
          onValue={(v) => setStatus(v as DisputeStatus | '')}
          options={[{ value: '', label: 'Tümü' }, ...Object.entries(DISPUTE_STATUS).map(([value, i]) => ({ value, label: i.text }))]}
        />
      </div>
      <ListState loading={res.loading} error={res.error} items={list} empty="İtiraz bulunmuyor." onRetry={res.reload}>
        {(ds) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Başlık</th>
                  {mode === 'admin' ? <th scope="col">Şirket</th> : null}
                  <th scope="col">Numara</th>
                  <th scope="col">Tür</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Açılış</th>
                  <th scope="col">Güncelleme</th>
                </tr>
              </thead>
              <tbody>
                {ds.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`${base}/${d.id}`}>{d.title}</Link>
                    </td>
                    {mode === 'admin' ? (
                      <td>
                        {names[d.entity_id] ?? '—'}
                      </td>
                    ) : null}
                    <td className="mono">{fmtTN(d.tn)}</td>
                    <td>{DISPUTE_KIND_TEXT[d.kind] ?? d.kind}</td>
                    <td>
                      <StatusBadge map={DISPUTE_STATUS} value={d.status} />
                    </td>
                    <td>{fmtDateTime(d.created_at)}</td>
                    <td>{fmtDateTime(d.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
      {creating ? <NewDisputeDialog onClose={() => setCreating(false)} onCreated={(id) => navigate(`${base}/${id}`)} /> : null}
    </>
  )
}
