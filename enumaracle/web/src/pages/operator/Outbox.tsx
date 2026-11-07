import { api, items } from '../../api'
import { ListState, PageHeader } from '../../components/Feedback'
import { fmtDateTime } from '../../format'
import { useApi } from '../../hooks'

export function OutboxPage() {
  const res = useApi(() => api.outbox(), 'outbox')
  return (
    <>
      <PageHeader
        title="E-posta kutusu"
        description="Kurumlara gönderilen bildirim e-postaları (pilot ortamda gönderilmeden burada tutulur)"
        actions={
          <button type="button" className="btn" onClick={res.reload} disabled={res.loading}>
            Yenile
          </button>
        }
      />
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Gönderilecek e-posta yok." onRetry={res.reload}>
        {(list) => (
          <ul className="card-list">
            {list.map((m) => (
              <li key={m.id} className="card">
                <details>
                  <summary className="mail-summary">
                    <strong>{m.subject}</strong>
                    <span className="muted small">
                      {m.to} · {fmtDateTime(m.created_at)}
                    </span>
                  </summary>
                  <pre className="mail-body">{m.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </ListState>
    </>
  )
}
