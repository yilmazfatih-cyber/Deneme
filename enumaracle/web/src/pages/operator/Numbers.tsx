import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog } from '../../components/Dialog'
import { ListState, PageHeader } from '../../components/Feedback'
import { CheckField, SelectField, TextField, fe } from '../../components/Fields'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import { fmtDateTime, fmtNum, fmtRange, NUMBER_STATUS, TN_KIND_TEXT, USE_CASE_TEXT } from '../../format'
import { Range } from '../../components/Range'
import { useAction, useApi } from '../../hooks'
import type { NumberStatus, PhoneNumber } from '../../types'
import { useEntityNames } from './useEntityNames'

type Pending = { kind: 'activate' | 'suspend'; number: PhoneNumber }

export function NumbersPage() {
  const { has } = useAuth()
  const canWrite = has('admin')
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as NumberStatus | ''
  const entityId = params.get('entity_id') ?? ''
  const names = useEntityNames()
  const res = useApi(() => api.adminNumbers({ status, entity_id: entityId, limit: 500 }), `${status}|${entityId}`)
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirmed, setConfirmed] = useState(true)
  const [reason, setReason] = useState('')
  const action = useAction()

  const setFilter = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v)
    else p.delete(k)
    setParams(p, { replace: true })
  }

  const open = (kind: Pending['kind'], number: PhoneNumber) => {
    action.reset()
    setConfirmed(number.carrier_confirmed || kind === 'activate')
    setReason('')
    setPending({ kind, number })
  }

  const submit = async () => {
    if (!pending) return
    const ok = await action.run(async () => {
      if (pending.kind === 'activate') {
        await api.setNumberStatus(pending.number.id, { status: 'active', carrier_confirmed: confirmed })
      } else {
        await api.setNumberStatus(pending.number.id, { status: 'suspended', reason: reason.trim() })
      }
      return true
    })
    if (ok) {
      setPending(null)
      res.reload()
    }
  }

  const entityOptions = [{ value: '', label: 'Tüm şirketler' }, ...Object.entries(names).map(([value, label]) => ({ value, label }))]

  return (
    <>
      <PageHeader title="Numaralar" description="Kayıtlı numara ve aralıkları etkinleştirin veya askıya alın" />
      <div className="toolbar filters">
        <SelectField
          label="Durum"
          value={status}
          onValue={(v) => setFilter('status', v)}
          options={[{ value: '', label: 'Tümü' }, ...Object.entries(NUMBER_STATUS).map(([value, i]) => ({ value, label: i.text }))]}
        />
        <SelectField label="Şirket" value={entityId} onValue={(v) => setFilter('entity_id', v)} options={entityOptions} />
      </div>
      {res.data?.total !== undefined ? <p className="muted small">Toplam {fmtNum(res.data.total)} kayıt</p> : null}
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Bu filtreye uyan numara yok." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Numara / aralık</th>
                  <th scope="col">Şirket</th>
                  <th scope="col">Tür</th>
                  <th scope="col" className="num">Adet</th>
                  <th scope="col">Kullanım</th>
                  <th scope="col">Durum</th>
                  <th scope="col">Tahsis teyidi</th>
                  {canWrite ? <th scope="col"><span className="sr-only">İşlemler</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.id}>
                    <td className="mono">
                      <Range start={n.range_start} end={n.range_end} />
                      <span className="muted small block">{fmtDateTime(n.updated_at)}</span>
                    </td>
                    <td>
                      <Link to={`/operator/dogrulama/${n.entity_id}`}>{names[n.entity_id] ?? 'Şirket'}</Link>
                    </td>
                    <td>{TN_KIND_TEXT[n.kind] ?? n.kind}</td>
                    <td className="num">{fmtNum(n.count)}</td>
                    <td>
                      {USE_CASE_TEXT[n.use_case] ?? n.use_case}
                      {n.call_reason ? <span className="muted small block">{n.call_reason}</span> : null}
                    </td>
                    <td>
                      <StatusBadge map={NUMBER_STATUS} value={n.status} />
                      {n.suspend_reason ? <span className="muted small block">{n.suspend_reason}</span> : null}
                    </td>
                    <td>{n.carrier_confirmed ? <Badge tone="success">Teyitli (A)</Badge> : <Badge tone="neutral">Teyit yok (B)</Badge>}</td>
                    {canWrite ? (
                      <td className="actions">
                        {n.status !== 'active' && n.status !== 'released' ? (
                          <button type="button" className="btn btn-small btn-primary" onClick={() => open('activate', n)}>
                            Etkinleştir
                          </button>
                        ) : null}
                        {n.status === 'active' && !n.carrier_confirmed ? (
                          <button type="button" className="btn btn-small" onClick={() => open('activate', n)}>
                            Tahsisi teyit et
                          </button>
                        ) : null}
                        {n.status === 'active' ? (
                          <button type="button" className="btn btn-small btn-danger" onClick={() => open('suspend', n)}>
                            Askıya al
                          </button>
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

      {pending ? (
        <ConfirmDialog
          title={pending.kind === 'activate' ? 'Numarayı etkinleştir' : 'Numarayı askıya al'}
          confirmText={pending.kind === 'activate' ? 'Etkinleştir' : 'Askıya al'}
          danger={pending.kind === 'suspend'}
          pending={action.pending}
          error={action.error}
          onCancel={() => setPending(null)}
          onConfirm={submit}
          message={
            <p>
              <strong className="mono">{fmtRange(pending.number.range_start, pending.number.range_end)}</strong> (
              {names[pending.number.entity_id] ?? 'şirket'})
            </p>
          }
        >
          {pending.kind === 'activate' ? (
            <CheckField
              label="Numara tahsisi operatör tarafından teyit edildi"
              checked={confirmed}
              onChecked={setConfirmed}
              hint="Teyitli numaralar A seviyesinde (tam), teyitsizler B seviyesinde imzalanır. Şirket doğrulanmış olmalıdır."
            />
          ) : (
            <>
              <TextField label="Askıya alma gerekçesi" value={reason} onValue={setReason} error={fe(action.fields, 'reason')} />
              <p className="muted small">Askıdaki numaralar sorgularda doğrulanmamış görünür.</p>
            </>
          )}
        </ConfirmDialog>
      ) : null}
    </>
  )
}
