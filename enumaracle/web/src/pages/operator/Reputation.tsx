import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, items, seg } from '../../api'
import { useAuth } from '../../auth'
import { ScoreGauge } from '../../components/Charts'
import { ListState, Notice, PageHeader } from '../../components/Feedback'
import { SelectField } from '../../components/Fields'
import { StatusBadge, Badge } from '../../components/StatusBadge'
import { fmtDateTime, fmtNum, fmtTN, REPUTATION_LABEL } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { ReputationLabel } from '../../types'

export function ReputationPage() {
  const { has } = useAuth()
  const navigate = useNavigate()
  const [label, setLabel] = useState<ReputationLabel | ''>('')
  const [tn, setTn] = useState('')
  const res = useApi(() => api.reputationList({ label, limit: 100 }), label)
  const recompute = useAction()
  const [scored, setScored] = useState<number | null>(null)

  const onRecompute = async () => {
    const r = await recompute.run(() => api.recompute())
    if (r) {
      setScored(r.scored)
      res.reload()
    }
  }

  const onGo = (e: FormEvent) => {
    e.preventDefault()
    const v = tn.replace(/[\s()-]/g, '')
    if (v) navigate(`/operator/itibar/${seg(v)}`)
  }

  return (
    <>
      <PageHeader
        title="İtibar"
        description="Numaraların arama davranışına göre hesaplanan puanları (100 = en iyi)"
        actions={
          has('admin') ? (
            <button type="button" className="btn" onClick={onRecompute} disabled={recompute.pending}>
              {recompute.pending ? 'Hesaplanıyor…' : 'Puanları yeniden hesapla'}
            </button>
          ) : null
        }
      />
      {scored !== null ? <Notice tone="success">{fmtNum(scored)} numaranın puanı yeniden hesaplandı.</Notice> : null}
      {recompute.error ? <Notice tone="danger">{recompute.error}</Notice> : null}
      <div className="toolbar filters">
        <SelectField
          label="Etiket"
          value={label}
          onValue={(v) => setLabel(v as ReputationLabel | '')}
          options={[{ value: '', label: 'Tümü (en kötü önce)' }, ...Object.entries(REPUTATION_LABEL).map(([value, i]) => ({ value, label: i.text }))]}
        />
        <form className="search" onSubmit={onGo}>
          <label htmlFor="rep-tn" className="sr-only">
            Numara ile ayrıntıya git
          </label>
          <input id="rep-tn" type="tel" placeholder="+90…" value={tn} onChange={(e) => setTn(e.target.value)} />
          <button type="submit" className="btn">
            Ayrıntı
          </button>
        </form>
      </div>
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Puanlanmış numara yok." onRetry={res.reload}>
        {(list) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Numara</th>
                  <th scope="col">Puan</th>
                  <th scope="col">Etiket</th>
                  <th scope="col">Başlıca etken</th>
                  <th scope="col" className="num">24 sa / 7 gün</th>
                  <th scope="col">Hesaplanma</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const top = [...(s.factors ?? [])].sort((a, b) => b.penalty - a.penalty)[0]
                  return (
                    <tr key={s.tn}>
                      <td className="mono">
                        <Link to={`/operator/itibar/${seg(s.tn)}`}>{fmtTN(s.tn)}</Link>
                      </td>
                      <td>
                        <span className="score-cell">
                          <ScoreGauge score={s.score} size={36} />
                        </span>
                      </td>
                      <td>
                        <StatusBadge map={REPUTATION_LABEL} value={s.label} />
                        {s.override_label ? <Badge tone="info">Operatör kararı</Badge> : null}
                        {s.floored ? <Badge tone="neutral">Taban koruması</Badge> : null}
                      </td>
                      <td>{top && top.penalty > 0 ? `${top.text_tr} (−${top.penalty})` : <span className="muted">—</span>}</td>
                      <td className="num">
                        {fmtNum(s.calls_24h)} / {fmtNum(s.calls_7d)}
                      </td>
                      <td>{fmtDateTime(s.computed_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </ListState>
    </>
  )
}
