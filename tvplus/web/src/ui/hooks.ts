/**
 * Arayüz kancaları: üst menü durumu, kırılım, gövde kaydırma kilidi, odak tuzağı, katmanlı Esc.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { itemsPerPageFor } from './sliderMath'

/* ───────────── Kaydırma ───────────── */

function subscribeScroll(cb: () => void): () => void {
  window.addEventListener('scroll', cb, { passive: true })
  return () => window.removeEventListener('scroll', cb)
}

/**
 * Sayfa `threshold` pikselden fazla kaydı mı — masaüstü üst menüsü saydamdan dolguya geçer
 * (Netflix: en üstte karartmalı saydam, kayınca `--bg`).
 */
export function useScrolled(threshold = 0): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > threshold,
    () => false,
  )
}

/* ───────────── Ortam sorguları ───────────── */

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

function subscribeResize(cb: () => void): () => void {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

/** Satırda sayfa başına kart sayısı (6/5/4/3) — pencere genişliğine göre, bkz. sliderMath.itemsPerPageFor. */
export function useBreakpointItems(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => itemsPerPageFor(window.innerWidth),
    () => 6,
  )
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/* ───────────── Gövde kaydırma kilidi ───────────── */

let lockCount = 0
let savedPadding = ''

function lockBody(): void {
  if (lockCount++ > 0) return
  const body = document.body
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  savedPadding = body.style.paddingRight
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px` // kaydırma çubuğu kalkınca sayfa kaymasın
  body.classList.add('ui-scroll-locked')
}
function unlockBody(): void {
  if (--lockCount > 0) return
  lockCount = 0
  document.body.classList.remove('ui-scroll-locked')
  document.body.style.paddingRight = savedPadding
}

/** `active` iken arkadaki sayfa kaymaz (iç içe katmanlar sayılır). */
export function useBodyScrollLock(active: boolean): void {
  useLayoutEffect(() => {
    if (!active) return
    lockBody()
    return unlockBody
  }, [active])
}

/* ───────────── Katmanlı Esc ───────────── */

const escStack: (() => void)[] = []
let escInstalled = false

function onEscKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const top = escStack[escStack.length - 1]
  if (!top) return
  e.preventDefault()
  top()
}

/** Yalnız en üstteki katman Esc'i alır (menü modalın içindeyse önce menü kapanır). */
export function useEscape(active: boolean, onEscape: () => void): void {
  const ref = useRef(onEscape)
  ref.current = onEscape
  useEffect(() => {
    if (!active) return
    const fn = () => ref.current()
    escStack.push(fn)
    if (!escInstalled) {
      window.addEventListener('keydown', onEscKey)
      escInstalled = true
    }
    return () => {
      const i = escStack.lastIndexOf(fn)
      if (i >= 0) escStack.splice(i, 1)
    }
  }, [active])
}

/* ───────────── Odak tuzağı ───────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  )
}

/**
 * `active` iken Tab odağı `ref` içinde döner; açılışta `initialFocus` (yoksa kapsayıcının kendisi) odaklanır,
 * kapanışta odak açan öğeye geri döner.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = initialFocus?.current ?? root
    first.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusableIn(root)
      if (!items.length) {
        e.preventDefault()
        root.focus({ preventScroll: true })
        return
      }
      const firstEl = items[0]!
      const lastEl = items[items.length - 1]!
      const current = document.activeElement
      if (e.shiftKey && (current === firstEl || current === root)) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && current === lastEl) {
        e.preventDefault()
        firstEl.focus()
      } else if (current && !root.contains(current)) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [active, ref, initialFocus])
}

/* ───────────── Açılış / kapanış animasyonu ───────────── */

export type PresenceState = 'entering' | 'open' | 'exiting' | 'closed'

/**
 * `open` false olunca öğe hemen kaybolmaz: `durationMs` boyunca 'exiting' durumunda kalır (kapanış animasyonu).
 * Azaltılmış hareket açıkken anında.
 */
export function usePresence(open: boolean, durationMs: number): PresenceState {
  const reduced = usePrefersReducedMotion()
  const [state, setState] = useState<PresenceState>(open ? 'open' : 'closed')
  useEffect(() => {
    if (open) {
      if (reduced) {
        setState('open')
        return
      }
      setState('entering')
      // İki kare bekle: ilk karede başlangıç biçimi çizilsin, sonra geçiş başlasın.
      let f2 = 0
      const f1 = requestAnimationFrame(() => {
        f2 = requestAnimationFrame(() => setState('open'))
      })
      return () => {
        cancelAnimationFrame(f1)
        cancelAnimationFrame(f2)
      }
    }
    setState((s) => (s === 'closed' ? s : reduced ? 'closed' : 'exiting'))
    if (reduced) return
    const t = window.setTimeout(() => setState('closed'), durationMs)
    return () => window.clearTimeout(t)
  }, [open, durationMs, reduced])
  return state
}
