import { useState, type ReactNode } from 'react'
import { t } from '../i18n'
import { Icon } from './Icon'

/**
 * Sayfalı ızgara. Kaydırma hareketi gerekmez: sayfalar büyük "Önceki / Sonraki" düğmeleriyle değişir.
 * Düğmelerin yeri sayfa olmasa da korunur; böylece ızgaranın yeri hiç değişmez.
 */
export function Pager<T>({
  items,
  cols,
  rows,
  title,
  render,
  pageKey,
}: {
  items: T[]
  cols: number
  rows: number
  title: ReactNode
  render: (item: T, index: number) => ReactNode
  /** Bölüm değişince sayfa başa döner */
  pageKey: string
}) {
  const [state, setState] = useState({ key: pageKey, page: 0 })
  const perPage = cols * rows
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = state.key === pageKey ? Math.min(state.page, pages - 1) : 0
  const setPage = (page: number) => setState({ key: pageKey, page })
  const visible = items.slice(current * perPage, current * perPage + perPage)

  return (
    <div className="pager">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(var(--touch), 1fr))`,
        }}
      >
        {visible.map((item, i) => (
          <div className="grid-cell" key={current * perPage + i}>
            {render(item, current * perPage + i)}
          </div>
        ))}
      </div>
      <div className="pager-nav">
        <button
          type="button"
          className="btn btn-secondary pager-btn"
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          aria-hidden={pages === 1 || undefined}
          style={pages === 1 ? { visibility: 'hidden' } : undefined}
        >
          <Icon name="prev" />
          <span>{t('nav.prevPage')}</span>
        </button>
        <div className="pager-title">
          <h1>{title}</h1>
          {pages > 1 ? <span className="pager-count">{t('nav.page', { n: current + 1, total: pages })}</span> : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary pager-btn"
          onClick={() => setPage(current + 1)}
          disabled={current >= pages - 1}
          aria-hidden={pages === 1 || undefined}
          style={pages === 1 ? { visibility: 'hidden' } : undefined}
        >
          <span>{t('nav.nextPage')}</span>
          <Icon name="next" />
        </button>
      </div>
    </div>
  )
}
