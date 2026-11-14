/**
 * Önizleme kapsamı — Netflix'in üzerine gelince açılan kartı ("mini modal"), yalnız masaüstünde ve fareyle.
 *   - İşaretçi bir kartta 500 ms durursa ya da kart klavyeyle odak alıp 500 ms beklerse, kartın kendi yerinden
 *     ~1.5× büyüyen bir kart açılır (portal; satır ve pencere kırpmaz, bkz. placement.ts).
 *   - Aynı anda tek kart. İşaretçi karttan çıkınca, sayfa kayınca, Esc'e basılınca ya da sayfa değişince kapanır.
 *   - Klavye: kart odaktayken önizleme açıksa Tab önizlemenin düğmelerine girer; Esc kapatıp odağı karta döndürür.
 *   - Dokunmatik cihazlarda ve mobil ekranda önizleme yoktur: dokunuş doğrudan bağlantıya gider.
 * Veri: bir satırda ilk önizlemede satırın TÜM yüklü kimlikleri tek MiniModalQuery ile (store.ts); devbus `prefetch`.
 *
 *   <PreviewScope> … <PreviewTarget info={{ rowId, videoId, getRowVideoIds, tctx, title, imageUrl, edge }}>
 *     <TitleCard …/></PreviewTarget> … </PreviewScope>
 * Kapsam yoksa (ya da kapalıysa) PreviewTarget yalnızca çocuğunu çizer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { useFormFactor } from '../../lib/formFactor'
import { logEvent } from '../../telemetry/logger'
import { focusRestoredJustNow, useMediaQuery } from '../../ui'
import { CLOSE_MS, setPreviewOpen } from './openState'
import { PreviewCard } from './PreviewCard'
import { requestRowPreview } from './store'
import './preview.css'

export interface PreviewTargetInfo {
  /** Satır kimliği (lolomo listId ya da sayfa kimliği): ön yükleme bu anahtarla yapılır */
  rowId: string
  videoId: number
  /** Satırda ŞU AN yüklü video kimlikleri (ilk önizlemede hepsi tek istekte) */
  getRowVideoIds: () => number[]
  tctx: string | null
  title: string
  /** Veri gelene kadar ve klip yokken gösterilen durağan görsel (16:9 tercih) */
  imageUrl?: string | null
  /** Satırın ilk / son tam görünen kartı: kart içe doğru büyür (Slider `ctx.edge`) */
  edge?: 'left' | 'right' | null
}

type Via = 'hover' | 'focus'

interface OpenState {
  info: PreviewTargetInfo
  anchor: HTMLElement
  via: Via
  closing: boolean
}

interface Controller {
  pointerEnter: (info: PreviewTargetInfo, el: HTMLElement) => void
  pointerLeave: (info: PreviewTargetInfo) => void
  focus: (info: PreviewTargetInfo, el: HTMLElement) => void
  blur: (info: PreviewTargetInfo, next: EventTarget | null) => void
  keyDown: (info: PreviewTargetInfo, e: KeyboardEvent<HTMLElement>) => void
}

const PreviewContext = createContext<Controller | null>(null)

export const HOVER_DELAY_MS = 500
/** Karttan önizlemeye geçerken (önizleme kartın üstünü örter) kapanmayı bekleten kısa pay */
const LEAVE_GRACE_MS = 120

const focusableOf = (el: HTMLElement): HTMLElement | null =>
  el.matches('a[href], button') ? el : el.querySelector<HTMLElement>('a[href], button')

