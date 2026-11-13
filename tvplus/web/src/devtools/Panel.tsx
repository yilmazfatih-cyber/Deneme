/**
 * Panelin gövdesi. Yalnızca panel ilk kez açılınca yüklenir (index.tsx'te lazy); kapalıyken kodu da çalışmaz.
 */
import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import './devtools.css'
import { ApiTab } from './tabs/ApiTab'
import { CdnTab } from './tabs/CdnTab'
import { EventsTab } from './tabs/EventsTab'
import { FeedTab } from './tabs/FeedTab'
import { IdentityTab } from './tabs/IdentityTab'
import { PipelineTab } from './tabs/PipelineTab'
import { TABS, type TabId } from './tabIds'
import { Icon, ICONS } from './ui'
import { useDevModel } from './useDevModel'

export default function Panel({
  tab,
  onTab,
  onClose,
  watch,
  panelRef,
}: {
  tab: TabId
  onTab: (t: TabId) => void
  onClose: () => void
  watch: boolean
  panelRef: RefObject<HTMLElement | null>
}): ReactNode {
  const { model, clearFeed } = useDevModel(true)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const n = TABS.length
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n
    const next = TABS[j]
    if (next) {
      onTab(next.id)
      tabRefs.current[j]?.focus()
    }
  }

  return (
    <aside ref={panelRef} className={`kp-panel${watch ? ' is-watch' : ''}`} aria-label="Kaputun altı" tabIndex={-1}>
      <div className="kp-grab" aria-hidden="true" />
      <header className="kp-head">
        <div>
          <h2 className="kp-title">Kaputun altı</h2>
          <p className="kp-sub">
            {model.total} olay · <kbd>Ctrl</kbd>+<kbd>.</kbd> aç/kapat
          </p>
        </div>
        <button type="button" className="kp-icon-btn" onClick={onClose} aria-label="Paneli kapat">
          <Icon d={ICONS.close} size={20} />
        </button>
      </header>
      <div className="kp-tabs" role="tablist" aria-label="Panel sekmeleri" onKeyDown={onTabKey}>
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`kp-tab-${t.id}`}
            aria-selected={t.id === tab}
            aria-controls="kp-tabpanel"
            tabIndex={t.id === tab ? 0 : -1}
            className="kp-tabbtn"
            onClick={() => onTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="kp-body" role="tabpanel" id="kp-tabpanel" aria-labelledby={`kp-tab-${tab}`}>
        {tab === 'akis' && <FeedTab feed={model.feed} onClear={clearFeed} />}
        {tab === 'hat' && <PipelineTab p={model.pipeline} />}
        {tab === 'api' && <ApiTab api={model.api} />}
        {tab === 'cdn' && <CdnTab />}
        {tab === 'kimlik' && <IdentityTab lastTraceId={model.lastTraceId} lastTraceAt={model.lastTraceAt} />}
        {tab === 'olaylar' && <EventsTab t={model.telemetry} />}
      </div>
    </aside>
  )
}
