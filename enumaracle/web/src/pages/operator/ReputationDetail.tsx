import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { DailyChart } from '../../components/Charts'
import { ConfirmDialog } from '../../components/Dialog'
import { Empty, ErrorBox, Loading, Notice, PageHeader } from '../../components/Feedback'
import { FactorTable, ScoreSummary } from '../../components/FactorTable'
import { SelectField, TextField, fe } from '../../components/Fields'
import { StatusBadge } from '../../components/StatusBadge'
import { FEEDBACK_KIND_TEXT, fmtDateTime, fmtTN, localInDays, localToRFC3339, REPUTATION_LABEL } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { ReputationLabel, Score } from '../../types'

function OverrideForm({ tn, score, onDone }: { tn: string; score: Score; onDone: (s: Score) => void }) {
  const [label, setLabel] = useState<ReputationLabel>('clean')
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState(localInDays(30))
  const [confirmClear, setConfirmClear] = useState(false)
  const action = useAction()
  const clear = useAction()

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const s = await action.run(() => api.setOverride(tn, { label, reason: reason.trim(), until: localToRFC3339(until) }))
    if (s) {
      setReason('')
      onDone(s)
    }
  }

  const onClear = async () => {
    const s = await clear.run(() => api.clearOverride(tn))
    if (s) {
      setConfirmClear(false)
      onDone(s)
    }
  }

  return (
    <section className="card" aria-labelledby="ovr-h">
      <h2 id="ovr-h">Operatör kararı (etiket geçersiz kılma)</h2>
      {score.override_label ? (
        <Notice tone="info" title="Etkin karar">
          <StatusBadge map={REPUTATION_LABEL} value={score.override_label} /> — {fmtDateTime(score.override_until)} tarihine kadar.{' '}
          <button type="button" className="btn btn-small btn-danger" onClick={() => setConfirmClear(true)}>
            Kararı kaldır
          </button>
        </Notice>
      ) : (
        <p className="muted small">Karar, süresi dolana kadar hesaplanan etiketin yerine geçer.</p>
      )}
      <form onSubmit={onSubmit} className="grid-3 align-end">
        <SelectField
          label="Etiket"
          value={label}
          onValue={(v) => setLabel(v as ReputationLabel)}
          error={fe(action.fields, 'label')}
          options={(['clean', 'watch', 'suspect', 'spam'] as ReputationLabel[]).map((l) => ({ value: l, label: REPUTATION_LABEL[l].text }))}
        />
        <TextField label="Gerekçe" required value={reason} onValue={setReason} error={fe(action.fields, 'reason')} />
        <TextField label="Bitiş" type="datetime-local" required value={until} onValue={setUntil} error={fe(action.fields, 'until')} />
        <div>
          <button type="submit" className="btn btn-primary" disabled={action.pending || !reason.trim()}>
            {action.pending ? 'Kaydediliyor…' : 'Kararı uygula'}
          </button>
        </div>
      </form>
      <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
      {confirmClear ? (
        <ConfirmDialog
          title="Operatör kararını kaldır"
          confirmText="Kaldır"
          danger
          pending={clear.pending}
          error={clear.error}
          onCancel={() => setConfirmClear(false)}
          onConfirm={onClear}
          message={<p>{fmtTN(tn)} için hesaplanan etiket yeniden geçerli olacak.</p>}
        />
      ) : null}
    </section>
  )
}

export function ReputationDetailPage() {
  const { tn: raw = '' } = useParams()
  const tn = decodeURIComponent(raw)
  const { has } = useAuth()
  const res = useApi(() => api.reputationDetail(tn), tn)
  const d = res.data

  return (
    <>
      <p className="breadcrumb">
        <Link to="/operator/itibar">← İtibar listesi</Link>
      </p>
      <PageHeader title={`İtibar: ${fmtTN(tn)}`} />
      {!d ? (
        res.error ? (
          <ErrorBox message={res.error} onRetry={res.reload} />
        ) : (
          <Loading />
        )
      ) : (
        <>
          <ErrorBox message={res.error} onRetry={res.reload} />
          <div className="grid-2">
            <section className="card">
              <h2>Puan</h2>
              <ScoreSummary score={d.score} />
            </section>
            <section className="card">
              <h2>Son 14 gün</h2>
              {(d.daily ?? []).length === 0 ? <Empty title="Bu dönemde çağrı kaydı yok." /> : <DailyChart data={d.daily ?? []} />}
            </section>
          </div>
          <section className="card">
            <h2>Puan etkenleri</h2>
            <FactorTable factors={d.score.factors} />
          </section>
          {has('admin') ? <OverrideForm tn={tn} score={d.score} onDone={(s) => res.setData({ ...d, score: s })} /> : null}
          <section className="card">
            <h2>Geri bildirimler ({(d.feedback ?? []).length})</h2>
            {(d.feedback ?? []).length === 0 ? (
              <Empty title="Etiket, şikâyet veya engelleme bildirimi yok." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Tarih</th>
                      <th scope="col">Tür</th>
                      <th scope="col">Kaynak</th>
                      <th scope="col">Etiket</th>
                      <th scope="col" className="num">Güven</th>
                      <th scope="col">Gerekçe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(d.feedback ?? []).map((f) => (
                      <tr key={f.id}>
                        <td>{fmtDateTime(f.created_at)}</td>
                        <td>{FEEDBACK_KIND_TEXT[f.kind] ?? f.kind}</td>
                        <td>{f.source_name || f.source_id}</td>
                        <td>{f.label ? <StatusBadge map={REPUTATION_LABEL} value={f.label} /> : '—'}</td>
                        <td className="num">{f.kind === 'label' ? `%${Math.round(f.confidence * 100)}` : '—'}</td>
                        <td>{f.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}