export function PreviewScope({ children }: { children: ReactNode }): ReactElement {
  const desktop = useFormFactor() === 'desktop'
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')
  const enabled = desktop && canHover
  const [open, setOpen] = useState<OpenState | null>(null)
  const openRef = useRef<OpenState | null>(null)
  openRef.current = open
  const hoverTimer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  /** Esc ile kapatıp odağı geri verdiğimiz kart: odak ondan ayrılana dek yeniden açılmaz */
  const suppressed = useRef<HTMLElement | null>(null)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const { pathname } = useLocation()

  const clear = (t: { current: number | null }) => {
    if (t.current !== null) {
      clearTimeout(t.current)
      t.current = null
    }
  }

  const show = useCallback((info: PreviewTargetInfo, anchor: HTMLElement, via: Via) => {
    clear(leaveTimer)
    clear(closeTimer)
    const cur = openRef.current
    if (cur && !cur.closing && cur.info.videoId === info.videoId && cur.anchor === anchor) return
    requestRowPreview(info.rowId, info.getRowVideoIds(), info.videoId)
    logEvent('focus', { videoId: info.videoId, rowId: info.rowId, via }, info.tctx)
    setOpen({ info, anchor, via, closing: false })
    setPreviewOpen(true)
  }, [])

  const hide = useCallback((opts: { refocus?: boolean; immediate?: boolean } = {}) => {
    clear(hoverTimer)
    clear(leaveTimer)
    const cur = openRef.current
    if (!cur) return
    if (opts.refocus) {
      suppressed.current = cur.anchor
      focusableOf(cur.anchor)?.focus({ preventScroll: true })
    }
    setPreviewOpen(false)
    if (opts.immediate) {
      clear(closeTimer)
      setOpen(null)
      return
    }
    if (cur.closing) return
    setOpen({ ...cur, closing: true })
    clear(closeTimer)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setOpen((s) => (s && s.closing ? null : s))
    }, CLOSE_MS)
  }, [])

  const hideSoon = useCallback(() => {
    clear(leaveTimer)
    leaveTimer.current = window.setTimeout(() => hide(), LEAVE_GRACE_MS)
  }, [hide])

  const isOpenFor = (info: PreviewTargetInfo, el?: HTMLElement) => {
    const cur = openRef.current
    return !!cur && !cur.closing && cur.info.videoId === info.videoId && (!el || cur.anchor === el)
  }

  const controller = useMemo<Controller>(
    () => ({
      pointerEnter(info, el) {
        clear(hoverTimer)
        if (isOpenFor(info, el)) {
          clear(leaveTimer)
          return
        }
        hoverTimer.current = window.setTimeout(() => show(info, el, 'hover'), HOVER_DELAY_MS)
      },
      pointerLeave(info) {
        clear(hoverTimer)
        if (isOpenFor(info) && openRef.current?.via === 'hover') hideSoon()
      },
      focus(info, el) {
        if (suppressed.current === el) return
        // Detay penceresi kapanınca karta geri verilen odak önizleme açmaz (kullanıcı karta yeniden gitmedi)
        if (focusRestoredJustNow()) return
        let keyboard = false
        try {
          keyboard = el.matches(':focus-visible') || !!el.querySelector(':focus-visible')
        } catch {
          keyboard = false
        }
        if (!keyboard) return
        clear(hoverTimer)
        hoverTimer.current = window.setTimeout(() => show(info, el, 'focus'), HOVER_DELAY_MS)
      },
      blur(info, next) {
        clear(hoverTimer)
        // Esc sonrası bastırma, odak o karttan ayrılınca kalkar.
        if (suppressed.current && !(next instanceof Node && suppressed.current.contains(next)))
          suppressed.current = null
        const cur = openRef.current
        if (!cur || cur.closing || cur.info.videoId !== info.videoId || cur.via !== 'focus') return
        if (next instanceof Node && (cur.anchor.contains(next) || cardRef.current?.contains(next))) return
        hideSoon()
      },
      keyDown(info, e) {
        if (e.key !== 'Tab' || e.shiftKey || !isOpenFor(info)) return
        const first = cardRef.current?.querySelector<HTMLElement>('button:not([disabled]), a[href]')
        if (!first) return
        e.preventDefault()
        clear(leaveTimer)
        first.focus()
      },
    }),
    [show, hideSoon],
  )

  // Kapsam kapanınca (ekran mobile döndü) ya da sayfa değişince hemen kapat.
  useEffect(() => {
    hide({ immediate: true })
  }, [pathname, enabled, hide])

  // Esc, kaydırma, pencere boyutu.
  const isOpen = !!open && !open.closing
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        hide({ refocus: true })
      }
    }
    const onScroll = (e: Event) => {
      const t = e.target
      if (t instanceof Node && cardRef.current?.contains(t)) return
      hide()
    }
    const onResize = () => hide({ immediate: true })
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
    }
  }, [isOpen, hide])

  useEffect(
    () => () => {
      clear(hoverTimer)
      clear(leaveTimer)
      clear(closeTimer)
      setPreviewOpen(false)
    },
    [],
  )

  return (
    <PreviewContext.Provider value={enabled ? controller : null}>
      {children}
      {open &&
        enabled &&
        createPortal(
          <PreviewCard
            key={`${open.info.rowId}|${open.info.videoId}`}
            ref={cardRef}
            info={open.info}
            anchor={open.anchor}
            closing={open.closing}
            onPointerEnter={() => clear(leaveTimer)}
            onPointerLeave={() => hideSoon()}
            onBlurOut={() => {
              if (openRef.current?.via === 'focus') hideSoon()
            }}
            onClose={(refocus) => hide({ refocus, immediate: !refocus })}
          />,
          document.body,
        )}
    </PreviewContext.Provider>
  )
}

