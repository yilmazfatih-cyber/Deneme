/**
 * Önizleme kapsamı (Netflix "mini modal" / hover önizlemesi).
 *   Web: işaretçi bir başlık kartında ≥ 400 ms durursa ya da kart klavyeyle odak alırsa, karta tutturulmuş daha büyük
 *   yüzen kart açılır (görünür alanın içinde kalır, diğer satırların üstünde). Kartla önizleme arasında gezinmek açık
 *   tutar; dışarı çıkış / Esc / kaydırma kapatır.
 *   Dokunmatik: uzun basış açar (ardından gelen tıklama yutulur), dışarıya dokunmak kapatır.
 * Veri: o satırda ilk önizlemede satırın TÜM yüklü kimlikleri tek MiniModalQuery ile (store.ts).
 *
 * Kullanım:
 *   <PreviewScope> … <PreviewTarget info={{ rowId, videoId, getRowVideoIds, tctx, title, imageUrl }}><PosterCard …/></PreviewTarget> … </PreviewScope>
 * Kapsam yoksa PreviewTarget yalnızca çocuğunu çizer (önizleme kapalı).
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
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { logEvent } from '../../telemetry/logger'
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
}

type Via = 'hover' | 'focus' | 'touch'

interface OpenState {
  info: PreviewTargetInfo
  anchor: HTMLElement
  via: Via
}

interface Controller {
  pointerEnter: (info: PreviewTargetInfo, el: HTMLElement) => void
  pointerLeave: (info: PreviewTargetInfo) => void
  focus: (info: PreviewTargetInfo, el: HTMLElement) => void
  blur: (info: PreviewTargetInfo, next: EventTarget | null) => void
  touchStart: (info: PreviewTargetInfo, el: HTMLElement, x: number, y: number) => void
  touchMove: (x: number, y: number) => void
  touchEnd: () => void
  /** Uzun basış önizleme açtıysa ardından gelen tıklamayı yut */
  consumeClick: () => boolean
}

const PreviewContext = createContext<Controller | null>(null)

export const HOVER_DELAY_MS = 400
const LONG_PRESS_MS = 500
const LEAVE_GRACE_MS = 180
const MOVE_TOLERANCE_PX = 10

export function PreviewScope({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState<OpenState | null>(null)
  const openRef = useRef<OpenState | null>(null)
  openRef.current = open
  const hoverTimer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
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
    const cur = openRef.current
    if (cur && cur.info.videoId === info.videoId && cur.info.rowId === info.rowId && cur.anchor === anchor) return
    requestRowPreview(info.rowId, info.getRowVideoIds(), info.videoId)
    logEvent('focus', { videoId: info.videoId, rowId: info.rowId, via }, info.tctx)
    setOpen({ info, anchor, via })
  }, [])

  const hide = useCallback((refocus = false) => {
    clear(hoverTimer)
    clear(leaveTimer)
    const cur = openRef.current
    setOpen(null)
    if (refocus && cur) {
      const a = cur.anchor
      ;(a.matches('a[href], button') ? a : a.querySelector<HTMLElement>('a[href], button'))?.focus()
    }
  }, [])

  const hideSoon = useCallback(() => {
    clear(leaveTimer)
    leaveTimer.current = window.setTimeout(() => hide(), LEAVE_GRACE_MS)
  }, [hide])

  const controller = useMemo<Controller>(
    () => ({
      pointerEnter(info, el) {
        clear(hoverTimer)
        const cur = openRef.current
        if (cur && cur.info.videoId === info.videoId && cur.anchor === el) {
          clear(leaveTimer)
          return
        }
        hoverTimer.current = window.setTimeout(() => show(info, el, 'hover'), HOVER_DELAY_MS)
      },
      pointerLeave(info) {
        clear(hoverTimer)
        const cur = openRef.current
        if (cur && cur.info.videoId === info.videoId && cur.via === 'hover') hideSoon()
      },
      focus(info, el) {
        let keyboard = false
        try {
          keyboard = !!el.querySelector(':focus-visible') || el.matches(':focus-visible')
        } catch {
          keyboard = false
        }
        if (keyboard) show(info, el, 'focus')
      },
      blur(info, next) {
        const cur = openRef.current
        if (!cur || cur.info.videoId !== info.videoId || cur.via !== 'focus') return
        if (next instanceof Node && (cur.anchor.contains(next) || cardRef.current?.contains(next))) return
        hideSoon()
      },
      touchStart(info, el, x, y) {
        clear(pressTimer)
        pressStart.current = { x, y }
        pressTimer.current = window.setTimeout(() => {
          pressTimer.current = null
          swallowClick.current = true
          show(info, el, 'touch')
        }, LONG_PRESS_MS)
      },
      touchMove(x, y) {
        const s = pressStart.current
        if (s && Math.hypot(x - s.x, y - s.y) > MOVE_TOLERANCE_PX) clear(pressTimer)
      },
      touchEnd() {
        clear(pressTimer)
        pressStart.current = null
      },
      consumeClick() {
        if (!swallowClick.current) return false
        swallowClick.current = false
        return true
      },
    }),
    [show, hideSoon],
  )

  // Yol değişince kapat.
  useEffect(() => {
    hide()
  }, [pathname, hide])

  // Esc, kaydırma, dışarı dokunma.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        hide(true)
      }
    }
    const onScroll = (e: Event) => {
      const t = e.target
      if (t instanceof Node && cardRef.current?.contains(t)) return
      hide()
    }
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target
      if (t instanceof Node && (cardRef.current?.contains(t) || open.anchor.contains(t))) return
      hide()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onScroll as EventListener)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onScroll as EventListener)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, hide])

  useEffect(
    () => () => {
      clear(hoverTimer)
      clear(leaveTimer)
      clear(pressTimer)
    },
    [],
  )

  return (
    <PreviewContext.Provider value={controller}>
      {children}
      {open &&
        createPortal(
          <PreviewCard
            key={`${open.info.rowId}|${open.info.videoId}`}
            ref={cardRef}
            info={open.info}
            anchor={open.anchor}
            via={open.via}
            onPointerEnter={() => clear(leaveTimer)}
            onPointerLeave={() => {
              if (openRef.current?.via !== 'touch') hideSoon()
            }}
            onBlurOut={() => {
              if (openRef.current?.via === 'focus') hideSoon()
            }}
            onClose={() => hide(true)}
          />,
          document.body,
        )}
    </PreviewContext.Provider>
  )
}

