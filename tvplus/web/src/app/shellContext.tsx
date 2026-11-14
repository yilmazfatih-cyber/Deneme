/**
 * Kabuk ile sayfalar arasındaki küçük sözleşme:
 *
 *   useShellOptions({ fullBleed: true })   Sayfa vitrinle başlar: masaüstünde üst menü vitrinin ÜSTÜNE biner
 *                                          (içerik menünün altından başlamaz), mobilde üst çubuk en üstte saydamdır.
 *   useShellOptions({ mobileTitle: 'Yeni ve Popüler' })   Mobil üst çubuğun başlığı (varsayılan yola göre).
 *   useShellOptions({ topBar: false })     Mobil üst çubuğu gizle (sayfa kendi ✕ / geri düğmesini çiziyor).
 *   useShellOptions({ keepScroll: true })  Yol değişiminde en üste kaydırılmaz (sayfa kendi kaydırır).
 *   <ShellPills>…</ShellPills>             Mobil üst çubuğun altındaki hap sırası (masaüstünde hiçbir şey çizmez):
 *                                          <ShellPills><Pill to="/goz-at/diziler">Diziler</Pill>…</ShellPills>
 *
 * Seçenekler sayfa açıkken geçerlidir; sayfa kapanınca varsayılana döner.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import type { FormFactor } from '../lib/formFactor'
import { PillBar } from '../ui'
import { markKeepScroll, unmarkKeepScroll } from './scrollPolicy'

export interface ShellOptions {
  /** Vitrinle başlayan sayfa (üst menü içeriğin üstüne biner); varsayılan false */
  fullBleed?: boolean
  /** Mobil üst çubuk başlığı; null → logo */
  mobileTitle?: string | null
  /** Mobil üst çubuk görünsün mü; varsayılan true */
  topBar?: boolean
  /** Yol değişiminde en üste kaydırma YAPILMASIN (sayfa kendi kaydırır, ör. rehber "şimdi"ye) */
  keepScroll?: boolean
}

export interface ShellContextValue {
  formFactor: FormFactor
  options: ShellOptions
  setOptions: (o: ShellOptions | null) => void
  /** Mobil hap yuvası (kabuk çizer) */
  pillsSlot: HTMLElement | null
}

const ShellContext = createContext<ShellContextValue | null>(null)
export const ShellContextProvider = ShellContext.Provider

/**
 * Kabuğun kendi tarafı: seçenek durumu + hap yuvası. Kabuk `<ShellContextProvider value={context}>` ile sayfaları sarar,
 * `options`'a göre kendini çizer, `pillsRef`'i hap yuvası öğesine verir.
 */
export function useShellController(formFactor: FormFactor): {
  options: ShellOptions
  pillsRef: (el: HTMLElement | null) => void
  /** <ShellContextProvider value={context}> ile sayfalara verilir */
  context: ShellContextValue
} {
  const [options, setOptionsState] = useState<ShellOptions>({})
  const [pillsSlot, setPillsSlot] = useState<HTMLElement | null>(null)
  // Kararlı kimlik: sayfaların etkisi yalnız kendi seçenekleri değişince yeniden çalışır.
  const setOptions = useCallback((o: ShellOptions | null) => {
    const next = o ?? {}
    setOptionsState((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [])
  const value = useMemo<ShellContextValue>(
    () => ({ formFactor, options, setOptions, pillsSlot }),
    [formFactor, options, setOptions, pillsSlot],
  )
  return { options, pillsRef: setPillsSlot, context: value }
}

/** Sayfanın kabuk seçenekleri (bkz. dosya başı). Kabuk dışında çağrılırsa etkisizdir. */
export function useShellOptions(options: ShellOptions): void {
  const ctx = useContext(ShellContext)
  const setOptions = ctx?.setOptions
  const { pathname } = useLocation()
  // keepScroll çizim sırasında kaydedilir (bkz. scrollPolicy.ts); kayıt bir kez, sayfa kapanınca silinir.
  const kept = useRef<string | null>(null)
  if (options.keepScroll && kept.current !== pathname) {
    if (kept.current) unmarkKeepScroll(kept.current)
    markKeepScroll(pathname)
    kept.current = pathname
  } else if (!options.keepScroll && kept.current) {
    unmarkKeepScroll(kept.current)
    kept.current = null
  }
  useEffect(
    () => () => {
      if (kept.current) unmarkKeepScroll(kept.current)
      kept.current = null
    },
    [],
  )
  const key = JSON.stringify(options)
  useLayoutEffect(() => {
    if (!setOptions) return
    setOptions(JSON.parse(key) as ShellOptions)
    return () => setOptions(null)
  }, [key, setOptions])
}

/** Hangi kabuğun içindeyiz ('desktop' | 'mobile'); kabuk dışında null. */
export function useShellFormFactor(): FormFactor | null {
  return useContext(ShellContext)?.formFactor ?? null
}

/** Mobil üst çubuğun altındaki hap sırası; masaüstünde (ve kabuk dışında) hiçbir şey çizmez. */
export function ShellPills({ children, label }: { children: ReactNode; label?: string }): ReactElement | null {
  const ctx = useContext(ShellContext)
  if (!ctx || ctx.formFactor !== 'mobile' || !ctx.pillsSlot) return null
  return createPortal(<PillBar label={label}>{children}</PillBar>, ctx.pillsSlot)
}
