import { useMemo, useState, type ReactNode } from 'react'
import type { DevCategory, DevEvent } from '../../lib/devbus'
import { ALL_CATEGORIES, CATEGORY_LABEL, filterFeed, type FeedState } from '../model/feed'
import { fmtClock, fmtMs } from '../model/format'
import { ErrMark, Explainer, Icon, ICONS } from '../ui'

export function FeedTab({ feed, onClear }: { feed: FeedState; onClear: () => void }): ReactNode {
  const [cats, setCats] = useState<Set<DevCategory>>(() => new Set())
  const [frozen, setFrozen] = useState<DevEvent[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  const source = frozen ?? feed.rows
  const rows = useMemo(() => filterFeed(source, cats), [source, cats])
  const waiting = frozen ? feed.rows.findIndex((r) => r.id === frozen[0]?.id) : 0
  const present = ALL_CATEGORIES.filter((c) => (feed.byCat[c] ?? 0) > 0 || cats.has(c))

  const toggle = (c: DevCategory) =>
    setCats((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  return (
    <div className="kp-tab">
      <Explainer netflix="tarayıcının Ağ sekmesi + Ichnaea iz kayıtları">
        Uygulamanın her katmanı yaptığı işi buraya bildirir: sorgular, oynatıcı istekleri, olay paketleri. Satıra dokun, ayrıntısı açılsın.
      </Explainer>

      <div className="kp-toolbar">
        <button type="button" className="kp-btn" onClick={() => setFrozen(frozen ? null : feed.rows)} aria-pressed={!!frozen}>
          <Icon d={frozen ? ICONS.play : ICONS.pause} size={16} />
          {frozen ? 'Sürdür' : 'Duraklat'}
        </button>
        <button
          type="button"
          className="kp-btn"
          onClick={() => {
            setFrozen(null)
            setOpenId(null)
            onClear()
          }}
        >
          Temizle
        </button>
        <span className="kp-toolbar-note" aria-live="polite">
          {frozen ? `Duraklatıldı${waiting > 0 ? ` · ${waiting} yeni olay bekliyor` : ''}` : `${rows.length} satır`}
        </span>
      </div>

      <div className="kp-chips" role="group" aria-label="Kategori süzgeci">
        <button type="button" className="kp-chip" aria-pressed={cats.size === 0} onClick={() => setCats(new Set())}>
          Tümü
        </button>
        {present.map((c) => (
          <button key={c} type="button" className="kp-chip" aria-pressed={cats.has(c)} onClick={() => toggle(c)}>
            {CATEGORY_LABEL[c]} <span className="kp-chip-n">{feed.byCat[c] ?? 0}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="kp-empty">Henüz olay yok. Uygulamada gezin ya da bir başlık açın.</p>
      ) : (
        <ol className="kp-feed">
          {rows.map((r) => (
            <FeedRow key={r.id} e={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} />
          ))}
        </ol>
      )}
    </div>
  )
}

function FeedRow({ e, open, onToggle }: { e: DevEvent; open: boolean; onToggle: () => void }): ReactNode {
  const [copied, setCopied] = useState(false)
  const json = open ? JSON.stringify(e.detail ?? {}, null, 2) : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ cat: e.cat, label: e.label, at: new Date(e.at).toISOString(), ms: e.ms, ok: e.ok, detail: e.detail }, null, 2))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <li className={`kp-feed-item${open ? ' is-open' : ''}`}>
      <button type="button" className="kp-feed-row" onClick={onToggle} aria-expanded={open}>
        <span className="kp-time">
          {fmtClock(e.at)}
          <span className="kp-time-ms">.{String(new Date(e.at).getMilliseconds()).padStart(3, '0')}</span>
        </span>
        <span className="kp-cat">{CATEGORY_LABEL[e.cat]}</span>
        <span className="kp-label">{e.label}</span>
        <span className="kp-ms">{e.ms !== undefined ? fmtMs(e.ms) : ''}</span>
        <span className="kp-ok">{e.ok ? null : <ErrMark label="başarısız" />}</span>
      </button>
      {open && (
        <div className="kp-detail">
          <pre>{json}</pre>
          <button type="button" className="kp-btn kp-btn-sm" onClick={() => void copy()}>
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        </div>
      )}
    </li>
  )
}