export interface PreviewTargetProps {
  /** Hedef bilgisi; null ise önizleme bağlanmaz (ör. satır kayarken) */
  info: PreviewTargetInfo | null
  children: ReactNode
  className?: string
}

/** Sarmalayıcı `display: contents`: kutusu yok, konum kartın kendisinden alınır. */
const anchorOf = (el: HTMLElement): HTMLElement =>
  el.firstElementChild instanceof HTMLElement ? el.firstElementChild : el

/*
 * Gerçek fare hareketi. Bir pencere kapanınca ya da sayfa kayınca tarayıcı, duran imlecin altına gelen karta
 * hareket olmadan `pointerenter` (ve aynı konumlu sahte `pointermove`) yollar. Önizleme yalnız imleç gerçekten
 * hareket ettiyse açılır: detay penceresini kapatan ya da tekerlekle kaydıran kullanıcının önüne kart fırlamaz.
 */
const REAL_MOVE_WINDOW_MS = 250
let lastRealMove = { x: Number.NaN, y: Number.NaN, at: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      if (e.screenX === lastRealMove.x && e.screenY === lastRealMove.y) return
      lastRealMove = { x: e.screenX, y: e.screenY, at: performance.now() }
    },
    { capture: true, passive: true },
  )
}
const movedJustNow = () => performance.now() - lastRealMove.at < REAL_MOVE_WINDOW_MS

/** Olay sahibi (sarmalayıcı) öğeye yayılacak dinleyiciler. Kapsam yoksa boş nesne. */
export function usePreviewTarget(info: PreviewTargetInfo | null) {
  const ctl = useContext(PreviewContext)
  const infoRef = useRef(info)
  infoRef.current = info
  /** İmleç hareket etmeden kartın üstünde kaldı: ilk gerçek harekette önizleme zamanlanır */
  const armed = useRef(false)
  return useMemo(() => {
    if (!ctl) return {}
    const get = () => infoRef.current
    return {
      onPointerEnter(e: PointerEvent<HTMLElement>) {
        const i = get()
        if (!i || e.pointerType !== 'mouse') return
        if (movedJustNow()) {
          armed.current = false
          ctl.pointerEnter(i, anchorOf(e.currentTarget))
        } else armed.current = true
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (!armed.current || e.pointerType !== 'mouse' || !movedJustNow()) return
        const i = get()
        armed.current = false
        if (i) ctl.pointerEnter(i, anchorOf(e.currentTarget))
      },
      onPointerLeave(e: PointerEvent<HTMLElement>) {
        armed.current = false
        const i = get()
        if (i && e.pointerType === 'mouse') ctl.pointerLeave(i)
      },
      onFocus(e: FocusEvent<HTMLElement>) {
        const i = get()
        if (i) ctl.focus(i, anchorOf(e.currentTarget))
      },
      onBlur(e: FocusEvent<HTMLElement>) {
        const i = get()
        if (i) ctl.blur(i, e.relatedTarget)
      },
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const i = get()
        if (i) ctl.keyDown(i, e)
      },
    }
  }, [ctl])
}

/** Kartı önizleme hedefi yapan sarmalayıcı (yerleşimi etkilemez). */
export function PreviewTarget({ info, children, className }: PreviewTargetProps): ReactElement {
  const handlers = usePreviewTarget(info)
  return (
    <div className={className ? `pv-target ${className}` : 'pv-target'} {...handlers}>
      {children}
    </div>
  )
}
