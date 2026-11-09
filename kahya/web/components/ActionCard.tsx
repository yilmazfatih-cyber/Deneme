import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AI_KINDS, PRIORITIES, TICKET_CATEGORIES, type AiKind } from '../../shared/labels.ts'
import { useAction } from '../context.tsx'
import { api, dateTimeTR, money } from '../lib.ts'
import { Badge, EngineBadge } from './ui.tsx'

export type AiAction = {
  id: number
  kind: string
  status: string
  title: string
  payload: Record<string, unknown>
  engine: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  masked_count: number
  ref_type: string | null
  ref_id: number | null
  note: string | null
  site_name?: string | null
  decided_by_name?: string | null
  created_at: string
  decided_at: string | null
}

const STATUS: Record<string, [string, 'ok' | 'warn' | 'bad' | 'info' | 'neutral']> = {
  oneri: ['Onay bekliyor', 'warn'],
  uygulandi: ['Uygulandı', 'ok'],
  reddedildi: ['Reddedildi', 'neutral'],
  bilgi: ['Kayıt', 'info'],
  hata: ['Hata', 'bad'],
}

export function ActionStatus({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, 'neutral']
  return <Badge tone={tone}>{label}</Badge>
}

/** Yapay zekâ önerisi: türüne göre düzenlenebilir alanlar, onayla / reddet. */
export function ActionCard({ action, onDone }: { action: AiAction; onDone: () => void }) {
  const p = action.payload
  const [body, setBody] = useState(String(p.body ?? ''))
  const [title, setTitle] = useState(String(p.title ?? ''))
  const [category, setCategory] = useState(String(p.category ?? 'diger'))
  const [priority, setPriority] = useState(String(p.priority ?? 'normal'))
  const { busy, run } = useAction()
  const pending = action.status === 'oneri'

  const approve = () => {
    const edits: Record<string, unknown> = {}
    if ((action.kind === 'yanit' || action.kind === 'hatirlatma') && body !== p.body) edits.body = body
    if (action.kind === 'talep') Object.assign(edits, { title, category, priority })
    return run(
      () => api.post<{ note: string }>(`/y/actions/${action.id}/approve`, { edits }),
      (r) => r.note,
    ).then((r) => r && onDone())
  }
  const reject = () =>
    run(() => api.post(`/y/actions/${action.id}/reject`, {}), 'Öneri reddedildi').then(() => onDone())

  return (
    <div className="ai-box stack" style={{ gap: 8 }}>
      <div className="row between">
        <div className="ai-title">
          ✦ {AI_KINDS[action.kind as AiKind] ?? action.kind}
          {action.site_name && (
            <span className="muted" style={{ fontWeight: 400 }}>
              · {action.site_name}
            </span>
          )}
        </div>
        <div className="row">
          <EngineBadge engine={action.engine} model={action.model} />
          <ActionStatus status={action.status} />
        </div>
      </div>
      {action.kind === 'yanit' || action.kind === 'hatirlatma' ? (
        pending ? (
          <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Gönderilecek metin" rows={4} />
        ) : (
          <div className="pre">{String(p.body ?? '')}</div>
        )
      ) : action.kind === 'talep' ? (
        pending ? (
          <div className="form-grid">
            <label className="field full">
              Talep başlığı
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="field">
              Kategori
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(TICKET_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Öncelik
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {!p.siteId && (
              <div className="alert warn full">
                Gönderen bir siteyle eşleşmedi; onaydan önce talebi ilgili siteden açın.
              </div>
            )}
          </div>
        ) : (
          <div>{action.title}</div>
        )
      ) : action.kind === 'atama' ? (
        <div>
          <b>{String(p.vendorName ?? '')}</b> — talep{' '}
          <Link to={`/talepler/${String(p.ticketId)}`}>#{String(p.ticketId)}</Link>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {String(p.reason ?? '')}
          </div>
        </div>
      ) : (
        <div>{action.title}</div>
      )}
      {action.kind === 'hatirlatma' && typeof p.amount === 'number' && (
        <small className="muted">
          Vadesi geçmiş tutar: {money(p.amount)} · kanallar: {(p.channels as string[] | undefined)?.join(', ')}
        </small>
      )}
      {action.note && <small className="muted">{action.note}</small>}
      <div className="row between">
        <small className="muted">
          {dateTimeTR(action.created_at)}
          {action.masked_count ? ` · KVKK: ${action.masked_count} kişisel veri maskelendi` : ''}
          {action.decided_by_name ? ` · karar: ${action.decided_by_name}` : ''}
        </small>
        {pending && (
          <div className="row">
            <button className="btn small" disabled={busy} onClick={() => void reject()}>
              Reddet
            </button>
            <button className="btn small primary" disabled={busy} onClick={() => void approve()}>
              {action.kind === 'yanit' || action.kind === 'hatirlatma' ? 'Onayla ve gönder' : 'Onayla'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
