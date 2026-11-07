import { useState, type FormEvent } from 'react'
import { api, items } from '../../api'
import { ListState, PageHeader } from '../../components/Feedback'
import { SelectField, TextField } from '../../components/Fields'
import { fmtDateTime, shortId } from '../../format'
import { useApi } from '../../hooks'

const KINDS = ['', 'entity', 'number', 'branding', 'certificate', 'reputation', 'dispute', 'user', 'apikey', 'webhook']
const KIND_TEXT: Record<string, string> = {
  '': 'Tümü',
  entity: 'Şirket',
  number: 'Numara',
  branding: 'Marka',
  certificate: 'Sertifika',
  reputation: 'İtibar',
  dispute: 'İtiraz',
  user: 'Kullanıcı',
  apikey: 'API anahtarı',
  webhook: 'Webhook',
}

function prettyDetail(d: string): string {
  if (!d) return ''
  try {
    return JSON.stringify(JSON.parse(d), null, 2)
  } catch {
    return d
  }
}

export function AuditPage() {
  const [kind, setKind] = useState('')
  const [target, setTarget] = useState('')
  const [query, setQuery] = useState({ target_kind: '', target_id: '', limit: 200 })
  const res = useApi(() => api.audit(query), JSON.stringify(query))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setQuery({ target_kind: kind, target_id: target.trim(), limit: 200 })
  }

  return (
    <>
      <PageHeader title="Denetim kaydı" description="Durum değiştiren tüm işlemlerin değiştirilemez kaydı" />
      <form className="toolbar filters align-end" onSubmit={onSubmit}>
        <SelectField label="Hedef türü" value={kind} onValue={setKind} options={KINDS.map((k) => ({ value: k, label: KIND_TEXT[k] ?? k }))} />
        <TextField label="Hedef kimliği" value={target} onValue={setTarget} />
        <button type="submit" className="btn">
          Filtrele
        </button>
      </form>
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Kayıt bulunamadı." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Zaman</th>
                  <th scope="col">İşlem</th>
                  <th scope="col">Yapan</th>
                  <th scope="col">Hedef</th>
                  <th scope="col">IP</th>
                  <th scope="col">Ayrıntı</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id}>
                    <td>{fmtDateTime(a.at)}</td>
                    <td className="mono">{a.action}</td>
                    <td>
                      {a.actor_kind}
                      <span className="muted small block mono" title={a.actor_id}>
                        {shortId(a.actor_id)}
                      </span>
                    </td>
                    <td>
                      {KIND_TEXT[a.target_kind] ?? a.target_kind}
                      <span className="muted small block mono" title={a.target_id}>
                        {shortId(a.target_id)}
                      </span>
                    </td>
                    <td className="mono small">{a.ip || '—'}</td>
                    <td>
                      {a.detail && a.detail !== '{}' && a.detail !== 'null' ? (
                        <details className="inline-details">
                          <summary>Göster</summary>
                          <pre className="detail-pre">{prettyDetail(a.detail)}</pre>
                        </details>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
    </>
  )
}
