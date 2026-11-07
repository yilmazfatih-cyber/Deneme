import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog } from '../../components/Dialog'
import { ErrorBox, Loading, Notice, PageHeader } from '../../components/Feedback'
import { CheckField, SelectField, TextArea, fe } from '../../components/Fields'
import { Badge, StatusBadge } from '../../components/StatusBadge'
import { DISPUTE_KIND_TEXT, DISPUTE_STATUS, fmtDateTime, fmtTN, ROLE_TEXT } from '../../format'
import { useAction, useApi } from '../../hooks'
import type { Dispute, DisputeComment } from '../../types'

type Target = 'in_review' | 'resolved' | 'rejected'

function StatusForm({ dispute, onDone }: { dispute: Dispute; onDone: () => void }) {
  const [status, setStatus] = useState<Target>(dispute.status === 'open' ? 'in_review' : 'resolved')
  const [resolution, setResolution] = useState(dispute.resolution ?? '')
  const [clearLabel, setClearLabel] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const action = useAction()
  const canClear = dispute.kind === 'label' && status === 'resolved'

  const submit = async () => {
    const ok = await action.run(async () => {
      await api.setDisputeStatus(dispute.id, {
        status,
        ...(resolution.trim() ? { resolution: resolution.trim() } : {}),
        ...(canClear ? { clear_label: clearLabel } : {}),
      })
      return true
    })
    setConfirm(false)
    if (ok) onDone()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    action.reset()
    setConfirm(true)
  }

  return (
    <section className="card" aria-labelledby="st-h">
      <h2 id="st-h">Durumu değiştir</h2>
      <form onSubmit={onSubmit}>
        <SelectField
          label="Yeni durum"
          value={status}
          onValue={(v) => setStatus(v as Target)}
          error={fe(action.fields, 'status')}
          options={[
            { value: 'in_review', label: DISPUTE_STATUS.in_review.text },
            { value: 'resolved', label: DISPUTE_STATUS.resolved.text },
            { value: 'rejected', label: DISPUTE_STATUS.rejected.text },
          ]}
        />
        <TextArea
          label="Sonuç açıklaması"
          rows={3}
          value={resolution}
          onValue={setResolution}
          error={fe(action.fields, 'resolution')}
          hint="Şirket bu açıklamayı görür."
        />
        <CheckField
          label="Etiketi temizle (30 gün “temiz” operatör kararı)"
          checked={canClear && clearLabel}
          onChecked={setClearLabel}
          disabled={!canClear}
          hint={canClear ? 'Numaranın itibar etiketi 30 gün boyunca “Temiz” olarak gösterilir.' : 'Yalnızca çözülen etiket itirazlarında kullanılabilir.'}
        />
        <ErrorBox message={action.error} />
        <button type="submit" className="btn btn-primary" disabled={action.pending}>
          Durumu kaydet
        </button>
      </form>
      {confirm ? (
        <ConfirmDialog
          title="İtiraz durumunu değiştir"
          confirmText="Kaydet"
          danger={status === 'rejected'}
          pending={action.pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
          message={
            <p>
              Durum <StatusBadge map={DISPUTE_STATUS} value={dispute.status} /> → <StatusBadge map={DISPUTE_STATUS} value={status} /> olacak
              {canClear && clearLabel ? ' ve numaranın etiketi 30 gün “Temiz” olarak işaretlenecek' : ''}. Şirkete bildirim gönderilir.
            </p>
          }
        />
      ) : null}
    </section>
  )
}

function Thread({ comments, mode }: { comments: DisputeComment[]; mode: 'admin' | 'enterprise' }) {
  if (comments.length === 0) return <p className="muted">Henüz yorum yok.</p>
  return (
    <ol className="thread">
      {comments.map((c) => {
        const operator = c.author_role === 'operator_admin' || c.author_role === 'operator_analyst'
        return (
          <li key={c.id} className={`comment${c.internal ? ' internal' : ''}${operator ? ' from-operator' : ''}`}>
            <div className="comment-head">
              <strong>{operator ? (mode === 'enterprise' ? 'Operatör' : ROLE_TEXT[c.author_role]) : ROLE_TEXT[c.author_role] ?? 'Kurum'}</strong>
              {c.internal ? <Badge tone="warning">İç not — şirket göremez</Badge> : null}
              <span className="muted small">{fmtDateTime(c.created_at)}</span>
            </div>
            <p className="comment-body">{c.body}</p>
          </li>
        )
      })}
    </ol>
  )
}

export function DisputeDetailPage({ mode }: { mode: 'admin' | 'enterprise' }) {
  const { id = '' } = useParams()
  const { has } = useAuth()
  const res = useApi(() => (mode === 'admin' ? api.adminDispute(id) : api.myDispute(id)), `${mode}|${id}`)
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const comment = useAction()
  const canComment = mode === 'admin' ? has('admin') : has('enterprise:write')
  const base = mode === 'admin' ? '/operator/itirazlar' : '/kurum/itirazlar'

  const onComment = async (e: FormEvent) => {
    e.preventDefault()
    const c = await comment.run(() =>
      mode === 'admin' ? api.adminDisputeComment(id, { body: body.trim(), internal }) : api.myDisputeComment(id, body.trim()),
    )
    if (c && res.data) {
      setBody('')
      res.setData({ ...res.data, comments: [...(res.data.comments ?? []), c] })
    }
  }

  const d = res.data?.dispute
  return (
    <>
      <p className="breadcrumb">
        <Link to={base}>← İtiraz listesi</Link>
      </p>
      {!d ? (
        <>
          <PageHeader title="İtiraz" />
          {res.error ? <ErrorBox message={res.error} onRetry={res.reload} /> : <Loading />}
        </>
      ) : (
        <>
          <PageHeader title={d.title} actions={<StatusBadge map={DISPUTE_STATUS} value={d.status} />} />
          <div className="grid-2 wide-left">
            <div>
              <section className="card">
                <dl className="kv">
                  <div><dt>Numara</dt><dd className="mono">{fmtTN(d.tn)}</dd></div>
                  <div><dt>Tür</dt><dd>{DISPUTE_KIND_TEXT[d.kind] ?? d.kind}</dd></div>
                  <div><dt>Açılış</dt><dd>{fmtDateTime(d.created_at)}</dd></div>
                  {d.resolved_at ? <div><dt>Sonuçlanma</dt><dd>{fmtDateTime(d.resolved_at)}</dd></div> : null}
                </dl>
                <h2>Açıklama</h2>
                <p className="pre-wrap">{d.description}</p>
                {d.resolution ? (
                  <Notice tone={d.status === 'rejected' ? 'warning' : 'success'} title="Sonuç">
                    {d.resolution}
                  </Notice>
                ) : null}
                {mode === 'admin' ? (
                  <p className="small">
                    <Link to={`/operator/itibar/${encodeURIComponent(d.tn)}`}>Numaranın itibar ayrıntısı</Link> ·{' '}
                    <Link to={`/operator/dogrulama/${d.entity_id}`}>Şirket kaydı</Link>
                  </p>
                ) : null}
              </section>
              <section className="card" aria-labelledby="thread-h">
                <h2 id="thread-h">Yazışma</h2>
                <Thread comments={res.data?.comments ?? []} mode={mode} />
                {canComment ? (
                  <form onSubmit={onComment} className="comment-form">
                    <TextArea label="Yorum" rows={3} value={body} onValue={setBody} error={fe(comment.fields, 'body')} />
                    {mode === 'admin' ? (
                      <CheckField label="İç not (yalnızca operatör görür)" checked={internal} onChecked={setInternal} />
                    ) : null}
                    <ErrorBox message={Object.keys(comment.fields).length ? null : comment.error} />
                    <button type="submit" className="btn btn-primary" disabled={comment.pending || !body.trim()}>
                      {comment.pending ? 'Gönderiliyor…' : internal && mode === 'admin' ? 'İç not ekle' : 'Yorum gönder'}
                    </button>
                  </form>
                ) : null}
              </section>
            </div>
            {mode === 'admin' && has('admin') ? <StatusForm key={d.status} dispute={d} onDone={res.reload} /> : null}
          </div>
        </>
      )}
    </>
  )
}
