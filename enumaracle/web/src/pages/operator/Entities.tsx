import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, items } from '../../api'
import { ListState, PageHeader } from '../../components/Feedback'
import { StatusBadge } from '../../components/StatusBadge'
import { ENTITY_STATUS, fmtDateTime, RISK_TEXT } from '../../format'
import { useApi } from '../../hooks'
import type { EntityStatus } from '../../types'

const FILTERS: { value: EntityStatus | ''; label: string }[] = [
  { value: 'in_review', label: 'İncelemede' },
  { value: 'pending', label: 'Başvuru bekliyor' },
  { value: 'verified', label: 'Doğrulandı' },
  { value: 'rejected', label: 'Reddedildi' },
  { value: 'suspended', label: 'Askıya alındı' },
  { value: '', label: 'Tümü' },
]

export function EntitiesPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? 'in_review') as EntityStatus | ''
  const q = params.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const res = useApi(() => api.entities({ status, q, limit: 200 }), `${status}|${q}`)

  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) p.set(k, v)
    setParams(p, { replace: true })
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    update({ q: search.trim() })
  }

  return (
    <>
      <PageHeader title="Doğrulama kuyruğu" description="Şirket başvurularını inceleyin ve karar verin (KYC)" />
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Duruma göre filtrele">
          {FILTERS.map((f) => (
            <button
              key={f.value || 'all'}
              type="button"
              className={status === f.value ? 'active' : ''}
              aria-pressed={status === f.value}
              onClick={() => update({ status: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <form className="search" role="search" onSubmit={onSearch}>
          <label htmlFor="entity-q" className="sr-only">
            Unvan, VKN veya e-posta ara
          </label>
          <input id="entity-q" type="search" placeholder="Unvan, VKN veya e-posta" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button type="submit" className="btn">
            Ara
          </button>
        </form>
      </div>
      {res.data?.total !== undefined ? <p className="muted small">Toplam {res.data.total} kayıt</p> : null}
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Bu filtreye uyan şirket yok." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Şirket</th>
                  <th scope="col">VKN</th>
                  <th scope="col">Sektör / şehir</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Risk</th>
                  <th scope="col">Başvuru</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to={`/operator/dogrulama/${e.id}`}>{e.legal_name}</Link>
                      <span className="muted small block">{e.trade_name}</span>
                    </td>
                    <td className="mono">{e.vkn}</td>
                    <td>
                      {e.sector}
                      <span className="muted small block">{e.city}</span>
                    </td>
                    <td>
                      <StatusBadge map={ENTITY_STATUS} value={e.status} />
                    </td>
                    <td>{e.risk_tier ? RISK_TEXT[e.risk_tier] : '—'}</td>
                    <td>{fmtDateTime(e.submitted_at ?? e.created_at)}</td>
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