export interface PreviewTargetProps {
  /** Hedef bilgisi; null ise önizleme bağlanmaz */
  info: PreviewTargetInfo | null
  children: ReactNode
  className?: string
}

/** Sarmalayıcı `display: contents`: kutusu yok, konum ve kapsama kartın kendisinden alınır. */
const anchorOf = (el: HTMLElement): HTMLElement => (el.firstElementChild instanceof HTMLElement ? el.firstElementChild : el)

/** Olay sahibi (wrapper) öğeye yayılacak dinleyiciler. Kapsam yoksa boş nesne. */
export function usePreviewTarget(info: PreviewTargetInfo | null) {
  const ctl = useContext(PreviewContext)
  const infoRef = useRef(info)
  infoRef.current = info
  return useMemo(() => {
    if (!ctl) return {}
    const get = () => infoRef.current
    return {
      onPointerEnter(e: PointerEvent<HTMLElement>) {
        const i = get()
        if (i && e.pointerType !== 'touch') ctl.pointerEnter(i, anchorOf(e.currentTarget))
      },
      onPointerLeave(e: PointerEvent<HTMLElement>) {
        const i = get()
        if (i && e.pointerType !== 'touch') ctl.pointerLeave(i)
      },
      onPointerDown(e: PointerEvent<HTMLElement>) {
        const i = get()
        if (i && e.pointerType === 'touch') ctl.touchStart(i, anchorOf(e.currentTarget), e.clientX, e.clientY)
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (e.pointerType === 'touch') ctl.touchMove(e.clientX, e.clientY)
      },
      onPointerUp() {
        ctl.touchEnd()
      },
      onPointerCancel() {
        ctl.touchEnd()
      },
      onFocus(e: FocusEvent<HTMLElement>) {
        const i = get()
        if (i) ctl.focus(i, anchorOf(e.currentTarget))
      },
      onBlur(e: FocusEvent<HTMLElement>) {
        const i = get()
        if (i) ctl.blur(i, e.relatedTarget)
      },
      onClickCapture(e: MouseEvent<HTMLElement>) {
        if (ctl.consumeClick()) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
      onContextMenu(e: MouseEvent<HTMLElement>) {
        // Uzun basışta tarayıcının bağlantı menüsü önizlemeyi örtmesin (yalnız dokunmatik).
        if (window.matchMedia?.('(hover: none)').matches) e.preventDefault()
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
