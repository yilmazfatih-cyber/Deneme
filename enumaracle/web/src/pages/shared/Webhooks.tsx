import { useState, type FormEvent } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { ConfirmDialog, Dialog } from '../../components/Dialog'
import { Empty, ErrorBox, ListState, Loading, Notice, PageHeader } from '../../components/Feedback'
import { CheckGroup, TextField, fe } from '../../components/Fields'
import { SecretOnce } from '../../components/Secret'
import { Badge } from '../../components/StatusBadge'
import { EVENT_TEXT, fmtDateTime } from '../../format'
import { useAction, useApi } from '../../hooks'
import { WEBHOOK_EVENTS, type CreatedWebhook, type Webhook } from '../../types'

const DELIVERY_STATUS: Record<string, { text: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  delivered: { text: 'Teslim edildi', tone: 'success' },
  pending: { text: 'Bekliyor', tone: 'info' },
  failed: { text: 'Başarısız, yeniden denenecek', tone: 'warning' },
  dead: { text: 'Vazgeçildi', tone: 'danger' },
}

function Deliveries({ id }: { id: string }) {
  const res = useApi(() => api.deliveries(id), id)
  if (!res.data) return res.error ? <ErrorBox message={res.error} onRetry={res.reload} /> : <Loading />
  const list = items(res.data)
  if (list.length === 0) return <Empty title="Henüz gönderim yok." />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Olay</th>
            <th scope="col">Durum</th>
            <th scope="col" className="num">Deneme</th>
            <th scope="col">Yanıt</th>
            <th scope="col">Zaman</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => {
            const st = DELIVERY_STATUS[d.status] ?? { text: d.status, tone: 'neutral' as const }
            return (
              <tr key={d.id}>
                <td>{d.event_type ? EVENT_TEXT[d.event_type] ?? d.event_type : '—'}</td>
                <td>
                  <Badge tone={st.tone}>{st.text}</Badge>
                </td>
                <td className="num">{d.attempt}</td>
                <td>
                  {d.last_code ? `HTTP ${d.last_code}` : '—'}
                  {d.last_error ? <span className="muted small block">{d.last_error}</span> : null}
                </td>
                <td>
                  {fmtDateTime(d.delivered_at ?? d.created_at)}
                  {d.next_at && d.status === 'failed' ? (
                    <span className="muted small block">Sonraki deneme: {fmtDateTime(d.next_at)}</span>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function CreateWebhookDialog({ mode, onClose, onCreated }: { mode: 'admin' | 'enterprise'; onClose: () => void; onCreated: (r: CreatedWebhook) => void }) {
  const [url, setUrl] = useState('https://')
  const [events, setEvents] = useState<string[]>([...WEBHOOK_EVENTS])
  const action = useAction()
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const body = { url: url.trim(), events }
    const r = await action.run(() => (mode === 'admin' ? api.createAdminWebhook(body) : api.createMyWebhook(body)))
    if (r) onCreated(r)
  }
  return (
    <Dialog title="Yeni webhook" onClose={onClose}>
      <form onSubmit={onSubmit}>
        <TextField label="Adres (URL)" type="url" required value={url} onValue={setUrl} error={fe(action.fields, 'url')} hint="HTTPS olmalıdır." />
        <CheckGroup
          legend="Olaylar"
          options={WEBHOOK_EVENTS.map((ev) => ({ value: ev, label: `${EVENT_TEXT[ev]} (${ev})` }))}
          value={events}
          onChange={setEvents}
          error={fe(action.fields, 'events')}
        />
        <ErrorBox message={Object.keys(action.fields).length ? null : action.error} />
        <div className="btn-row end">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn-primary" disabled={action.pending || events.length === 0}>
            {action.pending ? 'Oluşturuluyor…' : 'Webhook oluştur'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function WebhooksPage({ mode }: { mode: 'admin' | 'enterprise' }) {
  const { has } = useAuth()
  const canWrite = mode === 'admin' ? has('admin') : has('enterprise:write')
  const res = useApi(() => (mode === 'admin' ? api.adminWebhooks() : api.myWebhooks()), mode)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedWebhook | null>(null)
  const [removing, setRemoving] = useState<Webhook | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const action = useAction()

  const remove = async () => {
    if (!removing) return
    const ok = await action.run(async () => {
      await (mode === 'admin' ? api.deleteAdminWebhook(removing.id) : api.deleteMyWebhook(removing.id))
      return true
    })
    if (ok) {
      setRemoving(null)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Webhook'lar"
        description={mode === 'admin' ? 'Tüm olayları alan operatör uç noktaları' : 'Durum değişikliklerini sistemlerinize anında iletin'}
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Yeni webhook
            </button>
          ) : null
        }
      />
      {created ? (
        <SecretOnce title="Webhook oluşturuldu — imza anahtarı" secret={created.secret} onDone={() => setCreated(null)} />
      ) : null}
      <Notice tone="info">
        Her gönderim <code>X-Enumaracle-Signature: t=&lt;unix&gt;,v1=&lt;HMAC-SHA256&gt;</code> başlığıyla imzalanır. Başarısız
        gönderimler 1 dk, 5 dk, 30 dk, 2 sa ve 6 sa sonra yeniden denenir.
      </Notice>
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Henüz webhook yok." onRetry={res.reload}>
        {(list) => (
          <ul className="card-list">
            {list.map((w) => (
              <li key={w.id} className="card">
                <div className="card-row">
                  <div className="grow">
                    <p className="mono truncate">
                      <strong>{w.url}</strong>
                    </p>
                    <ul className="tag-list">
                      {(w.events ?? []).length === 0 ? <li className="tag">Tüm olaylar</li> : null}
                      {(w.events ?? []).map((ev) => (
                        <li key={ev} className="tag">
                          {EVENT_TEXT[ev] ?? ev}
                        </li>
                      ))}
                    </ul>
                    <p className="muted small">
                      {w.active ? null : <Badge tone="neutral">Devre dışı</Badge>} Oluşturma: {fmtDateTime(w.created_at)}
                    </p>
                  </div>
                  <div className="actions">
                    {mode === 'enterprise' ? (
                      <button
                        type="button"
                        className="btn btn-small"
                        aria-expanded={openId === w.id}
                        onClick={() => setOpenId(openId === w.id ? null : w.id)}
                      >
                        {openId === w.id ? 'Gönderimleri gizle' : 'Gönderimler'}
                      </button>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        onClick={() => {
                          action.reset()
                          setRemoving(w)
                        }}
                      >
                        Sil
                      </button>
                    ) : null}
                  </div>
                </div>
                {openId === w.id ? <Deliveries id={w.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </ListState>
      {creating ? (
        <CreateWebhookDialog
          mode={mode}
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false)
            setCreated(r)
            res.reload()
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          title="Webhook'u sil"
          confirmText="Sil"
          danger
          pending={action.pending}
          error={action.error}
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
          message={<p>{removing.url} adresine olay gönderimi durdurulacak. Bu işlem geri alınamaz.</p>}
        />
      ) : null}
    </>
  )
}
